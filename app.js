/* =========================================================================
   KONFIGURASI
   ⚠️ WAJIB DIISI: GID di bawah ini masih placeholder. Buka tab "datadt" di
   Google Sheets, lihat "#gid=NNNNN" pada URL, lalu ganti nilainya di sini.
   ========================================================================= */
const CONFIG = {
  SHEET_ID: '1RBYWSWbJSlrtwx3t33y6oMLLbp-PmTbSjEAB9ccipCY',
  DATADT_GID: 1423300991
};

// Header yang diharapkan pada sheet "datadt" (urutan bebas, dicocokkan by name)
const COL = { TANGGAL: 'Tanggal', SHIFT: 'Shift', MESIN: 'Mesin', KATEGORI: 'Kategori', DOWNTIME: 'Downtime', NOTE: 'Other Note' };

// Palet pastel untuk kategori (dipakai berurutan sesuai kategori terurut)
const PALETTE = ['#A9C9E8', '#B8DEC0', '#F3BFCB', '#D6C6EA', '#F5E2A6', '#F6C9A9', '#A9DAD4', '#E7B4C4', '#C9C3D4', '#B9CFE0'];

/* =========================================================================
   STATE
   ========================================================================= */
let RAW = [];
const CATEGORY_COLORS = {};
let currentFiltered = [];
const TABLE_SORT = { key: '__date', dir: 'desc' };
let chartPareto, chartTrend, chartMesin, chartShift;

/* =========================================================================
   AMBIL & PARSING DATA
   ========================================================================= */
async function fetchSheet(gid) {
  const url = `https://docs.google.com/spreadsheets/d/${CONFIG.SHEET_ID}/gviz/tq?tqx=out:csv&gid=${gid}&t=${Date.now()}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const text = await res.text();
  if (text.trim().startsWith('<')) {
    throw new Error('Sheet tidak bisa diakses publik. Atur sharing sheet ke "Anyone with the link — Viewer".');
  }
  const parsed = Papa.parse(text.trim(), { header: true, skipEmptyLines: true });
  return parsed.data;
}

// 20260805 -> "2026-08-05"
function parseTanggal(v) {
  const s = String(v || '').trim();
  if (/^\d{8}$/.test(s)) return `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}`;
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  return null;
}

function num(v) {
  if (v === undefined || v === null || v === '') return 0;
  const n = parseFloat(String(v).replace(',', '.').trim());
  return isNaN(n) ? 0 : n;
}

async function loadAll() {
  hideError();

  if (!/^\d+$/.test(String(CONFIG.DATADT_GID))) {
    setStatus('Menunggu konfigurasi.');
    showError('GID sheet "datadt" belum diisi. Buka app.js, cari CONFIG.DATADT_GID, dan ganti dengan angka gid sheet "datadt" (lihat "#gid=..." pada URL sheet tersebut).');
    return;
  }

  setStatus('Mengambil data…');
  RAW = [];

  try {
    const rows = await fetchSheet(CONFIG.DATADT_GID);
    RAW = rows.map(r => {
      const date = parseTanggal(r[COL.TANGGAL]);
      const shift = (r[COL.SHIFT] ?? '-').toString().trim() || '-';
      const mesin = (r[COL.MESIN] ?? '-').toString().trim() || '-';
      const kategori = (r[COL.KATEGORI] ?? '-').toString().trim() || '-';
      const downtime = num(r[COL.DOWNTIME]);
      const note = (r[COL.NOTE] ?? '').toString().trim();
      return { __date: date, __shift: shift, __mesin: mesin, __kategori: kategori, __downtime: downtime, __note: note };
    }).filter(r => r.__date); // buang baris tanpa tanggal valid (header ganda/baris kosong)
  } catch (e) {
    console.error(e);
    showError(`Gagal memuat sheet "datadt": ${e.message}`);
  }

  if (RAW.length === 0) {
    setStatus('Tidak ada data.');
    return;
  }

  const cats = uniqueSorted(RAW.map(r => r.__kategori));
  cats.forEach((c, i) => { CATEGORY_COLORS[c] = PALETTE[i % PALETTE.length]; });

  populateFilterOptions();
  applyFilters();
  setStatus('Sinkron terakhir: ' + new Date().toLocaleTimeString('id-ID'));
}

/* =========================================================================
   FILTER
   ========================================================================= */
function uniqueSorted(arr) {
  return [...new Set(arr.filter(v => v && v !== '-'))].sort();
}

function fillSelect(sel, values) {
  const el = document.querySelector(sel);
  const current = el.value;
  el.innerHTML = '<option value="all">Semua</option>' + values.map(v => `<option value="${v}">${v}</option>`).join('');
  if (values.includes(current)) el.value = current;
}

function populateFilterOptions() {
  fillSelect('#filterShift', uniqueSorted(RAW.map(r => r.__shift)));
  fillSelect('#filterMesin', uniqueSorted(RAW.map(r => r.__mesin)));
  fillSelect('#filterKategori', uniqueSorted(RAW.map(r => r.__kategori)));
  const dates = RAW.map(r => r.__date).filter(Boolean).sort();
  if (dates.length) {
    ['filterDateFrom', 'filterDateTo'].forEach(id => {
      document.getElementById(id).min = dates[0];
      document.getElementById(id).max = dates[dates.length - 1];
    });
  }
}

function getFiltered() {
  const from = document.getElementById('filterDateFrom').value;
  const to = document.getElementById('filterDateTo').value;
  const shift = document.getElementById('filterShift').value;
  const mesin = document.getElementById('filterMesin').value;
  const kategori = document.getElementById('filterKategori').value;
  const q = document.getElementById('searchBox').value.trim().toLowerCase();

  return RAW.filter(r => {
    if (from && r.__date && r.__date < from) return false;
    if (to && r.__date && r.__date > to) return false;
    if (shift !== 'all' && r.__shift !== shift) return false;
    if (mesin !== 'all' && r.__mesin !== mesin) return false;
    if (kategori !== 'all' && r.__kategori !== kategori) return false;
    if (q && !r.__note.toLowerCase().includes(q)) return false;
    return true;
  });
}

function applyFilters() {
  currentFiltered = getFiltered();
  // Setiap bagian dibungkus try/catch dan berdiri sendiri: kalau satu bagian
  // gagal (mis. Chart.js belum termuat), bagian lain tetap tampil normal.
  safeRun('KPI', () => renderKPIs(currentFiltered));
  safeRun('Komposisi', () => renderCompositionStrip(currentFiltered));
  safeRun('Insight', () => renderInsights(currentFiltered));
  safeRun('Tabel', () => renderTable(currentFiltered));
  safeRun('Grafik', () => renderCharts(currentFiltered));
}

function safeRun(label, fn) {
  try { fn(); }
  catch (e) { console.error(`Gagal render bagian "${label}":`, e); }
}

/* =========================================================================
   HELPER TAMPILAN
   ========================================================================= */
function formatMinutes(min) {
  min = Math.round(min || 0);
  const h = Math.floor(min / 60);
  const m = min % 60;
  return h > 0 ? `${h}j ${m}m` : `${m}m`;
}
function setText(sel, txt) { document.querySelector(sel).textContent = txt; }
function setStatus(txt) { document.getElementById('syncStatus').textContent = txt; }
function showError(msg) {
  const b = document.getElementById('errorBanner');
  b.style.display = 'block';
  b.textContent = msg;
}
function hideError() { document.getElementById('errorBanner').style.display = 'none'; }
function showLibWarning(msg) {
  const b = document.getElementById('libWarning');
  b.style.display = 'block';
  b.textContent = msg;
}
function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m]));
}
function groupSum(data, keyFn) {
  const out = {};
  data.forEach(r => { const k = keyFn(r); out[k] = (out[k] || 0) + r.__downtime; });
  return out;
}

/* =========================================================================
   KPI
   ========================================================================= */
function renderKPIs(data) {
  const total = data.reduce((s, r) => s + r.__downtime, 0);
  const count = data.length;
  const avg = count ? total / count : 0;

  const catTotals = groupSum(data, r => r.__kategori);
  let topCat = '-', topVal = 0;
  Object.entries(catTotals).forEach(([c, v]) => { if (v > topVal) { topVal = v; topCat = c; } });

  setText('#kpiTotalDowntime', formatMinutes(total));
  setText('#kpiTotalRecords', count.toLocaleString('id-ID'));
  setText('#kpiAvg', formatMinutes(avg));
  setText('#kpiTopCause', total ? `${topCat} (${(topVal / total * 100).toFixed(1)}%)` : '-');
}

/* =========================================================================
   COMPOSITION STRIP (elemen signature — segmen pastel)
   ========================================================================= */
function renderCompositionStrip(data) {
  const strip = document.getElementById('compStrip');
  const legend = document.getElementById('compLegend');
  const dot = document.getElementById('statusDot');
  strip.innerHTML = ''; legend.innerHTML = '';

  const catTotals = groupSum(data, r => r.__kategori);
  const total = Object.values(catTotals).reduce((a, b) => a + b, 0);

  if (total === 0) {
    strip.innerHTML = '<div class="comp-empty">Tidak ada downtime pada filter ini</div>';
    dot.style.background = 'var(--status-good)';
    return;
  }

  const sorted = Object.entries(catTotals).filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1]);
  const top = sorted.slice(0, 7);
  const restTotal = sorted.slice(7).reduce((s, [, v]) => s + v, 0);
  const segments = restTotal > 0 ? [...top, ['Lainnya', restTotal]] : top;

  segments.forEach(([cat, val]) => {
    const pct = (val / total) * 100;
    const color = CATEGORY_COLORS[cat] || 'var(--gray)';

    const seg = document.createElement('div');
    seg.className = 'comp-seg';
    seg.style.width = pct + '%';
    seg.style.background = color;
    seg.title = `${cat}: ${formatMinutes(val)} (${pct.toFixed(1)}%)`;
    strip.appendChild(seg);

    const item = document.createElement('span');
    item.className = 'comp-legend-item';
    item.innerHTML = `<i style="background:${color}"></i>${cat} <b>${pct.toFixed(0)}%</b>`;
    legend.appendChild(item);
  });

  const avgFiltered = total / data.length;
  const allTotal = RAW.reduce((s, r) => s + r.__downtime, 0);
  const avgAll = allTotal / RAW.length;
  dot.style.background = avgFiltered > avgAll * 1.15 ? 'var(--status-bad)' : (avgFiltered < avgAll * 0.85 ? 'var(--status-good)' : 'var(--status-warn)');
}

/* =========================================================================
   INSIGHT OTOMATIS
   ========================================================================= */
function renderInsights(data) {
  const box = document.getElementById('insightList');
  box.innerHTML = '';
  if (!data.length) { box.innerHTML = '<li>Tidak ada data pada filter ini.</li>'; return; }

  const items = [];
  const catTotals = groupSum(data, r => r.__kategori);
  const mesinTotals = groupSum(data, r => r.__mesin);
  const shiftTotals = groupSum(data, r => r.__shift);
  const total = Object.values(catTotals).reduce((a, b) => a + b, 0);

  if (total > 0) {
    const [topCat, topCatVal] = Object.entries(catTotals).sort((a, b) => b[1] - a[1])[0];
    items.push(`Kategori downtime terbesar: <strong>${topCat}</strong> — ${formatMinutes(topCatVal)} (${(topCatVal / total * 100).toFixed(1)}% dari total).`);
  }
  const mesinEntries = Object.entries(mesinTotals).filter(([k]) => k && k !== '-');
  if (mesinEntries.length) {
    const [topMesin, topMesinVal] = mesinEntries.sort((a, b) => b[1] - a[1])[0];
    items.push(`Mesin dengan downtime tertinggi: <strong>${topMesin}</strong> — ${formatMinutes(topMesinVal)}.`);
  }
  const shiftEntries = Object.entries(shiftTotals).filter(([k]) => k && k !== '-');
  if (shiftEntries.length) {
    const [topShift, topShiftVal] = shiftEntries.sort((a, b) => b[1] - a[1])[0];
    items.push(`Shift dengan downtime tertinggi: <strong>Shift ${topShift}</strong> — ${formatMinutes(topShiftVal)}.`);
  }

  const byDate = groupSum(data, r => r.__date);
  const dates = Object.keys(byDate).sort();
  if (dates.length >= 4) {
    const mid = Math.floor(dates.length / 2);
    const firstAvg = dates.slice(0, mid).reduce((s, d) => s + byDate[d], 0) / mid;
    const secondAvg = dates.slice(mid).reduce((s, d) => s + byDate[d], 0) / (dates.length - mid);
    if (firstAvg > 0) {
      const pct = ((secondAvg - firstAvg) / firstAvg) * 100;
      items.push(`Tren downtime harian <strong>${pct >= 0 ? 'naik' : 'turun'} ${Math.abs(pct).toFixed(1)}%</strong> pada paruh kedua periode filter dibanding paruh pertama.`);
    }
  }

  const zero = data.filter(r => r.__downtime === 0).length;
  if (zero > 0) items.push(`<strong>${zero}</strong> entri (${(zero / data.length * 100).toFixed(1)}%) tercatat dengan durasi 0 menit.`);

  const worst = [...data].sort((a, b) => b.__downtime - a.__downtime)[0];
  if (worst && worst.__downtime > 0) {
    items.push(`Entri dengan durasi terbesar: <strong>${worst.__kategori}</strong> di Mesin ${worst.__mesin} (${formatMinutes(worst.__downtime)}) pada ${worst.__date}.`);
  }

  items.forEach(t => { const li = document.createElement('li'); li.innerHTML = t; box.appendChild(li); });
}

/* =========================================================================
   CHARTS
   ========================================================================= */
function upsertChart(instance, canvasId, config) {
  if (instance) instance.destroy();
  const ctx = document.getElementById(canvasId);
  return new Chart(ctx, config);
}

function baseOptions() {
  return {
    responsive: true, maintainAspectRatio: false,
    plugins: {
      legend: { labels: { color: '#8C8593', font: { family: 'Inter', size: 11 } } },
      tooltip: { titleFont: { family: 'Inter' }, bodyFont: { family: 'JetBrains Mono' } }
    },
    scales: {
      x: { ticks: { color: '#8C8593', font: { size: 10 } }, grid: { color: '#EDE8F0' } },
      y: { ticks: { color: '#8C8593', font: { size: 10 } }, grid: { color: '#EDE8F0' }, beginAtZero: true }
    }
  };
}
function paretoOptions() {
  const o = baseOptions();
  o.scales.y1 = { position: 'right', min: 0, max: 100, ticks: { color: '#8C8593', callback: v => v + '%' }, grid: { drawOnChartArea: false } };
  o.scales.x.ticks.maxRotation = 40;
  o.scales.x.ticks.minRotation = 20;
  return o;
}

function renderCharts(data) {
  if (typeof Chart === 'undefined') return; // Chart.js gagal dimuat — sudah ditandai lewat error banner di initDashboard()

  // Pareto per kategori
  const catTotals = groupSum(data, r => r.__kategori);
  const sortedCats = Object.entries(catTotals).sort((a, b) => b[1] - a[1]);
  const catLabels = sortedCats.map(x => x[0]);
  const catValues = sortedCats.map(x => x[1]);
  const totalAll = catValues.reduce((a, b) => a + b, 0);
  let cum = 0;
  const cumPct = catValues.map(v => { cum += v; return totalAll ? (cum / totalAll * 100) : 0; });

  chartPareto = upsertChart(chartPareto, 'chartPareto', {
    type: 'bar',
    data: {
      labels: catLabels,
      datasets: [
        { type: 'bar', label: 'Downtime (menit)', data: catValues, backgroundColor: catLabels.map(c => CATEGORY_COLORS[c]), borderRadius: 6, yAxisID: 'y' },
        { type: 'line', label: 'Kumulatif %', data: cumPct, borderColor: '#B98CC9', backgroundColor: 'transparent', yAxisID: 'y1', tension: .3, pointRadius: 3, pointBackgroundColor: '#B98CC9' }
      ]
    },
    options: paretoOptions()
  });

  // Tren harian
  const byDate = groupSum(data, r => r.__date);
  const dates = Object.keys(byDate).sort();
  chartTrend = upsertChart(chartTrend, 'chartTrend', {
    type: 'line',
    data: { labels: dates, datasets: [{ label: 'Total downtime (menit)', data: dates.map(d => byDate[d]), borderColor: '#6FAE81', backgroundColor: 'rgba(184,222,192,.35)', fill: true, tension: .3, pointRadius: 2 }] },
    options: baseOptions()
  });

  // Per mesin
  const mesinTotals = groupSum(data, r => r.__mesin);
  const mesinEntries = Object.entries(mesinTotals).filter(([k]) => k && k !== '-').sort((a, b) => b[1] - a[1]);
  chartMesin = upsertChart(chartMesin, 'chartByMesin', {
    type: 'bar',
    data: { labels: mesinEntries.map(x => x[0]), datasets: [{ label: 'Downtime (menit)', data: mesinEntries.map(x => x[1]), backgroundColor: '#F6C9A9', borderRadius: 6 }] },
    options: baseOptions()
  });

  // Per shift
  const shiftTotals = groupSum(data, r => r.__shift);
  const shiftEntries = Object.entries(shiftTotals).filter(([k]) => k && k !== '-').sort((a, b) => a[0].localeCompare(b[0]));
  chartShift = upsertChart(chartShift, 'chartByShift', {
    type: 'bar',
    data: { labels: shiftEntries.map(x => 'Shift ' + x[0]), datasets: [{ label: 'Downtime (menit)', data: shiftEntries.map(x => x[1]), backgroundColor: '#A9C9E8', borderRadius: 6 }] },
    options: baseOptions()
  });
}

/* =========================================================================
   TABEL
   ========================================================================= */
function renderTable(data) {
  const theadRow = document.getElementById('tableHeadRow');
  const tbody = document.getElementById('tableBody');

  const cols = [
    { label: 'Tanggal', key: '__date' },
    { label: 'Shift', key: '__shift' },
    { label: 'Mesin', key: '__mesin' },
    { label: 'Kategori', key: '__kategori' },
    { label: 'Downtime', key: '__downtime' },
    { label: 'Catatan', key: '__note' }
  ];

  theadRow.innerHTML = cols.map(c =>
    `<th data-key="${c.key}">${escapeHtml(c.label)} <span class="sort-ind">${TABLE_SORT.key === c.key ? (TABLE_SORT.dir === 'asc' ? '▲' : '▼') : ''}</span></th>`
  ).join('');

  theadRow.querySelectorAll('th').forEach(th => {
    th.onclick = () => {
      const key = th.dataset.key;
      if (TABLE_SORT.key === key) TABLE_SORT.dir = TABLE_SORT.dir === 'asc' ? 'desc' : 'asc';
      else { TABLE_SORT.key = key; TABLE_SORT.dir = 'asc'; }
      renderTable(currentFiltered);
    };
  });

  const sorted = [...data].sort((a, b) => {
    let va = a[TABLE_SORT.key], vb = b[TABLE_SORT.key];
    if (typeof va === 'number' || typeof vb === 'number') { va = va || 0; vb = vb || 0; }
    else { va = (va || '').toString(); vb = (vb || '').toString(); }
    if (va < vb) return TABLE_SORT.dir === 'asc' ? -1 : 1;
    if (va > vb) return TABLE_SORT.dir === 'asc' ? 1 : -1;
    return 0;
  });

  setText('#tableCount', `${sorted.length.toLocaleString('id-ID')} entri`);

  tbody.innerHTML = sorted.map(r => {
    const color = CATEGORY_COLORS[r.__kategori] || '#D8D3DE';
    const cells = [
      r.__date || '-',
      'Shift ' + (r.__shift || '-'),
      r.__mesin || '-',
      `<span class="kat-pill" style="background:${color}33;color:${color === '#D8D3DE' ? '#6b6572' : color};border:1px solid ${color}">${escapeHtml(r.__kategori)}</span>`,
      `<strong>${formatMinutes(r.__downtime)}</strong>`,
      r.__note ? `<span class="note-cell" title="${escapeHtml(r.__note)}">${escapeHtml(r.__note)}</span>` : ''
    ];
    return `<tr>${cells.map(c => `<td>${c}</td>`).join('')}</tr>`;
  }).join('') || `<tr><td colspan="${cols.length}" class="empty-row">Tidak ada data untuk filter ini.</td></tr>`;
}

/* =========================================================================
   EXPORT CSV
   ========================================================================= */
function exportCsv() {
  const headers = ['Tanggal', 'Shift', 'Mesin', 'Kategori', 'Downtime', 'Other Note'];
  const rows = currentFiltered.map(r => [r.__date, r.__shift, r.__mesin, r.__kategori, r.__downtime, r.__note]);
  const csv = [headers, ...rows]
    .map(row => row.map(v => `"${String(v ?? '').replace(/"/g, '""')}"`).join(','))
    .join('\n');
  const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `downtime-export-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

/* =========================================================================
   INIT
   ========================================================================= */
function bindEvents() {
  ['filterDateFrom', 'filterDateTo', 'filterShift', 'filterMesin', 'filterKategori'].forEach(id => {
    document.getElementById(id).addEventListener('change', applyFilters);
  });
  document.getElementById('searchBox').addEventListener('input', applyFilters);
  document.getElementById('btnReset').addEventListener('click', () => {
    document.getElementById('filterDateFrom').value = '';
    document.getElementById('filterDateTo').value = '';
    document.getElementById('filterShift').value = 'all';
    document.getElementById('filterMesin').value = 'all';
    document.getElementById('filterKategori').value = 'all';
    document.getElementById('searchBox').value = '';
    applyFilters();
  });
  document.getElementById('btnExport').addEventListener('click', exportCsv);
  document.getElementById('btnRefresh').addEventListener('click', loadAll);
}

// Dipanggil oleh loader di index.html setelah PapaParse & Chart.js (atau
// cadangannya) selesai dicoba dimuat. Tidak lagi bergantung pada
// DOMContentLoaded karena script ini disisipkan secara dinamis.
function initDashboard() {
  if (typeof Papa === 'undefined') {
    showError('Gagal memuat pustaka PapaParse dari semua CDN cadangan. Data tidak bisa diproses — periksa apakah jaringan/firewall memblokir cdn.jsdelivr.net, cdnjs.cloudflare.com, dan unpkg.com.');
    return;
  }
  if (typeof Chart === 'undefined') {
    showLibWarning('Grafik tidak bisa ditampilkan: pustaka Chart.js gagal dimuat dari semua CDN cadangan (kemungkinan diblokir jaringan/firewall). KPI, insight, dan tabel tetap berfungsi normal.');
  }
  bindEvents();
  loadAll();
}
window.initDashboard = initDashboard;
