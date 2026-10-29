// GESFONT: página de download.
// Os links apontam para a última Release do GitHub. Se a API responder, cada botão
// passa a baixar o .dmg certo (chip Apple ou Intel) direto, sem passar pela página da Release.

const REPO = 'thiagosmantovani-hash/gesfont-releases';
const RELEASES = `https://github.com/${REPO}/releases`;
const LATEST = `${RELEASES}/latest`;
const API = `https://api.github.com/repos/${REPO}/releases/latest`;

const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];

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
const revealEls = $$('.feature, .extras, .steps, .final-in, .combo-cards, .news');
if ('IntersectionObserver' in window) {
  revealEls.forEach((el) => el.classList.add('reveal'));
  const io = new IntersectionObserver((entries) => {
    for (const e of entries) if (e.isIntersecting) { e.target.classList.add('is-in'); io.unobserve(e.target); }
  }, { rootMargin: '0px 0px -10% 0px' });
  revealEls.forEach((el) => io.observe(el));
}

// ---------- Combinar: abas de formato ----------
// Troca a tela pelo formato escolhido. Gira sozinho enquanto a seção está visível,
// até a pessoa clicar numa aba.
(() => {
  const tabs = $$('.format');
  const img = $('#combinar-img');
  const caption = $('#combinar-caption');
  if (!tabs.length || !img) return;
  const names = { pagina: 'Página', horizontal: 'Horizontal', vertical: 'Vertical', retrato: 'Retrato', quadrado: 'Quadrado' };
  // pré-carrega as telas para a troca ser instantânea
  tabs.forEach((t) => { const i = new Image(); i.src = `img/combinar-${t.dataset.format}.webp`; });

  let current = 0;
  let auto = !matchMedia('(prefers-reduced-motion: reduce)').matches;
  let timer = null;
  let visible = false;

  function show(i, focus) {
    current = (i + tabs.length) % tabs.length;
    const t = tabs[current];
    tabs.forEach((x) => { const on = x === t; x.classList.toggle('is-on', on); x.setAttribute('aria-selected', on ? 'true' : 'false'); x.tabIndex = on ? 0 : -1; });
    if (focus) t.focus();
    const src = `img/combinar-${t.dataset.format}.webp`;
    if (img.getAttribute('src') === src) return;
    img.classList.add('is-out');
    setTimeout(() => {
      img.src = src;
      img.alt = `Tela Combinar do GESFONT no formato ${names[t.dataset.format]}, ${t.dataset.caption}`;
      caption.textContent = t.dataset.caption;
      img.classList.remove('is-out');
    }, 180);
  }
  function stop() { auto = false; clearInterval(timer); timer = null; }
  function play() { if (auto && visible && !timer) timer = setInterval(() => show(current + 1), 4200); }

  tabs.forEach((t, i) => {
    t.addEventListener('click', () => { stop(); show(i); });
    t.addEventListener('keydown', (e) => {
      const d = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }[e.key];
      if (d) { e.preventDefault(); stop(); show(current + d, true); }
    });
  });
  if ('IntersectionObserver' in window) {
    new IntersectionObserver(([e]) => { visible = e.isIntersecting; if (visible) play(); else { clearInterval(timer); timer = null; } }, { threshold: .35 }).observe(img);
  }
})();

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
const fmtDateLong = (iso) => new Date(iso).toLocaleDateString('pt-BR', { day: 'numeric', month: 'long', year: 'numeric' });

// Novidades da versão: uma por linha no texto da Release ("- item").
const notesOf = (body) => String(body || '').split(/\r?\n/).map((l) => l.replace(/^\s*[-*•]\s+/, '').trim()).filter(Boolean);

async function latest() {
  try {
    const cached = JSON.parse(sessionStorage.getItem('gesfont-latest-v2') || 'null');
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
    notes: notesOf(j.body),
    assets: (j.assets || []).map((a) => ({ name: a.name, size: a.size, url: a.browser_download_url })),
  };
  try { sessionStorage.setItem('gesfont-latest-v2', JSON.stringify({ at: Date.now(), data })); } catch (e) {}
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

  // Novidades: só troca o conteúdo fixo da página quando a Release tem texto.
  if (rel.version && rel.notes && rel.notes.length) {
    $$('[data-news-title]').forEach((el) => { el.textContent = `Versão ${rel.version}`; });
    $$('[data-news-date]').forEach((el) => { el.textContent = fmtDateLong(rel.date); });
    $$('[data-news-list]').forEach((ul) => {
      ul.replaceChildren(...rel.notes.map((n) => {
        const li = document.createElement('li');
        const m = n.match(/^([^:]{2,24}):\s+(.*)$/);
        if (m) { const b = document.createElement('b'); b.textContent = m[1] + ':'; li.append(b, ' ' + m[2]); }
        else li.textContent = n;
        return li;
      }));
    });
  }
}).catch(() => {
  // Sem API (limite de consultas ou sem rede): os botões continuam levando à página da última versão.
});
