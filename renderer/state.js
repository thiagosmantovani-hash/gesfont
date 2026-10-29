// Estado do renderer e ações compartilhadas entre as telas.
import { toast } from './lib/ui.js';

const api = window.gesfont;

// Tons para marcar coleções, dentro da paleta do app.
export const COLORS = ['#000000', '#3d3d3b', '#6b6b68', '#9a9a96', '#c9c8c3', '#ffffff'];
export const COLOR_NAMES = ['Preto', 'Grafite', 'Cinza escuro', 'Cinza', 'Cinza claro', 'Branco'];

export const PANGRAM = 'Zebras caolhas de Java querem passar fax para moça gigante de New York';
export const PARAGRAPH = 'Uma boa tipografia não chama atenção para si. Ela conduz a leitura, dá ritmo ao texto e faz a marca soar do jeito certo antes mesmo de alguém ler a primeira palavra.';
export const DEFAULT_SAMPLES = [
  PANGRAM,
  'Ação, coração, pão, avô, órgão, júri, pêssego, à vontade',
  'ABCDEFGHIJKLMNOPQRSTUVWXYZ abcdefghijklmnopqrstuvwxyz',
  '0123456789   R$ 1.250,90   45%   12/10/2026',
  PARAGRAPH,
];

export function samples() {
  const list = Array.isArray(S.settings.samples) ? S.settings.samples.filter((t) => t.trim()) : null;
  return list && list.length ? list : DEFAULT_SAMPLES;
}

// Textos prontos para o menu das prévias: o nome da fonte e os textos de exemplo dos ajustes.
export function presets() {
  return [{ label: 'Nome da fonte', text: '' }, ...samples().map((t) => ({ label: t.length > 42 ? t.slice(0, 40) + '…' : t, text: t }))];
}

export const S = {
  ready: false,
  faces: [],
  byId: new Map(),
  activated: new Set(),
  folders: [],
  collections: [],
  favorites: new Set(),
  pairs: [],
  settings: {},
  platform: 'darwin',
  targetDir: '',
  googleDir: '',
  rootDir: '',
  tree: [],
  sep: '/',
  appVersion: '',
  update: null,
  overrides: {},
  tags: {},
  systemKept: {},
  systemLocations: [],
  gridText: loadLocal('gridText', 'a'),
  google: { list: null, loading: false, error: null, byKey: new Map() },
  route: { view: 'library', param: null },
  history: [],
  search: '',
  previewText: '',
  size: 48,
  sort: 'name',
  filter: 'all',
  compare: loadLocal('compare', []),
  busy: new Set(),         // chaves de famílias em operação
  scan: null,
  version: 0,
};

function loadLocal(key, fallback) {
  try { const v = JSON.parse(localStorage.getItem('gf.' + key)); return v ?? fallback; } catch { return fallback; }
}
export function saveLocal(key, value) {
  try { localStorage.setItem('gf.' + key, JSON.stringify(value)); } catch {}
}

// ---------- eventos ----------
const listeners = new Set();
export function subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); }
export function emit(reason) { S.version++; famCache.clear(); for (const fn of listeners) fn(reason); }

// ---------- dados ----------
export async function reload() {
  const st = await api.getState();
  S.faces = st.faces;
  S.byId = new Map(st.faces.map((f) => [f.id, f]));
  S.activated = new Set(st.activated);
  S.folders = st.folders;
  S.collections = st.collections;
  S.favorites = new Set(st.favorites);
  S.pairs = st.pairs;
  S.settings = st.settings;
  S.platform = st.platform;
  S.targetDir = st.targetDir;
  S.googleDir = st.googleDir;
  S.rootDir = st.rootDir;
  S.tree = st.tree || [];
  S.sep = st.sep || '/';
  S.appVersion = st.version;
  if (!S.update || !S.ready) S.update = st.update;
  S.overrides = st.overrides || {};
  S.tags = st.tags || {};
  S.systemKept = st.systemKept || {};
  S.systemLocations = st.systemLocations || [];
  if (!S.ready) {
    S.previewText = samples()[0] || '';
    S.size = st.settings.previewSize || 48;
  }
  S.ready = true;
  emit('data');
}

export const famKey = (name) => String(name).trim().toLowerCase();

const famCache = new Map();

export const familyName = (f) => S.overrides[f.id] || f.family;

function finishFamily(fam) {
  {  // métricas da família
    fam.faces.sort((a, b) => ((a.width !== 5) - (b.width !== 5)) || (a.width - b.width) || (a.weight - b.weight) || (a.italic - b.italic) || a.style.localeCompare(b.style));
    const upright = fam.faces.filter((f) => !f.italic && f.width === 5);
    const pool = upright.length ? upright : fam.faces;
    fam.primary = pool.reduce((best, f) => (Math.abs(f.weight - 400) < Math.abs(best.weight - 400) ? f : best), pool[0]);
    const des = fam.faces.map((f) => f.designer || f.manufacturer).find(Boolean) || null;
    fam.designer = des ? des.split(/;|\n/)[0].replace(/\s*\(.*?\)\s*/g, ' ').trim().slice(0, 80) : null;
    fam.variable = fam.faces.some((f) => f.variable);
    fam.addedAt = Math.max(...fam.faces.map((f) => f.addedAt || 0));
    fam.sources = new Set(fam.faces.map((f) => f.source));
    const seen = new Map();
    for (const f of fam.faces) if (f.postscriptName) seen.set(f.postscriptName, (seen.get(f.postscriptName) || 0) + 1);
    fam.duplicates = [...seen.values()].some((n) => n > 1);
    fam.formats = [...new Set(fam.faces.map((f) => (f.format === 'otc' ? 'otf' : f.format === 'ttc' ? 'ttf' : f.format).toUpperCase()))].sort().join('/');
    fam.renamed = fam.faces.some((f) => S.overrides[f.id]);
  }
  return fam;
}

function buildFamilies(faces, kind) {
  const map = new Map();
  for (const f of faces) {
    const name = familyName(f);
    const key = famKey(name);
    let fam = map.get(key);
    if (!fam) { fam = { key, name, kind, faces: [] }; map.set(key, fam); }
    fam.faces.push(f);
  }
  return [...map.values()].map(finishFamily);
}

// Um item por estilo, quando o agrupamento por família está desligado.
function buildSingles(faces, kind) {
  return faces.map((f) => finishFamily({ key: famKey(familyName(f)), name: `${familyName(f)} ${f.style}`, kind, faces: [f], single: true }));
}

function scopeFaces(scope) {
  if (scope === 'system') return S.faces.filter((f) => f.source === 'system');
  if (scope === 'native') return S.faces.filter((f) => f.source === 'system' && f.sysKind === 'native');
  if (scope === 'installed') return S.faces.filter((f) => f.source === 'system' && f.sysKind !== 'native');
  if (scope.startsWith('folder:')) { const dir = scope.slice(7); return S.faces.filter((f) => f.source !== 'system' && f.path.startsWith(dir + S.sep)); }
  return S.faces.filter((f) => f.source !== 'system');
}

export function families(scope = 'library', { split = false } = {}) {
  const ck = scope + (split ? ':split' : '');
  if (famCache.has(ck)) return famCache.get(ck);
  const kind = ['system', 'native', 'installed'].includes(scope) ? 'system' : 'local';
  const list = split ? buildSingles(scopeFaces(scope), kind) : buildFamilies(scopeFaces(scope), kind);
  famCache.set(ck, list);
  return list;
}

// Itens das listas, respeitando o ajuste de agrupar em famílias.
export function listFamilies(scope) {
  return families(scope, { split: S.settings.groupFamilies === false });
}

export function libraryMap() {
  const ck = 'map:library';
  if (famCache.has(ck)) return famCache.get(ck);
  const m = new Map(families('library').map((f) => [f.key, f]));
  famCache.set(ck, m);
  return m;
}
export function systemMap() {
  const ck = 'map:system';
  if (famCache.has(ck)) return famCache.get(ck);
  const m = new Map(families('system').map((f) => [f.key, f]));
  famCache.set(ck, m);
  return m;
}

export function googleFamily(gf) {
  return { key: famKey(gf.family), name: gf.family, kind: 'google', gf, faces: [], designer: gf.designers.join(', ') || null, variable: gf.axes.length > 0 };
}

// Encontra uma família pela chave, na ordem biblioteca, sistema, Google Fonts.
export function resolveFamily(key) {
  return libraryMap().get(key) || systemMap().get(key) || (S.google.byKey.get(key) ? googleFamily(S.google.byKey.get(key)) : null);
}

export function activatableFaces(fam) {
  return (fam.faces || []).filter((f) => f.source !== 'system' && f.activatable);
}

export function activeState(fam) {
  if (S.busy.has(fam.key)) return 'busy';
  if (fam.kind === 'system') return 'disabled';
  if (fam.kind === 'google') {
    const lib = libraryMap().get(fam.key);
    return lib ? activeState(lib) : 'off';
  }
  const faces = activatableFaces(fam);
  if (!faces.length) return 'disabled';
  const n = faces.filter((f) => S.activated.has(f.path)).length;
  return n === 0 ? 'off' : n === faces.length ? 'on' : 'mixed';
}

export function isFaceActive(face) { return S.activated.has(face.path); }

// ---------- ações ----------
function report(results, on) {
  const ok = results.filter((r) => r.ok && !r.already).length;
  const fail = results.filter((r) => !r.ok);
  if (fail.length) toast(fail[0].message || 'Não foi possível concluir a ativação.', 'error');
  else if (ok) toast(on ? `${ok === 1 ? '1 arquivo ativado' : ok + ' arquivos ativados'}` : `${ok === 1 ? '1 arquivo desativado' : ok + ' arquivos desativados'}`);
}

export async function setFacesActive(faces, on) {
  const results = await api.setActive(faces.map((f) => f.id), on);
  report(results, on);
  await reload();
}

export async function toggleFamily(fam) {
  if (fam.kind === 'google') {
    const lib = libraryMap().get(fam.key);
    if (lib) return toggleFamily(lib);
    return installGoogle(fam.gf, true);
  }
  const faces = activatableFaces(fam);
  if (!faces.length) {
    toast('Formatos web (WOFF e WOFF2) servem só para visualização e não podem ser ativados no sistema.', 'error');
    return;
  }
  const st = activeState(fam);
  S.busy.add(fam.key); emit('busy');
  try { await setFacesActive(faces, st !== 'on'); } finally { S.busy.delete(fam.key); emit('busy'); }
}

export async function installGoogle(gf, activate) {
  const key = famKey(gf.family);
  S.busy.add(key); emit('busy');
  try {
    await api.googleInstall(gf.family, gf.styles, activate);
    toast(activate ? `${gf.family} baixada e ativada` : `${gf.family} adicionada à biblioteca`);
    await reload();
  } catch (e) {
    toast(`Não foi possível baixar ${gf.family}. Verifique a conexão e tente de novo.`, 'error');
  } finally { S.busy.delete(key); emit('busy'); }
}

export async function setFamiliesActive(fams, on) {
  const local = [];
  for (const fam of fams) {
    if (fam.kind === 'google') {
      const lib = libraryMap().get(fam.key);
      if (lib) local.push(...activatableFaces(lib));
      else if (on) await installGoogle(fam.gf, true);
    } else local.push(...activatableFaces(fam));
  }
  if (local.length) await setFacesActive(local, on);
}

export async function loadGoogle(force = false) {
  if (S.google.loading || (S.google.list && !force)) return;
  S.google.loading = true; S.google.error = null; emit('google');
  try {
    const list = await api.googleCatalog(force);
    S.google.list = list;
    S.google.byKey = new Map(list.map((g) => [famKey(g.family), g]));
  } catch (e) {
    S.google.error = 'Não foi possível carregar o catálogo do Google Fonts. Verifique a conexão.';
  } finally { S.google.loading = false; emit('google'); }
}

export function toggleFavorite(key) {
  if (S.favorites.has(key)) S.favorites.delete(key); else S.favorites.add(key);
  api.save('favorites', [...S.favorites]);
  emit('favorites');
}

export function saveCollections() { api.save('collections', S.collections); emit('collections'); }

export function createCollection(name, keys = []) {
  const col = { id: 'c' + Date.now().toString(36), name, color: COLORS[S.collections.length % COLORS.length], families: [...new Set(keys)], createdAt: Date.now() };
  S.collections.push(col);
  saveCollections();
  return col;
}

export function addToCollection(colId, keys) {
  const col = S.collections.find((c) => c.id === colId);
  if (!col) return;
  const before = col.families.length;
  col.families = [...new Set([...col.families, ...keys])];
  saveCollections();
  const added = col.families.length - before;
  toast(added ? `Adicionada a ${col.name}` : `Já estava em ${col.name}`);
}

export function removeFromCollection(colId, key) {
  const col = S.collections.find((c) => c.id === colId);
  if (!col) return;
  col.families = col.families.filter((k) => k !== key);
  saveCollections();
}

export function deleteCollection(colId) {
  S.collections = S.collections.filter((c) => c.id !== colId);
  saveCollections();
}

export function saveSettings(patch) {
  S.settings = { ...S.settings, ...patch };
  api.save('settings', S.settings);
  applyTheme();
}

export function applyTheme() {
  const t = S.settings.theme || 'system';
  document.documentElement.dataset.theme = t;
}

export const persistPreview = (() => {
  let t;
  return () => { clearTimeout(t); t = setTimeout(() => saveSettings({ previewSize: S.size }), 600); };
})();

// ---------- comparação ----------
// itens: { key, faceId? , gstyle? }
export function inCompare(key) { return S.compare.some((c) => c.key === key); }
export function toggleCompare(fam, faceId) {
  if (inCompare(fam.key)) S.compare = S.compare.filter((c) => c.key !== fam.key);
  else {
    if (S.compare.length >= 8) { toast('A comparação aceita até 8 fontes. Remova uma para adicionar outra.', 'error'); return; }
    S.compare.push({ key: fam.key, faceId: faceId || (fam.primary && fam.primary.id) || null });
    toast(`${fam.name} na comparação`);
  }
  saveLocal('compare', S.compare);
  emit('compare');
}

// ---------- navegação ----------
export function navigate(view, param = null, { push = true } = {}) {
  if (push && !(S.route.view === view && S.route.param === param)) S.history.push(S.route);
  if (S.history.length > 40) S.history.shift();
  S.route = { view, param };
  emit('route');
}
export function back() {
  const prev = S.history.pop();
  S.route = prev || { view: 'library', param: null };
  emit('route');
}

// ---------- classificação ----------
export function classify(fam) {
  const g = S.google.byKey.get(fam.key);
  if (g) return g.category;
  const p = fam.primary;
  if (!p) return 'other';
  if (p.monospace) return 'mono';
  if (p.panoseSerif >= 2 && p.panoseSerif <= 10) return 'serif';
  if (p.panoseSerif >= 11 && p.panoseSerif <= 13) return 'sans';
  if (/serif/i.test(fam.name) && !/sans/i.test(fam.name)) return 'serif';
  if (/sans|grotesk|grotesque|gothic/i.test(fam.name)) return 'sans';
  if (/mono|code/i.test(fam.name)) return 'mono';
  if (/script|hand/i.test(fam.name)) return 'handwriting';
  return 'other';
}

export const CATEGORY_LABEL = { sans: 'Sem serifa', serif: 'Serifada', display: 'Display', handwriting: 'Manuscrita', mono: 'Monoespaçada', other: 'Sem classificação' };

// ---------- nomes de família (renomear e mesclar) ----------
function migrateKey(from, to) {
  if (from === to) return;
  for (const c of S.collections) {
    if (c.families.includes(from)) c.families = [...new Set(c.families.map((k) => (k === from ? to : k)))];
  }
  if (S.favorites.has(from)) { S.favorites.delete(from); S.favorites.add(to); }
  if (S.tags[from]) { S.tags[to] = [...new Set([...(S.tags[to] || []), ...S.tags[from]])]; delete S.tags[from]; }
  S.compare = S.compare.filter((c) => c.key !== from || !S.compare.some((x) => x.key === to)).map((c) => (c.key === from ? { ...c, key: to } : c));
  saveLocal('compare', S.compare);
  api.save('collections', S.collections);
  api.save('favorites', [...S.favorites]);
  api.save('tags', S.tags);
}

// Dá um novo nome de família a todos os estilos de uma família (renomear ou mesclar em outra).
export function setFamilyName(fam, newName) {
  newName = newName.trim();
  if (!newName) return;
  const faces = (fam.kind === 'google' ? (libraryMap().get(fam.key) || { faces: [] }) : fam).faces;
  for (const f of faces) {
    if (f.family === newName) delete S.overrides[f.id];
    else S.overrides[f.id] = newName;
  }
  api.save('overrides', S.overrides);
  migrateKey(fam.key, famKey(newName));
  emit('data');
}

export function restoreFamilyName(fam) {
  const originals = new Set();
  for (const f of fam.faces) { originals.add(f.family); delete S.overrides[f.id]; }
  api.save('overrides', S.overrides);
  if (originals.size === 1) migrateKey(fam.key, famKey([...originals][0]));
  emit('data');
}

export function resetOverrides() {
  S.overrides = {};
  api.save('overrides', S.overrides);
  emit('data');
}

// ---------- duplicadas ----------
export function duplicateGroups() {
  const map = new Map();
  for (const f of S.faces) {
    if (f.source === 'system') continue;
    const id = (f.postscriptName || f.fullName || '').toLowerCase();
    if (!id) continue;
    if (!map.has(id)) map.set(id, []);
    map.get(id).push(f);
  }
  const groups = [];
  for (const [id, faces] of map) {
    const paths = new Set(faces.map((f) => f.path));
    if (paths.size < 2) continue;
    groups.push({ id, name: faces[0].fullName || faces[0].postscriptName, family: familyName(faces[0]), faces });
  }
  return groups.sort((a, b) => a.family.localeCompare(b.family, 'pt-BR') || a.name.localeCompare(b.name, 'pt-BR'));
}

const versionNum = (v) => {
  const m = String(v || '').match(/(\d+(?:\.\d+)*)/);
  return m ? m[1].split('.').map(Number) : [0];
};
function cmpVersion(a, b) {
  const x = versionNum(a), y = versionNum(b);
  for (let i = 0; i < Math.max(x.length, y.length); i++) { const d = (x[i] || 0) - (y[i] || 0); if (d) return d; }
  return 0;
}
const FORMAT_RANK = { otf: 4, ttf: 3, otc: 2, ttc: 2, woff2: 1, woff: 0, dfont: 1 };
// Com versão e formato iguais, fica o arquivo original: primeiro o das suas pastas, depois o da pasta GESFONT.
const SOURCE_RANK = { local: 3, imported: 2, google: 1 };

// Arquivo recomendado para manter: versão mais nova, formato instalável, original antes de cópia, o mais antigo.
export function recommended(faces) {
  return faces.slice().sort((a, b) => cmpVersion(b.version, a.version)
    || ((FORMAT_RANK[b.format] || 0) - (FORMAT_RANK[a.format] || 0))
    || ((SOURCE_RANK[b.source] || 0) - (SOURCE_RANK[a.source] || 0))
    || ((a.mtime || 0) - (b.mtime || 0)))[0];
}

// Famílias com nomes quase iguais (espaços, hífens, maiúsculas) que podem ser mescladas.
export function similarFamilies() {
  const norm = (s) => s.toLowerCase().replace(/[\s\-_.]+/g, '');
  const map = new Map();
  for (const fam of families('library')) {
    const k = norm(fam.name);
    if (!map.has(k)) map.set(k, []);
    map.get(k).push(fam);
  }
  return [...map.values()].filter((l) => l.length > 1).map((l) => l.sort((a, b) => b.faces.length - a.faces.length));
}

export async function trashPaths(paths) {
  const r = await api.trash(paths);
  if (r.failed.length) toast(r.failed[0].message || 'Não foi possível mover para a Lixeira.', 'error');
  else toast(r.done.length === 1 ? '1 arquivo movido para a Lixeira' : `${r.done.length} arquivos movidos para a Lixeira`);
  await reload();
  return r;
}

// ---------- verificação do sistema ----------
// Famílias instaladas no sistema por fora do GESFONT, com o estado da decisão de cada uma.
export function installedFamilies() {
  return families('installed').map((fam) => {
    const files = [...new Set(fam.faces.map((f) => f.path))];
    return { ...fam, files, kept: files.every((p) => S.systemKept[p]), admin: fam.faces.some((f) => f.sysAdmin), apple: fam.faces.some((f) => f.sysVendor === 'apple'), where: [...new Set(fam.faces.map((f) => f.sysLabel).filter(Boolean))].join(', ') };
  });
}
export function pendingReviewCount() { return installedFamilies().filter((f) => !f.kept).length; }

// ---------- tags ----------
export function userTags(key) { return S.tags[key] || []; }

export function autoTags(fam) {
  if (S.settings.hideAutoTags) return [];
  const out = [];
  const g = S.google.byKey.get(fam.key);
  if (g && !S.settings.hideGoogleTags) out.push(CATEGORY_LABEL[g.category]);
  else if (fam.kind !== 'google') { const c = classify(fam); if (c !== 'other') out.push(CATEGORY_LABEL[c]); }
  if (fam.variable) out.push('Variável');
  return [...new Set(out)];
}

export function allTags() {
  const count = new Map();
  for (const list of Object.values(S.tags)) for (const t of list) count.set(t, (count.get(t) || 0) + 1);
  return [...count.entries()].sort((a, b) => a[0].localeCompare(b[0], 'pt-BR'));
}

export function setTags(key, list) {
  const clean = [...new Set(list.map((t) => t.trim()).filter(Boolean))];
  if (clean.length) S.tags[key] = clean; else delete S.tags[key];
  api.save('tags', S.tags);
  emit('tags');
}

export function renameTag(from, to) {
  for (const k of Object.keys(S.tags)) S.tags[k] = [...new Set(S.tags[k].map((t) => (t === from ? to : t)))];
  api.save('tags', S.tags);
  emit('tags');
}

export function deleteTag(tag) {
  for (const k of Object.keys(S.tags)) { S.tags[k] = S.tags[k].filter((t) => t !== tag); if (!S.tags[k].length) delete S.tags[k]; }
  api.save('tags', S.tags);
  emit('tags');
}

export { api };
