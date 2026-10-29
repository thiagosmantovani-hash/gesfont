// Ponto de entrada do renderer: barra lateral, navegação e arrastar e soltar.
import { h, icon, menu, prompt, confirmBox, toast, fmt } from './lib/ui.js';
import {
  S, api, reload, subscribe, navigate, families, activeState, createCollection, addToCollection, saveCollections,
  deleteCollection, applyTheme, COLORS, COLOR_NAMES, emit, duplicateGroups, similarFamilies, allTags, saveSettings, pendingReviewCount,
} from './state.js';
import { mountList } from './views/list.js';
import { mountDetail } from './views/detail.js';
import { mountCompare } from './views/compare.js';
import { mountPairs } from './views/pairs.js';
import { mountDuplicates } from './views/duplicates.js';
import { mountSettings } from './views/settings.js';
import { mountReview } from './views/review.js';
import { folderTreeNav, rootDropTarget, newFolder, isInRoot, movePaths } from './folders.js';

const sidebar = document.getElementById('sidebar');
const main = document.getElementById('main');
let current = null;
let currentKey = '';

document.documentElement.classList.add('platform-' + (navigator.userAgent.includes('Mac') ? 'mac' : navigator.userAgent.includes('Windows') ? 'win' : 'linux'));

// Monograma GF: o G circular com o F encaixado no quadrante aberto, compartilhando haste e barra.
export function brandMark(size = 22) {
  const el = document.createElement('span');
  el.className = 'brand-mark';
  el.innerHTML = `<svg viewBox="0 0 100 100" width="${size}" height="${size}" aria-hidden="true"><rect width="100" height="100" rx="22" fill="currentColor"/><g fill="none" stroke="var(--mark-ink)" stroke-width="10"><path d="M 50 20 A 30 30 0 1 0 80 50 H 50"/><path d="M 50 15 V 80"/><path d="M 45 20 H 82"/></g></svg>`;
  return el;
}

// ---------- barra lateral ----------
function navItem(view, label, ico, count, param = null) {
  const on = S.route.view === view && (param === null || S.route.param === param);
  return h('button', { class: 'nav-item' + (on ? ' is-on' : ''), 'aria-current': on ? 'page' : null, onClick: () => navigate(view, param) },
    icon(ico), h('span', { class: 'nav-label' }, label), count ? h('span', { class: 'nav-count' }, fmt.int(count)) : null);
}

function drawSidebar() {
  const lib = families('library');
  const active = lib.filter((f) => ['on', 'mixed'].includes(activeState(f))).length;
  const faceCount = S.faces.filter((f) => f.source !== 'system').length;
  const dupCount = duplicateGroups().length + similarFamilies().length;
  const tags = allTags();

  const colItems = S.collections.map((c) => {
    const on = S.route.view === 'collection' && S.route.param === c.id;
    const el = h('button', {
      class: 'nav-item nav-col' + (on ? ' is-on' : ''), 'aria-current': on ? 'page' : null,
      onClick: () => navigate('collection', c.id),
      onContextmenu: (e) => menu(e, [
        { label: 'Renomear', action: () => prompt('Renomear coleção', c.name, (v) => { c.name = v; saveCollections(); }) },
        { label: 'Mudar cor', action: () => menu(e, COLORS.map((col, i) => ({ label: COLOR_NAMES[i], color: col, checked: c.color === col, action: () => { c.color = col; saveCollections(); } }))) },
        '-',
        { label: 'Excluir coleção', danger: true, action: () => confirmBox(`Excluir ${c.name}?`, 'As fontes continuam na biblioteca. Só a coleção é apagada.', 'Excluir', () => { deleteCollection(c.id); if (on) navigate('library'); }) },
      ]),
    }, h('span', { class: 'dot', style: { background: c.color } }), h('span', { class: 'nav-label' }, c.name), c.families.length ? h('span', { class: 'nav-count' }, c.families.length) : null);
    el.addEventListener('dragover', (e) => { if (e.dataTransfer.types.includes('application/x-gesfont-family')) { e.preventDefault(); el.classList.add('is-drop'); } });
    el.addEventListener('dragleave', () => el.classList.remove('is-drop'));
    el.addEventListener('drop', (e) => { e.preventDefault(); e.stopPropagation(); el.classList.remove('is-drop'); const k = e.dataTransfer.getData('application/x-gesfont-family'); if (k) addToCollection(c.id, [k]); });
    return el;
  });

  const otherFolders = S.folders.map((f) => {
    const on = S.route.view === 'folder' && S.route.param === f;
    return h('button', {
      class: 'nav-item' + (on ? ' is-on' : ''), title: f, onClick: () => navigate('folder', f),
      onContextmenu: (e) => menu(e, [
        { label: S.platform === 'darwin' ? 'Mostrar no Finder' : 'Abrir pasta', action: () => api.reveal(f) },
        { label: 'Atualizar', action: () => api.rescan() },
        '-',
        { label: 'Remover pasta do app', danger: true, action: () => confirmBox('Remover esta pasta do app?', 'As fontes dela saem do GESFONT e são desativadas. Os arquivos continuam no seu computador.', 'Remover pasta', async () => { await api.removeFolder(f); if (on) navigate('library'); }) },
      ]),
    }, icon('link'), h('span', { class: 'nav-label' }, f.split(/[\\/]/).pop()));
  });
  const tree = folderTreeNav();

  const tagItems = tags.map(([t, n]) => navItem('tag', t, 'tag', n, t));

  const newCol = h('button', { class: 'nav-add', title: 'Nova coleção', 'aria-label': 'Nova coleção', onClick: newCollection }, icon('plus'));
  const addFolder = h('button', { class: 'nav-add', title: 'Nova pasta na GESFONT', 'aria-label': 'Nova pasta na GESFONT', onClick: () => newFolder() }, icon('plus'));
  const openRoot = h('button', { class: 'nav-add', title: S.platform === 'darwin' ? 'Abrir a pasta GESFONT no Finder' : 'Abrir a pasta GESFONT', 'aria-label': 'Abrir a pasta GESFONT', onClick: () => api.openRoot() }, icon('eye'));
  const settingsOn = S.route.view === 'settings';

  sidebar.innerHTML = '';
  sidebar.append(
    h('div', { class: 'brand' }, brandMark(24), h('span', { class: 'brand-name' }, 'GESFONT')),
    h('nav', { class: 'nav', 'aria-label': 'Navegação' },
      h('div', { class: 'nav-group' },
        navItem('library', 'Todas as fontes', 'library', lib.length),
        navItem('active', 'Ativas', 'zap', active),
        navItem('favorites', 'Favoritas', 'star', S.favorites.size),
        navItem('native', 'Nativas', 'lock', S.settings.systemScanned ? families('native').length : 0),
        reviewNav(),
        navItem('google', 'Google Fonts', 'globe', S.google.list ? S.google.list.length : 0)),
      h('div', { class: 'nav-group' },
        navItem('compare', 'Comparar', 'compare', S.compare.length),
        navItem('pairs', 'Combinar', 'pair', S.pairs.length),
        navItem('duplicates', 'Duplicadas', 'copy', dupCount)),
      h('div', { class: 'nav-group' },
        h('div', { class: 'nav-heading' }, h('span', {}, 'Coleções'), newCol),
        colItems.length ? colItems : h('button', { class: 'nav-hint', onClick: newCollection }, 'Crie uma coleção por cliente ou projeto')),
      tagItems.length ? h('div', { class: 'nav-group' }, h('div', { class: 'nav-heading' }, h('span', {}, 'Tags')), tagItems) : null,
      h('div', { class: 'nav-group' },
        h('div', { class: 'nav-heading' }, h('button', { class: 'nav-heading-btn', title: S.rootDir, onClick: () => navigate('folder', S.rootDir) }, 'Pastas'), h('span', { class: 'nav-heading-actions' }, openRoot, addFolder)),
        tree.length ? tree : h('button', { class: 'nav-hint', onClick: () => newFolder() }, 'Crie pastas dentro da GESFONT, por cliente ou por estilo. Elas também aparecem no Finder.'),
        rootDropTarget()),
      otherFolders.length ? h('div', { class: 'nav-group' },
        h('div', { class: 'nav-heading' }, h('span', {}, 'Outras pastas'), h('button', { class: 'nav-add', title: 'Adicionar pasta externa', 'aria-label': 'Adicionar pasta externa', onClick: () => api.chooseFolders() }, icon('plus'))),
        otherFolders) : null),
    updateBanner(),
    h('footer', { class: 'side-foot' },
      h('div', { class: 'side-stats', id: 'side-stats' }, S.scan
        ? h('span', {}, `Lendo ${S.scan.folder.split(/[\\/]/).pop()}: ${fmt.int(S.scan.done)} de ${fmt.int(S.scan.total)}`)
        : h('span', {}, `${fmt.plural(lib.length, 'família', 'famílias')}, ${fmt.plural(faceCount, 'estilo', 'estilos')}`)),
      h('button', { class: 'icon-btn' + (settingsOn ? ' is-on' : ''), title: 'Ajustes', 'aria-label': 'Ajustes', onClick: () => navigate('settings') }, icon('gear'))));
}

// Aviso de atualização no rodapé da barra lateral.
function updateBanner() {
  const u = S.update || {};
  if (u.phase === 'ready') return h('div', { class: 'update-bar' }, h('span', {}, `Versão ${u.version} pronta`), h('button', { class: 'btn btn-sm btn-primary', onClick: () => api.installUpdate() }, 'Reiniciar e atualizar'));
  if (u.phase === 'manual' || u.phase === 'available') return h('div', { class: 'update-bar' }, h('span', {}, `Versão ${u.version} disponível`), h('button', { class: 'btn btn-sm btn-primary', onClick: () => api.installUpdate() }, u.phase === 'manual' ? 'Baixar' : 'Atualizar'));
  if (u.phase === 'downloading') return h('div', { class: 'update-bar is-quiet' }, h('span', {}, `Baixando a versão ${u.version || 'nova'}: ${u.percent || 0}%`), h('span', { class: 'update-progress' }, h('i', { style: { width: (u.percent || 0) + '%' } })), h('span', { class: 'small' }, 'O app reinicia sozinho ao terminar.'));
  return ''; // nada a mostrar (string vazia: append do DOM escreveria "null")
}

// Etapa de verificação: destaca quantas fontes instaladas no sistema ainda esperam decisão.
function reviewNav() {
  const pending = S.settings.systemScanned ? pendingReviewCount() : 0;
  const on = S.route.view === 'review';
  return h('button', { class: 'nav-item' + (on ? ' is-on' : ''), 'aria-current': on ? 'page' : null, onClick: () => navigate('review') },
    icon('shield'), h('span', { class: 'nav-label' }, 'Verificação'), pending ? h('span', { class: 'nav-pill', title: `${pending} aguardando decisão` }, fmt.int(pending)) : null);
}

// ---------- aviso de nova versão ----------
// Fica no centro do app e bloqueia o uso até a pessoa fechar ou atualizar.
let updateOpen = null;

function showUpdatePrompt(p) {
  const root = document.getElementById('update-root');
  const notes = (p.notes || '').split('\n').map((l) => l.replace(/^[-•*]\s*/, '').trim()).filter(Boolean);
  const close = () => { root.hidden = true; root.innerHTML = ''; updateOpen = null; document.removeEventListener('keydown', onKey, true); };
  const later = () => { api.respondUpdate('dismiss'); close(); };
  const onKey = (e) => {
    if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); if (!updateOpen || !updateOpen.busy) later(); }
    if (e.key === 'Tab') { // mantém o foco dentro do aviso
      const f = [...root.querySelectorAll('button:not([disabled])')];
      if (!f.length) return;
      const i = f.indexOf(document.activeElement);
      if (e.shiftKey && i <= 0) { e.preventDefault(); f[f.length - 1].focus(); } else if (!e.shiftKey && i === f.length - 1) { e.preventDefault(); f[0].focus(); }
    }
  };
  const actions = h('div', { class: 'upd-actions' });
  const progress = h('div', { class: 'upd-progress', hidden: true }, h('div', { class: 'upd-bar' }, h('i')), h('p', { class: 'upd-status' }));
  const card = h('div', { class: 'upd-card', role: 'alertdialog', 'aria-modal': 'true', 'aria-labelledby': 'upd-title', 'aria-describedby': 'upd-desc' },
    h('button', { class: 'icon-btn upd-close', title: 'Fechar', 'aria-label': 'Fechar e atualizar depois', onClick: () => { if (!updateOpen.busy) later(); else close(); } }, icon('x')),
    brandMark(44),
    h('p', { class: 'upd-kicker' }, 'Atualização disponível'),
    h('h2', { id: 'upd-title', class: 'upd-title' }, `GESFONT ${p.version}`),
    h('p', { id: 'upd-desc', class: 'upd-desc' }, `Você está usando a versão ${p.current}. A atualização leva cerca de um minuto: o app baixa a versão nova, fecha e abre de novo. Suas fontes, coleções e ajustes continuam iguais.`),
    notes.length ? h('div', { class: 'upd-notes' }, h('h3', {}, 'Novidades'), h('ul', {}, notes.map((n) => h('li', {}, n)))) : null,
    progress,
    actions);
  actions.append(
    h('button', { class: 'btn', onClick: later }, 'Agora não'),
    h('button', { class: 'btn btn-primary', onClick: () => {
      updateOpen.busy = true;
      api.respondUpdate('accept');
      actions.innerHTML = '';
      actions.append(h('button', { class: 'btn', onClick: close }, 'Continuar usando enquanto baixa'));
      progress.hidden = false;
      paintProgress(S.update || {});
    } }, 'Atualizar agora'));
  root.innerHTML = '';
  root.append(h('div', { class: 'upd-backdrop' }), card);
  root.hidden = false;
  updateOpen = { busy: false, progress };
  document.addEventListener('keydown', onKey, true);
  setTimeout(() => actions.querySelector('.btn-primary')?.focus(), 30);
}

function paintProgress(u) {
  if (!updateOpen || !updateOpen.busy) return;
  const bar = updateOpen.progress.querySelector('.upd-bar i');
  const txt = updateOpen.progress.querySelector('.upd-status');
  const pct = u.phase === 'ready' ? 100 : u.percent || 0;
  bar.style.width = pct + '%';
  if (u.phase === 'ready') updateOpen.progress.parentElement.querySelector('.upd-actions')?.replaceChildren();
  txt.textContent = u.phase === 'ready' ? 'Instalando. O GESFONT vai fechar e abrir de novo.'
    : u.phase === 'manual' || u.phase === 'error' ? (u.message || 'Não foi possível atualizar agora.')
      : `Baixando a versão nova: ${pct}%`;
}

function newCollection() {
  prompt('Nova coleção', '', (name) => { const c = createCollection(name); navigate('collection', c.id); }, 'Criar coleção');
}

// ---------- roteamento ----------
function mountView() {
  if (S.route.view === 'system') S.route = { view: 'native', param: null }; // nome antigo da aba
  const key = S.route.view + ':' + S.route.param;
  if (current && key === currentKey) return;
  if (current) current.destroy();
  main.innerHTML = '';
  currentKey = key;
  const v = S.route.view;
  if (v === 'detail') current = mountDetail(main, S.route);
  else if (v === 'compare') current = mountCompare(main);
  else if (v === 'pairs') current = mountPairs(main);
  else if (v === 'duplicates') current = mountDuplicates(main);
  else if (v === 'settings') current = mountSettings(main);
  else if (v === 'review') current = mountReview(main);
  else current = mountList(main, S.route);
}

subscribe((reason) => {
  if (!S.ready) return;
  drawSidebar();
  if (reason === 'route') mountView();
  else if (current) current.update(reason);
});

// ---------- arrastar arquivos e pastas para a janela ----------
const dropzone = document.getElementById('dropzone');
let dragDepth = 0;
window.addEventListener('dragenter', (e) => { if (e.dataTransfer.types.includes('Files')) { dragDepth++; dropzone.classList.add('is-on'); } });
window.addEventListener('dragleave', () => { dragDepth = Math.max(0, dragDepth - 1); if (!dragDepth) dropzone.classList.remove('is-on'); });
window.addEventListener('dragover', (e) => { if (e.dataTransfer.types.includes('Files')) e.preventDefault(); });
window.addEventListener('drop', async (e) => {
  dragDepth = 0; dropzone.classList.remove('is-on');
  if (!e.dataTransfer.files.length) return;
  e.preventDefault();
  const paths = [...e.dataTransfer.files].map((f) => api.pathForFile(f)).filter(Boolean);
  if (!paths.length) return;
  // numa pasta da GESFONT, os arquivos soltos vão para essa pasta
  if (S.route.view === 'folder' && isInRoot(S.route.param) && S.route.param !== S.rootDir) {
    await movePaths(paths, S.route.param);
    return;
  }
  const r = await api.importPaths(paths);
  const parts = [];
  if (r.folders) parts.push(fmt.plural(r.folders, 'pasta adicionada', 'pastas adicionadas'));
  if (r.files) parts.push(`${fmt.plural(r.files, 'arquivo copiado', 'arquivos copiados')} para a pasta GESFONT`);
  if (r.skipped) parts.push(`${fmt.plural(r.skipped, 'arquivo já estava', 'arquivos já estavam')} lá`);
  toast(parts.length ? parts.join(', ') : 'Nenhum arquivo de fonte encontrado. O GESFONT lê TTF, OTF, TTC, WOFF e WOFF2.', parts.length ? 'info' : 'error');
});

// ---------- eventos do processo principal ----------
const reloadSoon = (() => { let t; return () => { clearTimeout(t); t = setTimeout(reload, 150); }; })();
api.on('library:changed', reloadSoon);
api.on('scan:progress', (p) => {
  S.scan = p.finished ? null : p;
  const el = document.getElementById('side-stats');
  if (el && !p.finished) el.textContent = `Lendo ${p.folder.split(/[\\/]/).pop()}: ${fmt.int(p.done)} de ${fmt.int(p.total)}`;
  if (p.finished) drawSidebar();
});
api.on('menu:navigate', (v) => navigate(v));
api.on('update:prompt', (p) => showUpdatePrompt(p));
api.on('update:status', (u) => {
  S.update = u;
  paintProgress(u);
  drawSidebar();
  if (u.manual && u.phase === 'latest') toast(`Você já está na versão mais recente (${S.appVersion}).`);
  if (u.manual && ['offline', 'error'].includes(u.phase)) toast(u.message || 'Não foi possível verificar atualizações.', 'error');
  if (u.manual && u.phase === 'dev') toast('As atualizações funcionam só no app instalado, não no modo de teste.');
  emit('update');
});
document.addEventListener('gf:sidebar', () => drawSidebar());
api.on('menu:addFolder', () => api.chooseFolders());
api.on('menu:importFiles', () => api.chooseFiles());
api.on('menu:newCollection', newCollection);
api.on('menu:rescan', () => api.rescan());
api.on('menu:find', () => { const s = document.getElementById('search-input'); if (s) { s.focus(); s.select(); } });
api.on('menu:size', (d) => { S.size = Math.max(12, Math.min(200, S.size + d)); if (current && current.setSize) current.setSize(S.size); });
api.on('menu:layout', (v) => { if (current && current.setLayout) current.setLayout(v); else saveSettings({ view: v }); });

window.addEventListener('keydown', (e) => {
  if ((e.metaKey || e.ctrlKey) && e.key === 'f') { const s = document.getElementById('search-input'); if (s) { e.preventDefault(); s.focus(); s.select(); } }
});

// ---------- início ----------
(async () => {
  await reload();
  applyTheme();
  drawSidebar();
  mountView();
  emit('init');
})();
