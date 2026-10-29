// GESFONT: página de download.
// Os links apontam para a última Release do GitHub. Se a API responder, cada botão
// passa a baixar o .dmg certo (chip Apple ou Intel) direto, sem passar pela página da Release.

const REPO = 'thiagosmantovani-hash/gesfont-releases';
const RELEASES = `https://github.com/${REPO}/releases`;
const LATEST = `${RELEASES}/latest`;
const API = `https://api.github.com/repos/${REPO}/releases/latest`;

const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];

// ---------- tema ----------
const root = document.documentElement;
function paintThemeColor() {
  const c = root.classList.contains('dark') ? '#0e0e0e' : '#efeee9';
  $$('meta[name="theme-color"]').forEach((m) => m.setAttribute('content', c));
}
$('#theme').addEventListener('click', () => {
  const dark = !root.classList.contains('dark');
  root.classList.toggle('dark', dark);
  try { localStorage.setItem('gesfont-theme', dark ? 'dark' : 'light'); } catch (e) {}
  paintThemeColor();
});
try {
  if (!localStorage.getItem('gesfont-theme')) {
    matchMedia('(prefers-color-scheme: dark)').addEventListener('change', (e) => { root.classList.toggle('dark', e.matches); paintThemeColor(); });
  }
} catch (e) {}
paintThemeColor();

// ---------- topo com borda ao rolar ----------
const topbar = $('.topbar');
const onScroll = () => topbar.classList.toggle('is-scrolled', scrollY > 8);
addEventListener('scroll', onScroll, { passive: true });
onScroll();

// ---------- palavra que troca de fonte ----------
const FONTS = [
  ['Fraunces', 800, 'normal'],
  ['Bodoni Moda', 700, 'normal'],
  ['Space Mono', 700, 'normal'],
  ['Instrument Serif', 400, 'italic'],
  ['Anton', 400, 'normal'],
  ['Bricolage Grotesque', 800, 'normal'],
  ['Young Serif', 400, 'normal'],
];
const cycle = $('#cycle');
if (cycle && !matchMedia('(prefers-reduced-motion: reduce)').matches) {
  let i = -1;
  const next = () => {
    cycle.classList.add('is-out');
    setTimeout(() => {
      i = (i + 1) % (FONTS.length + 1);
      if (i === FONTS.length) { cycle.style.cssText = ''; }
      else {
        const [family, weight, style] = FONTS[i];
        cycle.style.fontFamily = `"${family}", var(--ui)`;
        cycle.style.fontWeight = weight;
        cycle.style.fontStyle = style;
        cycle.style.letterSpacing = family === 'Space Mono' ? '-.06em' : '-.02em';
      }
      cycle.classList.remove('is-out');
    }, 250);
  };
  document.fonts.ready.then(() => setTimeout(() => setInterval(next, 1800), 1200));
}

// ---------- entrada suave das seções ----------
const revealEls = $$('.feature, .extras, .steps, .final-in');
if ('IntersectionObserver' in window) {
  revealEls.forEach((el) => el.classList.add('reveal'));
  const io = new IntersectionObserver((entries) => {
    for (const e of entries) if (e.isIntersecting) { e.target.classList.add('is-in'); io.unobserve(e.target); }
  }, { rootMargin: '0px 0px -10% 0px' });
  revealEls.forEach((el) => io.observe(el));
}

// ---------- qual Mac é este ----------
// Navegador nenhum diz o chip com certeza. O padrão é chip Apple; só troca para Intel
// quando a placa de vídeo informada é claramente Intel, AMD ou NVIDIA.
function detect() {
  const ua = navigator.userAgent;
  const isMac = /Macintosh|Mac OS X/.test(ua) && !/iPhone|iPad|iPod/.test(ua) && navigator.maxTouchPoints < 2;
  let intel = false;
  if (isMac) {
    try {
      const gl = document.createElement('canvas').getContext('webgl');
      const ext = gl && gl.getExtension('WEBGL_debug_renderer_info');
      const r = ext ? String(gl.getParameter(ext.UNMASKED_RENDERER_WEBGL)) : '';
      intel = /Intel|AMD|Radeon|NVIDIA|GeForce/i.test(r) && !/Apple M\d/i.test(r);
    } catch (e) {}
  }
  return { isMac, intel };
}
const env = detect();
if (!env.isMac) $('#notmac').hidden = false;
if (env.intel) {
  $$('[data-primary-label]').forEach((el) => { el.textContent = 'Mac com processador Intel'; });
  $$('[data-alt-q]').forEach((el) => { el.textContent = 'Seu Mac tem chip Apple?'; });
}

// ---------- última versão ----------
const fmtSize = (b) => `${Math.round(b / 1048576)} MB`;
const fmtDate = (iso) => new Date(iso).toLocaleDateString('pt-BR', { day: 'numeric', month: 'long' });

async function latest() {
  try {
    const cached = JSON.parse(sessionStorage.getItem('gesfont-latest') || 'null');
    if (cached && Date.now() - cached.at < 10 * 60 * 1000) return cached.data;
  } catch (e) {}
  const r = await fetch(API, { headers: { Accept: 'application/vnd.github+json' } });
  if (!r.ok) throw new Error('API ' + r.status);
  const j = await r.json();
  const data = {
    tag: j.tag_name,
    version: String(j.tag_name || '').replace(/^v/, ''),
    date: j.published_at,
    url: j.html_url,
    assets: (j.assets || []).map((a) => ({ name: a.name, size: a.size, url: a.browser_download_url })),
  };
  try { sessionStorage.setItem('gesfont-latest', JSON.stringify({ at: Date.now(), data })); } catch (e) {}
  return data;
}

latest().then((rel) => {
  const dmgs = rel.assets.filter((a) => /\.dmg$/i.test(a.name));
  const arm = dmgs.find((a) => /arm64/i.test(a.name));
  const x64 = dmgs.find((a) => !/arm64/i.test(a.name));
  const primary = env.intel ? (x64 || arm) : (arm || x64);
  const alt = env.intel ? arm : x64;

  if (primary) {
    $$('[data-dl="primary"]').forEach((a) => { a.href = primary.url; a.setAttribute('download', ''); });
    $$('[data-primary-size]').forEach((el) => { el.textContent = fmtSize(primary.size); });
  }
  if (alt) $$('[data-dl="alt"]').forEach((a) => { a.href = alt.url; a.setAttribute('download', ''); });

  if (rel.version) {
    $$('[data-version-label]').forEach((el) => { el.textContent = `Versão ${rel.version}, de ${fmtDate(rel.date)}`; });
    $$('[data-version-short]').forEach((el) => { el.textContent = `Versão ${rel.version}, grátis`; });
    $$('[data-releases-latest]').forEach((a) => { a.href = rel.url || LATEST; });
  }
}).catch(() => {
  // Sem API (limite de consultas ou sem rede): os botões continuam levando à página da última versão.
});
