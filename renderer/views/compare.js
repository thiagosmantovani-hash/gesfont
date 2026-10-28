// Comparar fontes lado a lado com o mesmo texto.
import { h, icon, iconButton, debounce, menu } from '../lib/ui.js';
import { styleName, defaultStyle } from '../lib/fonts.js';
import { S, resolveFamily, libraryMap, saveLocal, emit, navigate, presets, PARAGRAPH, persistPreview, toggleCompare } from '../state.js';
import { paintPreview, fontPicker } from '../components.js';

// Seletor de estilo que funciona para famílias locais e do Google Fonts.
export function styleSelect(fam, current, onChange) {
  const lib = fam.kind === 'google' ? libraryMap().get(fam.key) : null;
  const src = lib || fam;
  if (src.kind === 'google') {
    const styles = src.gf.styles;
    const cur = typeof current === 'number' ? current : styles.indexOf(defaultStyle(styles));
    return h('select', { class: 'select select-sm', 'aria-label': 'Estilo', onChange: (e) => onChange(+e.target.value) },
      styles.map((s, i) => h('option', { value: i, selected: i === cur }, styleName(s))));
  }
  const cur = src.faces.some((f) => f.id === current) ? current : src.primary.id;
  return h('select', { class: 'select select-sm', 'aria-label': 'Estilo', onChange: (e) => onChange(e.target.value) },
    src.faces.map((f) => h('option', { value: f.id, selected: f.id === cur }, f.style)));
}

export function paintChoice(el, fam, choice) {
  const lib = fam.kind === 'google' ? libraryMap().get(fam.key) : null;
  if (lib) return paintPreview(el, lib, typeof choice === 'string' ? choice : null);
  if (fam.kind === 'google') return paintPreview(el, fam, typeof choice === 'number' ? fam.gf.styles[choice] : null);
  return paintPreview(el, fam, choice);
}

export function mountCompare(root) {
  let mode = localStorage.getItem('tp.compareMode') || 'rows';
  const content = h('div', { class: 'compare-scroll' });
  const countEl = h('span', { class: 'view-count' });
  const sizeVal = h('span', { class: 'size-val' }, S.size + ' px');

  const addBtn = h('button', { class: 'btn btn-primary', onClick: (e) => fontPicker(e.currentTarget, (fam) => { if (!S.compare.some((c) => c.key === fam.key)) toggleCompare(fam); }, { title: 'Adicionar à comparação' }) }, icon('plus'), 'Adicionar fonte');
  const textInput = h('input', { class: 'preview-input', placeholder: 'Digite um texto para comparar', value: S.previewText, onInput: debounce((e) => { S.previewText = e.target.value; persistPreview(); draw(); }, 80) });
  const seg = h('div', { class: 'seg' }, [['rows', 'Linhas'], ['cols', 'Colunas']].map(([v, l]) =>
    h('button', { class: 'seg-btn' + (mode === v ? ' is-on' : ''), onClick: (e) => { mode = v; localStorage.setItem('tp.compareMode', v); seg.querySelectorAll('.seg-btn').forEach((b) => b.classList.toggle('is-on', b === e.currentTarget)); draw(); } }, l)));

  root.append(
    h('header', { class: 'view-head' },
      h('div', { class: 'view-title-row' }, h('h1', { class: 'view-title' }, 'Comparar'), countEl,
        h('div', { class: 'view-actions' },
          h('button', { class: 'btn', onClick: () => { S.compare = []; saveLocal('compare', S.compare); emit('compare'); } }, 'Limpar'), addBtn)),
      h('div', { class: 'testbar' },
        h('div', { class: 'preview-field preview-field-wide' }, textInput,
          iconButton('chevron', 'Textos prontos', (e) => menu(e.currentTarget, presets().map((p) => ({ label: p.label, action: () => { S.previewText = p.text; textInput.value = p.text; persistPreview(); draw(); } }))), 'preset-btn')),
        h('div', { class: 'size-field' }, h('input', { type: 'range', class: 'range', min: '12', max: '200', value: S.size, 'aria-label': 'Tamanho', onInput: (e) => { S.size = +e.target.value; sizeVal.textContent = S.size + ' px'; persistPreview(); content.querySelectorAll('.cmp-preview').forEach((p) => { p.style.fontSize = S.size + 'px'; }); } }), sizeVal),
        seg)),
    content);

  function draw() {
    content.innerHTML = '';
    const items = S.compare.map((c) => ({ c, fam: resolveFamily(c.key) })).filter((x) => x.fam);
    countEl.textContent = items.length ? `${items.length} de 8` : '';
    if (!items.length) {
      content.append(h('div', { class: 'empty' }, h('h2', {}, 'Escolha fontes para comparar'),
        h('p', {}, 'Use o botão Comparar em qualquer família, ou adicione daqui. Cabem até 8 fontes.'),
        h('div', { class: 'empty-actions' }, h('button', { class: 'btn btn-primary', onClick: (e) => fontPicker(e.currentTarget, (fam) => toggleCompare(fam)) }, icon('plus'), 'Adicionar fonte'))));
      return;
    }
    const grid = h('div', { class: mode === 'cols' ? 'cmp-cols' : 'cmp-rows' });
    for (const { c, fam } of items) {
      const setChoice = (v) => { c.faceId = v; saveLocal('compare', S.compare); draw(); };
      const headRow = h('div', { class: 'cmp-head' },
        h('button', { class: 'cmp-name', onClick: () => navigate('detail', fam.key) }, fam.name),
        styleSelect(fam, c.faceId, setChoice),
        iconButton('x', 'Remover da comparação', () => { S.compare = S.compare.filter((x) => x !== c); saveLocal('compare', S.compare); emit('compare'); }));
      if (mode === 'rows') {
        const p = h('div', { class: 'cmp-preview', style: { fontSize: S.size + 'px' } }, S.previewText || fam.name);
        paintChoice(p, fam, c.faceId);
        grid.append(h('div', { class: 'cmp-item' }, headRow, p));
      } else {
        const blocks = [
          h('div', { class: 'cmp-aa' }, 'Aa'),
          h('div', { class: 'cmp-preview', style: { fontSize: Math.min(S.size, 40) + 'px' } }, S.previewText || 'Tipografia que conduz'),
          h('div', { class: 'cmp-alpha' }, 'ABCDEFGHIJKLMNOPQRSTUVWXYZ abcdefghijklmnopqrstuvwxyz 0123456789 áéíóú ãõ ç'),
          h('p', { class: 'cmp-para' }, PARAGRAPH),
        ];
        blocks.forEach((b) => paintChoice(b, fam, c.faceId));
        grid.append(h('div', { class: 'cmp-item' }, headRow, ...blocks));
      }
    }
    content.append(grid);
  }
  draw();
  return { update: (reason) => { if (['compare', 'data', 'google'].includes(reason)) draw(); }, destroy() {} };
}
