// frontend/script.js
// Clean admin UI wiring for ScraperX (fixed & restored)

/* -------------------------
   DOM refs
--------------------------*/
const menuItems = document.querySelectorAll('.menu-item');
const views = document.querySelectorAll('.view');
const startBtn = document.getElementById('startBtn');
const stopBtn = document.getElementById('stopBtn');
const siteSelect = document.getElementById('siteSelect');
const urlInput = document.getElementById('urlInput');
const pagesInput = document.getElementById('pagesInput');

const progressWrap = document.getElementById('progressWrap');
const progressBar = document.getElementById('progressBar');
const progressMsg = document.getElementById('progressMsg');

const statRuns = document.getElementById('statRuns');
const statItems = document.getElementById('statItems');
const statLast = document.getElementById('statLast');

const resultsBody = document.getElementById('resultsBody');
const prevPage = document.getElementById('prevPage');
const nextPage = document.getElementById('nextPage');
const pageNumbers = document.getElementById('pageNumbers');
const showStart = document.getElementById('showStart');
const showEnd = document.getElementById('showEnd');
const showTotal = document.getElementById('showTotal');
const perPageEl = document.getElementById('perPage');

const filterSearch = document.getElementById('filterSearch');
const filterPriceMin = document.getElementById('filterPriceMin');
const filterPriceMax = document.getElementById('filterPriceMax');
const filterAvailability = document.getElementById('filterAvailability');
const sortByEl = document.getElementById('sortBy');
const sortOrderEl = document.getElementById('sortOrder');

const historyList = document.getElementById('historyList');

const themeToggle = document.getElementById('themeToggle');
const accentColor = document.getElementById('accentColor');
const openCssEditor = document.getElementById('openCssEditor');
const customCss = document.getElementById('customCss');
const applyCss = document.getElementById('applyCss');
const saveCss = document.getElementById('saveCss');
const clearCss = document.getElementById('clearCss');

const toasts = document.getElementById('toasts');

const priceChartCtx = document.getElementById('priceChart')?.getContext?.('2d');
const availChartCtx = document.getElementById('availChart')?.getContext?.('2d');

const sidebarEl = document.getElementById('sidebar');
const sidebarToggleBtn = document.getElementById('sidebarToggle');
const hamburger = document.getElementById('hamburger');

/* -------------------------
   State
--------------------------*/
let priceChart = null;
let availChart = null;

let controller = null;
let reader = null;
let currentRunId = null;
let currentPage = 1;
let perPage = Number(perPageEl?.value || 25);
let totalPages = 1;
let totalItems = 0;

/* -------------------------
   Helpers
--------------------------*/
function toast(msg, ttl = 3000) {
  if (!toasts) return console.log('toast:', msg);
  const el = document.createElement('div');
  el.className = 'toast';
  el.textContent = msg;
  toasts.appendChild(el);
  setTimeout(() => el.remove(), ttl);
}
function escapeHtml(s) { if (!s) return ''; return String(s).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;'); }
function debounce(fn, wait = 300) { let t; return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), wait); }; }

/* -------------------------
   Navigation (sidebar)
--------------------------*/
document.addEventListener('DOMContentLoaded', () => {
  const menuItems = document.querySelectorAll('.menu-item');
  const views = document.querySelectorAll('.view');

  menuItems.forEach(btn => btn.addEventListener('click', () => {
    menuItems.forEach(m => m.classList.remove('active'));
    btn.classList.add('active');
    const v = btn.dataset.view;
    views.forEach(view => view.classList.remove('active'));
    const target = document.getElementById(`view-${v}`);
    if(target) target.classList.add('active');
  }));
});


// Desktop collapse / mobile open logic
if (sidebarToggleBtn) {
  sidebarToggleBtn.addEventListener('click', () => {
    if (!sidebarEl) return;
    if (window.innerWidth < 768) {
      // mobile -> slide in/out
      sidebarEl.classList.toggle('open-mobile');
    } else {
      // desktop -> collapse
      sidebarEl.classList.toggle('collapsed');
    }
  });
}
if (hamburger) {
  hamburger.addEventListener('click', () => {
    if (!sidebarEl) return;
    sidebarEl.classList.toggle('open-mobile');
  });
}

/* -------------------------
   Site -> URL logic
--------------------------*/
function syncSiteToUrl() {
  if (!siteSelect || !urlInput) return;
  const v = siteSelect.value;
  if (v === 'custom') {
    urlInput.readOnly = false;
    urlInput.value = '';
    urlInput.placeholder = 'Enter custom URL';
  } else {
    urlInput.readOnly = true;
    urlInput.value = v;
  }
}
siteSelect?.addEventListener('change', syncSiteToUrl);
syncSiteToUrl();

/* -------------------------
   CSS editor
--------------------------*/
openCssEditor?.addEventListener('click', () => {
  document.querySelector('.menu-item[data-view="settings"]')?.click();
  window.scrollTo({ top: 0, behavior: 'smooth' });
});
applyCss?.addEventListener('click', () => {
  document.getElementById('custom-css').textContent = customCss.value || '';
  toast('Applied custom CSS');
});
saveCss?.addEventListener('click', () => {
  localStorage.setItem('customCSS', customCss.value || '');
  document.getElementById('custom-css').textContent = customCss.value || '';
  toast('Saved custom CSS');
});
clearCss?.addEventListener('click', () => {
  localStorage.removeItem('customCSS');
  customCss.value = '';
  document.getElementById('custom-css').textContent = '';
  toast('Cleared CSS');
});

/* -------------------------
   Theme + accent
--------------------------*/
themeToggle?.addEventListener('change', () => {
  if (themeToggle.checked) document.documentElement.classList.add('layout-dark');
  else document.documentElement.classList.remove('layout-dark');
  if (document.getElementById('saveTheme')?.checked) localStorage.setItem('darkMode', themeToggle.checked ? '1' : '0');
});
accentColor?.addEventListener('input', (e) => {
  document.documentElement.style.setProperty('--accent', e.target.value);
});

/* -------------------------
   Load history & stats
--------------------------*/
async function loadHistory() {
  try {
    const res = await fetch('/api/history');
    const j = await res.json();
    const runs = j.runs || [];
    statRuns && (statRuns.textContent = runs.length);
    statItems && (statItems.textContent = runs.reduce((s, r) => s + (r.item_count || 0), 0));
    statLast && (statLast.textContent = runs[0] ? runs[0].time_ago : '—');

    if (!historyList) return;
    historyList.innerHTML = '';
    runs.forEach(r => {
      const el = document.createElement('div');
      el.className = 'history-item';
      el.innerHTML = `<div>
        <div style="font-weight:600">${escapeHtml(r.url)}</div>
        <div class="muted small">${r.time_ago} • ${r.item_count} items • ${r.pages} pages</div>
      </div>
      <div style="display:flex;gap:8px">
        <button class="btn small" data-run="${r.id}" data-action="view">View</button>
        <a class="btn small" href="/api/export/${r.id}?format=csv">CSV</a>
        <button class="btn small" data-run="${r.id}" data-action="delete">Delete</button>
      </div>`;
      historyList.appendChild(el);

      el.querySelector('[data-action="view"]')?.addEventListener('click', () => {
        currentRunId = r.id;
        currentPage = 1;
        perPage = Number(perPageEl.value || 25);
        loadResultsPage();
        document.querySelector('.menu-item[data-view="results"]')?.click();
      });

      el.querySelector('[data-action="delete"]')?.addEventListener('click', async () => {
        if (!confirm(`Delete run ${r.id}?`)) return;
        try {
          const resp = await fetch('/api/delete-runs', {
            method: 'DELETE',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ ids: [r.id] })
          });
          const jd = await resp.json();
          if (!resp.ok) throw new Error(jd.error || 'Delete failed');
          toast('Deleted');
          loadHistory();
          if (currentRunId === r.id) { currentRunId = null; resultsBody.innerHTML = ''; }
        } catch (e) { toast(e.message || 'Delete failed'); }
      });
    });
  } catch (e) {
    console.error('loadHistory error', e);
    toast('Failed to load history');
  }
}

/* -------------------------
   Results: build & load
--------------------------*/
async function loadResultsPage() {
  if (!currentRunId) { toast('Open a run from History first'); return; }
  try {
    const q = new URLSearchParams({
      page: currentPage,
      per_page: perPage,
      sortBy: sortByEl?.value || 'title',
      sortOrder: sortOrderEl?.value || 'ASC'
    });
    if (filterSearch?.value) q.set('search', filterSearch.value);
    if (filterPriceMin?.value) q.set('price_min', filterPriceMin.value);
    if (filterPriceMax?.value) q.set('price_max', filterPriceMax.value);
    if (filterAvailability?.value) q.set('availability', filterAvailability.value);

    const res = await fetch(`/api/run/${currentRunId}?${q.toString()}`);
    const j = await res.json();
    if (!res.ok) throw new Error(j.error || 'Failed to load results');

    const items = j.items || [];
    totalItems = Number(j.total || 0);
    totalPages = Math.max(1, Math.ceil(totalItems / perPage));
    renderResults(items);
    renderPagination();
    renderCharts(items);
  } catch (e) {
    console.error('loadResultsPage error', e);
    toast(e.message || 'Load failed');
  }
}

/* -------------------------
   Render results & pagination
--------------------------*/
function renderResults(items) {
  if (!resultsBody) return;
  resultsBody.innerHTML = '';
  items.forEach(it => {
    const tr = document.createElement('tr');
    tr.innerHTML = `<td>${escapeHtml(it.title || '')}</td>
      <td>${escapeHtml(it.price || '')}</td>
      <td>${escapeHtml(it.availability || '')}</td>
      <td>${escapeHtml(it.category || '')}</td>`;
    resultsBody.appendChild(tr);
  });
  showStart && (showStart.textContent = ((currentPage - 1) * perPage) + 1);
  showEnd && (showEnd.textContent = Math.min(totalItems, currentPage * perPage));
  showTotal && (showTotal.textContent = totalItems);
}

function renderPagination() {
  if (!pageNumbers) return;
  pageNumbers.innerHTML = '';
  const max = 7; const half = Math.floor(max / 2);
  let start = Math.max(1, currentPage - half);
  let end = Math.min(totalPages, start + max - 1);
  if (end - start + 1 < max) start = Math.max(1, end - max + 1);
  for (let p = start; p <= end; p++) {
    const btn = document.createElement('button');
    btn.className = 'btn small';
    btn.style.margin = '0 4px';
    btn.textContent = p;
    if (p === currentPage) { btn.style.background = 'var(--accent)'; btn.style.color = '#fff'; }
    btn.addEventListener('click', () => { currentPage = p; loadResultsPage(); });
    pageNumbers.appendChild(btn);
  }
  if (prevPage) prevPage.disabled = currentPage <= 1;
  if (nextPage) nextPage.disabled = currentPage >= totalPages;
}
prevPage?.addEventListener('click', () => { if (currentPage > 1) { currentPage--; loadResultsPage(); } });
nextPage?.addEventListener('click', () => { if (currentPage < totalPages) { currentPage++; loadResultsPage(); } });
perPageEl?.addEventListener('change', () => { perPage = Number(perPageEl.value); currentPage = 1; loadResultsPage(); });

/* -------------------------
   Filters + sorting listeners
--------------------------*/
const debouncedLoad = debounce(() => { currentPage = 1; loadResultsPage(); }, 350);
[filterSearch, filterPriceMin, filterPriceMax, filterAvailability].forEach(el => {
  if (!el) return;
  el.addEventListener('input', debouncedLoad);
  el.addEventListener('change', debouncedLoad);
});

// sorting dropdowns (send sortBy & sortOrder params that backend expects)
[sortByEl, sortOrderEl].forEach(el => {
  if (!el) return;
  el.addEventListener('change', () => { currentPage = 1; loadResultsPage(); });
});

/* -------------------------
   Export
--------------------------*/
const exportBtn = document.getElementById('exportBtn');
const exportFormat = document.getElementById('exportFormat');
exportBtn?.addEventListener('click', () => {
  if (!currentRunId) return toast('Open a run first');
  const fmt = exportFormat?.value || 'csv';
  window.open(`/api/export/${currentRunId}?format=${fmt}`, '_blank');
});

/* -------------------------
   Scrape streaming (POST + ReadableStream)
--------------------------*/
function parseSSEChunk(buffer, cb) {
  const parts = buffer.split('\n\n');
  const remaining = parts.pop();
  for (const part of parts) {
    const lines = part.split('\n').map(l => l.trim()).filter(Boolean);
    let ev = null; const dataLines = [];
    for (const l of lines) {
      if (l.startsWith('event:')) ev = l.slice(6).trim();
      else if (l.startsWith('data:')) dataLines.push(l.slice(5).trim());
    }
    let data = null;
    try { data = JSON.parse(dataLines.join('\n')); } catch (e) { data = dataLines.join('\n') || null; }
    cb(ev || 'message', data);
  }
  return remaining;
}

startBtn?.addEventListener('click', async () => {
  const url = urlInput.value?.trim();
  const pages = Number(pagesInput.value || 1);
  if (!url) return toast('Enter a URL');

  startBtn.disabled = true;
  stopBtn.disabled = false;
  progressWrap.style.display = 'block';
  progressBar.style.width = '0%';
  progressMsg.textContent = 'Starting...';

  controller = new AbortController();
  reader = null;

  try {
    const res = await fetch('/api/scrape-stream', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url, pages }),
      signal: controller.signal
    });
    if (!res.ok) {
      const t = await res.json().catch(() => null);
      throw new Error(t && t.error ? t.error : `Server returned ${res.status}`);
    }

    if (res.body && res.body.getReader) {
      const r = res.body.getReader();
      reader = r;
      const dec = new TextDecoder();
      let buffer = '';
      while (true) {
        const { done, value } = await r.read();
        if (done) break;
        buffer += dec.decode(value, { stream: true });
        buffer = parseSSEChunk(buffer, (ev, data) => {
          if (ev === 'progress') {
            if (data && typeof data.pct === 'number') progressBar.style.width = `${data.pct}%`;
            if (data && data.message) progressMsg.textContent = data.message;
          } else if (ev === 'done') {
            progressBar.style.width = '100%';
            progressMsg.textContent = data && data.message ? data.message : 'Done';
            startBtn.disabled = false;
            stopBtn.disabled = true;
            if (data && data.runId) {
              currentRunId = data.runId;
              toast('Scrape complete');
              loadHistory();
              currentPage = 1;
              perPage = Number(perPageEl.value || 25);
              loadResultsPage();
              document.querySelector('.menu-item[data-view="results"]')?.click();
            }
          } else if (ev === 'error') {
            progressMsg.textContent = (data && data.message) || 'Error';
            toast((data && data.message) || 'Scrape failed');
            startBtn.disabled = false;
            stopBtn.disabled = true;
          }
        });
      }
    } else {
      const j = await res.json();
      if (j && j.error) throw new Error(j.error);
      toast('Started (no stream)');
      startBtn.disabled = false; stopBtn.disabled = true;
    }
  } catch (e) {
    console.error('scrape error', e);
    toast(e.message || 'Start failed');
    startBtn.disabled = false; stopBtn.disabled = true;
    progressWrap.style.display = 'none';
  }
});

stopBtn?.addEventListener('click', () => {
  if (controller) try { controller.abort(); } catch (e) { }
  if (reader) try { reader.cancel(); } catch (e) { }
  startBtn.disabled = false;
  stopBtn.disabled = true;
  progressMsg.textContent = 'Stopped';
  progressWrap.style.display = 'none';
  toast('Stop requested');
});

/* -------------------------
   Charts
--------------------------*/
function renderCharts(items) {
  if (!priceChartCtx && !availChartCtx) return;
  const prices = (items || []).map(i => i.price_num).filter(x => typeof x === 'number');
  const availCounts = {};
  (items || []).forEach(i => { const a = i.availability || 'Unknown'; availCounts[a] = (availCounts[a] || 0) + 1; });

  if (priceChart) try { priceChart.destroy(); } catch (e) {}
  if (priceChartCtx) {
    priceChart = new Chart(priceChartCtx, { type: 'bar', data: { labels: prices.map((_, i) => i + 1), datasets: [{ label: 'Price', data: prices }] } });
  }

  if (availChart) try { availChart.destroy(); } catch (e) {}
  if (availChartCtx) {
    availChart = new Chart(availChartCtx, { type: 'pie', data: { labels: Object.keys(availCounts), datasets: [{ data: Object.values(availCounts) }] } });
  }
}

/* -------------------------
   Init
--------------------------*/
function initOnce() {
  try {
    const savedCss = localStorage.getItem('customCSS') || '';
    document.getElementById('custom-css').textContent = savedCss;
    if (customCss) customCss.value = savedCss;

    const dark = localStorage.getItem('darkMode') === '1';
    if (themeToggle) { themeToggle.checked = dark; if (dark) document.documentElement.classList.add('layout-dark'); }

    loadHistory();
    // refresh history periodically
    setInterval(loadHistory, 30_000);
  } catch (e) {
    console.error('init error', e);
  }
}

if (document.readyState === 'loading') window.addEventListener('DOMContentLoaded', initOnce);
else initOnce();

/* -------------------------
   Dev helper
--------------------------*/
window.openResultsForRun = (id) => { currentRunId = id; currentPage = 1; perPage = Number(perPageEl.value || 25); loadResultsPage(); };
