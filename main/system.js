// Fontes do sistema: onde ficam, quais são nativas e o que fazer com as instaladas por fora do GESFONT.
//
// Nativas: fazem parte do sistema operacional, ficam sempre ativas e não podem ser movidas nem apagadas
//   (no Mac, tudo dentro de /System, protegido pelo próprio macOS).
// Instaladas: alguém instalou depois (você, um instalador, um app). Ficam ativas o tempo todo e
//   podem ser mantidas, movidas para a pasta GESFONT (e passar a ser ativadas pelo app) ou apagadas.
const fs = require('fs');
const fsp = fs.promises;
const os = require('os');
const path = require('path');
const { execFile } = require('child_process');

const platform = process.platform;
const home = os.homedir();

// Cada local: pasta, se é nativa, e se mexer nela pede senha de administrador.
function locations() {
  if (platform === 'darwin') {
    const out = [
      { dir: '/System/Library/Fonts', kind: 'native', label: 'Sistema (macOS)' },
      { dir: '/Library/Apple/System/Library/Fonts', kind: 'native', label: 'Sistema (macOS)' },
      { dir: '/Library/Application Support/Apple/Fonts', kind: 'native', label: 'Apps da Apple' },
      { dir: '/Library/Fonts', kind: 'installed', admin: true, label: 'Todos os usuários' },
      { dir: path.join(home, 'Library', 'Fonts'), kind: 'installed', admin: false, label: 'Seu usuário' },
    ];
    // fontes que o macOS baixa sob demanda (também nativas)
    try {
      for (const e of fs.readdirSync('/System/Library/AssetsV2')) {
        if (/^com_apple_MobileAsset_Font/.test(e)) out.push({ dir: path.join('/System/Library/AssetsV2', e), kind: 'native', label: 'Sistema (macOS, sob demanda)' });
      }
    } catch {}
    return out;
  }
  if (platform === 'win32') {
    const win = process.env.WINDIR || 'C:\\Windows';
    return [
      { dir: path.join(win, 'Fonts'), kind: 'auto', admin: true, label: 'Windows' },
      { dir: path.join(process.env.LOCALAPPDATA || path.join(home, 'AppData', 'Local'), 'Microsoft', 'Windows', 'Fonts'), kind: 'installed', admin: false, label: 'Seu usuário' },
    ];
  }
  return [
    { dir: '/usr/share/fonts', kind: 'native', label: 'Sistema (Linux)' },
    { dir: '/usr/local/share/fonts', kind: 'installed', admin: true, label: 'Todos os usuários' },
    { dir: path.join(home, '.local', 'share', 'fonts'), kind: 'installed', admin: false, label: 'Seu usuário' },
    { dir: path.join(home, '.fonts'), kind: 'installed', admin: false, label: 'Seu usuário' },
  ];
}

const inside = (file, dir) => file === dir || file.startsWith(dir + path.sep);

function locationOf(file) {
  // a pasta mais específica vence (ex.: AssetsV2 dentro de /System)
  return locations().filter((l) => inside(file, l.dir)).sort((a, b) => b.dir.length - a.dir.length)[0] || null;
}

// Classifica uma face já lida. No Windows, a pasta Fonts mistura as do sistema e as instaladas:
// as que vêm da Microsoft são tratadas como nativas.
function classify(face) {
  const loc = locationOf(face.path);
  if (!loc) return { sysKind: 'installed', sysAdmin: false, sysLabel: 'Sistema' };
  let kind = loc.kind;
  if (kind === 'auto') kind = /microsoft/i.test(`${face.manufacturer || ''} ${face.copyright || ''}`) ? 'native' : 'installed';
  const apple = /apple/i.test(`${face.manufacturer || ''} ${face.copyright || ''}`);
  return { sysKind: kind, sysAdmin: !!loc.admin, sysLabel: loc.label, sysVendor: apple ? 'apple' : null };
}

function installedDirs() {
  return locations().filter((l) => l.kind !== 'native').map((l) => l.dir);
}

// ---------- aplicar decisões da verificação ----------
const q = (s) => `'${String(s).replace(/'/g, `'\\''`)}'`;

function uniqueDest(dir, file) {
  const ext = path.extname(file);
  const base = path.basename(file, ext);
  let dest = path.join(dir, base + ext);
  let n = 2;
  while (fs.existsSync(dest)) dest = path.join(dir, `${base} ${n++}${ext}`);
  return dest;
}

async function moveFile(src, dest) {
  try { await fsp.rename(src, dest); } catch (e) {
    if (e.code === 'EXDEV') { await fsp.copyFile(src, dest); await fsp.unlink(src); return; }
    throw e;
  }
}

// Executa comandos com a senha de administrador (uma vez só para o lote). Só no Mac.
function runAsAdmin(lines) {
  return new Promise((resolve) => {
    if (platform !== 'darwin' || !lines.length) return resolve({ ok: false, message: 'Precisa de permissão de administrador.' });
    const script = path.join(os.tmpdir(), `gesfont-admin-${Date.now()}.sh`);
    fs.writeFileSync(script, `#!/bin/bash\n${lines.join('\n')}\n`, { mode: 0o755 });
    const apple = `do shell script "/bin/bash ${script.replace(/"/g, '\\"')}" with administrator privileges with prompt "O GESFONT precisa da sua senha para mexer em fontes instaladas para todos os usuários."`;
    execFile('/usr/bin/osascript', ['-e', apple], (err, _o, stderr) => {
      try { fs.unlinkSync(script); } catch {}
      if (err) resolve({ ok: false, message: /-128|cancel/i.test(String(stderr)) ? 'Você cancelou o pedido de senha.' : 'Não foi possível obter permissão de administrador.' });
      else resolve({ ok: true });
    });
  });
}

/**
 * items: [{ path, action }] com action = 'keep' | 'move' | 'move-active' | 'trash'
 * moveDir: pasta de destino dentro da GESFONT
 * trashItem: shell.trashItem do Electron
 * Retorna { moved: [{from, to, activate}], trashed: [path], kept: [path], failed: [{path, message}] }
 */
async function resolve(items, moveDir, trashItem) {
  const out = { moved: [], trashed: [], kept: [], failed: [] };
  const needAdmin = [];
  await fsp.mkdir(moveDir, { recursive: true });
  const trashDir = path.join(home, '.Trash');
  for (const it of items) {
    const loc = locationOf(it.path);
    if (!loc || loc.kind === 'native') { out.failed.push({ path: it.path, message: 'Fonte nativa do sistema, não pode ser alterada.' }); continue; }
    if (it.action === 'keep') { out.kept.push(it.path); continue; }
    if (!fs.existsSync(it.path)) { out.failed.push({ path: it.path, message: 'O arquivo não existe mais.' }); continue; }
    try {
      if (it.action === 'trash') { await trashItem(it.path); out.trashed.push(it.path); }
      else { const to = uniqueDest(moveDir, it.path); await moveFile(it.path, to); out.moved.push({ from: it.path, to, activate: it.action === 'move-active' }); }
    } catch (e) {
      if (e.code === 'EACCES' || e.code === 'EPERM' || /permission|not permitted/i.test(String(e.message))) needAdmin.push(it);
      else out.failed.push({ path: it.path, message: e.message });
    }
  }
  if (needAdmin.length) {
    const user = os.userInfo().username;
    const lines = [];
    const plan = [];
    for (const it of needAdmin) {
      const to = it.action === 'trash' ? uniqueDest(trashDir, it.path) : uniqueDest(moveDir, it.path);
      lines.push(`/bin/mv -n ${q(it.path)} ${q(to)} && /usr/sbin/chown ${q(user)} ${q(to)}`);
      plan.push({ it, to });
    }
    const r = await runAsAdmin(lines);
    // confere arquivo por arquivo o que de fato mudou de lugar
    for (const { it, to } of plan) {
      const done = fs.existsSync(to) && !fs.existsSync(it.path);
      if (!done) out.failed.push({ path: it.path, message: r.ok ? 'Não foi possível mover o arquivo.' : r.message });
      else if (it.action === 'trash') out.trashed.push(it.path);
      else out.moved.push({ from: it.path, to, activate: it.action === 'move-active' });
    }
  }
  return out;
}

module.exports = { locations, locationOf, classify, installedDirs, resolve, inside };
