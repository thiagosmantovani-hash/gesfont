// Utilitários de interface: criação de elementos, ícones, toasts, popovers, menus e modais.

export function h(tag, attrs = {}, ...children) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v === null || v === undefined || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
    else if (k === 'dataset') Object.assign(el.dataset, v);
    else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2).toLowerCase(), v);
    else if (k === 'html') el.innerHTML = v;
    else if (v === true) el.setAttribute(k, '');
    else el.setAttribute(k, v);
  }
  append(el, children);
  return el;
}

function append(el, children) {
  for (const c of children.flat(Infinity)) {
    if (c === null || c === undefined || c === false) continue;
    el.append(c instanceof Node ? c : document.createTextNode(String(c)));
  }
}

const PATHS = {
  search: '<circle cx="7" cy="7" r="4.5"/><path d="M10.5 10.5 14 14"/>',
  star: '<path d="M8 1.8l1.9 3.9 4.3.6-3.1 3 .7 4.3L8 11.6l-3.8 2 .7-4.3-3.1-3 4.3-.6z"/>',
  plus: '<path d="M8 3v10M3 8h10"/>',
  compare: '<rect x="2" y="3" width="5" height="10" rx="1"/><rect x="9" y="3" width="5" height="10" rx="1"/>',
  folder: '<path d="M2 4.5c0-.6.4-1 1-1h3l1.5 1.5H13c.6 0 1 .4 1 1V12c0 .6-.4 1-1 1H3c-.6 0-1-.4-1-1z"/>',
  x: '<path d="M4 4l8 8M12 4l-8 8"/>',
  back: '<path d="M10 3 5 8l5 5"/>',
  chevron: '<path d="M4 6l4 4 4-4"/>',
  check: '<path d="M3 8.5 6.5 12 13 4.5"/>',
  trash: '<path d="M3 4.5h10M6.5 4.5V3h3v1.5M4.5 4.5l.6 8.5h5.8l.6-8.5"/>',
  export: '<path d="M8 2v8M5 5l3-3 3 3M3 10v3h10v-3"/>',
  library: '<path d="M3 2.5v11M6 2.5v11M9 3l3.5 10"/>',
  monitor: '<rect x="2" y="3" width="12" height="8" rx="1"/><path d="M6 14h4M8 11v3"/>',
  globe: '<circle cx="8" cy="8" r="6"/><path d="M2 8h12M8 2c2 2 2 10 0 12M8 2c-2 2-2 10 0 12"/>',
  layers: '<path d="M8 2 2 5l6 3 6-3zM2 8l6 3 6-3M2 11l6 3 6-3"/>',
  pair: '<path d="M2 13 5 3l3 10M3 10h4M10 13V7M13.5 13V9.5a1.8 1.8 0 0 0-3.5 0"/>',
  zap: '<path d="M9 1.5 3.5 9H8l-1 5.5L12.5 7H8z"/>',
  swap: '<path d="M3 5.5h9l-2.5-2.5M13 10.5H4l2.5 2.5"/>',
  gear: '<circle cx="8" cy="8" r="2.2"/><path d="M8 1.5v2M8 12.5v2M1.5 8h2M12.5 8h2M3.4 3.4l1.4 1.4M11.2 11.2l1.4 1.4M3.4 12.6l1.4-1.4M11.2 4.8l1.4-1.4"/>',
  refresh: '<path d="M13 8a5 5 0 1 1-1.5-3.6M13 2.5v2.5h-2.5"/>',
  eye: '<path d="M1.5 8S4 3.5 8 3.5 14.5 8 14.5 8 12 12.5 8 12.5 1.5 8 1.5 8z"/><circle cx="8" cy="8" r="2"/>',
  copy: '<rect x="5" y="5" width="8.5" height="8.5" rx="1"/><path d="M3 10.5V3.5c0-.6.4-1 1-1h6.5"/>',
  grid: '<rect x="2.5" y="2.5" width="4.5" height="4.5"/><rect x="9" y="2.5" width="4.5" height="4.5"/><rect x="2.5" y="9" width="4.5" height="4.5"/><rect x="9" y="9" width="4.5" height="4.5"/>',
  rows: '<path d="M2.5 4h11M2.5 8h11M2.5 12h11"/>',
  download: '<path d="M8 2v8M5 7l3 3 3-3M3 13h10"/>',
  alignLeft: '<path d="M2.5 4h11M2.5 8h7M2.5 12h9"/>',
  alignCenter: '<path d="M2.5 4h11M4.5 8h7M3.5 12h9"/>',
  alignRight: '<path d="M2.5 4h11M6.5 8h7M4.5 12h9"/>',
  alignJustify: '<path d="M2.5 4h11M2.5 8h11M2.5 12h11"/>',
  home: '<path d="M2.5 7.5 8 3l5.5 4.5V13a.5.5 0 0 1-.5.5H9.5V10h-3v3.5H3a.5.5 0 0 1-.5-.5z"/>',
  tag: '<path d="M2.5 3v4.2l6.3 6.3 4.7-4.7-6.3-6.3H3a.5.5 0 0 0-.5.5z"/><circle cx="5.3" cy="5.3" r=".9"/>',
  link: '<path d="M6.5 9.5 9.5 6.5M7 4.5l1.3-1.3a2.5 2.5 0 0 1 3.5 3.5L10.5 8M9 11.5l-1.3 1.3a2.5 2.5 0 0 1-3.5-3.5L5.5 8"/>',
  more: '<circle cx="3.5" cy="8" r=".9"/><circle cx="8" cy="8" r=".9"/><circle cx="12.5" cy="8" r=".9"/>',
};

export function icon(name, cls = '') {
  const span = document.createElement('span');
  span.className = 'ico ' + cls;
  span.innerHTML = `<svg viewBox="0 0 16 16" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${PATHS[name] || ''}</svg>`;
  return span;
}

export function iconButton(name, title, onClick, cls = '') {
  return h('button', { class: 'icon-btn ' + cls, title, 'aria-label': title, onClick }, icon(name));
}

export function toggle(state, onChange, title = 'Ativar') {
  // state: 'on' | 'off' | 'mixed' | 'busy' | 'disabled'
  const b = h('button', {
    class: `switch is-${state}`, role: 'switch', 'aria-checked': state === 'on' ? 'true' : state === 'mixed' ? 'mixed' : 'false',
    title, 'aria-label': title, disabled: state === 'disabled' || state === 'busy',
    onClick: (e) => { e.stopPropagation(); onChange(); },
  }, h('span', { class: 'knob' }));
  return b;
}

let toastTimer;
export function toast(message, kind = 'info') {
  const root = document.getElementById('toast');
  root.textContent = message;
  root.className = `toast is-visible is-${kind}`;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { root.className = 'toast'; }, kind === 'error' ? 6000 : 2800);
}

// ---------- popover ancorado ----------
let openPop = null;
export function closePopover() {
  if (openPop) { openPop.remove(); openPop = null; document.removeEventListener('mousedown', outside, true); }
}
function outside(e) { if (openPop && !openPop.contains(e.target)) closePopover(); }

export function popover(anchor, content, { align = 'left', width } = {}) {
  closePopover();
  const pop = h('div', { class: 'popover', role: 'dialog' }, content);
  if (width) pop.style.width = width + 'px';
  document.body.append(pop);
  const r = anchor.getBoundingClientRect();
  const pw = pop.offsetWidth, ph = pop.offsetHeight;
  let left = align === 'right' ? r.right - pw : r.left;
  left = Math.max(8, Math.min(left, window.innerWidth - pw - 8));
  let top = r.bottom + 6;
  if (top + ph > window.innerHeight - 8) top = Math.max(8, r.top - ph - 6);
  pop.style.left = left + 'px';
  pop.style.top = top + 'px';
  openPop = pop;
  setTimeout(() => document.addEventListener('mousedown', outside, true), 0);
  const focusable = pop.querySelector('input, button');
  if (focusable) focusable.focus();
  return pop;
}

export function menu(anchorOrEvent, items) {
  const list = h('div', { class: 'menu', role: 'menu' }, items.filter(Boolean).map((it) => it === '-'
    ? h('div', { class: 'menu-sep' })
    : h('button', { class: 'menu-item' + (it.danger ? ' is-danger' : ''), role: 'menuitem', disabled: it.disabled, onClick: () => { closePopover(); it.action(); } },
      it.color ? h('span', { class: 'dot', style: { background: it.color } }) : null,
      h('span', {}, it.label), it.checked ? icon('check', 'menu-check') : null)));
  let anchor = anchorOrEvent;
  if (anchorOrEvent instanceof MouseEvent) {
    anchorOrEvent.preventDefault();
    anchor = { getBoundingClientRect: () => ({ left: anchorOrEvent.clientX, right: anchorOrEvent.clientX, top: anchorOrEvent.clientY, bottom: anchorOrEvent.clientY }) };
  }
  return popover(anchor, list, { width: 220 });
}

// ---------- modal ----------
export function modal(title, body, actions = []) {
  const root = document.getElementById('modal-root');
  const close = () => { root.innerHTML = ''; root.classList.remove('is-open'); };
  const box = h('div', { class: 'modal', role: 'dialog', 'aria-modal': 'true', 'aria-label': title },
    h('div', { class: 'modal-head' }, h('h2', {}, title), iconButton('x', 'Fechar', close)),
    h('div', { class: 'modal-body' }, body),
    actions.length ? h('div', { class: 'modal-foot' }, actions.map((a) => h('button', { class: 'btn ' + (a.primary ? 'btn-primary' : ''), onClick: () => { if (a.action() !== false) close(); } }, a.label))) : null);
  root.innerHTML = '';
  root.append(h('div', { class: 'modal-backdrop', onClick: close }), box);
  root.classList.add('is-open');
  const f = box.querySelector('input, select, button.btn-primary');
  if (f) f.focus();
  return close;
}

export function prompt(title, value, onSubmit, label = 'Salvar') {
  const input = h('input', { class: 'field', value: value || '', onKeydown: (e) => { if (e.key === 'Enter') { submit(); close(); } } });
  const submit = () => { const v = input.value.trim(); if (v) onSubmit(v); };
  const close = modal(title, input, [{ label: 'Cancelar', action: () => {} }, { label, primary: true, action: submit }]);
  setTimeout(() => input.select(), 0);
}

export function confirmBox(title, text, label, onYes) {
  modal(title, h('p', { class: 'muted' }, text), [{ label: 'Cancelar', action: () => {} }, { label, primary: true, action: onYes }]);
}

export const fmt = {
  int: (n) => new Intl.NumberFormat('pt-BR').format(n),
  bytes: (n) => n > 1048576 ? (n / 1048576).toFixed(1).replace('.', ',') + ' MB' : Math.max(1, Math.round(n / 1024)) + ' KB',
  plural: (n, one, many) => `${new Intl.NumberFormat('pt-BR').format(n)} ${n === 1 ? one : many}`,
};

export function debounce(fn, ms) {
  let t;
  return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); };
}
