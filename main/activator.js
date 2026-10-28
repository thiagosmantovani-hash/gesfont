// Ativa e desativa fontes no sistema operacional, sem mexer nos arquivos originais.
// macOS: copia para ~/Library/Fonts (o sistema detecta sozinho).
// Windows: copia para a pasta de fontes do usuário e registra em HKCU.
// Linux: copia para ~/.local/share/fonts/gesfont e atualiza o fc-cache.
const fs = require('fs');
const fsp = fs.promises;
const os = require('os');
const path = require('path');
const { execFile } = require('child_process');

const platform = process.platform;

function targetDir() {
  if (platform === 'darwin') return path.join(os.homedir(), 'Library', 'Fonts');
  if (platform === 'win32') return path.join(process.env.LOCALAPPDATA || path.join(os.homedir(), 'AppData', 'Local'), 'Microsoft', 'Windows', 'Fonts');
  return path.join(os.homedir(), '.local', 'share', 'fonts', 'gesfont');
}

function run(cmd, args) {
  return new Promise((resolve) => execFile(cmd, args, { windowsHide: true }, (err, stdout) => resolve({ err, stdout })));
}

let fcTimer = null;
function refreshCache() {
  if (platform !== 'linux') return;
  clearTimeout(fcTimer);
  fcTimer = setTimeout(() => run('fc-cache', ['-f', targetDir()]), 400);
}

async function sameFile(a, b) {
  try {
    const [sa, sb] = await Promise.all([fsp.stat(a), fsp.stat(b)]);
    return sa.size === sb.size;
  } catch { return false; }
}

async function activateFile(store, file, regName) {
  const d = store.data;
  if (d.activated[file] && fs.existsSync(d.activated[file].dest)) return { ok: true, already: true };
  const dir = targetDir();
  await fsp.mkdir(dir, { recursive: true });
  const ext = path.extname(file);
  const base = path.basename(file, ext);
  let dest = path.join(dir, base + ext);

  if (fs.existsSync(dest)) {
    const ours = Object.values(d.activated).some((a) => a.dest === dest);
    if (!ours && (await sameFile(file, dest))) {
      // o mesmo arquivo já está instalado manualmente: não duplica
      return { ok: false, reason: 'installed', message: 'Esta fonte já está instalada no sistema.' };
    }
    dest = path.join(dir, `${base}-gesfont-${Date.now().toString(36)}${ext}`);
  }

  await fsp.copyFile(file, dest);
  const record = { dest, at: Date.now() };

  if (platform === 'win32') {
    const name = `${regName || base} (TrueType)`;
    const r = await run('reg', ['add', 'HKCU\\Software\\Microsoft\\Windows NT\\CurrentVersion\\Fonts', '/v', name, '/t', 'REG_SZ', '/d', dest, '/f']);
    if (!r.err) record.regName = name;
  }
  d.activated[file] = record;
  refreshCache();
  return { ok: true };
}

async function deactivateFile(store, file) {
  const d = store.data;
  const rec = d.activated[file];
  if (!rec) return { ok: true };
  if (platform === 'win32' && rec.regName) {
    await run('reg', ['delete', 'HKCU\\Software\\Microsoft\\Windows NT\\CurrentVersion\\Fonts', '/v', rec.regName, '/f']);
  }
  try {
    await fsp.unlink(rec.dest);
  } catch (e) {
    if (e.code !== 'ENOENT') return { ok: false, message: 'O arquivo está em uso. Feche os apps que usam a fonte e tente de novo.' };
  }
  delete d.activated[file];
  refreshCache();
  return { ok: true };
}

// Remove registros de fontes que o usuário apagou manualmente da pasta de destino.
function reconcile(store) {
  const d = store.data;
  let changed = false;
  for (const [file, rec] of Object.entries(d.activated)) {
    if (!fs.existsSync(rec.dest)) { delete d.activated[file]; changed = true; }
  }
  return changed;
}

function systemFontDirs() {
  const home = os.homedir();
  if (platform === 'darwin') return ['/System/Library/Fonts', '/Library/Fonts', path.join(home, 'Library', 'Fonts')];
  if (platform === 'win32') return [path.join(process.env.WINDIR || 'C:\\Windows', 'Fonts'), targetDir()];
  return ['/usr/share/fonts', '/usr/local/share/fonts', path.join(home, '.local', 'share', 'fonts'), path.join(home, '.fonts')];
}

module.exports = { activateFile, deactivateFile, reconcile, targetDir, systemFontDirs, platform };
