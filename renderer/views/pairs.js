// Combinar: título, subtítulo e texto juntos, na página livre e em artes de 1080 px.
// Cada etapa do texto tem conteúdo, fonte, tamanho, entrelinha, espaçamento e caixa próprios.
// As cores mudam só as cores: a estrutura do layout é a mesma em todos os formatos.
import { h, icon, toast, confirmBox } from '../lib/ui.js';
import { S, api, resolveFamily, families, saveLocal, navigate, famKey, loadGoogle } from '../state.js';
import { fontPicker } from '../components.js';
import { styleSelect, paintChoice } from './compare.js';

// ---------- etapas do texto ----------
const ROLES = [
  { id: 'heading', label: 'Título', rows: 2, size: [16, 160, 1], defaults: { size: 64, lh: 1.05, ls: -10, case: 'none' },
    text: 'Toda marca começa por uma voz' },
  { id: 'sub', label: 'Subtítulo', rows: 2, size: [10, 80, 1], defaults: { size: 24, lh: 1.25, ls: 0, case: 'none' },
    text: 'A tipografia fala antes de qualquer palavra ser lida.' },
  { id: 'body', label: 'Texto', rows: 5, size: [10, 40, 0.5], defaults: { size: 18, lh: 1.55, ls: 0, case: 'none' },
    text: 'Escolher fontes para uma identidade é decidir como a marca vai soar quando ninguém estiver explicando nada. Teste em tamanhos reais, com acentos e números, antes de levar ao cliente.' },
];
const CTA_TEXT = 'Agendar uma conversa';
const CASES = [['none', 'Original', 'Como foi digitado'], ['upper', 'Alta', 'Caixa alta: tudo em maiúsculas'], ['lower', 'Baixa', 'Caixa baixa: tudo em minúsculas']];
const TRANSFORM = { none: 'none', upper: 'uppercase', lower: 'lowercase' };

// ---------- cores ----------
// [nome, fundo, título, subtítulo, texto, botão, texto do botão]
const PALETTES = [
  ['Neutro', '#ffffff', '#000000', '#5f5f5c', '#2e2e2c', '#000000', '#ffffff'],
  ['Noite', '#000000', '#f7f6f3', '#c9c8c3', '#c9c8c3', '#39ff14', '#000000'],
  ['Areia', '#efe6d8', '#2b2118', '#8a5a33', '#4a3b2c', '#b4532a', '#ffffff'],
  ['Oceano', '#0f2a3d', '#ffffff', '#8fd3e8', '#d5e6ee', '#f2c14e', '#0f2a3d'],
  ['Floresta', '#f3f1ea', '#1f3b2d', '#4e7a5a', '#2e3a33', '#1f3b2d', '#f3f1ea'],
  ['Vinho', '#2a0f17', '#f6e7df', '#e0a39a', '#ebd3cc', '#e0a39a', '#2a0f17'],
];
const COLOR_FIELDS = [['bg', 'Fundo'], ['title', 'Título'], ['sub', 'Subtítulo'], ['body', 'Texto'], ['accent', 'Botão'], ['accentText', 'Texto do botão']];
const paletteObj = (p) => ({ bg: p[1], title: p[2], sub: p[3], body: p[4], accent: p[5], accentText: p[6] });

function luminance(hex) {
  const n = parseInt(hex.replace('#', '').padEnd(6, '0').slice(0, 6), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; })
    .reduce((s, v, i) => s + v * [0.2126, 0.7152, 0.0722][i], 0);
}
function contrast(a, b) {
  const [x, y] = [luminance(a), luminance(b)].sort((m, n) => n - m);
  return (x + 0.05) / (y + 0.05);
}

// ---------- formatos ----------
// As artes de 1080 px usam o dobro dos tamanhos da página, como uma tela de celular em 2x.
const FORMATS = [
  { id: 'page', label: 'Página', w: null, h: null },
  { id: 'land', label: 'Horizontal', w: 1920, h: 1080 },
  { id: 'story', label: 'Vertical', w: 1080, h: 1920 },
  { id: 'portrait', label: 'Retrato', w: 1080, h: 1440 },
  { id: 'square', label: 'Quadrado', w: 1080, h: 1080 },
];
const ART_SCALE = 2;
const fmtOf = (id) => FORMATS.find((f) => f.id === id) || FORMATS[0];

// ---------- configuração ----------
function defaultFonts() {
  const pool = [...families('library'), ...families('system')];
  const pick = (re) => pool.find((f) => re.test(f.name));
  const heading = pick(/serif|garamond|playfair|fraunces|caladea|georgia|baskerville/i) || pool[0];
  const body = pick(/^inter$|sans|helvetica|arial|roboto|carlito/i) || pool[1] || pool[0];
  return { heading: heading && heading.key, sub: body && body.key, body: body && body.key };
}

function freshRole(role, key) {
  return { key: key || null, choice: null, text: role.text, ...role.defaults };
}

// Lê a configuração salva, convertendo o formato das versões anteriores.
function loadConfig() {
  let old = null;
  try { old = JSON.parse(localStorage.getItem('gf.pair')); } catch {}
  const fonts = defaultFonts();
  const cfg = { roles: {}, cta: CTA_TEXT, colors: paletteObj(PALETTES[0]), layout: 'page', open: { heading: true } };
  for (const r of ROLES) cfg.roles[r.id] = freshRole(r, fonts[r.id]);
  if (!old) return cfg;
  if (old.roles) {
    for (const r of ROLES) cfg.roles[r.id] = { ...cfg.roles[r.id], ...(old.roles[r.id] || {}) };
    cfg.cta = old.cta ?? CTA_TEXT;
    if (old.colors) cfg.colors = { ...cfg.colors, ...old.colors };
    cfg.open = old.open || cfg.open;
  } else {
    // versões 2.2 a 2.4: heading/sub/body com tamanhos soltos
    const map = { heading: ['heading', 'hs'], sub: ['sub', 'ss'], body: ['body', 'bs'] };
    for (const [id, [slot, sizeKey]] of Object.entries(map)) {
      const s = old[slot] || (id === 'sub' ? old.body : null);
      if (s && s.key) Object.assign(cfg.roles[id], { key: s.key, choice: s.choice ?? null });
      if (old[sizeKey]) cfg.roles[id].size = old[sizeKey];
    }
    if (old.lh) cfg.roles.body.lh = old.lh;
    if (old.subCase === 'upper') cfg.roles.sub.case = 'upper';
  }
  cfg.layout = old.layout === 'post' ? 'square' : FORMATS.some((f) => f.id === old.layout) ? old.layout : 'page';
  return cfg;
}

export function mountPairs(root) {
  let cfg = loadConfig();
  const persist = () => saveLocal('pair', cfg);
  if (ROLES.some((r) => cfg.roles[r.id].key && !resolveFamily(cfg.roles[r.id].key))) loadGoogle();

  const controls = h('aside', { class: 'pair-controls' });
  const stage = h('div', { class: 'pair-stage' });
  const saved = h('div', { class: 'pair-saved' });
  root.append(
    h('header', { class: 'view-head view-head-plain' }, h('div', { class: 'view-title-row' }, h('h1', { class: 'view-title' }, 'Combinar'),
      h('span', { class: 'view-count' }, 'Título, subtítulo e texto juntos, em vários formatos'),
      h('div', { class: 'view-actions' }, h('button', { class: 'btn', onClick: copySpec }, icon('copy'), 'Copiar especificação')))),
    h('div', { class: 'pair-layout' }, controls, h('div', { class: 'pair-main' }, stage, saved)));

  // ---------- layout: página e arte usam o mesmo conteúdo ----------
  const makeSet = () => ({ title: h('h2', { class: 'pair-title' }), sub: h('p', { class: 'pair-sub' }), body: h('div', { class: 'pair-bodies' }), cta: h('span', { class: 'pair-cta' }) });
  const page = makeSet();
  const art = makeSet();
  const pageCard = h('article', { class: 'pair-card' }, page.title, page.sub, page.body, page.cta);
  const artCard = h('article', { class: 'artboard' }, art.title, art.sub, art.body, art.cta);
  const artWrap = h('div', { class: 'art-wrap' }, artCard);
  const artCaption = h('p', { class: 'art-caption' });
  const artBox = h('div', { class: 'art-box' }, artWrap, artCaption);
  const contrastEl = h('div', { class: 'contrast' });
  stage.append(pageCard, artBox, contrastEl);
  const ro = new ResizeObserver(() => fitArt());
  ro.observe(stage);

  const famOf = (r) => (r && r.key ? resolveFamily(r.key) : null);
  const roleEls = (set) => ({ heading: [set.title], sub: [set.sub], body: [set.body, set.cta] });

  function fillText(set) {
    set.title.textContent = cfg.roles.heading.text;
    set.sub.textContent = cfg.roles.sub.text;
    set.body.replaceChildren(...String(cfg.roles.body.text).split(/\n+/).filter((t) => t.trim()).map((t) => h('p', { class: 'pair-body' }, t)));
    set.cta.textContent = cfg.cta;
    set.cta.hidden = !cfg.cta.trim();
  }

  function styleSet(set, k) {
    for (const r of ROLES) {
      const rc = cfg.roles[r.id];
      const fam = famOf(rc);
      for (const el of roleEls(set)[r.id]) {
        if (fam) paintChoice(el, fam, rc.choice);
        el.style.fontSize = Math.round(rc.size * k * 10) / 10 + 'px';
        el.style.lineHeight = rc.lh;
        el.style.letterSpacing = rc.ls / 1000 + 'em';
        el.style.textTransform = TRANSFORM[rc.case] || 'none';
      }
    }
    set.cta.style.lineHeight = 1.2; // o botão mantém a altura própria
  }

  function paint() {
    const fmt = fmtOf(cfg.layout);
    pageCard.hidden = fmt.id !== 'page';
    artBox.hidden = fmt.id === 'page';
    artCard.className = `artboard art-${fmt.id}`;
    const c = cfg.colors;
    for (const card of [pageCard, artCard]) {
      card.style.setProperty('--c-bg', c.bg);
      card.style.setProperty('--c-title', c.title);
      card.style.setProperty('--c-sub', c.sub);
      card.style.setProperty('--c-body', c.body);
      card.style.setProperty('--c-accent', c.accent);
      card.style.setProperty('--c-accent-text', c.accentText);
    }
    fillText(page); fillText(art);
    styleSet(page, 1); styleSet(art, ART_SCALE);
    fitArt();
    paintContrast();
  }

  // Contraste de cada cor com o fundo (referência WCAG: 4,5 para texto, 3 para títulos grandes).
  function paintContrast() {
    const c = cfg.colors;
    const rows = [['Título', c.title, 3], ['Subtítulo', c.sub, 3], ['Texto', c.body, 4.5], ['Botão', c.accentText, 4.5, c.accent]];
    contrastEl.replaceChildren(h('span', { class: 'contrast-title' }, 'Contraste com o fundo'),
      ...rows.map(([label, fg, min, bg]) => {
        const r = contrast(fg, bg || c.bg);
        const ok = r >= min;
        return h('span', { class: 'contrast-item' + (ok ? '' : ' is-low'), title: ok ? 'Boa leitura' : `Abaixo do mínimo recomendado (${String(min).replace('.', ',')}:1)` },
          h('span', { class: 'contrast-dot', style: { background: fg, boxShadow: `0 0 0 3px ${bg || c.bg}` } }),
          `${label} ${r.toFixed(1).replace('.', ',')}:1`, ok ? null : h('strong', {}, ' baixo'));
      }));
  }

  // Reduz a arte para caber no espaço disponível e mostra o tamanho real.
  function fitArt() {
    const fmt = fmtOf(cfg.layout);
    if (!fmt.w) return;
    const availW = Math.max(240, Math.min(stage.clientWidth || 760, fmt.w > fmt.h ? 980 : 760));
    const availH = Math.max(380, window.innerHeight - 260);
    const s = Math.min(availW / fmt.w, availH / fmt.h);
    artCard.style.width = fmt.w + 'px';
    artCard.style.height = fmt.h + 'px';
    artCard.style.transform = `scale(${s})`;
    artWrap.style.width = Math.round(fmt.w * s) + 'px';
    artWrap.style.height = Math.round(fmt.h * s) + 'px';
    const R = cfg.roles;
    artCaption.textContent = `${fmt.w} × ${fmt.h} px, prévia em ${Math.round(s * 100)}%. Na arte: título ${Math.round(R.heading.size * ART_SCALE)} px, subtítulo ${Math.round(R.sub.size * ART_SCALE)} px, texto ${Math.round(R.body.size * ART_SCALE)} px.`;
  }

  // ---------- controles ----------
  const num = (v, d = 0) => (Math.round(v * 10 ** d) / 10 ** d).toString().replace('.', ',');

  function slider(label, min, max, step, get, set, fmt) {
    const out = h('span', { class: 'ctl-val' }, fmt(get()));
    return h('label', { class: 'ctl' }, h('span', { class: 'ctl-label' }, label, out),
      h('input', { type: 'range', class: 'range', min, max, step, value: get(), onInput: (e) => { set(+e.target.value); out.textContent = fmt(get()); persist(); paint(); } }));
  }

  function roleSection(role) {
    const rc = cfg.roles[role.id];
    const fam = famOf(rc);
    const textBox = h('textarea', { class: 'pair-text', rows: role.rows, spellcheck: 'true', 'aria-label': `Texto do ${role.label.toLowerCase()}`,
      onInput: (e) => { rc.text = e.target.value; persist(); paint(); } });
    textBox.value = rc.text;
    const nameBtn = h('button', { class: 'slot-font', onClick: (e) => fontPicker(e.currentTarget, (f) => { rc.key = f.key; rc.choice = null; persist(); drawControls(); paint(); }, { title: `Fonte do ${role.label.toLowerCase()}` }) },
      h('span', { class: 'slot-name' }, fam ? fam.name : 'Escolher fonte'), icon('chevron'));
    if (fam) paintChoice(nameBtn.firstChild, fam, rc.choice);
    const summaryName = h('span', { class: 'stage-font' }, fam ? fam.name : '');
    const det = h('details', { class: 'stage', open: !!cfg.open[role.id], onToggle: (e) => { cfg.open[role.id] = e.currentTarget.open; persist(); } },
      h('summary', {}, h('span', { class: 'stage-name' }, role.label), summaryName, icon('chevron', 'stage-caret')),
      h('div', { class: 'stage-body' },
        h('label', { class: 'ctl' }, h('span', { class: 'ctl-label' }, 'Texto', h('button', { class: 'link-btn', title: 'Voltar ao texto do modelo', onClick: (e) => { e.preventDefault(); rc.text = role.text; textBox.value = role.text; persist(); paint(); } }, 'Usar modelo')), textBox),
        role.id === 'body' ? h('label', { class: 'ctl' }, h('span', { class: 'ctl-label' }, 'Texto do botão'),
          h('input', { class: 'field field-sm', value: cfg.cta, placeholder: 'Deixe vazio para esconder o botão', onInput: (e) => { cfg.cta = e.target.value; persist(); paint(); } })) : null,
        h('div', { class: 'slot' }, h('span', { class: 'ctl-label' }, 'Fonte'), nameBtn,
          fam ? styleSelect(fam, rc.choice, (v) => { rc.choice = v; persist(); paint(); drawControls(); }) : null),
        slider('Tamanho', ...role.size, () => rc.size, (v) => { rc.size = v; }, (v) => num(v, 1) + ' px'),
        slider('Entrelinha', 0.8, 2.4, 0.05, () => rc.lh, (v) => { rc.lh = v; }, (v) => v.toFixed(2).replace('.', ',')),
        slider('Espaçamento entre caracteres', -100, 400, 5, () => rc.ls, (v) => { rc.ls = v; }, (v) => (v > 0 ? '+' : '') + v),
        h('div', { class: 'ctl' }, h('span', { class: 'ctl-label' }, 'Caixa'),
          h('div', { class: 'seg seg-fill' }, CASES.map(([v, l, tip]) => h('button', { class: 'seg-btn' + (rc.case === v ? ' is-on' : ''), title: tip, onClick: () => { rc.case = v; persist(); drawControls(); paint(); } }, l))))));
    return det;
  }

  function colorSection() {
    const current = PALETTES.find((p) => COLOR_FIELDS.every(([k], i) => cfg.colors[k].toLowerCase() === p[i + 1]));
    const det = h('details', { class: 'stage', open: !!cfg.open.colors, onToggle: (e) => { cfg.open.colors = e.currentTarget.open; persist(); } },
      h('summary', {}, h('span', { class: 'stage-name' }, 'Cores'), h('span', { class: 'stage-font' }, current ? current[0] : 'Personalizadas'), icon('chevron', 'stage-caret')),
      h('div', { class: 'stage-body' },
        h('div', { class: 'ctl' }, h('span', { class: 'ctl-label' }, 'Combinações prontas'),
          h('div', { class: 'palettes' }, PALETTES.map((p) => h('button', {
            class: 'palette' + (current === p ? ' is-on' : ''), title: p[0], 'aria-label': `Cores ${p[0]}`,
            onClick: () => { cfg.colors = paletteObj(p); persist(); drawControls(); paint(); },
          }, h('span', { class: 'palette-bg', style: { background: p[1] } }, h('span', { style: { color: p[2] } }, 'Aa'), h('i', { style: { background: p[5] } })), h('span', { class: 'palette-name' }, p[0]))))),
        h('div', { class: 'color-grid' }, COLOR_FIELDS.map(([k, l]) => colorField(k, l)))));
    return det;
  }

  // Seletor de cor com o código hexadecimal ao lado, os dois sincronizados.
  function colorField(k, label) {
    const set = (v) => { cfg.colors[k] = v.toLowerCase(); persist(); paint(); };
    const hex = h('input', { class: 'color-hex', value: cfg.colors[k].toUpperCase(), spellcheck: 'false', 'aria-label': `${label} em hexadecimal`,
      onChange: (e) => {
        const v = e.target.value.trim().replace(/^#?/, '#');
        if (/^#[0-9a-f]{6}$/i.test(v)) { set(v); picker.value = v.toLowerCase(); e.target.value = v.toUpperCase(); drawControls(); } else e.target.value = cfg.colors[k].toUpperCase();
      } });
    const picker = h('input', { type: 'color', value: cfg.colors[k], 'aria-label': label,
      onInput: (e) => { set(e.target.value); hex.value = e.target.value.toUpperCase(); },
      onChange: () => drawControls() });
    return h('label', { class: 'color-field' }, picker, h('span', { class: 'color-name' }, label), hex);
  }

  function formatPicker() {
    return h('div', { class: 'ctl' }, h('span', { class: 'ctl-label' }, 'Formato'),
      h('div', { class: 'formats' }, FORMATS.map((f) => {
        const r = f.w ? f.w / f.h : 1.35;
        const box = r >= 1 ? { width: '30px', height: Math.round(30 / r) + 'px' } : { height: '30px', width: Math.round(30 * r) + 'px' };
        return h('button', { class: 'format' + (cfg.layout === f.id ? ' is-on' : ''), 'aria-pressed': cfg.layout === f.id ? 'true' : 'false', onClick: () => { cfg.layout = f.id; persist(); drawControls(); paint(); } },
          h('span', { class: 'format-shape' }, h('i', { style: box })),
          h('span', { class: 'format-name' }, f.label),
          h('span', { class: 'format-size' }, f.w ? `${f.w}×${f.h}` : 'Livre'));
      })));
  }

  function drawControls() {
    const scroll = controls.scrollTop;
    controls.replaceChildren(
      ...ROLES.map(roleSection),
      colorSection(),
      h('div', { class: 'stage-plain' }, formatPicker()),
      h('div', { class: 'stage-plain stage-actions' },
        h('button', { class: 'btn btn-ghost swap', title: 'Troca as fontes do título e do texto', onClick: () => {
          const a = cfg.roles.heading, b = cfg.roles.body;
          [a.key, b.key, a.choice, b.choice] = [b.key, a.key, b.choice, a.choice];
          persist(); drawControls(); paint();
        } }, icon('swap'), 'Inverter fontes do título e texto'),
        h('button', { class: 'btn btn-primary', onClick: savePair }, 'Salvar combinação')));
    controls.scrollTop = scroll;
  }

  // ---------- especificação e combinações salvas ----------
  function specText() {
    const name = (rc) => { const f = famOf(rc); if (!f) return '(não definida)'; const st = f.faces && f.faces.find((x) => x.id === rc.choice); return `${f.name}${st ? ' ' + st.style : ''}`; };
    const caseTxt = { none: '', upper: ', caixa alta', lower: ', caixa baixa' };
    const fmt = fmtOf(cfg.layout);
    const lines = ROLES.map((r) => {
      const rc = cfg.roles[r.id];
      const size = fmt.w ? `${num(rc.size, 1)} px (${Math.round(rc.size * ART_SCALE)} px na arte)` : `${num(rc.size, 1)} px`;
      return `${r.label}: ${name(rc)}, ${size}, entrelinha ${rc.lh.toFixed(2).replace('.', ',')}, espaçamento ${rc.ls}${caseTxt[rc.case] || ''}`;
    });
    const c = cfg.colors;
    return [
      ...lines,
      ...(fmt.w ? [`Formato: ${fmt.label} ${fmt.w} × ${fmt.h} px`] : []),
      '',
      `Fundo ${c.bg.toUpperCase()}`, `Título ${c.title.toUpperCase()}`, `Subtítulo ${c.sub.toUpperCase()}`, `Texto ${c.body.toUpperCase()}`,
      `Botão ${c.accent.toUpperCase()} com texto ${c.accentText.toUpperCase()}`,
    ].join('\n');
  }
  function copySpec() { navigator.clipboard.writeText(specText()); toast('Especificação copiada: fontes, tamanhos, espaçamentos e cores'); }

  function savePair() {
    if (!cfg.roles.heading.key || !cfg.roles.body.key) return;
    const snap = JSON.stringify({ roles: cfg.roles, colors: cfg.colors, layout: cfg.layout, cta: cfg.cta });
    if (S.pairs.some((p) => p.v === 3 && JSON.stringify({ roles: p.roles, colors: p.colors, layout: p.layout, cta: p.cta }) === snap)) { toast('Essa combinação já está salva'); return; }
    const copy = JSON.parse(snap);
    // mantém também o formato antigo para quem abrir numa versão anterior
    S.pairs.unshift({ id: 'p' + Date.now().toString(36), v: 3, ...copy,
      heading: { key: copy.roles.heading.key, choice: copy.roles.heading.choice }, sub: { key: copy.roles.sub.key, choice: copy.roles.sub.choice }, body: { key: copy.roles.body.key, choice: copy.roles.body.choice },
      hs: copy.roles.heading.size, ss: copy.roles.sub.size, bs: copy.roles.body.size, lh: copy.roles.body.lh, at: Date.now() });
    api.save('pairs', S.pairs);
    toast('Combinação salva');
    drawSaved();
  }

  function openPair(p) {
    if (p.v === 3) {
      cfg = { ...cfg, roles: JSON.parse(JSON.stringify(p.roles)), colors: { ...paletteObj(PALETTES[0]), ...(p.colors || {}) }, layout: p.layout || cfg.layout, cta: p.cta ?? cfg.cta };
    } else {
      const map = { heading: [p.heading, p.hs], sub: [p.sub || p.body, p.ss], body: [p.body, p.bs] };
      for (const [id, [slot, size]] of Object.entries(map)) {
        if (slot) Object.assign(cfg.roles[id], { key: slot.key, choice: slot.choice ?? null });
        if (size) cfg.roles[id].size = size;
      }
      if (p.lh) cfg.roles.body.lh = p.lh;
      if (p.colors) cfg.colors = { ...paletteObj(PALETTES[0]), ...p.colors };
      if (p.layout) cfg.layout = p.layout === 'post' ? 'square' : p.layout;
    }
    persist(); drawControls(); paint();
  }

  function drawSaved() {
    saved.replaceChildren();
    if (!S.pairs.length) return;
    saved.append(h('h3', { class: 'section-title' }, 'Combinações salvas'));
    const grid = h('div', { class: 'pair-grid' });
    for (const p of S.pairs) {
      const roles = p.v === 3 ? p.roles : { heading: p.heading, sub: p.sub || p.body, body: p.body };
      const c = { ...paletteObj(PALETTES[0]), ...(p.colors || {}) };
      const hf = famOf(roles.heading), sf = famOf(roles.sub), bf = famOf(roles.body);
      const t = h('span', { class: 'pair-thumb-h', style: { color: c.title } }, hf ? hf.name : roles.heading.key);
      const s = h('span', { class: 'pair-thumb-s', style: { color: c.sub } }, sf ? sf.name : '');
      const b = h('span', { class: 'pair-thumb-b', style: { color: c.body } }, bf ? bf.name : roles.body.key);
      if (hf) paintChoice(t, hf, roles.heading.choice);
      if (sf) paintChoice(s, sf, roles.sub.choice);
      if (bf) paintChoice(b, bf, roles.body.choice);
      grid.append(h('div', { class: 'pair-thumb' },
        h('button', { class: 'pair-thumb-main', style: { background: c.bg }, title: 'Abrir combinação', onClick: () => openPair(p) }, t, s, b),
        h('button', { class: 'icon-btn pair-del', title: 'Excluir combinação', 'aria-label': 'Excluir combinação', onClick: () => confirmBox('Excluir combinação?', `${hf ? hf.name : ''} com ${bf ? bf.name : ''}`, 'Excluir', () => { S.pairs = S.pairs.filter((x) => x !== p); api.save('pairs', S.pairs); drawSaved(); }) }, icon('x'))));
    }
    saved.append(grid);
  }

  drawControls(); paint(); drawSaved();
  return {
    update: (reason) => { if (reason === 'data' || reason === 'google') { if (!controls.contains(document.activeElement)) drawControls(); paint(); drawSaved(); } },
    destroy() { ro.disconnect(); },
  };
}

export { famKey, navigate };
