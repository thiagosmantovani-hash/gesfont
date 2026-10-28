// Varredura de pastas e leitura de metadados com fontkit.
const fs = require('fs');
const fsp = fs.promises;
const path = require('path');
const crypto = require('crypto');
const fontkit = require('fontkit');

const FONT_EXT = new Set(['.ttf', '.otf', '.ttc', '.otc', '.woff', '.woff2', '.dfont']);
const ACTIVATABLE = new Set(['.ttf', '.otf', '.ttc', '.otc', '.dfont']);

function isFontFile(file) {
  return FONT_EXT.has(path.extname(file).toLowerCase());
}

function faceId(file, index) {
  return crypto.createHash('sha1').update(file + '#' + index).digest('hex').slice(0, 16);
}

async function walk(dir, out = [], depth = 0) {
  if (depth > 12) return out;
  let entries;
  try { entries = await fsp.readdir(dir, { withFileTypes: true }); } catch { return out; }
  for (const e of entries) {
    if (e.name.startsWith('.')) continue;
    const full = path.join(dir, e.name);
    if (e.isDirectory()) await walk(full, out, depth + 1);
    else if (e.isFile() && isFontFile(e.name)) out.push(full);
  }
  return out;
}

function safe(fn, fallback = null) {
  try { const v = fn(); return v === undefined ? fallback : v; } catch { return fallback; }
}

function cleanName(s) {
  if (!s) return null;
  return String(s).replace(/\u0000/g, '').trim() || null;
}

const WEIGHT_WORDS = [
  [100, /thin|hairline/i], [200, /extra ?light|ultra ?light/i], [300, /light/i],
  [500, /medium/i], [600, /semi ?bold|demi ?bold/i], [800, /extra ?bold|ultra ?bold/i],
  [900, /black|heavy/i], [700, /bold/i],
];

function guessWeight(style) {
  for (const [w, re] of WEIGHT_WORDS) if (re.test(style)) return w;
  return 400;
}

function describe(face, file, index, stat, source) {
  const os2 = safe(() => face['OS/2'], null);
  const family = cleanName(safe(() => face.getName('preferredFamily'))) || cleanName(safe(() => face.familyName)) || path.basename(file, path.extname(file));
  const style = cleanName(safe(() => face.getName('preferredSubfamily'))) || cleanName(safe(() => face.subfamilyName)) || 'Regular';
  let weight = safe(() => os2.usWeightClass, 0);
  if (!weight || weight < 1 || weight > 1000) weight = guessWeight(style);
  const italic = !!(safe(() => os2.fsSelection.italic, false) || safe(() => face.head.macStyle.italic, false) || /italic|oblique/i.test(style));
  const axesObj = safe(() => face.variationAxes, {}) || {};
  const axes = Object.entries(axesObj).map(([tag, a]) => ({ tag, name: a.name || tag, min: a.min, default: a.default, max: a.max }));
  const instances = Object.keys(safe(() => face.namedVariations, {}) || {});
  const widthClass = safe(() => os2.usWidthClass, 5) || 5;
  const panoseSerif = safe(() => os2.panose[1], 0);

  return {
    id: faceId(file, index),
    path: file,
    index,
    source,                     // local | google | system | imported
    family,
    style,
    fullName: cleanName(safe(() => face.fullName)) || `${family} ${style}`,
    postscriptName: cleanName(safe(() => face.postscriptName)),
    weight,
    width: widthClass,
    italic,
    monospace: !!safe(() => face.post.isFixedPitch, 0),
    panoseSerif,
    variable: axes.length > 0,
    axes,
    instances,
    glyphCount: safe(() => face.numGlyphs, 0),
    designer: cleanName(safe(() => face.getName('designer'))),
    manufacturer: cleanName(safe(() => face.getName('manufacturer'))),
    version: cleanName(safe(() => face.getName('version'))),
    license: cleanName(safe(() => face.getName('license'))),
    licenseURL: cleanName(safe(() => face.getName('licenseURL'))),
    designerURL: cleanName(safe(() => face.getName('designerURL'))),
    copyright: cleanName(safe(() => face.getName('copyright'))),
    format: path.extname(file).slice(1).toLowerCase(),
    activatable: ACTIVATABLE.has(path.extname(file).toLowerCase()),
    fileSize: stat.size,
    mtime: stat.mtimeMs,
    addedAt: Date.now(),
  };
}

async function readFontFile(file, source) {
  const stat = await fsp.stat(file);
  const buf = await fsp.readFile(file);
  const font = fontkit.create(buf);
  const faces = font.fonts ? font.fonts : [font];
  return { stat, faces: faces.map((f, i) => describe(f, file, i, stat, source)) };
}

// Detalhes mais pesados, calculados sob demanda (glifos, recursos OpenType, métricas)
async function readDetails(face) {
  const buf = await fsp.readFile(face.path);
  let font = fontkit.create(buf);
  if (font.fonts) font = font.fonts[face.index] || font.fonts[0];
  const features = safe(() => font.availableFeatures, []) || [];
  const chars = safe(() => font.characterSet, []) || [];
  const codepoints = Array.from(new Set(chars)).filter((c) => c > 31 && !(c >= 0x7f && c < 0xa0)).sort((a, b) => a - b);
  return {
    features: Array.from(new Set(features)).sort(),
    codepoints: codepoints.slice(0, 70000),
    unitsPerEm: safe(() => font.unitsPerEm, 1000),
    ascent: safe(() => font.ascent, 0),
    descent: safe(() => font.descent, 0),
    capHeight: safe(() => font.capHeight, 0),
    xHeight: safe(() => font.xHeight, 0),
    italicAngle: safe(() => font.italicAngle, 0),
    description: cleanName(safe(() => font.getName('description'))),
    trademark: cleanName(safe(() => font.getName('trademark'))),
    sampleText: cleanName(safe(() => font.getName('sampleText'))),
  };
}

async function glyphName(face, codepoint) {
  const buf = await fsp.readFile(face.path);
  let font = fontkit.create(buf);
  if (font.fonts) font = font.fonts[face.index] || font.fonts[0];
  const g = safe(() => font.glyphForCodePoint(codepoint));
  return { name: safe(() => g.name, null), advance: safe(() => g.advanceWidth, null), id: safe(() => g.id, null) };
}

// Varre uma lista de arquivos, reaproveitando o índice quando mtime e tamanho não mudaram.
async function scanFiles(store, files, source, onProgress) {
  const d = store.data;
  let done = 0;
  const queue = files.slice();
  const errors = [];
  async function worker() {
    while (queue.length) {
      const file = queue.shift();
      try {
        const st = await fsp.stat(file);
        const known = d.fileIndex[file];
        const src = typeof source === 'function' ? source(file) : source;
        if (!(known && known.mtime === st.mtimeMs && known.size === st.size && known.source === src && known.ids.every((id) => d.faces[id] && d.faces[id].mtime))) {
          if (known) known.ids.forEach((id) => delete d.faces[id]);
          const { faces } = await readFontFile(file, src);
          for (const f of faces) d.faces[f.id] = f;
          d.fileIndex[file] = { mtime: st.mtimeMs, size: st.size, ids: faces.map((f) => f.id), source: src };
        }
      } catch (e) {
        errors.push({ file, message: e.message });
      }
      done++;
      if (onProgress && (done % 25 === 0 || done === files.length)) onProgress(done, files.length);
    }
  }
  await Promise.all(Array.from({ length: 6 }, worker));
  return errors;
}

function removeFiles(store, predicate) {
  const d = store.data;
  for (const [file, info] of Object.entries(d.fileIndex)) {
    if (predicate(file, info)) {
      info.ids.forEach((id) => delete d.faces[id]);
      delete d.fileIndex[file];
    }
  }
}

module.exports = { walk, scanFiles, readDetails, glyphName, removeFiles, isFontFile, ACTIVATABLE };
