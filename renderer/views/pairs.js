// Combinar uma fonte de título com uma fonte de texto e salvar as combinações.
import { h, icon, toast, confirmBox } from '../lib/ui.js';
import { S, api, resolveFamily, families, saveLocal, navigate, famKey, loadGoogle } from '../state.js';
import { fontPicker } from '../components.js';
import { styleSelect, paintChoice } from './compare.js';

function defaults() {
  const lib = families('library');
  const sys = families('system');
  const pool = [...lib, ...sys];
  const pick = (re) => pool.find((f) => re.test(f.name));
  const heading = pick(/serif|garamond|playfair|fraunces|caladea|georgia|baskerville/i) || pool[0];
  const body = pick(/^inter$|sans|helvetica|arial|roboto|carlito/i) || pool[1] || pool[0];
  return { heading: heading ? { key: heading.key, choice: null } : null, body: body ? { key: body.key, choice: null } : null };
}

export function mountPairs(root) {
  let cfg = (() => { try { return JSON.parse(localStorage.getItem('tp.pair')); } catch { return null; } })() || { ...defaults(), hs: 64, bs: 18, lh: 1.55, dark: false };
  if (!cfg.heading || !cfg.body) cfg = { ...cfg, ...defaults() };
  const persist = () => saveLocal('pair', cfg);
  // o catálogo do Google precisa estar carregado para resolver famílias que vieram de lá
  if ([cfg.heading, cfg.body].some((x) => x && !resolveFamily(x.key))) loadGoogle();

  const controls = h('aside', { class: 'pair-controls' });
  const stage = h('div', { class: 'pair-stage' });
  const saved = h('div', { class: 'pair-saved' });
  root.append(
    h('header', { class: 'view-head' }, h('div', { class: 'view-title-row' }, h('h1', { class: 'view-title' }, 'Combinar'),
      h('span', { class: 'view-count' }, 'Teste título e texto juntos, em tamanhos reais'))),
    h('div', { class: 'pair-layout' }, controls, h('div', { class: 'pair-main' }, stage, saved)));

  // conteúdo editável do exemplo
  const sample = {
    title: 'Toda marca começa por uma voz',
    lead: 'A tipografia fala antes de qualquer palavra ser lida.',
    p1: 'Escolher fontes para uma identidade é decidir como a marca vai soar quando ninguém estiver explicando nada. O título chama a atenção, o texto sustenta a leitura e os dois precisam conversar.',
    p2: 'Teste a combinação em tamanhos reais, com acentos, números e frases longas, antes de levar para o cliente. Assim a escolha chega pronta para aprovar.',
    cta: 'Agendar uma conversa',
  };
  const els = {
    title: h('h2', { class: 'pair-title', contenteditable: 'plaintext-only', spellcheck: 'false' }, sample.title),
    lead: h('p', { class: 'pair-lead', contenteditable: 'plaintext-only', spellcheck: 'false' }, sample.lead),
    p1: h('p', { class: 'pair-body', contenteditable: 'plaintext-only', spellcheck: 'false' }, sample.p1),
    p2: h('p', { class: 'pair-body', contenteditable: 'plaintext-only', spellcheck: 'false' }, sample.p2),
    cta: h('span', { class: 'pair-cta', contenteditable: 'plaintext-only', spellcheck: 'false' }, sample.cta),
  };
  const card = h('article', { class: 'pair-card' }, els.title, els.lead, els.p1, els.p2, els.cta);
  stage.append(card);

  function paint() {
    const hf = cfg.heading && resolveFamily(cfg.heading.key);
    const bf = cfg.body && resolveFamily(cfg.body.key);
    card.classList.toggle('is-dark', !!cfg.dark);
    if (hf) { paintChoice(els.title, hf, cfg.heading.choice); paintChoice(els.lead, hf, cfg.heading.choice); }
    if (bf) { [els.p1, els.p2, els.cta].forEach((e) => paintChoice(e, bf, cfg.body.choice)); }
    els.title.style.fontSize = cfg.hs + 'px';
    els.lead.style.fontSize = Math.round(cfg.hs * 0.42) + 'px';
    [els.p1, els.p2].forEach((e) => { e.style.fontSize = cfg.bs + 'px'; e.style.lineHeight = cfg.lh; });
    els.cta.style.fontSize = cfg.bs + 'px';
  }

  function fontSlot(role, label) {
    const slot = cfg[role];
    const fam = slot && resolveFamily(slot.key);
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

  function drawControls() {
    controls.innerHTML = '';
    controls.append(
      fontSlot('heading', 'Título'),
      slider('Tamanho do título', 24, 140, 1, 'hs', (v) => v + ' px'),
      h('button', { class: 'btn btn-ghost swap', onClick: () => { [cfg.heading, cfg.body] = [cfg.body, cfg.heading]; persist(); drawControls(); paint(); } }, icon('swap'), 'Inverter'),
      fontSlot('body', 'Texto'),
      slider('Tamanho do texto', 11, 32, 0.5, 'bs', (v) => String(v).replace('.', ',') + ' px'),
      slider('Entrelinha', 1, 2.2, 0.05, 'lh', (v) => v.toFixed(2).replace('.', ',')),
      h('div', { class: 'ctl' }, h('span', { class: 'ctl-label' }, 'Fundo'),
        h('div', { class: 'seg' }, [[false, 'Claro'], [true, 'Escuro']].map(([v, l]) => h('button', { class: 'seg-btn' + (!!cfg.dark === v ? ' is-on' : ''), onClick: () => { cfg.dark = v; persist(); drawControls(); paint(); } }, l)))),
      h('button', { class: 'btn btn-primary', onClick: savePair }, 'Salvar combinação'));
  }

  function savePair() {
    if (!cfg.heading || !cfg.body) return;
    const exists = S.pairs.some((p) => p.heading.key === cfg.heading.key && p.body.key === cfg.body.key && p.heading.choice === cfg.heading.choice && p.body.choice === cfg.body.choice);
    if (exists) { toast('Essa combinação já está salva'); return; }
    S.pairs.unshift({ id: 'p' + Date.now().toString(36), heading: { ...cfg.heading }, body: { ...cfg.body }, hs: cfg.hs, bs: cfg.bs, lh: cfg.lh, at: Date.now() });
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
      const hf = resolveFamily(p.heading.key);
      const bf = resolveFamily(p.body.key);
      const t = h('span', { class: 'pair-thumb-h' }, hf ? hf.name : p.heading.key);
      const b = h('span', { class: 'pair-thumb-b' }, bf ? bf.name : p.body.key);
      if (hf) paintChoice(t, hf, p.heading.choice);
      if (bf) paintChoice(b, bf, p.body.choice);
      grid.append(h('div', { class: 'pair-thumb' },
        h('button', { class: 'pair-thumb-main', title: 'Abrir combinação', onClick: () => { cfg = { ...cfg, heading: { ...p.heading }, body: { ...p.body }, hs: p.hs || cfg.hs, bs: p.bs || cfg.bs, lh: p.lh || cfg.lh }; persist(); drawControls(); paint(); } }, t, b),
        h('button', { class: 'icon-btn pair-del', title: 'Excluir combinação', 'aria-label': 'Excluir combinação', onClick: () => confirmBox('Excluir combinação?', `${hf ? hf.name : ''} com ${bf ? bf.name : ''}`, 'Excluir', () => { S.pairs = S.pairs.filter((x) => x !== p); api.save('pairs', S.pairs); drawSaved(); }) }, icon('x'))));
    }
    saved.append(grid);
  }

  drawControls(); paint(); drawSaved();
  return { update: (reason) => { if (reason === 'data' || reason === 'google') { drawControls(); paint(); drawSaved(); } }, destroy() {} };
}

export { famKey, navigate };
