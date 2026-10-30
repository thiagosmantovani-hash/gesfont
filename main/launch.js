// Onde o app está instalado e como ele abre junto com o sistema.
//
// Abrir com o sistema no Mac: o GESFONT grava um item de início em ~/Library/LaunchAgents.
// O caminho usado é o do app em Aplicativos, então o item continua valendo depois de cada
// atualização. O registro antigo (SMAppService, usado até a 2.5) dependia da assinatura do app,
// que muda a cada versão de um app sem certificado da Apple, e por isso parava de funcionar.
const { app } = require('electron');
const fs = require('fs');
const os = require('os');
const path = require('path');

const isMac = process.platform === 'darwin';
const LABEL = 'com.thiagomantovani.gesfont.login';
const BUNDLE_ID = 'com.thiagomantovani.gesfont';
const LOGIN_ARG = '--login';

const agentPath = () => path.join(os.homedir(), 'Library', 'LaunchAgents', `${LABEL}.plist`);

// Pasta GESFONT.app (no Mac) a partir do executável.
function bundlePath() {
  if (!isMac) return null;
  const m = process.execPath.match(/^(.*?\.app)(?=\/Contents\/MacOS\/)/);
  return m ? m[1] : null;
}

function placement() {
  if (!isMac || !app.isPackaged) return { ok: true, packaged: app.isPackaged };
  const bundle = bundlePath() || '';
  const translocated = bundle.includes('/AppTranslocation/');
  const dmg = bundle.startsWith('/Volumes/');
  let inApps = false;
  try { inApps = app.isInApplicationsFolder(); } catch {}
  return { ok: inApps && !translocated && !dmg, packaged: true, inApplications: inApps, translocated, dmg, bundle };
}

// Copia o app para Aplicativos e abre a cópia de lá. Retorna false se não conseguiu.
function moveToApplications() {
  if (!isMac || !app.isPackaged) return { ok: false, message: 'Disponível só no app instalado no Mac.' };
  try {
    const moved = app.moveToApplicationsFolder({
      // Já existe um GESFONT em Aplicativos: substitui pela cópia que a pessoa acabou de abrir.
      conflictHandler: () => true,
    });
    return moved ? { ok: true } : { ok: false, message: 'O Mac não deixou mover o app.' };
  } catch (e) {
    return { ok: false, message: e.message || 'O Mac não deixou mover o app.' };
  }
}

const xml = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

function agentPlist(bundle) {
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>${LABEL}</string>
  <key>AssociatedBundleIdentifiers</key>
  <string>${BUNDLE_ID}</string>
  <key>ProgramArguments</key>
  <array>
    <string>/usr/bin/open</string>
    <string>-a</string>
    <string>${xml(bundle)}</string>
    <string>--args</string>
    <string>${LOGIN_ARG}</string>
  </array>
  <key>RunAtLoad</key>
  <true/>
  <key>LimitLoadToSessionType</key>
  <string>Aqua</string>
  <key>ProcessType</key>
  <string>Interactive</string>
</dict>
</plist>
`;
}

// Desliga o registro antigo do Electron (SMAppService) uma vez, para não abrir duas vezes.
function clearLegacy(settings) {
  if (settings.loginPrefVersion === 2) return false;
  try { app.setLoginItemSettings({ openAtLogin: false }); } catch {}
  settings.loginPrefVersion = 2;
  return true;
}

/**
 * Aplica "Iniciar com o sistema" de acordo com os ajustes. Chamado ao abrir o app e
 * sempre que o ajuste muda. Retorna o estado para mostrar nos Ajustes.
 */
function applyLogin(settings) {
  const want = !!settings.openAtLogin;
  if (process.platform === 'linux') return { supported: false };
  if (!isMac) {
    // Windows: o registro fica no próprio Windows e aponta para o executável atual.
    try {
      app.setLoginItemSettings({ openAtLogin: want, path: process.execPath, args: [LOGIN_ARG] });
      return { supported: true, on: want, ok: true };
    } catch (e) { return { supported: true, on: false, ok: false, message: e.message }; }
  }
  clearLegacy(settings);
  const file = agentPath();
  if (!want) {
    try { fs.rmSync(file, { force: true }); } catch {}
    return { supported: true, on: false, ok: true };
  }
  if (!app.isPackaged) return { supported: true, on: false, ok: false, reason: 'dev', message: 'Funciona só no app instalado.' };
  const where = placement();
  if (!where.ok) return { supported: true, on: false, ok: false, reason: 'placement', message: 'Mova o GESFONT para a pasta Aplicativos para ele abrir com o Mac.' };
  try {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    const content = agentPlist(where.bundle);
    let current = '';
    try { current = fs.readFileSync(file, 'utf8'); } catch {}
    if (current !== content) fs.writeFileSync(file, content, { mode: 0o644 });
    return { supported: true, on: true, ok: true, file };
  } catch (e) {
    return { supported: true, on: false, ok: false, reason: 'write', message: `Não foi possível criar o item de início: ${e.message}` };
  }
}

function openedAtLogin() {
  if (process.argv.includes(LOGIN_ARG) || process.argv.includes('--hidden')) return true;
  try { return isMac && app.getLoginItemSettings().wasOpenedAtLogin; } catch { return false; }
}

module.exports = { placement, moveToApplications, applyLogin, openedAtLogin, agentPlist, agentPath, LOGIN_ARG };
