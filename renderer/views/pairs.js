// Combinar: título, subtítulo e texto juntos, em fundo neutro, na página livre e em artes de 1080 px.
import { h, icon, toast, confirmBox } from '../lib/ui.js';
import { S, api, resolveFamily, families, saveLocal, navigate, famKey, loadGoogle } from '../state.js';
import { fontPicker } from '../components.js';
import { styleSelect, paintChoice } from './compare.js';

// Cores fixas e neutras: no Combinar só as fontes mudam.
const NEUTRAL = { bg: '#ffffff', title: '#000000', sub: '#5f5f5c', body: '#2e2e2c', accent: '#000000', accentText: '#ffffff' };

function defaults() {
  const pool = [...families('library'), ...families('system')];
  const pick = (re) => pool.find((f) => re.test(f.name));
  const heading = pick(/serif|garamond|playfair|fraunces|caladea|georgia|baskerville/i) || pool[0];
  const body = pick(/^inter$|sans|helvetica|arial|roboto|carlito/i) || pool[1] || pool[0];
  const slot = (f) => (f ? { key: f.key, choice: null } : null);
  return { heading: slot(heading), sub: slot(body), body: slot(body) };
}

const BASE = { hs: 64, ss: 24, bs: 18, lh: 1.55, subCase: 'normal', layout: 'page' };

// Formatos de teste. As artes de 1080 px usam o dobro dos tamanhos da página, como uma tela de celular em 2x.
const FORMATS = [
  { id: 'page', label: 'Página', w: null, h: null },
  { id: 'land', label: 'Horizontal', w: 1920, h: 1080 },
  { id: 'story', label: 'Vertical', w: 1080, h: 1920 },
  { id: 'portrait', label: 'Retrato', w: 1080, h: 1440 },
  { id: 'square', label: 'Quadrado', w: 1080, h: 1080 },
];
const ART_SCALE = 2;
const fmtOf = (id) => FORMATS.find((f) => f.id === id) || FORMATS[0];

export function mountPairs(root) {
  let cfg = (() => { try { return JSON.parse(localStorage.getItem('gf.pair')); } catch { return null; } })() || {};
  cfg = { ...BASE, ...defaults(), ...cfg };
  if (!cfg.sub) cfg.sub = cfg.body ? { ...cfg.body } : null;
  if (cfg.layout === 'post') cfg.layout = 'square';
  if (!FORMATS.some((f) => f.id === cfg.layout)) cfg.layout = 'page';
  delete cfg.dark; delete cfg.colors; delete cfg.colorsSet;
  const persist = () => saveLocal('pair', cfg);
  if ([cfg.heading, cfg.sub, cfg.body].some((x) => x && !resolveFamily(x.key))) loadGoogle();

  const controls = h('aside', { class: 'pair-controls' });
  const stage = h('div', { class: 'pair-stage' });
  const saved = h('div', { class: 'pair-saved' });
  root.append(
    h('header', { class: 'view-head view-head-plain' }, h('div', { class: 'view-title-row' }, h('h1', { class: 'view-title' }, 'Combinar'),
      h('span', { class: 'view-count' }, 'Título, subtítulo e texto juntos, em vários formatos'),
      h('div', { class: 'view-actions' }, h('button', { class: 'btn', onClick: copySpec }, icon('copy'), 'Copiar especificação')))),
    h('div', { class: 'pair-layout' }, controls, h('div', { class: 'pair-main' }, stage, saved)));

  // textos editáveis do layout de teste (o mesmo conteúdo nos dois formatos)
  const ed = (tag, cls, text) => h(tag, { class: cls, contenteditable: 'plaintext-only', spellcheck: 'false' }, text);
  const page = {
    title: ed('h2', 'pair-title', 'Toda marca começa por uma voz'),
    sub: ed('p', 'pair-sub', 'A tipografia fala antes de qualquer palavra ser lida.'),
    p1: ed('p', 'pair-body', 'Escolher fontes para uma identidade é decidir como a marca vai soar quando ninguém estiver explicando nada. O título chama a atenção, o subtítulo apresenta a ideia e o texto sustenta a leitura.'),
    p2: ed('p', 'pair-body', 'Teste a combinação em tamanhos reais, com acentos, números e frases longas, antes de levar para o cliente. Assim a escolha chega pronta para aprovar.'),
    cta: ed('span', 'pair-cta', 'Agendar uma conversa'),
  };
  const post = {
    title: ed('h2', 'post-title', 'Nova coleção de outono'),
    sub: ed('p', 'post-sub', 'Peças pensadas para durar mais de uma estação.'),
    body: ed('p', 'post-body', 'Disponível na loja e no site a partir de 12/11. Frete grátis acima de R$ 299,90.'),
    cta: ed('span', 'pair-cta', 'Ver a coleção'),
  };
  const pageCard = h('article', { class: 'pair-card' }, page.title, page.sub, page.p1, page.p2, page.cta);
  // arte em tamanho real (1080 px de largura ou mais), reduzida para caber na tela
  const postCard = h('article', { class: 'artboard' }, post.title, post.sub, post.body, post.cta);
  const artWrap = h('div', { class: 'art-wrap' }, postCard);
  const artCaption = h('p', { class: 'art-caption' });
  const artBox = h('div', { class: 'art-box' }, artWrap, artCaption);
  stage.append(pageCard, artBox);
  const ro = new ResizeObserver(() => fitArt());
  ro.observe(stage);

  function famOf(slot) { return slot && resolveFamily(slot.key); }

  function paint() {
    const hf = famOf(cfg.heading), sf = famOf(cfg.sub), bf = famOf(cfg.body);
    const c = NEUTRAL;
    const fmt = fmtOf(cfg.layout);
    pageCard.hidden = fmt.id !== 'page';
    artBox.hidden = fmt.id === 'page';
    postCard.className = `artboard art-${fmt.id}`;
    for (const card of [pageCard, postCard]) {
      card.style.setProperty('--c-bg', c.bg);
      card.style.setProperty('--c-title', c.title);
      card.style.setProperty('--c-sub', c.sub);
      card.style.setProperty('--c-body', c.body);
      card.style.setProperty('--c-accent', c.accent);
      card.style.setProperty('--c-accent-text', c.accentText);
    }
    if (hf) [page.title, post.title].forEach((e) => paintChoice(e, hf, cfg.heading.choice));
    if (sf) [page.sub, post.sub].forEach((e) => paintChoice(e, sf, cfg.sub.choice));
    if (bf) [page.p1, page.p2, page.cta, post.body, post.cta].forEach((e) => paintChoice(e, bf, cfg.body.choice));
    page.title.style.fontSize = cfg.hs + 'px';
    const k = ART_SCALE;
    post.title.style.fontSize = Math.round(cfg.hs * k) + 'px';
    post.sub.style.fontSize = Math.round(cfg.ss * k) + 'px';
    post.body.style.fontSize = Math.round(cfg.bs * k) + 'px';
    post.body.style.lineHeight = cfg.lh;
    post.cta.style.fontSize = Math.round(cfg.bs * k) + 'px';
    page.sub.style.fontSize = cfg.ss + 'px';
    [page.sub, post.sub].forEach((e) => {
      e.style.textTransform = cfg.subCase === 'upper' ? 'uppercase' : 'none';
      e.style.letterSpacing = cfg.subCase === 'upper' ? '0.08em' : 'normal';
    });
    [page.p1, page.p2].forEach((e) => { e.style.fontSize = cfg.bs + 'px'; e.style.lineHeight = cfg.lh; });
    page.cta.style.fontSize = cfg.bs + 'px';
    fitArt();

  }

  // Reduz a arte para caber no espaço disponível e mostra o tamanho real.
  function fitArt() {
    const fmt = fmtOf(cfg.layout);
    if (!fmt.w) return;
    const availW = Math.max(240, Math.min(stage.clientWidth || 760, fmt.w > fmt.h ? 980 : 760));
    const availH = Math.max(380, window.innerHeight - 250);
    const s = Math.min(availW / fmt.w, availH / fmt.h);
    postCard.style.width = fmt.w + 'px';
    postCard.style.height = fmt.h + 'px';
    postCard.style.transform = `scale(${s})`;
    artWrap.style.width = Math.round(fmt.w * s) + 'px';
    artWrap.style.height = Math.round(fmt.h * s) + 'px';
    const k = ART_SCALE;
    artCaption.textContent = `${fmt.w} × ${fmt.h} px, prévia em ${Math.round(s * 100)}%. Na arte: título ${Math.round(cfg.hs * k)} px, subtítulo ${Math.round(cfg.ss * k)} px, texto ${Math.round(cfg.bs * k)} px.`;
  }

  // Botões de formato com a proporção desenhada.
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

  function fontSlot(role, label) {
    const slot = cfg[role];
    const fam = famOf(slot);
    const nameBtn = h('button', { class: 'slot-font', onClick: (e) => fontPicker(e.currentTarget, (f) => { cfg[role] = { key: f.key, choice: null }; persist(); drawControls(); paint(); }, { title: `Fonte do ${label.toLowerCase()}` }) },
      h('span', { class: 'slot-name' }, fam ? fam.name : 'Escolher fonte'), icon('chevron'));
    if (fam) paintChoice(nameBtn.firstChild, fam, slot.choice);
    return h('div', { class: 'slot' }, h('span', { class: 'ctl-label' }, label), nameBtn,
      fam ? styleSelect(fam, slot.choice, (v) => { cfg[role].choice = v; persist(); paint(); drawControls(); }) : null);
  }

  const slider = (label, min, max, step, key, f = (v) => v) => {
    const out = h('span', { class: 'ctl-val' }, f(cfg[key]));
    return h('label', { class: 'ctl' }, h('span', { class: 'ctl-label' }, label, out),
      h('input', { type: 'range', class: 'range', min, max, step, value: cfg[key], onInput: (e) => { cfg[key] = +e.target.value; out.textContent = f(cfg[key]); persist(); paint(); } }));
  };
  const seg = (label, key, options) => h('div', { class: 'ctl' }, h('span', { class: 'ctl-label' }, label),
    h('div', { class: 'seg' }, options.map(([v, l]) => h('button', { class: 'seg-btn' + (cfg[key] === v ? ' is-on' : ''), onClick: () => { cfg[key] = v; persist(); drawControls(); paint(); } }, l))));
  const px = (v) => String(v).replace('.', ',') + ' px';

  function drawControls() {
    controls.innerHTML = '';
    controls.append(
      h('h3', { class: 'ctl-group' }, 'Fontes'),
      fontSlot('heading', 'Título'),
      slider('Tamanho do título', 24, 140, 1, 'hs', px),
      fontSlot('sub', 'Subtítulo'),
      slider('Tamanho do subtítulo', 12, 60, 1, 'ss', px),
      seg('Caixa do subtítulo', 'subCase', [['normal', 'Como digitado'], ['upper', 'Maiúsculas']]),
      fontSlot('body', 'Texto'),
      slider('Tamanho do texto', 11, 32, 0.5, 'bs', px),
      slider('Entrelinha', 1, 2.2, 0.05, 'lh', (v) => v.toFixed(2).replace('.', ',')),
      h('button', { class: 'btn btn-ghost swap', title: 'Troca a fonte do título com a do texto', onClick: () => { [cfg.heading, cfg.body] = [cfg.body, cfg.heading]; persist(); drawControls(); paint(); } }, icon('swap'), 'Inverter título e texto'),
      h('h3', { class: 'ctl-group' }, 'Layout de teste'),
      formatPicker(),
      h('button', { class: 'btn btn-primary', onClick: savePair }, 'Salvar combinação'));
  }

  function specText() {
    const name = (slot) => { const f = famOf(slot); if (!f) return '(não definida)'; const st = f.faces && f.faces.find((x) => x.id === slot.choice); return `${f.name}${st ? ' ' + st.style : ''}`; };
    return [
      `Título: ${name(cfg.heading)}, ${cfg.hs} px`,
      `Subtítulo: ${name(cfg.sub)}, ${cfg.ss} px${cfg.subCase === 'upper' ? ', em maiúsculas' : ''}`,
      `Texto: ${name(cfg.body)}, ${px(cfg.bs)}, entrelinha ${cfg.lh.toFixed(2).replace('.', ',')}`,
      ...(fmtOf(cfg.layout).w ? ['', `Arte ${fmtOf(cfg.layout).w} × ${fmtOf(cfg.layout).h} px: título ${Math.round(cfg.hs * ART_SCALE)} px, subtítulo ${Math.round(cfg.ss * ART_SCALE)} px, texto ${Math.round(cfg.bs * ART_SCALE)} px`] : []),
    ].join('\n');
  }
  function copySpec() { navigator.clipboard.writeText(specText()); toast('Especificação copiada: fontes e tamanhos'); }

  function savePair() {
    if (!cfg.heading || !cfg.body) return;
    const same = (a, b) => (a && b ? a.key === b.key && a.choice === b.choice : a === b);
    const exists = S.pairs.some((p) => same(p.heading, cfg.heading) && same(p.sub, cfg.sub) && same(p.body, cfg.body) && p.layout === cfg.layout);
    if (exists) { toast('Essa combinação já está salva'); return; }
    S.pairs.unshift({ id: 'p' + Date.now().toString(36), heading: { ...cfg.heading }, sub: cfg.sub ? { ...cfg.sub } : null, body: { ...cfg.body }, hs: cfg.hs, ss: cfg.ss, bs: cfg.bs, lh: cfg.lh, subCase: cfg.subCase, layout: cfg.layout, at: Date.now() });
    api.save('pairs', S.pairs);
    toast('Combinação salva');
    drawSaved();
  }

  function drawSaved() {
    saved.innerHTML = '';
    if (!S.pairs.length) return;
    saved.append(h('h3', { class: 'section-title' }, 'Combinações salvas'));
    const grid = h('div', { class: 'pair-grid' });
    for (const p of S.pairs) {
      const hf = famOf(p.heading), sf = famOf(p.sub || p.body), bf = famOf(p.body);
      const c = NEUTRAL;
      const t = h('span', { class: 'pair-thumb-h', style: { color: c.title } }, hf ? hf.name : p.heading.key);
      const s = h('span', { class: 'pair-thumb-s', style: { color: c.sub } }, sf ? sf.name : '');
      const b = h('span', { class: 'pair-thumb-b', style: { color: c.body } }, bf ? bf.name : p.body.key);
      if (hf) paintChoice(t, hf, p.heading.choice);
      if (sf) paintChoice(s, sf, (p.sub || p.body).choice);
      if (bf) paintChoice(b, bf, p.body.choice);
      grid.append(h('div', { class: 'pair-thumb' },
        h('button', { class: 'pair-thumb-main', style: { background: c.bg }, title: 'Abrir combinação', onClick: () => {
          cfg = { ...cfg, heading: { ...p.heading }, sub: { ...(p.sub || p.body) }, body: { ...p.body }, hs: p.hs || cfg.hs, ss: p.ss || cfg.ss, bs: p.bs || cfg.bs, lh: p.lh || cfg.lh, subCase: p.subCase || 'normal', layout: p.layout || cfg.layout };
          persist(); drawControls(); paint();
        } }, t, s, b),
        h('button', { class: 'icon-btn pair-del', title: 'Excluir combinação', 'aria-label': 'Excluir combinação', onClick: () => confirmBox('Excluir combinação?', `${hf ? hf.name : ''} com ${bf ? bf.name : ''}`, 'Excluir', () => { S.pairs = S.pairs.filter((x) => x !== p); api.save('pairs', S.pairs); drawSaved(); }) }, icon('x'))));
    }
    saved.append(grid);
  }

  drawControls(); paint(); drawSaved();
  return { update: (reason) => { if (reason === 'data' || reason === 'google') { drawControls(); paint(); drawSaved(); } }, destroy() { ro.disconnect(); } };
}

export { famKey, navigate };
