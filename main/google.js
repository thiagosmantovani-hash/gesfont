// Catálogo e downloads do Google Fonts (não precisa de chave de API).
const fs = require('fs');
const fsp = fs.promises;
const path = require('path');
const { net } = require('electron');

const CATALOG_URL = 'https://fonts.google.com/metadata/fonts';
const FALLBACK_URL = 'https://api.fontsource.org/v1/fonts?type=google';
const CSS_URL = 'https://fonts.googleapis.com/css2';
const MAX_AGE = 7 * 24 * 3600 * 1000;

const CATEGORY = {
  'Sans Serif': 'sans', Serif: 'serif', Display: 'display', Handwriting: 'handwriting', Monospace: 'mono',
};

function normalize(raw) {
  const list = raw.familyMetadataList || raw.items || [];
  return list.map((f) => {
    const keys = f.fonts ? Object.keys(f.fonts) : (f.variants || []);
    const styles = keys.map((k) => {
      const italic = /i$|italic/.test(k);
      const w = parseInt(k, 10) || 400;
      return { weight: w, italic };
    }).sort((a, b) => (a.italic - b.italic) || (a.weight - b.weight));
    return {
      family: f.family,
      category: CATEGORY[f.category] || 'display',
      styles,
      axes: (f.axes || []).map((a) => ({ tag: a.tag, min: a.min, max: a.max, default: a.defaultValue })),
      designers: f.designers || [],
      popularity: f.popularity ?? 9999,
      subsets: (f.subsets || []).filter((s) => s !== 'menu'),
      dateAdded: f.dateAdded || '',
      lastModified: f.lastModified || '',
    };
  }).filter((f) => f.family && f.styles.length);
}

// Catálogo alternativo (Fontsource), usado se o endereço do Google mudar.
function fromFontsource(items) {
  const cat = { 'sans-serif': 'sans', serif: 'serif', display: 'display', handwriting: 'handwriting', monospace: 'mono' };
  return items.filter((f) => !f.type || f.type === 'google').map((f, i) => ({
    family: f.family,
    category: cat[f.category] || 'display',
    styles: (f.styles || ['normal']).flatMap((st) => (f.weights || [400]).map((w) => ({ weight: w, italic: st === 'italic' })))
      .sort((a, b) => (a.italic - b.italic) || (a.weight - b.weight)),
    axes: f.variable ? [{ tag: 'wght', min: Math.min(...(f.weights || [400])), max: Math.max(...(f.weights || [400])), default: 400 }] : [],
    designers: [],
    popularity: i + 1,
    subsets: f.subsets || [],
    dateAdded: f.lastModified || '',
    lastModified: f.lastModified || '',
  })).filter((f) => f.family);
}

async function fetchText(url, ua) {
  const res = await net.fetch(url, { headers: ua ? { 'User-Agent': ua } : {} });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.text();
}

async function getCatalog(dataDir, force = false) {
  const cache = path.join(dataDir, 'google-catalog.json');
  try {
    const st = await fsp.stat(cache);
    if (!force && Date.now() - st.mtimeMs < MAX_AGE) return JSON.parse(await fsp.readFile(cache, 'utf8'));
  } catch {}
  try {
    let list;
    try {
      const text = (await fetchText(CATALOG_URL)).replace(/^\)\]\}'\s*/, '');
      list = normalize(JSON.parse(text));
    } catch {
      list = fromFontsource(JSON.parse(await fetchText(FALLBACK_URL)));
    }
    if (!list.length) throw new Error('Catálogo vazio');
    await fsp.writeFile(cache, JSON.stringify(list));
    return list;
  } catch (e) {
    // sem internet: usa o cache antigo, se houver
    try { return JSON.parse(await fsp.readFile(cache, 'utf8')); } catch {}
    throw e;
  }
}

function cssQuery(family, styles) {
  const name = family.replace(/ /g, '+');
  const hasItalic = styles.some((s) => s.italic);
  const sorted = styles.slice().sort((a, b) => (a.italic - b.italic) || (a.weight - b.weight));
  const spec = hasItalic
    ? 'ital,wght@' + sorted.map((s) => `${s.italic ? 1 : 0},${s.weight}`).join(';')
    : 'wght@' + sorted.map((s) => s.weight).join(';');
  return `family=${name}:${spec}`;
}

// Baixa os arquivos TTF de uma família. Um User-Agent genérico faz o Google servir TTF.
async function downloadFamily(baseDir, family, styles) {
  const css = await fetchText(`${CSS_URL}?${cssQuery(family, styles)}`, 'GESFONT/2.0');
  const dir = path.join(baseDir, family.replace(/[^\w\- ]/g, ''));
  await fsp.mkdir(dir, { recursive: true });
  const blocks = css.split('@font-face').slice(1);
  const files = [];
  for (const b of blocks) {
    const url = (b.match(/url\((https:[^)]+)\)/) || [])[1];
    if (!url) continue;
    const weight = (b.match(/font-weight:\s*(\d+)/) || [])[1] || '400';
    const italic = /font-style:\s*italic/.test(b);
    const ext = path.extname(new URL(url).pathname) || '.ttf';
    const file = path.join(dir, `${family.replace(/[^\w]/g, '')}-${weight}${italic ? 'Italic' : ''}${ext}`);
    if (!fs.existsSync(file)) {
      const res = await net.fetch(url);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      await fsp.writeFile(file, Buffer.from(await res.arrayBuffer()));
    }
    files.push(file);
  }
  if (!files.length) throw new Error('O Google Fonts não retornou arquivos para esta família.');
  return Array.from(new Set(files));
}

module.exports = { getCatalog, downloadFamily, cssQuery };
