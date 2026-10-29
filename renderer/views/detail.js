// Detalhes de uma família: estilos, área de teste, glifos e informações.
import { h, icon, iconButton, toggle, toast, fmt, debounce } from '../lib/ui.js';
import { applyFace, applyGoogle, ensureGoogle, styleName, cssFamily } from '../lib/fonts.js';
import {
  S, api, resolveFamily, libraryMap, activeState, toggleFamily, toggleFavorite, toggleCompare, inCompare,
  back, setFacesActive, isFaceActive, installGoogle, CATEGORY_LABEL, presets, PANGRAM, PARAGRAPH, persistPreview, classify,
} from '../state.js';
import { collectionPicker, familyMenu } from '../components.js';

const FEATURE_NAMES = {
  kern: 'Kerning', liga: 'Ligaduras padrão', dlig: 'Ligaduras opcionais', hlig: 'Ligaduras históricas', clig: 'Ligaduras contextuais',
  calt: 'Alternativas contextuais', salt: 'Alternativas estilísticas', swsh: 'Floreios', smcp: 'Versalete', c2sc: 'Maiúsculas em versalete',
  pcap: 'Versalete petit', case: 'Formas para maiúsculas', onum: 'Algarismos de texto', lnum: 'Algarismos alinhados', tnum: 'Algarismos tabulares',
  pnum: 'Algarismos proporcionais', frac: 'Frações', afrc: 'Frações alternativas', zero: 'Zero cortado', sups: 'Sobrescrito', subs: 'Subscrito',
  sinf: 'Inferiores científicos', ordn: 'Ordinais', ss: 'Conjunto estilístico', cv: 'Variante de caractere', titl: 'Formas de título',
  locl: 'Formas locais', ccmp: 'Composição de glifos', mark: 'Posicionamento de acentos', mkmk: 'Acento sobre acento', aalt: 'Todas as alternativas',
  cpsp: 'Espaçamento para maiúsculas', init: 'Formas iniciais', fina: 'Formas finais', medi: 'Formas mediais', isol: 'Formas isoladas', rlig: 'Ligaduras obrigatórias',
  hist: 'Formas históricas', ornm: 'Ornamentos', nalt: 'Formas alternativas de notas',
};
const HIDDEN_FEATURES = new Set(['ccmp', 'mark', 'mkmk', 'locl', 'rlig', 'init', 'fina', 'medi', 'isol', 'abvm', 'blwm', 'abvs', 'blws', 'pres', 'psts', 'rclt', 'rvrn', 'dist', 'curs', 'aalt', 'akhn', 'blwf', 'half', 'nukt', 'pref', 'pstf', 'rkrf', 'rphf', 'vatu', 'cjct', 'abvf', 'vert', 'vrt2', 'vkrn', 'valt', 'vpal', 'vhal']);
function featureName(tag) {
  if (/^ss\d\d$/.test(tag)) return `Conjunto estilístico ${parseInt(tag.slice(2), 10)}`;
  if (/^cv\d\d$/.test(tag)) return `Variante de caractere ${parseInt(tag.slice(2), 10)}`;
  return FEATURE_NAMES[tag] || tag;
}
const AXIS_NAMES = { wght: 'Peso', wdth: 'Largura', slnt: 'Inclinação', ital: 'Itálico', opsz: 'Tamanho óptico', GRAD: 'Grau', XHGT: 'Altura-x' };

const BLOCKS = [
  ['Latim básico', 0x20, 0x7f], ['Latim-1', 0x80, 0xff], ['Latim estendido', 0x100, 0x24f], ['IPA', 0x250, 0x2af],
  ['Modificadores', 0x2b0, 0x2ff], ['Diacríticos', 0x300, 0x36f], ['Grego', 0x370, 0x3ff], ['Cirílico', 0x400, 0x52f],
  ['Hebraico', 0x590, 0x5ff], ['Árabe', 0x600, 0x6ff], ['Devanágari', 0x900, 0x97f], ['Tailandês', 0xe00, 0xe7f], ['Latim adicional', 0x1e00, 0x1eff],
  ['Grego estendido', 0x1f00, 0x1fff], ['Pontuação', 0x2000, 0x206f], ['Sobrescritos', 0x2070, 0x209f], ['Moedas', 0x20a0, 0x20cf],
  ['Símbolos de letras', 0x2100, 0x214f], ['Formas numéricas', 0x2150, 0x218f], ['Setas', 0x2190, 0x21ff], ['Matemática', 0x2200, 0x22ff],
  ['Técnicos', 0x2300, 0x23ff], ['Formas', 0x2460, 0x25ff], ['Símbolos diversos', 0x2600, 0x27bf], ['CJK', 0x2e80, 0x9fff],
  ['Hangul', 0xac00, 0xd7af], ['Uso privado', 0xe000, 0xf8ff], ['Formas de apresentação', 0xfb00, 0xffff],
];
function blockOf(cp) {
  for (const b of BLOCKS) if (cp >= b[1] && cp <= b[2]) return b[0];
  return 'Outros';
}
const hex = (cp) => cp.toString(16).toUpperCase().padStart(4, '0');

export function mountDetail(root, route) {
  let fam = resolveFamily(route.param);
  if (!fam) {
    root.append(h('div', { class: 'empty' }, h('h2', {}, 'Família não encontrada'), h('p', {}, 'Ela pode ter sido removida da biblioteca.'), h('button', { class: 'btn', onClick: back }, 'Voltar')));
    return { update() {}, destroy() {} };
  }
  let tab = 'styles';
  const body = h('div', { class: 'detail-body' });
  const head = h('header', { class: 'detail-head' });
  const tabs = h('nav', { class: 'tabs', role: 'tablist' });
  root.append(h('div', { class: 'detail' }, head, tabs, body));
  const state = { faceId: null, axes: {}, features: {}, lh: 1.35, ls: 0, align: 'left', size: Math.min(S.size, 72), text: null, block: null, glyph: null };

  const isGoogleOnly = () => fam.kind === 'google' && !libraryMap().get(fam.key);
  const localFam = () => (fam.kind === 'google' ? libraryMap().get(fam.key) : fam);
  const currentFace = () => { const lf = localFam(); if (!lf) return null; return lf.faces.find((f) => f.id === state.faceId) || lf.primary; };

  function drawHead() {
    head.innerHTML = '';
    const lf = localFam();
    const st = activeState(fam);
    const title = h('h1', { class: 'detail-title' }, fam.name);
    if (lf) applyFace(title, lf.primary); else applyGoogle(title, fam.gf);
    const faces = lf ? lf.faces : [];
    const meta = [];
    meta.push(fmt.plural(lf ? faces.length : fam.gf.styles.length, 'estilo', 'estilos'));
    const cat = fam.gf ? fam.gf.category : classify(lf);
    if (cat && cat !== 'other') meta.push(CATEGORY_LABEL[cat]);
    if (fam.designer || (lf && lf.designer)) meta.push(fam.designer || lf.designer);
    if (fam.variable || (lf && lf.variable)) meta.push('Variável');
    meta.push(fam.kind === 'system' ? (lf && lf.faces.every((f) => f.sysKind === 'native') ? 'Nativa do sistema' : 'Instalada no sistema') : isGoogleOnly() ? 'Google Fonts' : lf && lf.sources.has('google') ? 'Baixada do Google Fonts' : 'Biblioteca');

    const files = [...new Set(faces.map((f) => f.path))];
    head.append(
      h('div', { class: 'detail-nav' }, h('button', { class: 'btn btn-ghost', onClick: back }, icon('back'), 'Voltar')),
      h('div', { class: 'detail-title-row' },
        title,
        h('div', { class: 'detail-actions' },
          h('button', { class: 'star' + (S.favorites.has(fam.key) ? ' is-on' : ''), title: 'Favorita', 'aria-pressed': S.favorites.has(fam.key) ? 'true' : 'false', onClick: () => toggleFavorite(fam.key) }, icon('star')),
          iconButton('plus', 'Adicionar a uma coleção', (e) => collectionPicker(e.currentTarget, [fam.key])),
          iconButton('compare', inCompare(fam.key) ? 'Tirar da comparação' : 'Comparar', () => toggleCompare(fam, state.faceId), inCompare(fam.key) ? 'is-on' : ''),
          lf && fam.kind !== 'system' ? iconButton('export', 'Exportar arquivos', async () => { const r = await api.exportFonts(faces.map((f) => f.id), fam.name); if (r) toast(fmt.plural(r.count, 'arquivo exportado', 'arquivos exportados')); }) : null,
          lf ? iconButton('eye', S.platform === 'darwin' ? 'Mostrar no Finder' : 'Mostrar na pasta', () => api.reveal(files[0])) : null,
          iconButton('more', 'Mais opções', (e) => familyMenu(e.currentTarget, fam)),
          isGoogleOnly()
            ? h('div', { class: 'btn-group' },
              h('button', { class: 'btn', disabled: S.busy.has(fam.key), onClick: () => installGoogle(fam.gf, false) }, icon('download'), 'Adicionar à biblioteca'),
              h('button', { class: 'btn btn-primary', disabled: S.busy.has(fam.key), onClick: () => installGoogle(fam.gf, true) }, S.busy.has(fam.key) ? 'Baixando…' : 'Baixar e ativar'))
            : fam.kind === 'system' ? null
              : h('label', { class: 'collection-toggle' }, toggle(st, () => toggleFamily(fam), st === 'on' ? 'Desativar família' : 'Ativar família'), h('span', {}, st === 'on' ? 'Ativa' : st === 'mixed' ? 'Parcialmente ativa' : 'Ativar família')))),
      h('p', { class: 'detail-meta' }, meta.map((m) => h('span', {}, m))));
  }

  function drawTabs() {
    tabs.innerHTML = '';
    for (const [id, label] of [['styles', 'Estilos'], ['test', 'Testar'], ['glyphs', 'Glifos'], ['info', 'Informações']]) {
      tabs.append(h('button', { class: 'tab' + (tab === id ? ' is-on' : ''), role: 'tab', 'aria-selected': tab === id ? 'true' : 'false', onClick: () => { tab = id; drawTabs(); drawBody(); } }, label));
    }
  }

  function needsDownload(what) {
    return h('div', { class: 'empty empty-inline' }, h('h2', {}, `${what} aparecem depois do download`),
      h('p', {}, 'Baixe a família para a biblioteca para ver todos os glifos, recursos OpenType e dados do arquivo.'),
      h('button', { class: 'btn btn-primary', disabled: S.busy.has(fam.key), onClick: () => installGoogle(fam.gf, false) }, icon('download'), 'Adicionar à biblioteca'));
  }

  // ---------- estilos ----------
  function drawStyles() {
    const lf = localFam();
    const text = S.previewText || PANGRAM;
    const sizeInput = h('input', { type: 'range', class: 'range', min: '12', max: '160', value: state.size, 'aria-label': 'Tamanho', onInput: (e) => { state.size = +e.target.value; sv.textContent = state.size + ' px'; body.querySelectorAll('.style-preview').forEach((p) => { p.style.fontSize = state.size + 'px'; }); } });
    const sv = h('span', { class: 'size-val' }, state.size + ' px');
    const rows = [];
    if (lf) {
      for (const f of lf.faces) {
        const p = h('div', { class: 'style-preview', style: { fontSize: state.size + 'px' }, contenteditable: 'plaintext-only', spellcheck: 'false' }, text);
        applyFace(p, f);
        const canToggle = f.source !== 'system' && f.activatable;
        rows.push(h('div', { class: 'style-row' },
          h('div', { class: 'style-meta' },
            h('span', { class: 'style-name' }, f.style),
            h('span', { class: 'fmeta' }, `${f.weight}${f.italic ? ', itálico' : ''}`),
            f.variable ? h('span', { class: 'badge' }, 'Variável') : null,
            !f.activatable ? h('span', { class: 'badge is-quiet' }, 'Formato web') : null,
            h('span', { class: 'fmeta' }, f.format.toUpperCase()),
            lf.faces.some((o) => o !== f && o.style === f.style) ? h('span', { class: 'fmeta', title: f.path }, f.path.split(/[\\/]/).pop()) : null,
            h('div', { class: 'frow-actions' },
              canToggle ? toggle(isFaceActive(f) ? 'on' : 'off', () => setFacesActive([f], !isFaceActive(f)), isFaceActive(f) ? 'Desativar estilo' : 'Ativar estilo') : null)),
          p));
      }
    } else {
      ensureGoogle(fam.gf.family, fam.gf.styles);
      for (const s of fam.gf.styles) {
        const p = h('div', { class: 'style-preview', style: { fontSize: state.size + 'px', fontFamily: `"${fam.gf.family}"`, fontWeight: s.weight, fontStyle: s.italic ? 'italic' : 'normal' }, contenteditable: 'plaintext-only', spellcheck: 'false' }, text);
        rows.push(h('div', { class: 'style-row' }, h('div', { class: 'style-meta' }, h('span', { class: 'style-name' }, styleName(s)), h('span', { class: 'fmeta' }, String(s.weight))), p));
      }
    }
    body.append(h('div', { class: 'subbar' }, h('div', { class: 'size-field' }, sizeInput, sv)), h('div', { class: 'style-list' }, rows));
  }

  // ---------- testar ----------
  function drawTest() {
    const lf = localFam();
    const area = h('div', { class: 'tester', contenteditable: 'plaintext-only', spellcheck: 'false', onInput: (e) => { state.text = e.target.innerText; } }, state.text ?? (S.previewText || PARAGRAPH));
    const controls = h('aside', { class: 'tester-controls' });
    let styleCtl = null;
    const applyAll = () => {
      area.style.fontSize = state.size + 'px';
      area.style.lineHeight = state.lh;
      area.style.letterSpacing = state.ls / 1000 + 'em';
      area.style.textAlign = state.align;
      const ax = Object.entries(state.axes).map(([t, v]) => `"${t}" ${v}`).join(', ');
      area.style.fontVariationSettings = ax || 'normal';
      const ft = Object.entries(state.features).filter(([, v]) => v !== null).map(([t, v]) => `"${t}" ${v ? 1 : 0}`).join(', ');
      area.style.fontFeatureSettings = ft || 'normal';
    };
    const slider = (label, min, max, step, value, onInput, fmtv = (v) => v) => {
      const out = h('span', { class: 'ctl-val' }, fmtv(value));
      return h('label', { class: 'ctl' }, h('span', { class: 'ctl-label' }, label, out),
        h('input', { type: 'range', class: 'range', min, max, step, value, onInput: (e) => { const v = +e.target.value; out.textContent = fmtv(v); onInput(v); applyAll(); } }));
    };

    if (lf) {
      const face = currentFace();
      applyFace(area, face);
      if (lf.faces.length > 1) {
        styleCtl = (h('label', { class: 'ctl' }, h('span', { class: 'ctl-label' }, 'Estilo'),
          h('select', { class: 'select', onChange: (e) => { state.faceId = e.target.value; state.axes = {}; state.features = {}; body.innerHTML = ''; drawTest(); } },
            lf.faces.map((f) => h('option', { value: f.id, selected: f.id === face.id }, f.style)))));
      }
      if (face.axes.length) {
        controls.append(h('h3', { class: 'ctl-group' }, 'Eixos variáveis'));
        for (const a of face.axes) {
          const v = state.axes[a.tag] ?? a.default;
          controls.append(slider(AXIS_NAMES[a.tag] || a.name || a.tag, a.min, a.max, (a.max - a.min) > 20 ? 1 : 0.1, v, (nv) => { state.axes[a.tag] = nv; }, (x) => (Math.round(x * 10) / 10).toString().replace('.', ',')));
        }
      }
      const featBox = h('div', { class: 'features' }, h('p', { class: 'muted small' }, 'Lendo recursos OpenType…'));
      controls.append(h('h3', { class: 'ctl-group' }, 'Recursos OpenType'), featBox);
      api.fontDetails(face.id).then((d) => {
        featBox.innerHTML = '';
        const feats = (d && d.features || []).filter((t) => !HIDDEN_FEATURES.has(t));
        if (!feats.length) { featBox.append(h('p', { class: 'muted small' }, 'Esta fonte não tem recursos OpenType opcionais.')); return; }
        for (const t of feats) {
          const on = state.features[t];
          featBox.append(h('button', { class: 'feat' + (on ? ' is-on' : on === false ? ' is-off' : ''), title: t, 'aria-pressed': on ? 'true' : 'false', onClick: (e) => {
            const cur = state.features[t];
            // ciclo: padrão da fonte > ligado > desligado > padrão
            state.features[t] = cur === undefined || cur === null ? true : cur === true ? false : null;
            e.currentTarget.className = 'feat' + (state.features[t] ? ' is-on' : state.features[t] === false ? ' is-off' : '');
            applyAll();
          } }, h('span', {}, featureName(t)), h('code', {}, t)));
        }
      });
    } else {
      ensureGoogle(fam.gf.family, fam.gf.styles);
      let st = fam.gf.styles.find((s) => s.weight === 400 && !s.italic) || fam.gf.styles[0];
      const setG = () => { area.style.fontFamily = `"${fam.gf.family}"`; area.style.fontWeight = st.weight; area.style.fontStyle = st.italic ? 'italic' : 'normal'; };
      setG();
      if (fam.gf.styles.length > 1) styleCtl = (h('label', { class: 'ctl' }, h('span', { class: 'ctl-label' }, 'Estilo'),
        h('select', { class: 'select', onChange: (e) => { st = fam.gf.styles[e.target.value]; setG(); } }, fam.gf.styles.map((s, i) => h('option', { value: i, selected: s === st }, styleName(s))))));
      controls.append(h('p', { class: 'muted small' }, 'Baixe a família para testar eixos variáveis e recursos OpenType.'));
    }

    controls.prepend(
      ...(styleCtl ? [styleCtl] : []),
      slider('Tamanho', 10, 240, 1, state.size, (v) => { state.size = v; }, (v) => v + ' px'),
      slider('Entrelinha', 0.8, 2.4, 0.05, state.lh, (v) => { state.lh = v; }, (v) => v.toFixed(2).replace('.', ',')),
      slider('Espacejamento', -100, 300, 5, state.ls, (v) => { state.ls = v; }, (v) => v),
      h('div', { class: 'ctl' }, h('span', { class: 'ctl-label' }, 'Alinhamento'),
        h('div', { class: 'seg' }, [['left', 'Alinhar à esquerda', 'alignLeft'], ['center', 'Centralizar', 'alignCenter'], ['right', 'Alinhar à direita', 'alignRight'], ['justify', 'Justificar', 'alignJustify']].map(([v, l, ic]) =>
          h('button', { class: 'seg-btn seg-icon' + (state.align === v ? ' is-on' : ''), title: l, 'aria-label': l, onClick: (e) => { state.align = v; e.currentTarget.parentElement.querySelectorAll('.seg-btn').forEach((b) => b.classList.remove('is-on')); e.currentTarget.classList.add('is-on'); applyAll(); } }, icon(ic))))),
      h('div', { class: 'ctl' }, h('span', { class: 'ctl-label' }, 'Texto'),
        h('div', { class: 'preset-row' }, presets().filter((p) => p.text).map((p) => h('button', { class: 'chip chip-sm', title: p.text, onClick: () => { area.innerText = p.text; state.text = p.text; } }, p.text.length > 22 ? p.text.slice(0, 20).trim() + '…' : p.text)))));
    applyAll();
    body.append(h('div', { class: 'tester-wrap' }, controls, h('div', { class: 'tester-stage' }, area)));
  }

  // ---------- glifos ----------
  function drawGlyphs() {
    const lf = localFam();
    if (!lf) { body.append(needsDownload('Os glifos')); return; }
    const face = currentFace();
    const wrap = h('div', { class: 'glyphs' });
    const bar = h('div', { class: 'subbar' });
    const chipsEl = h('div', { class: 'chips chips-wrap' });
    const grid = h('div', { class: 'glyph-grid' });
    const inspector = h('aside', { class: 'glyph-inspector' }, h('p', { class: 'muted' }, 'Selecione um glifo para ver detalhes.'));
    const fontCss = `"${cssFamily(face.id)}", "Adobe NotDef"`;

    if (lf.faces.length > 1) {
      bar.append(h('select', { class: 'select', 'aria-label': 'Estilo', onChange: (e) => { state.faceId = e.target.value; state.block = null; state.glyph = null; body.innerHTML = ''; drawGlyphs(); } },
        lf.faces.map((f) => h('option', { value: f.id, selected: f.id === face.id }, f.style))));
    }
    const countEl = h('span', { class: 'view-count' }, 'Lendo glifos…');
    bar.append(countEl);
    wrap.append(bar, chipsEl, h('div', { class: 'glyph-layout' }, h('div', { class: 'glyph-scroll' }, grid), inspector));
    body.append(wrap);

    applyFace(grid, face);
    api.fontDetails(face.id).then((d) => {
      const cps = d ? d.codepoints : [];
      const groups = new Map();
      for (const cp of cps) { const b = blockOf(cp); if (!groups.has(b)) groups.set(b, []); groups.get(b).push(cp); }
      countEl.textContent = `${fmt.plural(cps.length, 'caractere mapeado', 'caracteres mapeados')}, ${fmt.plural(face.glyphCount, 'glifo', 'glifos')} no arquivo`;
      const rank = (b) => { const i = BLOCKS.findIndex((x) => x[0] === b); return i < 0 ? 999 : i; };
      const order = [...groups.keys()].sort((a, b) => rank(a) - rank(b));
      if (!state.block || (state.block !== 'all' && !groups.has(state.block))) state.block = 'all';
      const drawChips = () => {
        chipsEl.innerHTML = '';
        chipsEl.append(h('button', { class: 'chip chip-sm' + (state.block === 'all' ? ' is-on' : ''), onClick: () => { state.block = 'all'; drawChips(); drawGrid(); } }, `Todos ${fmt.int(cps.length)}`));
        for (const b of order) chipsEl.append(h('button', { class: 'chip chip-sm' + (state.block === b ? ' is-on' : ''), onClick: () => { state.block = b; drawChips(); drawGrid(); } }, `${b} ${fmt.int(groups.get(b).length)}`));
      };
      let observer;
      const drawGrid = () => {
        grid.innerHTML = '';
        if (observer) observer.disconnect();
        const list = state.block === 'all' ? cps : groups.get(state.block) || [];
        let i = 0;
        const sentinel = h('div', { class: 'glyph-sentinel' });
        const more = () => {
          const frag = document.createDocumentFragment();
          const end = Math.min(list.length, i + 600);
          for (; i < end; i++) {
            const cp = list[i];
            const cell = h('button', { class: 'glyph' + (state.glyph === cp ? ' is-on' : ''), title: `U+${hex(cp)}`, onClick: (e) => { grid.querySelectorAll('.glyph.is-on').forEach((g) => g.classList.remove('is-on')); e.currentTarget.classList.add('is-on'); state.glyph = cp; inspect(cp); } },
              h('span', { class: 'glyph-char' }, String.fromCodePoint(cp)), h('span', { class: 'glyph-code' }, hex(cp)));
            frag.append(cell);
          }
          grid.insertBefore(frag, sentinel);
          if (i >= list.length) { sentinel.remove(); observer.disconnect(); }
        };
        grid.append(sentinel);
        observer = new IntersectionObserver((en) => { if (en[0].isIntersecting) more(); }, { root: grid.parentElement, rootMargin: '600px' });
        more();
        observer.observe(sentinel);
      };
      drawChips();
      drawGrid();
      if (state.glyph) inspect(state.glyph); else if (cps.length) inspect(cps.find((c) => c === 0x61) || cps[0]);

      async function inspect(cp) {
        const ch = String.fromCodePoint(cp);
        const info = await api.glyphInfo(face.id, cp);
        const big = h('div', { class: 'glyph-big', style: { fontFamily: fontCss } }, ch);
        const copy = (v, what) => { navigator.clipboard.writeText(v); toast(`${what} copiado`); };
        inspector.innerHTML = '';
        inspector.append(
          h('div', { class: 'glyph-stage' }, big),
          h('dl', { class: 'facts' },
            h('dt', {}, 'Unicode'), h('dd', {}, `U+${hex(cp)}`),
            h('dt', {}, 'Nome do glifo'), h('dd', {}, (info && info.name) || 'Sem nome'),
            h('dt', {}, 'Bloco'), h('dd', {}, blockOf(cp)),
            h('dt', {}, 'Largura'), h('dd', {}, info && info.advance != null ? `${info.advance} unidades` : 'Desconhecida'),
            h('dt', {}, 'HTML'), h('dd', {}, h('code', {}, `&#x${hex(cp)};`)),
            h('dt', {}, 'CSS'), h('dd', {}, h('code', {}, `\\${hex(cp)}`))),
          h('div', { class: 'btn-row' },
            h('button', { class: 'btn btn-primary', onClick: () => copy(ch, 'Caractere') }, icon('copy'), 'Copiar caractere'),
            h('button', { class: 'btn', onClick: () => copy(`U+${hex(cp)}`, 'Código') }, 'Copiar código')));
      }
    });
  }

  // ---------- informações ----------
  function drawInfo() {
    const lf = localFam();
    if (!lf) { body.append(needsDownload('As informações do arquivo')); return; }
    const face = currentFace();
    const box = h('div', { class: 'info' });
    if (lf.faces.length > 1) box.append(h('div', { class: 'subbar' }, h('select', { class: 'select', 'aria-label': 'Estilo', onChange: (e) => { state.faceId = e.target.value; body.innerHTML = ''; drawInfo(); } }, lf.faces.map((f) => h('option', { value: f.id, selected: f.id === face.id }, f.style)))));
    const row = (k, v) => (v ? [h('dt', {}, k), h('dd', {}, v)] : []);
    const dl = h('dl', { class: 'facts facts-wide' },
      row('Nome completo', face.fullName), row('Nome PostScript', face.postscriptName), row('Família', face.family), row('Estilo', face.style),
      row('Peso', String(face.weight)), row('Versão', face.version), row('Designer', face.designer), row('Fabricante', face.manufacturer),
      row('Glifos', fmt.int(face.glyphCount)), row('Formato', face.format.toUpperCase() + (face.index ? `, face ${face.index + 1} da coleção` : '')),
      row('Tamanho', fmt.bytes(face.fileSize)),
      face.axes.length ? row('Eixos', face.axes.map((a) => `${AXIS_NAMES[a.tag] || a.name} (${a.tag}) de ${a.min} a ${a.max}`).join('; ')) : [],
      face.instances.length ? row('Instâncias', face.instances.join(', ')) : [],
      row('Arquivo', h('button', { class: 'link', onClick: () => api.reveal(face.path) }, face.path)),
      row('Ativação', face.source === 'system' ? 'Fonte do sistema' : !face.activatable ? 'Formato web, só para visualização' : isFaceActive(face) ? 'Ativa no sistema' : 'Inativa'),
      row('Direitos autorais', face.copyright),
      row('Licença', face.license ? h('div', { class: 'license' }, face.license) : null),
      row('Link da licença', face.licenseURL ? h('button', { class: 'link', onClick: () => api.openExternal(face.licenseURL) }, face.licenseURL) : null),
      row('Site do designer', face.designerURL ? h('button', { class: 'link', onClick: () => api.openExternal(face.designerURL) }, face.designerURL) : null));
    box.append(dl);
    const extra = h('dl', { class: 'facts facts-wide' });
    box.append(extra);
    api.fontDetails(face.id).then((d) => {
      if (!d) return;
      extra.append(...row('Unidades por eme', String(d.unitsPerEm)), ...row('Ascendente', String(d.ascent)), ...row('Descendente', String(d.descent)),
        ...row('Altura das maiúsculas', d.capHeight ? String(d.capHeight) : null), ...row('Altura-x', d.xHeight ? String(d.xHeight) : null),
        ...row('Descrição', d.description), ...row('Marca registrada', d.trademark));
    });
    body.append(box);
  }

  function drawBody() {
    body.innerHTML = '';
    if (tab === 'styles') drawStyles();
    else if (tab === 'test') drawTest();
    else if (tab === 'glyphs') drawGlyphs();
    else drawInfo();
  }

  drawHead(); drawTabs(); drawBody();
  const onKey = (e) => { if (e.key === 'Escape' && !document.querySelector('.popover') && !document.querySelector('#modal-root.is-open') && document.activeElement.contentEditable !== 'true' && document.activeElement.contentEditable !== 'plaintext-only') back(); };
  document.addEventListener('keydown', onKey);

  return {
    update(reason) {
      const wasGoogleOnly = isGoogleOnly();
      fam = resolveFamily(route.param) || fam;
      drawHead();
      if (reason === 'data' && (wasGoogleOnly !== isGoogleOnly() || tab === 'styles')) drawBody();
    },
    destroy() { document.removeEventListener('keydown', onKey); },
  };
}
