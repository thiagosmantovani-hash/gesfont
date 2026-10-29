// Telas de lista: biblioteca, ativas, favoritas, sistema, coleção, pasta, tag e Google Fonts.
// Cada tela pode ser vista em lista (prévia longa) ou em grade (um glifo por família).
import { h, icon, iconButton, toggle, menu, prompt, confirmBox, toast, fmt, debounce, popover, closePopover } from '../lib/ui.js';
import { VirtualList } from '../lib/virtual.js';
import {
  S, api, listFamilies, resolveFamily, googleFamily, activeState, setFamiliesActive, navigate, loadGoogle,
  saveCollections, deleteCollection, removeFromCollection, classify, presets, persistPreview, saveSettings,
  libraryMap, COLORS, COLOR_NAMES, reload, saveLocal, renameTag, deleteTag, setFacesActive, pendingReviewCount,
} from '../state.js';
import { familyRow, familyCard, rowHeight, cardHeight } from '../components.js';
import { isInRoot, relPath, newFolder, renameFolder, trashFolder } from '../folders.js';

const GOOGLE_CATS = [['all', 'Todas'], ['sans', 'Sem serifa'], ['serif', 'Serifada'], ['display', 'Display'], ['handwriting', 'Manuscrita'], ['mono', 'Monoespaçada']];
const SCROLL = { slow: 0.55, normal: 1, fast: 1.9 };
const CARD_MIN = 230;

const isRoot = (route) => route.view === 'folder' && route.param === S.rootDir;

function scopeInfo(route) {
  const { view, param } = route;
  if (view === 'collection') {
    const col = S.collections.find((c) => c.id === param);
    return { title: col ? col.name : 'Coleção', col };
  }
  if (view === 'folder') return isRoot(route) ? { title: 'GESFONT', subtitle: param } : { title: param.split(/[\\/]/).pop(), subtitle: param, inRoot: isInRoot(param) };
  if (view === 'tag') return { title: param, tag: true };
  return {
    library: { title: 'Todas as fontes' },
    active: { title: 'Ativas' },
    favorites: { title: 'Favoritas' },
    native: { title: 'Fontes nativas' },
    google: { title: 'Google Fonts' },
  }[view] || { title: '' };
}

function baseItems(route) {
  const { view, param } = route;
  switch (view) {
    case 'library': return listFamilies('library');
    case 'active': return listFamilies('library').filter((f) => ['on', 'mixed'].includes(activeState(f)));
    case 'favorites': return [...S.favorites].map(resolveFamily).filter(Boolean);
    case 'native': return listFamilies('native');
    case 'folder': return listFamilies('folder:' + param);
    case 'google': return (S.google.list || []).map(googleFamily);
    case 'tag': return Object.entries(S.tags).filter(([, t]) => t.includes(param)).map(([k]) => resolveFamily(k)).filter(Boolean);
    case 'collection': {
      const col = S.collections.find((c) => c.id === param);
      if (!col) return [];
      return col.families.map((k) => resolveFamily(k) || { key: k, name: k, kind: 'missing', faces: [] });
    }
    default: return [];
  }
}

function filterSort(items, route) {
  const q = S.search.trim().toLowerCase();
  let out = items;
  if (q) out = out.filter((f) => f.key.includes(q) || f.name.toLowerCase().includes(q) || (f.designer || '').toLowerCase().includes(q) || (S.tags[f.key] || []).some((t) => t.toLowerCase().includes(q)));
  if (S.filter !== 'all') {
    if (S.filter === 'variable') out = out.filter((f) => f.variable);
    else out = out.filter((f) => f.kind !== 'missing' && (f.kind === 'google' ? f.gf.category : classify(f)) === S.filter);
  }
  const sort = route.view === 'google' && S.sort === 'name' && !S._userSorted ? 'popular' : S.sort;
  const by = {
    name: (a, b) => a.name.localeCompare(b.name, 'pt-BR'),
    styles: (a, b) => ((b.faces.length || (b.gf ? b.gf.styles.length : 0)) - (a.faces.length || (a.gf ? a.gf.styles.length : 0))) || a.name.localeCompare(b.name),
    recent: (a, b) => (b.gf ? b.gf.dateAdded.localeCompare(a.gf.dateAdded) : (b.addedAt || 0) - (a.addedAt || 0)),
    popular: (a, b) => (a.gf && b.gf ? a.gf.popularity - b.gf.popularity : a.name.localeCompare(b.name)),
  }[sort] || ((a, b) => a.name.localeCompare(b.name));
  if (route.view === 'collection' && S.sort === 'name' && !S._userSorted) return out; // mantém a ordem da coleção
  return out.slice().sort(by);
}

export function mountList(root, route) {
  const info = scopeInfo(route);
  if (route.view === 'google') loadGoogle();
  let layout = S.settings.view === 'grid' ? 'grid' : 'list';
  let cols = 1;
  let items = [];

  const scroller = h('div', { class: 'list-scroller', tabindex: '-1' });
  const countEl = h('span', { class: 'view-count' });
  const headActions = h('div', { class: 'view-actions' });
  const chips = h('div', { class: 'chips' });
  const empty = h('div', { class: 'empty' });

  // rolagem com velocidade ajustável
  scroller.addEventListener('wheel', (e) => {
    const k = SCROLL[S.settings.scrollSpeed] || 1;
    if (k === 1 || e.ctrlKey) return;
    e.preventDefault();
    scroller.scrollTop += e.deltaY * k;
  }, { passive: false });

  // ---------- barra de teste ----------
  const layoutSeg = h('div', { class: 'seg', role: 'group', 'aria-label': 'Visualização' },
    h('button', { class: 'seg-btn seg-icon', 'data-v': 'list', title: 'Lista', 'aria-label': 'Lista', onClick: () => setLayout('list') }, icon('rows')),
    h('button', { class: 'seg-btn seg-icon', 'data-v': 'grid', title: 'Grade', 'aria-label': 'Grade', onClick: () => setLayout('grid') }, icon('grid')));

  const search = h('label', { class: 'search' }, icon('search'),
    h('input', { id: 'search-input', type: 'search', placeholder: route.view === 'google' ? 'Buscar no Google Fonts' : 'Buscar família, designer ou tag', value: S.search, onInput: debounce((e) => { S.search = e.target.value; refresh(true); }, 120) }));

  const textInput = h('input', { class: 'preview-input', onInput: debounce((e) => {
    if (layout === 'grid') { S.gridText = e.target.value; saveLocal('gridText', S.gridText); } else S.previewText = e.target.value;
    list.refresh();
  }, 80) });
  const presetBtn = iconButton('chevron', 'Textos prontos', (e) => {
    const opts = layout === 'grid'
      ? ['a', 'Aa', 'g', 'R', '&', 'Ag', '1'].map((t) => ({ label: t, checked: S.gridText === t, action: () => setText(t) }))
      : presets().map((p) => ({ label: p.label, checked: S.previewText === p.text, action: () => setText(p.text) }));
    menu(e.currentTarget, opts);
  }, 'preset-btn');
  function setText(t) {
    if (layout === 'grid') { S.gridText = t; saveLocal('gridText', t); } else S.previewText = t;
    textInput.value = t;
    list.refresh();
  }
  function syncTextInput() {
    textInput.value = layout === 'grid' ? S.gridText : S.previewText;
    textInput.placeholder = layout === 'grid' ? 'Caractere da grade' : 'Digite um texto para testar';
  }

  const sizeVal = h('span', { class: 'size-val' }, S.size + ' px');
  const sizeInput = h('input', { type: 'range', min: '12', max: '200', value: S.size, class: 'range', 'aria-label': 'Tamanho da prévia', onInput: (e) => setSize(+e.target.value) });

  const sortSel = h('select', { class: 'select', 'aria-label': 'Ordenar', onChange: (e) => { S.sort = e.target.value; S._userSorted = true; refresh(true); } },
    [['name', 'Nome'], ['styles', 'Mais estilos'], ['recent', route.view === 'google' ? 'Mais recentes' : 'Adicionadas recentemente'], ...(route.view === 'google' ? [['popular', 'Mais populares']] : [])]
      .map(([v, l]) => h('option', { value: v, selected: (route.view === 'google' && !S._userSorted ? 'popular' : S.sort) === v }, l)));

  const filterSel = route.view === 'google' ? null : h('select', { class: 'select', 'aria-label': 'Classificação', onChange: (e) => { S.filter = e.target.value; refresh(true); } },
    [['all', 'Todas as classificações'], ['sans', 'Sem serifa'], ['serif', 'Serifada'], ['mono', 'Monoespaçada'], ['handwriting', 'Manuscrita'], ['display', 'Display'], ['variable', 'Somente variáveis']]
      .map(([v, l]) => h('option', { value: v, selected: S.filter === v }, l)));

  function itemHeight() { return layout === 'grid' ? cardHeight(S.size) : rowHeight(S.size); }

  function setSize(v) {
    S.size = Math.max(12, Math.min(200, v));
    sizeInput.value = S.size; sizeVal.textContent = S.size + ' px';
    list.setRowHeight(itemHeight());
    persistPreview();
  }

  function setLayout(v) {
    if (v === layout) return;
    layout = v;
    saveSettings({ view: v });
    scroller.classList.toggle('is-grid', v === 'grid');
    layoutSeg.querySelectorAll('.seg-btn').forEach((b) => b.classList.toggle('is-on', b.dataset.v === v));
    syncTextInput();
    list.rowHeight = itemHeight(); // os itens mudam de formato junto com a altura
    paintItems(true);
  }
  layoutSeg.querySelectorAll('.seg-btn').forEach((b) => b.classList.toggle('is-on', b.dataset.v === layout));
  scroller.classList.toggle('is-grid', layout === 'grid');
  syncTextInput();

  const titleExtra = route.view === 'collection' && info.col
    ? h('button', { class: 'col-dot-btn', title: 'Mudar cor', onClick: (e) => colorMenu(e.currentTarget, info.col) }, h('span', { class: 'dot dot-lg', style: { background: info.col.color } }))
    : info.tag ? h('span', { class: 'tag tag-title' }, 'Tag') : null;

  const header = h('header', { class: 'view-head' },
    h('div', { class: 'view-title-row' },
      titleExtra,
      h('h1', { class: 'view-title', title: info.subtitle || '', onDblclick: () => info.col && rename(info.col) }, info.title),
      countEl, headActions),
    isRoot(route) ? h('p', { class: 'view-sub' }, 'Todas as fontes guardadas na pasta GESFONT e nas subpastas. Arraste fontes para esta pasta pelo Finder e elas aparecem aqui sozinhas. ', h('button', { class: 'link', onClick: () => api.openRoot() }, S.rootDir)) : null,
    route.view === 'native' ? h('p', { class: 'view-sub' }, 'Fontes que fazem parte do sistema operacional. Ficam sempre ativas e não podem ser movidas nem apagadas, nem pelo GESFONT. Dá para ver, comparar, combinar e pôr em coleções.') : null,
    info.inRoot ? h('p', { class: 'view-sub' }, h('button', { class: 'link', onClick: () => navigate('folder', S.rootDir) }, 'GESFONT'), ' / ' + relPath(route.param)) : null,
    h('div', { class: 'testbar' },
      layoutSeg,
      search,
      h('div', { class: 'preview-field' }, textInput, presetBtn),
      h('div', { class: 'size-field' }, sizeInput, sizeVal),
      filterSel, sortSel),
    route.view === 'google' ? chips : null);

  root.append(header, scroller, empty);

  const opts = { onRemove: route.view === 'collection' ? (f) => removeFromCollection(route.param, f.key) : null };
  const list = new VirtualList(scroller, {
    rowHeight: itemHeight(),
    render: (item) => {
      if (layout === 'list') return familyRow(item, opts);
      const row = h('div', { class: 'grow', style: { gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` } });
      for (const fam of item) row.append(familyCard(fam, opts));
      return row;
    },
  });

  function computeCols() {
    return Math.max(1, Math.floor((scroller.clientWidth - 24) / CARD_MIN));
  }
  function paintItems(reset) {
    if (layout === 'grid') {
      cols = computeCols();
      const rows = [];
      for (let i = 0; i < items.length; i += cols) rows.push(items.slice(i, i + cols));
      list.setItems(rows, { keepScroll: !reset });
    } else list.setItems(items, { keepScroll: !reset });
  }
  const ro = new ResizeObserver(() => { if (layout === 'grid' && computeCols() !== cols) paintItems(false); });
  ro.observe(scroller);

  // ---------- ações do cabeçalho ----------
  function buildActions(visible) {
    headActions.innerHTML = '';
    const v = route.view;
    if (v === 'library') {
      headActions.append(
        h('button', { class: 'btn', onClick: () => api.chooseFiles() }, icon('download'), 'Importar arquivos'),
        h('button', { class: 'btn btn-primary', onClick: () => api.chooseFolders() }, icon('folder'), 'Adicionar pasta'));
    } else if (v === 'active' && visible.length) {
      headActions.append(h('button', { class: 'btn', onClick: () => confirmBox('Desativar todas as fontes?', 'As fontes saem do sistema, mas continuam na sua biblioteca. Apps abertos podem precisar ser reiniciados.', 'Desativar todas', async () => { await api.deactivateAll(); await reload(); toast('Todas as fontes foram desativadas'); }) }, 'Desativar todas'));
    } else if (v === 'native') {
      const pending = pendingReviewCount();
      headActions.append(...[
        pending ? h('button', { class: 'btn', onClick: () => navigate('review') }, icon('shield'), `Verificar ${fmt.plural(pending, 'instalada', 'instaladas')}`) : null,
        h('button', { class: 'btn', onClick: () => api.scanSystem() }, icon('refresh'), 'Ler novamente'),
      ].filter(Boolean));
    } else if (v === 'google') {
      headActions.append(h('button', { class: 'btn', onClick: () => loadGoogle(true) }, icon('refresh'), 'Atualizar catálogo'));
    } else if (v === 'folder') {
      const faces = listFamilies('folder:' + route.param).flatMap((f) => f.faces).filter((f) => f.activatable);
      const allOn = faces.length && faces.every((f) => S.activated.has(f.path));
      headActions.append(...[
        faces.length ? h('label', { class: 'collection-toggle' }, toggle(allOn ? 'on' : faces.some((f) => S.activated.has(f.path)) ? 'mixed' : 'off', () => setFacesActive(faces, !allOn), allOn ? 'Desativar pasta' : 'Ativar pasta'), h('span', {}, allOn ? 'Pasta ativa' : 'Ativar pasta')) : null,
        h('button', { class: 'btn', onClick: () => api.openPath(route.param) }, icon('eye'), S.platform === 'darwin' ? 'Abrir no Finder' : 'Abrir pasta'),
        info.inRoot || isRoot(route) ? h('button', { class: 'btn', onClick: () => newFolder(route.param) }, icon('plus'), isRoot(route) ? 'Nova pasta' : 'Nova subpasta') : null,
        info.inRoot ? iconButton('more', 'Mais opções', (e) => menu(e.currentTarget, [
          { label: 'Renomear…', action: () => renameFolder(route.param) },
          { label: 'Atualizar', action: () => api.rescan() },
          '-',
          { label: 'Mover para a Lixeira…', danger: true, action: () => trashFolder(route.param) },
        ])) : null,
        isRoot(route) || info.inRoot ? null : h('button', { class: 'btn', onClick: () => confirmBox('Remover esta pasta?', 'As fontes dela saem do GESFONT e são desativadas. Os arquivos continuam no seu computador.', 'Remover pasta', async () => { await api.removeFolder(route.param); navigate('library'); }) }, 'Remover pasta'),
      ].filter(Boolean));
    } else if (v === 'tag') {
      headActions.append(iconButton('more', 'Mais opções', (e) => menu(e.currentTarget, [
        { label: 'Renomear tag', action: () => prompt('Renomear tag', route.param, (n) => { renameTag(route.param, n); navigate('tag', n, { push: false }); }) },
        { label: 'Excluir tag', danger: true, action: () => confirmBox(`Excluir a tag ${route.param}?`, 'A tag sai de todas as famílias. As fontes não são afetadas.', 'Excluir', () => { deleteTag(route.param); navigate('library'); }) },
      ])));
    } else if (v === 'collection' && info.col) {
      const col = info.col;
      const fams = visible.filter((f) => f.kind !== 'missing');
      const states = fams.map(activeState).filter((s) => s !== 'disabled');
      const st = !states.length ? 'disabled' : states.every((s) => s === 'on') ? 'on' : states.some((s) => s === 'on' || s === 'mixed') ? 'mixed' : 'off';
      const exportIds = fams.flatMap((f) => (f.kind === 'google' ? (libraryMap().get(f.key) || { faces: [] }).faces : f.faces)).map((f) => f.id);
      headActions.append(
        h('label', { class: 'collection-toggle' }, toggle(st, () => setFamiliesActive(fams, st !== 'on'), st === 'on' ? 'Desativar coleção' : 'Ativar coleção'), h('span', {}, st === 'on' ? 'Coleção ativa' : 'Ativar coleção')),
        h('button', { class: 'btn', disabled: !exportIds.length, title: 'Copia os arquivos das fontes para uma pasta, para enviar ao cliente ou à equipe', onClick: async () => { const r = await api.exportFonts(exportIds, col.name); if (r) toast(`${fmt.plural(r.count, 'arquivo exportado', 'arquivos exportados')}`); } }, icon('export'), 'Exportar arquivos'),
        iconButton('more', 'Mais opções', (e) => menu(e.currentTarget, [
          { label: 'Renomear', action: () => rename(col) },
          { label: 'Mudar cor', action: () => colorMenu(e.target, col) },
          '-',
          { label: 'Excluir coleção', danger: true, action: () => confirmBox(`Excluir ${col.name}?`, 'As fontes continuam na biblioteca. Só a coleção é apagada.', 'Excluir', () => { deleteCollection(col.id); navigate('library'); }) },
        ])));
    }
  }

  function rename(col) {
    prompt('Renomear coleção', col.name, (v) => { col.name = v; saveCollections(); });
  }

  function colorMenu(anchor, col) {
    popover(anchor, h('div', { class: 'swatches' }, COLORS.map((c, i) => h('button', { class: 'swatch' + (c === col.color ? ' is-on' : ''), style: { background: c }, title: COLOR_NAMES[i], 'aria-label': COLOR_NAMES[i], onClick: () => { col.color = c; saveCollections(); closePopover(); } }))), { width: 172 });
  }

  // ---------- chips de categoria (Google) ----------
  function buildChips() {
    if (route.view !== 'google') return;
    chips.innerHTML = '';
    for (const [v, l] of GOOGLE_CATS) {
      chips.append(h('button', { class: 'chip' + (S.filter === v ? ' is-on' : ''), onClick: () => { S.filter = v; buildChips(); refresh(true); } }, l));
    }
    chips.append(h('button', { class: 'chip' + (S.filter === 'variable' ? ' is-on' : ''), onClick: () => { S.filter = S.filter === 'variable' ? 'all' : 'variable'; buildChips(); refresh(true); } }, 'Variáveis'));
  }

  // ---------- estado vazio ----------
  function emptyState(visible, all) {
    empty.innerHTML = '';
    empty.hidden = true;
    scroller.hidden = false;
    if (visible.length) return;
    let node;
    const v = route.view;
    if (all.length && (S.search || S.filter !== 'all')) {
      node = [h('h2', {}, 'Nada encontrado'), h('p', {}, 'Nenhuma família corresponde à busca ou ao filtro.'), h('button', { class: 'btn', onClick: () => { S.search = ''; S.filter = 'all'; document.getElementById('search-input').value = ''; if (filterSel) filterSel.value = 'all'; buildChips(); refresh(true); } }, 'Limpar busca e filtro')];
    } else if (info.inRoot) {
      node = [h('div', { class: 'drop-art', 'aria-hidden': 'true' }, 'Aa'), h('h2', {}, 'Pasta vazia'),
        h('p', {}, 'Arraste famílias da lista para esta pasta na barra lateral, ou solte arquivos de fonte aqui pelo Finder.'),
        h('div', { class: 'empty-actions' }, h('button', { class: 'btn btn-primary', onClick: () => api.openPath(route.param) }, icon('folder'), S.platform === 'darwin' ? 'Abrir no Finder' : 'Abrir pasta'))];
    } else if (v === 'library' || isRoot(route)) {
      node = [h('div', { class: 'drop-art', 'aria-hidden': 'true' }, 'Aa'), h('h2', {}, 'Arraste pastas ou arquivos de fonte para cá'),
        h('p', {}, 'Arquivos soltos vão para a pasta GESFONT na sua pasta de usuário. Pastas adicionadas são lidas no lugar, sem mover nada.'),
        h('div', { class: 'empty-actions' },
          h('button', { class: 'btn btn-primary', onClick: () => api.openRoot() }, icon('folder'), 'Abrir pasta GESFONT'),
          h('button', { class: 'btn', onClick: () => api.chooseFolders() }, 'Adicionar outra pasta'),
          h('button', { class: 'btn', onClick: () => navigate('google') }, 'Explorar Google Fonts'))];
    } else if (v === 'active') node = [h('h2', {}, 'Nenhuma fonte ativa'), h('p', {}, 'Use o interruptor ao lado de uma família, ou o círculo na grade, para ativá-la no sistema.')];
    else if (v === 'favorites') node = [h('h2', {}, 'Nenhuma favorita ainda'), h('p', {}, 'Marque a estrela de uma família para encontrá-la aqui.')];
    else if (v === 'collection') node = [h('h2', {}, 'Coleção vazia'), h('p', {}, 'Arraste famílias para esta coleção na barra lateral, ou use o botão + em qualquer família.')];
    else if (v === 'tag') node = [h('h2', {}, 'Nenhuma família com esta tag'), h('p', {}, 'Adicione tags pelo menu de uma família, com o botão direito.')];
    else if (v === 'native' && S.settings.systemScanned && !S.scan) node = [h('h2', {}, 'Nenhuma fonte nativa encontrada'), h('button', { class: 'btn', onClick: () => api.scanSystem() }, 'Ler novamente')];
    else if (v === 'native') node = [h('h2', {}, 'Lendo as fontes do sistema'), h('p', {}, 'A primeira leitura leva alguns segundos. As próximas são instantâneas.')];
    else if (v === 'google') {
      if (S.google.loading) node = [h('h2', {}, 'Carregando o catálogo'), h('p', {}, 'São mais de 1.800 famílias. Leva alguns segundos.')];
      else if (S.google.error) node = [h('h2', {}, 'Catálogo indisponível'), h('p', {}, S.google.error), h('button', { class: 'btn btn-primary', onClick: () => loadGoogle(true) }, 'Tentar de novo')];
      else node = [h('h2', {}, 'Carregando o catálogo')];
    } else node = [h('h2', {}, 'Nenhuma fonte nesta pasta')];
    empty.append(...node);
    empty.hidden = false;
    scroller.hidden = true;
  }

  function refresh(resetScroll = false) {
    const all = baseItems(route);
    items = filterSort(all, route);
    const noun = S.settings.groupFamilies === false && !['google', 'favorites', 'collection', 'tag'].includes(route.view) ? ['estilo', 'estilos'] : ['família', 'famílias'];
    countEl.textContent = all.length ? (items.length === all.length ? fmt.plural(all.length, ...noun) : `${fmt.int(items.length)} de ${fmt.int(all.length)}`) : '';
    buildActions(items);
    emptyState(items, all);
    paintItems(resetScroll);
  }

  buildChips();
  refresh(true);
  if (route.view === 'native' && !S.settings.systemScanned && !S.scan) api.scanSystem();

  return {
    update: (reason) => { if (reason === 'size') { setSize(S.size); return; } refresh(false); },
    setSize,
    setLayout,
    destroy: () => { ro.disconnect(); list.destroy(); },
  };
}
