const { app, BrowserWindow, ipcMain, dialog, shell, Menu, Tray, nativeImage, nativeTheme } = require('electron');
const fs = require('fs');
const fsp = fs.promises;
const os = require('os');
const path = require('path');
const crypto = require('crypto');

const { Store } = require('./store');
const scanner = require('./scanner');
const activator = require('./activator');
const google = require('./google');
const { extractFromCollection } = require('./ttc');
const updater = require('./updater');
const system = require('./system');

const isMac = process.platform === 'darwin';
let win = null;
let tray = null;
let store = null;
let quitting = false;
const watchers = new Map();

const dataDir = () => app.getPath('userData');
const defaultRoot = () => path.join(os.homedir(), 'GESFONT');
const rootDir = () => store.data.settings.rootDir || defaultRoot();
const googleDir = () => path.join(rootDir(), 'Google Fonts');
const inside = (file, dir) => file === dir || file.startsWith(dir + path.sep);

function send(channel, payload) {
  if (win && !win.isDestroyed()) win.webContents.send(channel, payload);
}

// Origem de cada arquivo: baixado do Google, guardado na pasta principal ou numa pasta do usuário.
function sourceFor(file) {
  if (inside(file, googleDir())) return 'google';
  if (inside(file, rootDir())) return 'imported';
  return 'local';
}

// Subpastas da pasta principal, até 4 níveis, para a barra lateral.
function folderTree(dir = rootDir(), depth = 0) {
  if (depth > 3) return [];
  let entries = [];
  try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return []; }
  return entries
    .filter((e) => e.isDirectory() && !e.name.startsWith('.'))
    .sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'))
    .map((e) => { const p = path.join(dir, e.name); return { name: e.name, path: p, children: folderTree(p, depth + 1) }; });
}

function publicState() {
  const d = store.data;
  return {
    faces: Object.values(d.faces),
    folders: d.folders,
    activated: Object.keys(d.activated),
    collections: d.collections,
    favorites: d.favorites,
    pairs: d.pairs,
    overrides: d.overrides,
    tags: d.tags,
    systemKept: d.systemKept || {},
    systemLocations: system.locations().map(({ dir, kind, label }) => ({ dir, kind, label })),
    settings: d.settings,
    platform: process.platform,
    targetDir: activator.targetDir(),
    rootDir: rootDir(),
    googleDir: googleDir(),
    tree: folderTree(),
    sep: path.sep,
    version: app.getVersion(),
    update: updater.status(),
  };
}

function changed() {
  store.save();
  send('library:changed');
}

// ---------- pastas ----------
async function scanFolder(folder) {
  const files = await scanner.walk(folder);
  const set = new Set(files);
  const isRoot = folder === rootDir();
  scanner.removeFiles(store, (file, info) => inside(file, folder) && info.source !== 'system' && !set.has(file)
    && (isRoot || !inside(file, rootDir())));
  const label = isRoot ? 'GESFONT' : folder;
  send('scan:progress', { folder: label, done: 0, total: files.length });
  const errors = await scanner.scanFiles(store, files, sourceFor, (done, total) => send('scan:progress', { folder: label, done, total }));
  send('scan:progress', { folder: label, done: files.length, total: files.length, finished: true });
  return errors;
}

function watchFolder(folder) {
  if (watchers.has(folder)) return;
  try {
    let t = null;
    let td = null;
    const w = fs.watch(folder, { recursive: true }, (_e, name) => {
      if (name && !scanner.isFontFile(name)) {
        // pasta criada, renomeada ou apagada pelo Finder: atualiza a árvore e relê
        if (folder === rootDir() && !path.extname(name)) { clearTimeout(td); td = setTimeout(async () => { await scanFolder(folder); changed(); }, 800); }
        return;
      }
      clearTimeout(t);
      t = setTimeout(async () => { await scanFolder(folder); changed(); }, 1500);
    });
    w.on('error', () => {});
    watchers.set(folder, w);
  } catch {}
}

function unwatch(folder) {
  const w = watchers.get(folder);
  if (w) { w.close(); watchers.delete(folder); }
}

async function ensureRoot() {
  await fsp.mkdir(rootDir(), { recursive: true });
  const readme = path.join(rootDir(), 'Leia-me.txt');
  if (!fs.existsSync(readme)) {
    await fsp.writeFile(readme, 'Pasta principal do GESFONT.\n\nArraste arquivos de fonte (TTF, OTF, TTC, WOFF, WOFF2) para esta pasta e eles aparecem no app automaticamente.\nAs fontes baixadas do Google Fonts ficam na subpasta "Google Fonts".\n');
  }
}

async function addFolders(folders) {
  const d = store.data;
  const errors = [];
  for (let f of folders) {
    f = path.resolve(f);
    if (inside(f, rootDir())) continue; // já monitorada como pasta principal
    if (!d.folders.includes(f) && !d.folders.some((p) => inside(f, p))) d.folders.push(f);
    errors.push(...(await scanFolder(f)));
    watchFolder(f);
  }
  changed();
  return { errors };
}

async function removeFolder(folder) {
  const d = store.data;
  if (folder === rootDir()) return;
  for (const file of Object.keys(d.activated)) {
    if (inside(file, folder)) await activator.deactivateFile(store, file);
  }
  scanner.removeFiles(store, (file) => inside(file, folder) && !inside(file, rootDir()));
  d.folders = d.folders.filter((f) => f !== folder);
  unwatch(folder);
  changed();
}

async function sameContent(a, b) {
  try {
    const [sa, sb] = await Promise.all([fsp.stat(a), fsp.stat(b)]);
    if (sa.size !== sb.size) return false;
    const [ha, hb] = await Promise.all([hashFile(a), hashFile(b)]);
    return ha === hb;
  } catch { return false; }
}

// Arquivos soltos são copiados para a pasta principal.
async function importPaths(paths) {
  const folders = [];
  const files = [];
  for (const p of paths) {
    try {
      const st = await fsp.stat(p);
      if (st.isDirectory()) folders.push(p);
      else if (scanner.isFontFile(p)) files.push(p);
    } catch {}
  }
  let skipped = 0;
  if (files.length) {
    await ensureRoot();
    const copied = [];
    for (const f of files) {
      if (inside(f, rootDir())) { copied.push(f); continue; }
      const ext = path.extname(f);
      const base = path.basename(f, ext);
      let dest = path.join(rootDir(), base + ext);
      if (fs.existsSync(dest)) {
        if (await sameContent(f, dest)) { skipped++; continue; }
        let n = 2;
        while (fs.existsSync(dest)) dest = path.join(rootDir(), `${base} ${n++}${ext}`);
      }
      await fsp.copyFile(f, dest);
      copied.push(dest);
    }
    await scanner.scanFiles(store, copied, sourceFor);
  }
  if (folders.length) await addFolders(folders);
  changed();
  return { files: files.length - skipped, skipped, folders: folders.length };
}

async function setRoot(newRoot) {
  const d = store.data;
  const old = rootDir();
  if (path.resolve(newRoot) === old) return;
  // As fontes da pasta antiga saem do app; os arquivos continuam onde estão.
  for (const file of Object.keys(d.activated)) {
    if (inside(file, old)) await activator.deactivateFile(store, file);
  }
  unwatch(old);
  scanner.removeFiles(store, (file) => inside(file, old) && !d.folders.some((f) => inside(file, f)));
  d.settings.rootDir = path.resolve(newRoot);
  d.folders = d.folders.filter((f) => !inside(f, rootDir()));
  await ensureRoot();
  await scanFolder(rootDir());
  watchFolder(rootDir());
  changed();
}

// Varre todas as pastas de fontes do sistema. Arquivos já conhecidos e sem mudança não são relidos.
let systemScanning = null;
function scanSystem() {
  if (systemScanning) return systemScanning;
  systemScanning = (async () => {
    const ours = new Set(Object.values(store.data.activated).map((a) => a.dest));
    const files = [];
    for (const { dir } of system.locations()) {
      if (fs.existsSync(dir)) files.push(...(await scanner.walk(dir)));
    }
    const unique = Array.from(new Set(files)).filter((f) => !ours.has(f) && !f.includes(`${path.sep}gesfont${path.sep}`));
    const set = new Set(unique);
    scanner.removeFiles(store, (f, info) => info.source === 'system' && !set.has(f));
    send('scan:progress', { folder: 'Sistema', done: 0, total: unique.length });
    await scanner.scanFiles(store, unique, 'system', (done, total) => send('scan:progress', { folder: 'Sistema', done, total }));
    // classifica cada face: nativa ou instalada
    for (const f of unique) {
      const info = store.data.fileIndex[f];
      if (!info) continue;
      for (const id of info.ids) { const face = store.data.faces[id]; if (face) Object.assign(face, system.classify(face)); }
    }
    for (const p of Object.keys(store.data.systemKept || {})) if (!set.has(p)) delete store.data.systemKept[p];
    send('scan:progress', { folder: 'Sistema', done: unique.length, total: unique.length, finished: true });
    store.data.settings.systemScanned = true;
    changed();
  })().finally(() => { systemScanning = null; });
  return systemScanning;
}

// Avisa quando alguém instala ou remove fontes no sistema por fora do GESFONT.
function watchSystem() {
  let t = null;
  for (const dir of system.installedDirs()) {
    if (!fs.existsSync(dir)) continue;
    try {
      const w = fs.watch(dir, (_e, name) => {
        if (name && !scanner.isFontFile(name)) return;
        clearTimeout(t);
        t = setTimeout(() => scanSystem(), 2000);
      });
      w.on('error', () => {});
    } catch {}
  }
}

// Aplica as decisões da verificação: manter, mover para a GESFONT (ativa ou não) ou apagar.
async function resolveSystem(items) {
  const d = store.data;
  d.systemKept = d.systemKept || {};
  const dest = path.join(rootDir(), 'Importadas do sistema');
  const r = await system.resolve(items, dest, (p) => shell.trashItem(p));
  for (const p of r.kept) d.systemKept[p] = Date.now();
  const gone = new Set([...r.trashed, ...r.moved.map((m) => m.from)]);
  for (const p of gone) delete d.systemKept[p];
  scanner.removeFiles(store, (f) => gone.has(f));
  if (r.moved.length) {
    await scanner.scanFiles(store, r.moved.map((m) => m.to), sourceFor);
    const ids = r.moved.filter((m) => m.activate).flatMap((m) => (d.fileIndex[m.to] ? d.fileIndex[m.to].ids : []));
    if (ids.length) await setActive(ids, true);
  }
  changed();
  updateTray();
  return { moved: r.moved.length, activated: r.moved.filter((m) => m.activate).length, trashed: r.trashed.length, kept: r.kept.length, failed: r.failed };
}

// ---------- ativação ----------
async function setActive(ids, on) {
  const d = store.data;
  const files = new Map();
  for (const id of ids) {
    const f = d.faces[id];
    if (f && f.source !== 'system' && f.activatable) files.set(f.path, f);
  }
  const results = [];
  for (const [file, face] of files) {
    try {
      const r = on ? await activator.activateFile(store, file, face.fullName) : await activator.deactivateFile(store, file);
      results.push({ file, ...r });
    } catch (e) {
      results.push({ file, ok: false, message: e.message });
    }
  }
  changed();
  updateTray();
  return results;
}

async function deactivateAll() {
  for (const file of Object.keys(store.data.activated)) {
    try { await activator.deactivateFile(store, file); } catch {}
  }
  changed();
  updateTray();
}

// ---------- duplicadas e Lixeira ----------
function hashFile(file) {
  return new Promise((resolve, reject) => {
    const h = crypto.createHash('sha1');
    fs.createReadStream(file).on('data', (c) => h.update(c)).on('end', () => resolve(h.digest('hex'))).on('error', reject);
  });
}

async function fileInfo(paths) {
  const out = {};
  for (const p of new Set(paths)) {
    try { out[p] = { hash: await hashFile(p), mtime: (await fsp.stat(p)).mtimeMs }; } catch { out[p] = null; }
  }
  return out;
}

async function trashFiles(paths) {
  const d = store.data;
  const done = [];
  const failed = [];
  for (const p of new Set(paths)) {
    const info = d.fileIndex[p];
    if (!info || info.source === 'system') { failed.push({ path: p, message: 'Fontes do sistema não podem ser apagadas pelo app.' }); continue; }
    try {
      if (d.activated[p]) await activator.deactivateFile(store, p);
      if (fs.existsSync(p)) await shell.trashItem(p);
      scanner.removeFiles(store, (file) => file === p);
      done.push(p);
    } catch (e) {
      failed.push({ path: p, message: e.message });
    }
  }
  changed();
  updateTray();
  return { done, failed };
}

// ---------- pastas dentro da pasta principal ----------
const safeName = (n) => String(n).replace(/[\\/:*?"<>|]/g, '-').trim().slice(0, 120);

// Atualiza índice, ativação e nomes de família quando arquivos mudam de lugar.
async function relocate(pairs) {
  const d = store.data;
  const moved = [];
  for (const [from, to] of pairs) {
    const info = d.fileIndex[from];
    if (!info) continue;
    const oldIds = info.ids.slice();
    if (d.activated[from]) { d.activated[to] = d.activated[from]; delete d.activated[from]; }
    scanner.removeFiles(store, (f) => f === from);
    moved.push({ to, oldIds });
  }
  await scanner.scanFiles(store, moved.map((m) => m.to), sourceFor);
  for (const { to, oldIds } of moved) {
    const newIds = (d.fileIndex[to] || { ids: [] }).ids;
    oldIds.forEach((oid, i) => {
      const nid = newIds[i];
      if (nid && d.overrides[oid]) { d.overrides[nid] = d.overrides[oid]; delete d.overrides[oid]; }
    });
  }
}

async function makeFolder(parent, name) {
  parent = parent && inside(parent, rootDir()) ? parent : rootDir();
  const base = safeName(name) || 'Nova pasta';
  let dir = path.join(parent, base);
  let n = 2;
  while (fs.existsSync(dir)) dir = path.join(parent, `${base} ${n++}`);
  await fsp.mkdir(dir, { recursive: true });
  changed();
  return dir;
}

async function renameFolder(dir, name) {
  if (!inside(dir, rootDir()) || dir === rootDir()) throw new Error('Só é possível renomear pastas dentro da pasta GESFONT.');
  const to = path.join(path.dirname(dir), safeName(name));
  if (to === dir) return dir;
  if (fs.existsSync(to)) throw new Error('Já existe uma pasta com esse nome.');
  unwatch(rootDir());
  await fsp.rename(dir, to);
  const pairs = Object.keys(store.data.fileIndex).filter((f) => inside(f, dir)).map((f) => [f, to + f.slice(dir.length)]);
  await relocate(pairs);
  watchFolder(rootDir());
  changed();
  return to;
}

async function trashFolder(dir) {
  if (!inside(dir, rootDir()) || dir === rootDir()) throw new Error('Só é possível apagar pastas dentro da pasta GESFONT.');
  for (const file of Object.keys(store.data.activated)) if (inside(file, dir)) await activator.deactivateFile(store, file);
  await shell.trashItem(dir);
  scanner.removeFiles(store, (f) => inside(f, dir));
  changed();
  updateTray();
}

// Move arquivos para uma pasta da GESFONT. Arquivos de fora da pasta principal são copiados, não movidos.
async function moveInto(paths, destDir) {
  if (!inside(destDir, rootDir())) throw new Error('O destino precisa estar dentro da pasta GESFONT.');
  await fsp.mkdir(destDir, { recursive: true });
  const pairs = [];
  let copied = 0, moved = 0, skipped = 0;
  for (const p of new Set(paths)) {
    if (!fs.existsSync(p) || path.dirname(p) === destDir) { skipped++; continue; }
    const ext = path.extname(p);
    const base = path.basename(p, ext);
    let to = path.join(destDir, base + ext);
    if (fs.existsSync(to) && await sameContent(p, to)) { skipped++; continue; }
    let n = 2;
    while (fs.existsSync(to)) to = path.join(destDir, `${base} ${n++}${ext}`);
    if (inside(p, rootDir())) {
      try { await fsp.rename(p, to); } catch { await fsp.copyFile(p, to); await fsp.unlink(p); }
      pairs.push([p, to]); moved++;
    } else {
      await fsp.copyFile(p, to); copied++;
    }
  }
  await relocate(pairs);
  await scanner.scanFiles(store, (await scanner.walk(destDir)), sourceFor);
  changed();
  return { moved, copied, skipped };
}

// ---------- barra de menus / bandeja ----------
function showWindow() {
  if (!win || win.isDestroyed()) createWindow(true);
  else { win.show(); win.focus(); }
  if (isMac && app.dock) app.dock.show();
}

function updateTray() {
  if (!tray) return;
  const n = Object.keys(store.data.activated).length;
  tray.setToolTip(`GESFONT, ${n === 1 ? '1 arquivo ativo' : n + ' arquivos ativos'}`);
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: 'Abrir GESFONT', click: showWindow },
    { type: 'separator' },
    { label: n === 1 ? '1 arquivo ativo' : `${n} arquivos ativos`, enabled: false },
    { label: 'Desativar todas as fontes', enabled: n > 0, click: () => deactivateAll() },
    { type: 'separator' },
    { label: 'Sair do GESFONT', click: () => app.quit() },
  ]));
}

function syncTray() {
  const s = store.data.settings;
  const want = s.hideToTray || s.startHidden;
  if (want && !tray) {
    const img = nativeImage.createFromPath(path.join(__dirname, 'assets', isMac ? 'trayTemplate.png' : 'icon.png'));
    if (isMac) img.setTemplateImage(true);
    tray = new Tray(isMac ? img : img.resize({ width: 16, height: 16 }));
    tray.on('click', () => { if (!isMac) showWindow(); });
    updateTray();
  } else if (!want && tray) {
    tray.destroy();
    tray = null;
  }
}

function applyLoginItem() {
  const s = store.data.settings;
  if (process.platform === 'linux') return;
  try { app.setLoginItemSettings({ openAtLogin: !!s.openAtLogin, openAsHidden: !!s.startHidden, args: s.startHidden ? ['--hidden'] : [] }); } catch {}
}

function openedAtLogin() {
  if (process.argv.includes('--hidden')) return true;
  try { return isMac && app.getLoginItemSettings().wasOpenedAtLogin; } catch { return false; }
}

// ---------- IPC ----------
function registerIpc() {
  ipcMain.handle('state:get', () => publicState());

  ipcMain.handle('folders:choose', async () => {
    const r = await dialog.showOpenDialog(win, { title: 'Adicionar pasta de fontes', properties: ['openDirectory', 'multiSelections', 'createDirectory'] });
    if (r.canceled || !r.filePaths.length) return null;
    return addFolders(r.filePaths);
  });
  ipcMain.handle('folders:remove', (_e, folder) => removeFolder(folder));
  ipcMain.handle('folders:rescan', async () => {
    await scanFolder(rootDir());
    for (const f of store.data.folders) await scanFolder(f);
    changed();
  });
  ipcMain.handle('root:choose', async () => {
    const r = await dialog.showOpenDialog(win, { title: 'Escolher a pasta principal', buttonLabel: 'Usar esta pasta', defaultPath: rootDir(), properties: ['openDirectory', 'createDirectory'] });
    if (r.canceled || !r.filePaths.length) return null;
    await setRoot(r.filePaths[0]);
    return rootDir();
  });
  ipcMain.handle('root:open', async () => { await ensureRoot(); shell.openPath(rootDir()); });
  ipcMain.handle('files:import', (_e, paths) => importPaths(paths));
  ipcMain.handle('files:choose', async () => {
    const r = await dialog.showOpenDialog(win, {
      title: 'Importar fontes para a pasta GESFONT', properties: ['openFile', 'multiSelections'],
      filters: [{ name: 'Fontes', extensions: ['ttf', 'otf', 'ttc', 'otc', 'woff', 'woff2'] }],
    });
    if (r.canceled) return null;
    return importPaths(r.filePaths);
  });
  ipcMain.handle('files:info', (_e, paths) => fileInfo(paths));
  ipcMain.handle('rootfs:mkdir', (_e, parent, name) => makeFolder(parent, name));
  ipcMain.handle('rootfs:rename', async (_e, dir, name) => { try { return { ok: true, path: await renameFolder(dir, name) }; } catch (e) { return { ok: false, message: e.message }; } });
  ipcMain.handle('rootfs:trash', async (_e, dir) => { try { await trashFolder(dir); return { ok: true }; } catch (e) { return { ok: false, message: e.message }; } });
  ipcMain.handle('rootfs:move', async (_e, paths, dest) => { try { return { ok: true, ...(await moveInto(paths, dest)) }; } catch (e) { return { ok: false, message: e.message }; } });
  ipcMain.handle('update:check', () => updater.check(true));
  ipcMain.handle('update:install', () => updater.install());
  ipcMain.handle('files:trash', (_e, paths) => trashFiles(paths));
  ipcMain.handle('system:scan', () => scanSystem());
  ipcMain.handle('system:resolve', (_e, items) => resolveSystem(items));
  ipcMain.handle('system:unkeep', (_e, paths) => { for (const p of paths) delete store.data.systemKept[p]; changed(); });

  ipcMain.handle('font:data', async (_e, id) => {
    const f = store.data.faces[id];
    if (!f) return null;
    const buf = await fsp.readFile(f.path);
    return extractFromCollection(buf, f.index);
  });
  ipcMain.handle('font:details', async (_e, id) => {
    const f = store.data.faces[id];
    return f ? scanner.readDetails(f) : null;
  });
  ipcMain.handle('font:glyph', async (_e, id, cp) => {
    const f = store.data.faces[id];
    return f ? scanner.glyphName(f, cp) : null;
  });

  ipcMain.handle('fonts:activate', (_e, ids, on) => setActive(ids, on));
  ipcMain.handle('fonts:deactivateAll', () => deactivateAll());

  ipcMain.handle('fonts:export', async (_e, ids, label) => {
    const r = await dialog.showOpenDialog(win, { title: `Exportar arquivos${label ? ' de ' + label : ''}`, buttonLabel: 'Exportar aqui', properties: ['openDirectory', 'createDirectory'] });
    if (r.canceled || !r.filePaths.length) return null;
    const target = label ? path.join(r.filePaths[0], label.replace(/[\\/:*?"<>|]/g, '-')) : r.filePaths[0];
    await fsp.mkdir(target, { recursive: true });
    const files = new Set(ids.map((id) => store.data.faces[id]).filter(Boolean).map((f) => f.path));
    for (const file of files) await fsp.copyFile(file, path.join(target, path.basename(file)));
    shell.openPath(target);
    return { count: files.size, target };
  });

  ipcMain.handle('collections:export', async (_e, payload) => {
    const r = await dialog.showSaveDialog(win, { title: 'Exportar coleções', defaultPath: path.join(app.getPath('documents'), 'GESFONT coleções.json'), filters: [{ name: 'Coleções do GESFONT', extensions: ['json'] }] });
    if (r.canceled || !r.filePath) return null;
    await fsp.writeFile(r.filePath, JSON.stringify(payload, null, 2));
    return r.filePath;
  });
  ipcMain.handle('collections:import', async () => {
    const r = await dialog.showOpenDialog(win, { title: 'Importar coleções', properties: ['openFile'], filters: [{ name: 'Coleções do GESFONT', extensions: ['json'] }] });
    if (r.canceled || !r.filePaths.length) return null;
    try {
      const data = JSON.parse(await fsp.readFile(r.filePaths[0], 'utf8'));
      return Array.isArray(data.collections) ? data : null;
    } catch { return null; }
  });

  ipcMain.handle('data:save', (_e, key, value) => {
    if (!['collections', 'favorites', 'pairs', 'settings', 'overrides', 'tags'].includes(key)) return;
    const prev = store.data.settings;
    if (key === 'settings') value = { ...value, rootDir: prev.rootDir, systemScanned: prev.systemScanned, updatePrefVersion: prev.updatePrefVersion };
    store.data[key] = value;
    if (key === 'settings') {
      nativeTheme.themeSource = value.theme || 'system';
      if (prev.openAtLogin !== value.openAtLogin || prev.startHidden !== value.startHidden) applyLoginItem();
      syncTray();
    }
    store.save();
  });

  ipcMain.handle('google:catalog', (_e, force) => google.getCatalog(dataDir(), force));
  ipcMain.handle('google:install', async (_e, family, styles, activate) => {
    await ensureRoot();
    const files = await google.downloadFamily(googleDir(), family, styles);
    await scanner.scanFiles(store, files, sourceFor);
    const ids = files.flatMap((f) => (store.data.fileIndex[f] ? store.data.fileIndex[f].ids : []));
    if (activate) await setActive(ids, true);
    else changed();
    return { ids };
  });

  ipcMain.handle('shell:reveal', (_e, p) => shell.showItemInFolder(p));
  ipcMain.handle('shell:openPath', (_e, p) => shell.openPath(p));
  ipcMain.handle('shell:open', (_e, url) => {
    if (/^https?:\/\//.test(url)) shell.openExternal(url);
  });
}

// ---------- janela e menu ----------
function buildMenu() {
  const go = (view) => () => { showWindow(); send('menu:navigate', view); };
  const template = [
    ...(isMac ? [{
      label: 'GESFONT',
      submenu: [
        { role: 'about', label: 'Sobre o GESFONT' },
        { label: 'Verificar atualizações…', click: () => { showWindow(); updater.check(true); } },
        { type: 'separator' },
        { label: 'Ajustes…', accelerator: 'Cmd+,', click: go('settings') },
        { type: 'separator' },
        { role: 'hide', label: 'Ocultar GESFONT' },
        { role: 'hideOthers', label: 'Ocultar outros' },
        { type: 'separator' },
        { role: 'quit', label: 'Sair do GESFONT' },
      ],
    }] : []),
    {
      label: 'Arquivo',
      submenu: [
        { label: 'Adicionar pasta…', accelerator: 'CmdOrCtrl+O', click: () => send('menu:addFolder') },
        { label: 'Importar fontes…', accelerator: 'CmdOrCtrl+Shift+O', click: () => send('menu:importFiles') },
        { label: 'Abrir pasta GESFONT', accelerator: 'CmdOrCtrl+Shift+G', click: () => shell.openPath(rootDir()) },
        { label: 'Nova coleção', accelerator: 'CmdOrCtrl+N', click: () => send('menu:newCollection') },
        { type: 'separator' },
        { label: 'Atualizar pastas', accelerator: 'CmdOrCtrl+R', click: () => send('menu:rescan') },
        ...(isMac ? [] : [{ type: 'separator' }, { label: 'Ajustes…', accelerator: 'Ctrl+,', click: go('settings') }, { role: 'quit', label: 'Sair' }]),
      ],
    },
    {
      label: 'Editar',
      submenu: [
        { role: 'undo', label: 'Desfazer' }, { role: 'redo', label: 'Refazer' }, { type: 'separator' },
        { role: 'cut', label: 'Recortar' }, { role: 'copy', label: 'Copiar' }, { role: 'paste', label: 'Colar' },
        { role: 'selectAll', label: 'Selecionar tudo' },
        { type: 'separator' },
        { label: 'Buscar', accelerator: 'CmdOrCtrl+F', click: () => send('menu:find') },
      ],
    },
    {
      label: 'Visualizar',
      submenu: [
        { label: 'Biblioteca', accelerator: 'CmdOrCtrl+1', click: go('library') },
        { label: 'Nativas', accelerator: 'CmdOrCtrl+2', click: go('native') },
        { label: 'Verificação do sistema', accelerator: 'CmdOrCtrl+7', click: go('review') },
        { label: 'Google Fonts', accelerator: 'CmdOrCtrl+3', click: go('google') },
        { label: 'Comparar', accelerator: 'CmdOrCtrl+4', click: go('compare') },
        { label: 'Combinar', accelerator: 'CmdOrCtrl+5', click: go('pairs') },
        { label: 'Duplicadas', accelerator: 'CmdOrCtrl+6', click: go('duplicates') },
        { type: 'separator' },
        { label: 'Lista', accelerator: 'CmdOrCtrl+L', click: () => send('menu:layout', 'list') },
        { label: 'Grade', accelerator: 'CmdOrCtrl+G', click: () => send('menu:layout', 'grid') },
        { type: 'separator' },
        { label: 'Aumentar prévia', accelerator: 'CmdOrCtrl+=', click: () => send('menu:size', 8) },
        { label: 'Diminuir prévia', accelerator: 'CmdOrCtrl+-', click: () => send('menu:size', -8) },
        { type: 'separator' },
        { role: 'togglefullscreen', label: 'Tela cheia' },
        ...(app.isPackaged ? [] : [{ role: 'toggleDevTools', label: 'Ferramentas de desenvolvedor' }]),
      ],
    },
    { label: 'Janela', submenu: [{ role: 'minimize', label: 'Minimizar' }, { role: 'zoom', label: 'Zoom' }, ...(isMac ? [{ role: 'front', label: 'Trazer tudo para a frente' }] : [{ role: 'close', label: 'Fechar' }])] },
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

function createWindow(visible = true) {
  win = new BrowserWindow({
    width: 1360,
    height: 860,
    minWidth: 980,
    minHeight: 620,
    title: 'GESFONT',
    icon: isMac ? undefined : path.join(__dirname, 'assets', 'icon.png'),
    backgroundColor: nativeTheme.shouldUseDarkColors ? '#0b0b0b' : '#f7f6f3',
    titleBarStyle: isMac ? 'hiddenInset' : 'default',
    trafficLightPosition: { x: 16, y: 18 },
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      spellcheck: false,
    },
  });
  win.loadFile(path.join(__dirname, '..', 'renderer', 'index.html'));
  win.once('ready-to-show', () => { if (visible) win.show(); });
  win.on('close', (e) => {
    if (!quitting && store.data.settings.hideToTray) {
      e.preventDefault();
      win.hide();
      if (isMac && app.dock) app.dock.hide();
    }
  });
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  });
  win.webContents.on('will-navigate', (e) => e.preventDefault());
}

app.setName('GESFONT');
if (process.env.GESFONT_DATA) app.setPath('userData', process.env.GESFONT_DATA);

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', () => showWindow());
  app.whenReady().then(async () => {
    store = new Store(dataDir());
    if (!store.data.settings.rootDir) store.data.settings.rootDir = defaultRoot();
    if (store.data.settings.updatePrefVersion !== 1) { store.data.settings.autoUpdate = true; store.data.settings.updatePrefVersion = 1; store.save(); }
    nativeTheme.themeSource = store.data.settings.theme || 'system';
    if (activator.reconcile(store)) store.save();
    await ensureRoot();
    registerIpc();
    buildMenu();
    const hidden = store.data.settings.startHidden && openedAtLogin();
    syncTray();
    createWindow(!hidden);
    if (hidden && isMac && app.dock) app.dock.hide();
    updater.init({ send, showWindow, settings: () => store.data.settings, beforeInstall: () => { quitting = true; try { store.flush(); } catch {} } });
    // mantém a pasta principal e as pastas do usuário sincronizadas em segundo plano
    setTimeout(async () => {
      await scanFolder(rootDir());
      watchFolder(rootDir());
      for (const f of store.data.folders) {
        if (fs.existsSync(f)) { await scanFolder(f); watchFolder(f); }
      }
      changed();
      await scanSystem();
      watchSystem();
    }, 400);
    app.on('activate', () => showWindow());
  });
}

app.on('before-quit', async (e) => {
  if (quitting || !store) return;
  e.preventDefault();
  quitting = true;
  try {
    if (store.data.settings.deactivateOnQuit) {
      for (const file of Object.keys(store.data.activated)) await activator.deactivateFile(store, file);
    }
    store.flush();
  } catch {}
  app.quit();
});

app.on('window-all-closed', () => { if (!isMac && !store?.data.settings.hideToTray) app.quit(); });
