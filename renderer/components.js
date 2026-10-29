// Componentes reutilizados: linha e card de família, menu de contexto, seletores de coleção, fonte e tags.
import { h, icon, iconButton, toggle, popover, closePopover, menu, prompt, confirmBox, fmt, toast } from './lib/ui.js';
import { applyFace, applyGoogle, styleName, defaultStyle } from './lib/fonts.js';
import {
  S, api, activeState, toggleFamily, toggleFavorite, toggleCompare, inCompare, navigate, addToCollection,
  createCollection, families, libraryMap, googleFamily, resolveFamily, CATEGORY_LABEL, classify, installGoogle,
  setFamilyName, restoreFamilyName, trashPaths, userTags, autoTags, allTags, setTags,
} from './state.js';
import { moveMenu } from './folders.js';

export const rowFace = new Map(); // família -> face escolhida na linha

export function previewFor(fam) {
  return S.previewText || fam.name;
}

export function rowHeight(size) {
  return Math.round(size * 1.35) + 86;
}

export function cardHeight(size) {
  return Math.round(size * 1.9) + 76;
}

// Aplica a prévia de uma família num elemento, usando a face escolhida.
export function paintPreview(el, fam, choice) {
  if (fam.kind === 'google') {
    const lib = libraryMap().get(fam.key);
    if (lib && !choice) return paintPreview(el, lib);
    applyGoogle(el, fam.gf, choice && choice.weight ? choice : defaultStyle(fam.gf.styles));
    return;
  }
  const picked = !fam.single && rowFace.get(fam.key);
  const face = (choice && fam.faces.find((f) => f.id === choice)) || (picked && fam.faces.find((f) => f.id === picked)) || fam.primary;
  if (face) applyFace(el, face);
}

function familyMeta(fam) {
  const out = [];
  if (fam.kind === 'google') {
    out.push(fmt.plural(fam.gf.styles.length, 'estilo', 'estilos'));
    if (fam.designer) out.push(fam.designer);
  } else if (fam.single) {
    out.push(fam.faces[0].format.toUpperCase());
    if (fam.designer) out.push(fam.designer);
  } else {
    out.push(fmt.plural(fam.faces.length, 'estilo', 'estilos'));
    if (fam.designer) out.push(fam.designer);
  }
  return out;
}

function tagChips(fam) {
  const tags = [...autoTags(fam).map((t) => ({ t, auto: true })), ...userTags(fam.key).map((t) => ({ t, auto: false }))];
  return tags.map(({ t, auto }) => h('button', {
    class: 'tag' + (auto ? ' is-auto' : ''), title: auto ? 'Tag automática' : `Ver fontes com a tag ${t}`,
    onClick: (e) => { e.stopPropagation(); if (!auto) navigate('tag', t); },
  }, t));
}

// Indicador de ativação usado na grade (círculo vazio, meio cheio ou cheio).
export function statusDot(fam) {
  const st = activeState(fam);
  const lib = fam.kind === 'google' ? libraryMap().get(fam.key) : null;
  const cloud = fam.kind === 'google' && !lib;
  const label = fam.kind === 'system' ? (fam.faces.every((f) => f.sysKind === 'native') ? 'Fonte nativa do sistema, sempre ativa' : 'Instalada no sistema, sempre ativa. Revise na Verificação.')
    : cloud ? 'Baixar e ativar' : st === 'disabled' ? 'Formato web, não pode ser ativado'
      : st === 'on' ? 'Desativar' : 'Ativar';
  return h('button', {
    class: `status is-${fam.kind === 'system' ? 'system' : cloud && st !== 'busy' ? 'cloud' : st}`,
    title: label, 'aria-label': label, 'aria-pressed': st === 'on' ? 'true' : st === 'mixed' ? 'mixed' : 'false',
    disabled: st === 'disabled' || st === 'busy' || fam.kind === 'system',
    onClick: (e) => { e.stopPropagation(); toggleFamily(fam); },
  });
}

function attachCommon(el, fam, opts) {
  el.addEventListener('click', () => navigate('detail', fam.key));
  el.addEventListener('keydown', (e) => { if (e.key === 'Enter') navigate('detail', fam.key); });
  el.addEventListener('contextmenu', (e) => familyMenu(e, fam, opts));
  el.draggable = true;
  el.addEventListener('dragstart', (e) => {
    e.dataTransfer.setData('application/x-gesfont-family', fam.key);
    e.dataTransfer.effectAllowed = 'copy';
    document.body.classList.add('is-dragging-family');
  });
  el.addEventListener('dragend', () => document.body.classList.remove('is-dragging-family'));
}

function missingRow(fam, onRemove, cls) {
  return h('div', { class: cls + ' is-missing' },
    h('div', { class: 'frow-head' },
      h('span', { class: 'fname' }, fam.name),
      h('span', { class: 'fmeta' }, 'Não está na biblioteca, no sistema nem no Google Fonts'),
      h('div', { class: 'frow-actions' }, onRemove ? iconButton('x', 'Remover da coleção', (e) => { e.stopPropagation(); onRemove(fam); }) : null)));
}

export function familyRow(fam, opts = {}) {
  const { onRemove, size } = opts;
  if (fam.kind === 'missing') return missingRow(fam, onRemove, 'frow');
  const row = h('div', { class: 'frow', tabindex: '0', role: 'button', 'aria-label': `Abrir ${fam.name}` });
  const lib = fam.kind === 'google' ? libraryMap().get(fam.key) : null;
  const fav = S.favorites.has(fam.key);
  const st = activeState(fam);

  let styleSel = null;
  const stylesSource = fam.kind === 'google' && !lib ? null : (lib || fam);
  if (!fam.single && stylesSource && stylesSource.faces.length > 1) {
    const current = rowFace.get(fam.key) || stylesSource.primary.id;
    styleSel = h('select', { class: 'mini-select', title: 'Estilo da prévia', onClick: (e) => e.stopPropagation(), onChange: (e) => { rowFace.set(fam.key, e.target.value); paintPreview(preview, stylesSource, e.target.value); } },
      stylesSource.faces.map((f) => h('option', { value: f.id, selected: f.id === current }, f.style)));
  } else if (fam.kind === 'google' && !lib && fam.gf.styles.length > 1) {
    styleSel = h('select', { class: 'mini-select', title: 'Estilo da prévia', onClick: (e) => e.stopPropagation(), onChange: (e) => { const s = fam.gf.styles[e.target.value]; paintPreview(preview, fam, s); } },
      fam.gf.styles.map((s, i) => h('option', { value: i, selected: s === defaultStyle(fam.gf.styles) }, styleName(s))));
  }

  const badges = [];
  if (fam.kind === 'system') badges.push(fam.faces.every((f) => f.sysKind === 'native')
    ? h('span', { class: 'badge', title: 'Faz parte do sistema operacional. Sempre ativa, não pode ser movida nem apagada.' }, icon('lock', 'badge-ico'), 'Nativa')
    : h('button', { class: 'badge is-strong', title: 'Instalada no sistema por fora do GESFONT. Clique para revisar.', onClick: (e) => { e.stopPropagation(); navigate('review'); } }, 'Instalada no sistema'));
  if (fam.kind === 'google' && !lib) badges.push(h('span', { class: 'badge' }, 'Google Fonts'));
  if (fam.kind === 'google' && lib) badges.push(h('span', { class: 'badge' }, 'Na biblioteca'));
  if (fam.duplicates) badges.push(h('button', { class: 'badge is-strong', title: 'Há estilos repetidos em arquivos diferentes. Clique para revisar.', onClick: (e) => { e.stopPropagation(); navigate('duplicates'); } }, 'Duplicada'));
  if (fam.kind === 'local' && fam.faces.every((f) => !f.activatable)) badges.push(h('span', { class: 'badge', title: 'WOFF e WOFF2 são formatos web' }, 'Formato web'));

  const preview = h('div', { class: 'frow-preview', style: { fontSize: (size || S.size) + 'px' } }, previewFor(fam));
  paintPreview(preview, fam);

  const toggleTitle = fam.kind === 'system' ? 'Fonte do sistema, sempre ativa' : fam.kind === 'google' && !lib ? 'Baixar e ativar' : st === 'on' ? 'Desativar' : 'Ativar';

  row.append(
    h('div', { class: 'frow-head' },
      h('button', { class: 'star' + (fav ? ' is-on' : ''), title: fav ? 'Remover das favoritas' : 'Adicionar às favoritas', 'aria-pressed': fav ? 'true' : 'false', onClick: (e) => { e.stopPropagation(); toggleFavorite(fam.key); } }, icon('star')),
      h('span', { class: 'fname' }, fam.name),
      ...familyMeta(fam).map((m) => h('span', { class: 'fmeta' }, m)),
      ...badges,
      ...tagChips(fam),
      h('div', { class: 'frow-actions' },
        styleSel,
        iconButton('plus', 'Adicionar a uma coleção', (e) => { e.stopPropagation(); collectionPicker(e.currentTarget, [fam.key]); }),
        iconButton('compare', inCompare(fam.key) ? 'Tirar da comparação' : 'Comparar', (e) => { e.stopPropagation(); toggleCompare(fam, rowFace.get(fam.key)); }, inCompare(fam.key) ? 'is-on' : ''),
        iconButton('more', 'Mais opções', (e) => { e.stopPropagation(); familyMenu(e.currentTarget, fam, opts); }),
        onRemove ? iconButton('x', 'Remover da coleção', (e) => { e.stopPropagation(); onRemove(fam); }) : null,
        toggle(st, () => toggleFamily(fam), toggleTitle))),
    preview);
  attachCommon(row, fam, opts);
  return row;
}

// Card da visualização em grade.
export function familyCard(fam, opts = {}) {
  const { onRemove } = opts;
  if (fam.kind === 'missing') {
    return h('div', { class: 'gcard is-missing' }, h('div', { class: 'gcard-head' }, h('span', { class: 'gname' }, fam.name),
      onRemove ? iconButton('x', 'Remover da coleção', () => onRemove(fam), 'gcard-x') : null), h('div', { class: 'gcard-sample gcard-missing' }, 'Não encontrada'));
  }
  const lib = fam.kind === 'google' ? libraryMap().get(fam.key) : null;
  const fav = S.favorites.has(fam.key);
  const count = fam.kind === 'google' ? (lib ? lib.faces.length : fam.gf.styles.length) : fam.faces.length;
  const fmtLabel = fam.kind === 'google' && !lib ? 'Google' : (lib || fam).formats;
  const card = h('div', { class: 'gcard', tabindex: '0', role: 'button', 'aria-label': `Abrir ${fam.name}` });
  const sample = h('div', { class: 'gcard-sample', style: { fontSize: S.size + 'px' } }, S.gridText || 'a');
  paintPreview(sample, fam);
  card.append(
    h('div', { class: 'gcard-head' },
      statusDot(fam),
      h('span', { class: 'gname', title: fam.name }, fam.name),
      h('span', { class: 'gfmt' }, fmtLabel),
      fam.single ? null : h('span', { class: 'gcount' }, String(count)),
      h('div', { class: 'gcard-actions' },
        h('button', { class: 'gview', onClick: (e) => { e.stopPropagation(); navigate('detail', fam.key); } }, 'Ver'),
        iconButton('compare', inCompare(fam.key) ? 'Tirar da comparação' : 'Comparar', (e) => { e.stopPropagation(); toggleCompare(fam); }, inCompare(fam.key) ? 'is-on' : ''),
        h('button', { class: 'star star-sm' + (fav ? ' is-on' : ''), title: fav ? 'Remover das favoritas' : 'Adicionar às favoritas', 'aria-pressed': fav ? 'true' : 'false', onClick: (e) => { e.stopPropagation(); toggleFavorite(fam.key); } }, icon('star')))),
    sample);
  if (fav) card.classList.add('is-fav');
  attachCommon(card, fam, opts);
  return card;
}

// Menu de contexto de uma família (botão direito ou botão de mais opções).
export function familyMenu(anchorOrEvent, fam, { onRemove } = {}) {
  const lib = fam.kind === 'google' ? libraryMap().get(fam.key) : null;
  const local = fam.kind === 'local' ? fam : lib;
  const st = activeState(fam);
  const fav = S.favorites.has(fam.key);
  const files = local ? [...new Set(local.faces.map((f) => f.path))] : [];
  const point = anchorOrEvent instanceof MouseEvent
    ? { getBoundingClientRect: () => ({ left: anchorOrEvent.clientX, right: anchorOrEvent.clientX, top: anchorOrEvent.clientY, bottom: anchorOrEvent.clientY }) }
    : anchorOrEvent;
  const whole = local && fam.single ? libraryMap().get(fam.key) : local;
  menu(anchorOrEvent, [
    { label: 'Abrir', action: () => navigate('detail', fam.key) },
    fam.kind === 'google' && !lib
      ? { label: 'Baixar e ativar', action: () => installGoogle(fam.gf, true) }
      : st !== 'disabled' && fam.kind !== 'system' ? { label: st === 'on' ? 'Desativar' : 'Ativar', action: () => toggleFamily(fam) } : null,
    fam.kind === 'google' && !lib ? { label: 'Adicionar à biblioteca', action: () => installGoogle(fam.gf, false) } : null,
    { label: fav ? 'Remover das favoritas' : 'Adicionar às favoritas', action: () => toggleFavorite(fam.key) },
    { label: 'Adicionar à coleção…', action: () => collectionPicker(point, [fam.key]) },
    { label: 'Tags…', action: () => tagEditor(point, fam.key, fam.name) },
    { label: inCompare(fam.key) ? 'Tirar da comparação' : 'Comparar', action: () => toggleCompare(fam) },
    whole ? '-' : null,
    whole ? { label: 'Mover para pasta…', action: () => moveMenu(point, whole.key) } : null,
    whole ? { label: 'Renomear família…', action: () => prompt('Renomear família', whole.name, (v) => { setFamilyName(whole, v); toast(`Família renomeada para ${v}`); }, 'Renomear') } : null,
    whole ? { label: 'Mesclar com outra família…', action: () => fontPicker(point, (target) => { setFamilyName(whole, target.name); toast(`${whole.name} mesclada em ${target.name}`); }, { title: `Mesclar ${whole.name} em`, only: 'library', exclude: whole.key }) } : null,
    whole && whole.renamed ? { label: 'Restaurar nome original', action: () => restoreFamilyName(whole) } : null,
    files.length || fam.kind === 'system' ? '-' : null,
    files.length || fam.kind === 'system' ? { label: S.platform === 'darwin' ? 'Mostrar no Finder' : 'Mostrar na pasta', action: () => api.reveal((files[0] || fam.faces[0].path)) } : null,
    files.length ? {
      label: 'Mover para a Lixeira…', danger: true, action: () => confirmBox(`Mover ${fam.name} para a Lixeira?`,
        `${fmt.plural(files.length, 'arquivo vai', 'arquivos vão')} para a Lixeira e ${files.length === 1 ? 'sai' : 'saem'} do GESFONT. Dá para recuperar pela Lixeira.`,
        'Mover para a Lixeira', () => trashPaths(files)),
    } : null,
    onRemove ? '-' : null,
    onRemove ? { label: 'Remover da coleção', action: () => onRemove(fam) } : null,
  ]);
}

export function collectionPicker(anchor, keys) {
  const input = h('input', { class: 'field field-sm', placeholder: 'Nova coleção', onKeydown: (e) => {
    if (e.key === 'Enter' && input.value.trim()) { const c = createCollection(input.value.trim(), keys); closePopover(); toast(`Coleção ${c.name} criada`); }
  } });
  const list = S.collections.length
    ? S.collections.map((c) => {
      const has = keys.every((k) => c.families.includes(k));
      return h('button', { class: 'menu-item', onClick: () => { closePopover(); addToCollection(c.id, keys); } },
        h('span', { class: 'dot', style: { background: c.color } }), h('span', {}, c.name), has ? icon('check', 'menu-check') : null);
    })
    : [h('p', { class: 'menu-empty' }, 'Crie a primeira coleção, por exemplo com o nome de um cliente.')];
  popover(anchor, h('div', { class: 'menu' }, h('div', { class: 'menu-title' }, 'Adicionar à coleção'), list, h('div', { class: 'menu-sep' }), h('div', { class: 'menu-input' }, input)), { width: 240, align: 'right' });
  input.focus();
}

export function tagEditor(anchor, key, name) {
  const box = h('div', { class: 'menu tag-editor' });
  const draw = () => {
    box.innerHTML = '';
    const current = userTags(key);
    const input = h('input', { class: 'field field-sm', placeholder: 'Nova tag, Enter para adicionar', onKeydown: (e) => {
      if (e.key === 'Enter' && input.value.trim()) { setTags(key, [...current, input.value.trim()]); draw(); }
    } });
    const suggestions = allTags().map(([t]) => t).filter((t) => !current.includes(t)).slice(0, 12);
    box.append(
      h('div', { class: 'menu-title' }, `Tags de ${name}`),
      h('div', { class: 'tag-list' }, current.length
        ? current.map((t) => h('button', { class: 'tag is-removable', title: 'Remover tag', onClick: () => { setTags(key, current.filter((x) => x !== t)); draw(); } }, t, icon('x')))
        : h('p', { class: 'menu-empty' }, 'Sem tags. Use tags como estilo, uso ou cliente: elegante, títulos, varejo.')),
      h('div', { class: 'menu-input' }, input),
      suggestions.length ? h('div', { class: 'tag-list tag-suggest' }, suggestions.map((t) => h('button', { class: 'tag', onClick: () => { setTags(key, [...current, t]); draw(); } }, '+ ' + t))) : '');
    setTimeout(() => input.focus(), 0);
  };
  draw();
  popover(anchor, box, { width: 280 });
}

// Seletor de fonte com busca em biblioteca, sistema e Google Fonts.
export function fontPicker(anchor, onPick, { title = 'Escolher fonte', only = null, exclude = null } = {}) {
  const results = h('div', { class: 'picker-results' });
  const input = h('input', { class: 'field field-sm', placeholder: 'Buscar fonte', onInput: () => draw() });
  const all = (() => {
    const lib = families('library');
    const sys = only ? [] : families('system');
    const g = only ? [] : (S.google.list || []).map(googleFamily);
    const seen = new Set(exclude ? [exclude] : []);
    const out = [];
    for (const f of [...lib, ...sys, ...g]) { if (seen.has(f.key)) continue; seen.add(f.key); out.push(f); }
    return out;
  })();
  function draw() {
    const q = input.value.trim().toLowerCase();
    const list = (q ? all.filter((f) => f.key.includes(q)) : all).slice(0, 60);
    results.innerHTML = '';
    if (!list.length) results.append(h('p', { class: 'menu-empty' }, 'Nenhuma fonte com esse nome.'));
    for (const fam of list) {
      const label = h('span', { class: 'picker-name' }, fam.name);
      paintPreview(label, fam);
      results.append(h('button', { class: 'menu-item picker-item', onClick: () => { closePopover(); onPick(resolveFamily(fam.key) || fam); } },
        label, h('span', { class: 'picker-src' }, fam.kind === 'google' ? 'Google' : fam.kind === 'system' ? 'Sistema' : 'Biblioteca')));
    }
  }
  draw();
  popover(anchor, h('div', { class: 'menu picker' }, h('div', { class: 'menu-title' }, title), h('div', { class: 'menu-input' }, input), results), { width: 320 });
  input.focus();
}

export { classify, CATEGORY_LABEL };
