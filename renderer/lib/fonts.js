// Carrega fontes no renderer sob demanda (arquivos locais via IPC e Google Fonts via CSS).

const local = new Map();   // faceId -> Promise<boolean>
const gcss = new Set();

export const cssFamily = (id) => `tp-${id}`;

export function ensureFace(face) {
  if (!face) return Promise.resolve(false);
  if (local.has(face.id)) return local.get(face.id);
  const p = window.gesfont.fontData(face.id)
    .then((buf) => new FontFace(cssFamily(face.id), buf).load())
    .then((ff) => { document.fonts.add(ff); return true; })
    .catch(() => false);
  local.set(face.id, p);
  return p;
}

// Aplica a fonte num elemento, mostrando um estado discreto enquanto carrega.
export function applyFace(el, face) {
  el.style.fontFamily = `"${cssFamily(face.id)}", "Adobe NotDef", system-ui`;
  el.classList.add('is-loading');
  ensureFace(face).then((ok) => {
    el.classList.remove('is-loading');
    if (!ok) el.classList.add('is-broken');
  });
}

export function googleCssUrl(family, styles) {
  const name = family.replace(/ /g, '+');
  if (!styles || !styles.length) return `https://fonts.googleapis.com/css2?family=${name}&display=swap`;
  const hasItalic = styles.some((s) => s.italic);
  const sorted = styles.slice().sort((a, b) => (a.italic - b.italic) || (a.weight - b.weight));
  const spec = hasItalic ? 'ital,wght@' + sorted.map((s) => `${s.italic ? 1 : 0},${s.weight}`).join(';') : 'wght@' + sorted.map((s) => s.weight).join(';');
  return `https://fonts.googleapis.com/css2?family=${name}:${spec}&display=block`;
}

export function ensureGoogle(family, styles) {
  const url = googleCssUrl(family, styles);
  if (gcss.has(url)) return;
  gcss.add(url);
  document.head.append(Object.assign(document.createElement('link'), { rel: 'stylesheet', href: url }));
}

export function applyGoogle(el, gf, style) {
  const st = style || defaultStyle(gf.styles);
  ensureGoogle(gf.family, [st]);
  el.style.fontFamily = `"${gf.family}", system-ui`;
  el.style.fontWeight = st.weight;
  el.style.fontStyle = st.italic ? 'italic' : 'normal';
}

export function defaultStyle(styles) {
  const up = styles.filter((s) => !s.italic);
  const pool = up.length ? up : styles;
  return pool.reduce((best, s) => (Math.abs(s.weight - 400) < Math.abs(best.weight - 400) ? s : best), pool[0]);
}

const WEIGHT_NAMES = { 100: 'Thin', 200: 'ExtraLight', 300: 'Light', 400: 'Regular', 500: 'Medium', 600: 'SemiBold', 700: 'Bold', 800: 'ExtraBold', 900: 'Black' };
export function styleName(s) {
  const base = WEIGHT_NAMES[s.weight] || String(s.weight);
  if (s.italic) return s.weight === 400 ? 'Italic' : `${base} Italic`;
  return base;
}
