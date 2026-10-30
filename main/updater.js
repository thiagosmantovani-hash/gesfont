// Atualizações automáticas a partir das Releases do GitHub (thiagosmantovani-hash/gesfont-releases).
//
// Dois modos:
// - "squirrel": o electron-updater padrão (o equivalente ao Sparkle no Electron). Usado no Windows,
//   no Linux e no Mac quando o app tem assinatura Developer ID da Apple.
// - "swap": usado no Mac sem assinatura, onde o macOS não deixa o Squirrel trocar o app.
//   O GESFONT baixa o .zip da versão nova, confere o SHA-512 publicado no latest-mac.yml,
//   extrai, e ao reiniciar um script troca o GESFONT.app em Aplicativos e abre a versão nova.
const { app, shell, net, Notification, BrowserWindow } = require('electron');
const { execFile, spawn } = require('child_process');
const crypto = require('crypto');
const fs = require('fs');
const fsp = fs.promises;
const os = require('os');
const path = require('path');

const OWNER = 'thiagosmantovani-hash';
const REPO = 'gesfont-releases';
const RELEASES_URL = `https://github.com/${OWNER}/${REPO}/releases/latest`;
const SIX_HOURS = 6 * 3600 * 1000;

let autoUpdater = null;
let ctx = null;
let mode = 'squirrel';
let state = { phase: 'idle', version: null, percent: 0, message: null, manualUrl: null };
let manualCheck = false;
let pending = null;      // { version, appPath } pronto para trocar (modo swap)
let downloading = null;  // versão sendo baixada (modo swap)
let wantInstall = false; // o usuário aceitou baixar e instalar a versão encontrada
let asking = false;      // o aviso de nova versão está aberto
let dismissed = null;    // versão que o usuário adiou nesta sessão
let lastInfo = null;

// Ganchos de teste (GESFONT_UPDATE_*): só valem com o app rodando a partir do código, nunca no app instalado.
const testEnv = (name) => (app.isPackaged ? undefined : process.env[name]);
const TRUSTED = [`https://github.com/${OWNER}/${REPO}/releases/download/`];

function set(patch) {
  state = { ...state, ...patch };
  if (ctx) ctx.send('update:status', { ...state, manual: manualCheck });
}

function status() {
  return { ...state, mode, packaged: app.isPackaged, current: app.getVersion() };
}

// Caminho do GESFONT.app em execução (no Mac: .../GESFONT.app/Contents/MacOS/GESFONT).
function appBundlePath() {
  if (testEnv('GESFONT_UPDATE_DEST')) return testEnv('GESFONT_UPDATE_DEST');
  return path.resolve(process.execPath, '..', '..', '..');
}

function run(cmd, args) {
  return new Promise((resolve) => execFile(cmd, args, (err, stdout, stderr) => resolve({ err, stdout: String(stdout || ''), stderr: String(stderr || '') })));
}

async function detectMode() {
  if (testEnv('GESFONT_UPDATE_MODE')) return testEnv('GESFONT_UPDATE_MODE');
  if (process.platform !== 'darwin') return 'squirrel';
  const r = await run('/usr/bin/codesign', ['-dv', '--verbose=2', appBundlePath()]);
  return /Authority=Developer ID Application/.test(r.stderr) ? 'squirrel' : 'swap';
}

function manual(message) {
  set({ phase: 'manual', manualUrl: RELEASES_URL, message });
}

async function init(context) {
  ctx = context;
  if (!app.isPackaged && !testEnv('GESFONT_UPDATE_MODE')) { state.phase = 'dev'; return; }
  try { ({ autoUpdater } = require('electron-updater')); } catch { state.phase = 'unavailable'; return; }
  mode = await detectMode();

  // nada é baixado sem o usuário aceitar: o app avisa e pergunta primeiro
  autoUpdater.autoDownload = false;
  autoUpdater.autoInstallOnAppQuit = mode === 'squirrel';
  autoUpdater.logger = null;
  if (testEnv('GESFONT_UPDATE_FEED')) autoUpdater.setFeedURL({ provider: 'generic', url: testEnv('GESFONT_UPDATE_FEED') });
  if (!app.isPackaged) autoUpdater.forceDevUpdateConfig = true; // só em testes com GESFONT_UPDATE_MODE

  autoUpdater.on('checking-for-update', () => { if (!downloading && !pending) set({ phase: 'checking', message: null }); });
  autoUpdater.on('update-not-available', () => { if (!pending) set({ phase: 'latest' }); manualCheck = false; });
  autoUpdater.on('update-available', (info) => {
    lastInfo = info;
    if (pending && pending.version === info.version) { set({ phase: 'ready', version: info.version }); return; }
    if (downloading === info.version || (state.phase === 'downloading' && state.version === info.version)) return;
    set({ phase: 'available', version: info.version, percent: 0, notes: notesOf(info) });
    if (manualCheck || dismissed !== info.version) ask(info);
  });
  autoUpdater.on('download-progress', (p) => set({ phase: 'downloading', percent: Math.round(p.percent || 0) }));
  autoUpdater.on('update-downloaded', (info) => {
    set({ phase: 'ready', version: info.version, percent: 100 });
    manualCheck = false;
    if (wantInstall) install();
  });
  autoUpdater.on('error', (err) => {
    const msg = String((err && err.message) || err);
    if (/code signature|not signed|ShipIt|did not pass validation/i.test(msg) && state.version) {
      manual('O macOS não deixou trocar o app sozinho. Baixe a versão nova pela página de downloads.');
    } else if (/404|Cannot find|No published versions|ENOTFOUND|net::|ECONN|ETIMEDOUT/i.test(msg)) {
      set({ phase: 'offline', message: 'Não foi possível consultar as atualizações agora.' });
    } else {
      set({ phase: 'error', message: msg.split('\n')[0].slice(0, 200) });
    }
    manualCheck = false;
  });

  setTimeout(() => check(false), 15000);
  setInterval(() => check(false), SIX_HOURS);
}

// ---------- aviso de nova versão ----------
function notesOf(info) {
  const raw = Array.isArray(info.releaseNotes) ? info.releaseNotes.map((n) => n.note).join('\n') : (info.releaseNotes || '');
  return String(raw).replace(/<[^>]+>/g, '').replace(/\n{3,}/g, '\n\n').trim().slice(0, 700);
}

function mainWindow() {
  return BrowserWindow.getAllWindows().find((w) => !w.isDestroyed()) || null;
}

// Mostra o aviso de nova versão no centro do app (bloqueia o uso até fechar ou atualizar).
// Com a janela escondida, avisa por notificação do sistema e abre o aviso ao clicar.
function ask(info) {
  const win = mainWindow();
  if (!win || !win.isVisible()) {
    if (Notification.isSupported()) {
      const n = new Notification({ title: `GESFONT ${info.version} disponível`, body: 'Clique para ver as novidades e atualizar.' });
      n.on('click', () => { if (ctx.showWindow) ctx.showWindow(); setTimeout(() => ask(info), 400); });
      n.show();
    }
    return;
  }
  asking = true;
  ctx.send('update:prompt', { version: info.version, current: app.getVersion(), notes: notesOf(info) });
}

// Resposta do aviso: aceitar (baixar e instalar) ou adiar até a próxima abertura.
function respond(answer) {
  asking = false;
  manualCheck = false;
  if (answer === 'accept') accept();
  else if (state.version) { dismissed = state.version; set({ phase: 'available' }); }
}

// O usuário aceitou: baixa e, ao terminar, instala e reabre.
function accept() {
  wantInstall = true;
  dismissed = null;
  if (state.phase === 'ready') { install(); return; }
  if (mode === 'swap') { if (lastInfo) swapDownload(lastInfo); return; }
  set({ phase: 'downloading', percent: 0 });
  autoUpdater.downloadUpdate().catch(() => {});
}

async function check(isManual) {
  if (!autoUpdater) {
    if (isManual && ctx) ctx.send('update:status', { ...state, manual: true });
    return status();
  }
  if (!isManual && ctx.settings().autoUpdate === false) return status();
  if (downloading) return status();
  manualCheck = isManual;
  if (isManual && state.phase === 'available' && lastInfo) { ask(lastInfo); return status(); }
  try { await autoUpdater.checkForUpdates(); } catch {}
  return status();
}

// ---------- modo swap ----------
function pickZip(info) {
  const zips = (info.files || []).filter((f) => /\.zip$/i.test(f.url));
  const arm = process.arch === 'arm64';
  return zips.find((f) => (arm ? /arm64/i.test(f.url) : !/arm64/i.test(f.url))) || zips[0] || null;
}

// Endereço do arquivo da versão nova. Só aceita arquivos das Releases do próprio GESFONT.
function assetUrl(info, file) {
  const feed = testEnv('GESFONT_UPDATE_FEED');
  const version = String(info.version || '');
  if (!/^\d+\.\d+\.\d+([-.][0-9A-Za-z.-]+)?$/.test(version)) throw new Error('número de versão inválido');
  const base = (feed || `https://github.com/${OWNER}/${REPO}/releases/download/v${version}`).replace(/\/$/, '');
  const url = /^https?:\/\//.test(file.url) ? file.url : `${base}/${encodeURIComponent(file.url)}`;
  const trusted = feed ? [base + '/'] : TRUSTED;
  if (!trusted.some((t) => url.startsWith(t))) throw new Error('endereço de download fora das Releases do GESFONT');
  return url;
}

async function download(url, dest, size) {
  const res = await net.fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const total = Number(res.headers.get('content-length')) || size || 0;
  const out = fs.createWriteStream(dest);
  const hash = crypto.createHash('sha512');
  const reader = res.body.getReader();
  let got = 0, last = -1;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    const buf = Buffer.from(value);
    hash.update(buf);
    got += buf.length;
    if (!out.write(buf)) await new Promise((r) => out.once('drain', r));
    const pct = total ? Math.floor((got / total) * 100) : 0;
    if (pct !== last) { last = pct; set({ phase: 'downloading', percent: pct }); }
  }
  await new Promise((r, j) => out.end((e) => (e ? j(e) : r())));
  return hash.digest('base64');
}

async function findApp(dir) {
  for (const e of await fsp.readdir(dir, { withFileTypes: true })) {
    if (e.isDirectory() && e.name.endsWith('.app')) return path.join(dir, e.name);
  }
  return null;
}

async function swapDownload(info) {
  const file = pickZip(info);
  if (!file) { manual('A versão nova não tem o arquivo de atualização para Mac.'); return; }
  downloading = info.version;
  set({ phase: 'downloading', version: info.version, percent: 0, message: null });
  try {
    const work = path.join(app.getPath('userData'), 'atualizacao');
    await fsp.rm(work, { recursive: true, force: true });
    await fsp.mkdir(work, { recursive: true });
    const zip = path.join(work, 'GESFONT.zip');
    if (!file.sha512) throw new Error('a versão publicada não informa a soma de verificação');
    const sha = await download(assetUrl(info, file), zip, file.size);
    if (sha !== file.sha512) throw new Error('O arquivo baixado não confere com a versão publicada.');
    const outDir = path.join(work, 'app');
    await fsp.mkdir(outDir);
    const r = process.platform === 'darwin' ? await run('/usr/bin/ditto', ['-x', '-k', zip, outDir]) : await run('unzip', ['-q', zip, '-d', outDir]);
    if (r.err) throw new Error('Não foi possível abrir o arquivo da atualização.');
    const appPath = await findApp(outDir);
    if (!appPath) throw new Error('A atualização não contém o GESFONT.app.');
    await fsp.rm(zip, { force: true });
    pending = { version: info.version, appPath };
    set({ phase: 'ready', version: info.version, percent: 100 });
    if (wantInstall) setTimeout(() => install(), 600);
  } catch (e) {
    manual(`Não foi possível baixar a atualização (${e.message}). Baixe pela página de downloads.`);
  } finally {
    downloading = null;
    manualCheck = false;
  }
}

function canReplace(dest) {
  if (/\/AppTranslocation\/|^\/Volumes\//.test(dest)) return 'Mova o GESFONT para a pasta Aplicativos para ele conseguir se atualizar sozinho.';
  try { fs.accessSync(path.dirname(dest), fs.constants.W_OK); fs.accessSync(dest, fs.constants.W_OK); } catch {
    return 'Sem permissão para trocar o app na pasta Aplicativos. Baixe a versão nova pela página de downloads.';
  }
  return null;
}

async function swapInstall() {
  const dest = appBundlePath();
  const problem = canReplace(dest);
  if (problem) { manual(problem); return; }
  const script = path.join(os.tmpdir(), `gesfont-update-${Date.now()}.sh`);
  // Espera o app fechar, troca o pacote (com volta atrás se algo falhar) e abre a versão nova.
  await fsp.writeFile(script, `#!/bin/bash
PID="$1"; NEW="$2"; DEST="$3"; OPEN="$4"
for i in $(seq 1 300); do kill -0 "$PID" 2>/dev/null || break; sleep 0.2; done
rm -rf "$DEST.old"
if mv "$DEST" "$DEST.old" && mv "$NEW" "$DEST"; then
  rm -rf "$DEST.old"
else
  [ -e "$DEST.old" ] && [ ! -e "$DEST" ] && mv "$DEST.old" "$DEST"
fi
xattr -dr com.apple.quarantine "$DEST" 2>/dev/null
if [ "$OPEN" = "1" ]; then open "$DEST"; fi
rm -f "$0"
`, { mode: 0o755 });
  const child = spawn('/bin/bash', [script, String(process.pid), pending.appPath, dest, process.platform === 'darwin' ? '1' : '0'], { detached: true, stdio: 'ignore' });
  child.unref();
  pending = null;
  if (ctx.beforeInstall) ctx.beforeInstall();
  setImmediate(() => app.quit());
}

function install() {
  if (state.phase === 'manual') { shell.openExternal(state.manualUrl || RELEASES_URL); return; }
  if (state.phase === 'available') { if (lastInfo) ask(lastInfo); else accept(); return; }
  if (mode === 'swap') {
    if (state.phase === 'ready' && pending) swapInstall();
    return;
  }
  if (state.phase === 'ready' && autoUpdater) {
    if (ctx.beforeInstall) ctx.beforeInstall();
    setImmediate(() => autoUpdater.quitAndInstall(false, true));
  }
}

module.exports = { init, check, install, respond, status, RELEASES_URL };
