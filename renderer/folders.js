// Pastas dentro da pasta GESFONT: árvore da barra lateral, criar, renomear, apagar e mover fontes.
import { h, icon, menu, prompt, confirmBox, toast, fmt } from './lib/ui.js';
import { S, api, navigate, families, libraryMap, reload, setFacesActive, saveLocal } from './state.js';

const collapsed = new Set((() => { try { return JSON.parse(localStorage.getItem('gf.collapsed')) || []; } catch { return []; } })());
const saveCollapsed = () => saveLocal('collapsed', [...collapsed]);

export const isInRoot = (p) => !!S.rootDir && (p === S.rootDir || p.startsWith(S.rootDir + S.sep));
export const relPath = (p) => (isInRoot(p) ? p.slice(S.rootDir.length + 1).split(S.sep).join(' / ') : p);

export function flatTree(nodes = S.tree, depth = 0, out = []) {
  for (const n of nodes) { out.push({ ...n, depth }); flatTree(n.children, depth + 1, out); }
  return out;
}

function report(r, what) {
  if (!r || r.ok === false) { toast((r && r.message) || 'Não foi possível concluir.', 'error'); return false; }
  if (what) toast(what);
  return true;
}

export function newFolder(parent = S.rootDir) {
  prompt(parent === S.rootDir ? 'Nova pasta na GESFONT' : `Nova pasta em ${parent.split(S.sep).pop()}`, '', async (name) => {
    const dir = await api.mkdir(parent, name);
    await reload();
    if (parent !== S.rootDir) { collapsed.delete(parent); saveCollapsed(); }
    navigate('folder', dir);
  }, 'Criar pasta');
}

export function renameFolder(dir) {
  prompt('Renomear pasta', dir.split(S.sep).pop(), async (name) => {
    const r = await api.renameFolder(dir, name);
    if (report(r, 'Pasta renomeada')) { await reload(); if (S.route.view === 'folder' && S.route.param === dir) navigate('folder', r.path, { push: false }); }
  }, 'Renomear');
}

export function trashFolder(dir) {
  const n = S.faces.filter((f) => f.path.startsWith(dir + S.sep)).length;
  confirmBox(`Mover ${dir.split(S.sep).pop()} para a Lixeira?`,
    n ? `A pasta e ${fmt.plural(n, 'estilo', 'estilos')} dentro dela vão para a Lixeira. Fontes ativas são desativadas antes. Dá para recuperar pela Lixeira.` : 'A pasta está vazia e vai para a Lixeira.',
    'Mover para a Lixeira', async () => {
      const r = await api.trashFolder(dir);
      if (report(r, 'Pasta movida para a Lixeira')) { await reload(); if (S.route.view === 'folder' && S.route.param.startsWith(dir)) navigate('library', null, { push: false }); }
    });
}

// Move os arquivos de uma família para uma pasta da GESFONT.
export async function moveFamilyTo(key, dest) {
  const fam = libraryMap().get(key);
  if (!fam) { toast('Só fontes da biblioteca podem ser movidas para uma pasta.', 'error'); return; }
  const paths = [...new Set(fam.faces.filter((f) => f.source !== 'system').map((f) => f.path))];
  await movePaths(paths, dest, fam.name);
}

export async function movePaths(paths, dest, label) {
  const r = await api.moveInto(paths, dest);
  if (!report(r)) return;
  const where = dest === S.rootDir ? 'GESFONT' : dest.split(S.sep).pop();
  const parts = [];
  if (r.moved) parts.push(`${fmt.plural(r.moved, 'arquivo movido', 'arquivos movidos')}`);
  if (r.copied) parts.push(`${fmt.plural(r.copied, 'arquivo copiado', 'arquivos copiados')} de fora da GESFONT`);
  toast(parts.length ? `${label ? label + ': ' : ''}${parts.join(', ')} para ${where}` : `Os arquivos já estavam em ${where}`);
  await reload();
}

export function folderMenu(e, dir) {
  const faces = families('folder:' + dir).flatMap((f) => f.faces).filter((f) => f.activatable);
  const allOn = faces.length && faces.every((f) => S.activated.has(f.path));
  menu(e, [
    { label: S.platform === 'darwin' ? 'Abrir no Finder' : 'Abrir pasta', action: () => api.openPath(dir) },
    faces.length ? { label: allOn ? 'Desativar fontes da pasta' : 'Ativar fontes da pasta', action: () => setFacesActive(faces, !allOn) } : null,
    '-',
    { label: 'Nova subpasta…', action: () => newFolder(dir) },
    { label: 'Renomear…', action: () => renameFolder(dir) },
    '-',
    { label: 'Mover para a Lixeira…', danger: true, action: () => trashFolder(dir) },
  ]);
}

// Menu "Mover para pasta" usado no menu de contexto das famílias.
export function moveMenu(anchor, key) {
  const items = [{ label: 'GESFONT (raiz)', action: () => moveFamilyTo(key, S.rootDir) }];
  for (const n of flatTree()) items.push({ label: ' '.repeat(n.depth) + n.name, action: () => moveFamilyTo(key, n.path) });
  items.push('-', { label: 'Nova pasta…', action: () => prompt('Nova pasta na GESFONT', '', async (name) => { const dir = await api.mkdir(S.rootDir, name); await moveFamilyTo(key, dir); }, 'Criar e mover') });
  menu(anchor, items);
}

// Aceita famílias arrastadas da lista e arquivos arrastados do Finder.
function makeDropTarget(el, dir) {
  el.addEventListener('dragover', (e) => {
    const t = e.dataTransfer.types;
    if (t.includes('application/x-gesfont-family') || t.includes('Files')) { e.preventDefault(); e.stopPropagation(); el.classList.add('is-drop'); }
  });
  el.addEventListener('dragleave', () => el.classList.remove('is-drop'));
  el.addEventListener('drop', async (e) => {
    el.classList.remove('is-drop');
    const key = e.dataTransfer.getData('application/x-gesfont-family');
    const files = [...(e.dataTransfer.files || [])].map((f) => api.pathForFile(f)).filter(Boolean);
    if (!key && !files.length) return;
    e.preventDefault(); e.stopPropagation();
    document.getElementById('dropzone').classList.remove('is-on');
    if (key) await moveFamilyTo(key, dir);
    else await movePaths(files, dir);
  });
}

export function folderTreeNav() {
  const out = [];
  const walk = (nodes, depth) => {
    for (const n of nodes) {
      const on = S.route.view === 'folder' && S.route.param === n.path;
      const count = families('folder:' + n.path).length;
      const open = !collapsed.has(n.path);
      const caret = n.children.length
        ? h('span', { class: 'caret' + (open ? ' is-open' : ''), role: 'button', 'aria-label': open ? 'Recolher' : 'Expandir', onClick: (e) => { e.stopPropagation(); if (open) collapsed.add(n.path); else collapsed.delete(n.path); saveCollapsed(); document.dispatchEvent(new CustomEvent('gf:sidebar')); } }, icon('chevron'))
        : h('span', { class: 'caret is-empty' });
      const el = h('button', {
        class: 'nav-item nav-tree' + (on ? ' is-on' : ''), title: relPath(n.path), 'aria-current': on ? 'page' : null,
        style: { paddingLeft: 4 + depth * 14 + 'px' },
        onClick: () => navigate('folder', n.path),
        onContextmenu: (e) => folderMenu(e, n.path),
      }, caret, icon('folder'), h('span', { class: 'nav-label' }, n.name), count ? h('span', { class: 'nav-count' }, fmt.int(count)) : null);
      makeDropTarget(el, n.path);
      out.push(el);
      if (open) walk(n.children, depth + 1);
    }
  };
  walk(S.tree || [], 0);
  return out;
}

// Área "solte aqui" para a raiz, mostrada só durante o arraste.
export function rootDropTarget() {
  const el = h('div', { class: 'nav-rootdrop' }, 'Solte na raiz da GESFONT');
  makeDropTarget(el, S.rootDir);
  return el;
}
