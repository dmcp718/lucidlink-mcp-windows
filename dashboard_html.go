package main

// dashboardHTML is the embedded single-page dashboard served by the HTTP server.
// Uses vanilla JS + Chart.js (CDN) for visualizations. No build step required.
const dashboardHTML = `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<title>LucidLink Audit Trail</title>
<script src="https://cdn.jsdelivr.net/npm/chart.js@4.4.7/dist/chart.umd.min.js"></script>
<style>
  :root { color-scheme: light dark; }
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body {
    font-family: "Segoe UI", -apple-system, sans-serif;
    font-size: 13px;
    line-height: 1.4;
    background: var(--bg);
    color: var(--text);
    --bg: #f5f5f7;
    --card: #fff;
    --text: #1d1d1f;
    --dim: #86868b;
    --border: #d2d2d7;
    --accent: #61149a;
    --accent-light: rgba(97,20,154,0.08);
    --green: #34c759;
    --red: #ff3b30;
    --orange: #ff9500;
  }
  @media (prefers-color-scheme: dark) {
    body {
      --bg: #1d1d1f;
      --card: #2c2c2e;
      --text: #f5f5f7;
      --dim: #98989d;
      --border: #38383a;
      --accent: #bf5af2;
      --accent-light: rgba(191,90,242,0.12);
    }
  }

  .header {
    background: var(--card);
    border-bottom: 1px solid var(--border);
    padding: 12px 20px;
    display: flex;
    align-items: center;
    gap: 12px;
  }
  .header h1 {
    font-size: 16px;
    font-weight: 600;
  }
  .header .dot {
    width: 8px; height: 8px;
    border-radius: 50%;
    background: var(--dim);
  }
  .header .dot.active { background: var(--green); }
  .header .status { font-size: 12px; color: var(--dim); margin-left: auto; }

  .filespace-select {
    font-family: inherit;
    font-size: 12px;
    padding: 4px 8px;
    border: 1px solid var(--border);
    border-radius: 6px;
    background: var(--bg);
    color: var(--text);
    outline: none;
    margin-left: 8px;
  }
  .filespace-select:focus { border-color: var(--accent); }

  .content { padding: 16px 20px; }

  .stats-row {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: 12px;
    margin-bottom: 16px;
  }
  .stat-card {
    background: var(--card);
    border: 1px solid var(--border);
    border-radius: 10px;
    padding: 14px 16px;
  }
  .stat-card .label { font-size: 11px; color: var(--dim); text-transform: uppercase; letter-spacing: 0.5px; }
  .stat-card .value { font-size: 24px; font-weight: 600; margin-top: 2px; }

  .charts-row {
    display: grid;
    grid-template-columns: 2fr 1fr;
    gap: 12px;
    margin-bottom: 16px;
  }
  .chart-card {
    background: var(--card);
    border: 1px solid var(--border);
    border-radius: 10px;
    padding: 14px 16px;
  }
  .chart-card h3 { font-size: 13px; font-weight: 600; margin-bottom: 8px; }
  .chart-card canvas { width: 100% !important; max-height: 200px; }

  .events-section {
    background: var(--card);
    border: 1px solid var(--border);
    border-radius: 10px;
    overflow: hidden;
  }
  .events-header {
    padding: 12px 16px;
    border-bottom: 1px solid var(--border);
    display: flex;
    align-items: center;
    gap: 8px;
    flex-wrap: wrap;
  }
  .events-header h3 { font-size: 13px; font-weight: 600; margin-right: auto; }

  .filter-group {
    display: flex;
    gap: 6px;
    align-items: center;
    flex-wrap: wrap;
  }
  .filter-group input, .filter-group select {
    font-family: inherit;
    font-size: 12px;
    padding: 4px 8px;
    border: 1px solid var(--border);
    border-radius: 6px;
    background: var(--bg);
    color: var(--text);
    outline: none;
  }
  .filter-group input:focus, .filter-group select:focus {
    border-color: var(--accent);
  }
  .filter-group input { width: 120px; }
  .btn {
    font-family: inherit;
    font-size: 12px;
    padding: 4px 12px;
    border: 1px solid var(--accent);
    border-radius: 6px;
    background: var(--accent);
    color: #fff;
    cursor: pointer;
  }
  .btn:hover { opacity: 0.85; }
  .btn-outline {
    background: transparent;
    color: var(--accent);
  }

  table {
    width: 100%;
    border-collapse: collapse;
    font-size: 12px;
  }
  thead th {
    text-align: left;
    padding: 8px 12px;
    border-bottom: 1px solid var(--border);
    font-weight: 600;
    font-size: 11px;
    color: var(--dim);
    text-transform: uppercase;
    letter-spacing: 0.3px;
    position: sticky;
    top: 0;
    background: var(--card);
  }
  tbody td {
    padding: 6px 12px;
    border-bottom: 1px solid var(--border);
    max-width: 300px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  tbody tr:hover { background: var(--accent-light); }

  .action-badge {
    display: inline-block;
    padding: 1px 6px;
    border-radius: 4px;
    font-size: 11px;
    font-weight: 500;
  }
  .action-FileRead { background: rgba(0,122,255,0.12); color: #007aff; }
  .action-FileWritten { background: rgba(52,199,89,0.12); color: #34c759; }
  .action-FileCreate { background: rgba(52,199,89,0.12); color: #30d158; }
  .action-FileDelete { background: rgba(255,59,48,0.12); color: #ff3b30; }
  .action-DirectoryCreate { background: rgba(0,199,190,0.12); color: #00c7be; }
  .action-DirectoryDelete { background: rgba(255,59,48,0.12); color: #ff453a; }
  .action-Move { background: rgba(255,149,0,0.12); color: #ff9500; }

  .table-scroll { max-height: 400px; overflow-y: auto; }

  .pager {
    padding: 8px 16px;
    display: flex;
    align-items: center;
    justify-content: space-between;
    border-top: 1px solid var(--border);
    font-size: 12px;
    color: var(--dim);
  }
  .pager button {
    font-family: inherit;
    font-size: 12px;
    padding: 3px 10px;
    border: 1px solid var(--border);
    border-radius: 5px;
    background: var(--card);
    color: var(--text);
    cursor: pointer;
  }
  .pager button:disabled { opacity: 0.4; cursor: default; }

  .time-filters {
    display: flex;
    gap: 4px;
    margin-left: 8px;
  }
  .time-btn {
    font-family: inherit;
    font-size: 11px;
    padding: 2px 8px;
    border: 1px solid var(--border);
    border-radius: 4px;
    background: var(--card);
    color: var(--text);
    cursor: pointer;
  }
  .time-btn.active {
    background: var(--accent);
    color: #fff;
    border-color: var(--accent);
  }
</style>
</head>
<body>

<div class="header">
  <div class="dot" id="statusDot"></div>
  <h1>LucidLink Audit Trail</h1>
  <select id="filespaceSelect" class="filespace-select">
    <option value="">All Filespaces</option>
  </select>
  <span class="status" id="statusText">Connecting...</span>
</div>

<div class="content">
  <div class="stats-row">
    <div class="stat-card"><div class="label">Total Events</div><div class="value" id="statTotal">—</div></div>
    <div class="stat-card"><div class="label">Unique Users</div><div class="value" id="statUsers">—</div></div>
    <div class="stat-card"><div class="label">Filespaces</div><div class="value" id="statFilespaces">—</div></div>
    <div class="stat-card"><div class="label">Time Range</div><div class="value" id="statRange" style="font-size:13px">—</div></div>
  </div>

  <div class="charts-row">
    <div class="chart-card">
      <h3>Event Timeline</h3>
      <canvas id="timelineChart"></canvas>
    </div>
    <div class="chart-card">
      <h3>Events by Type</h3>
      <canvas id="actionChart"></canvas>
    </div>
  </div>

  <div class="events-section">
    <div class="events-header">
      <h3>Events</h3>
      <div class="time-filters">
        <button class="time-btn" data-since="1h">1H</button>
        <button class="time-btn" data-since="24h" >24H</button>
        <button class="time-btn active" data-since="7d">7D</button>
        <button class="time-btn" data-since="30d">30D</button>
        <button class="time-btn" data-since="">All</button>
      </div>
      <div class="filter-group">
        <input type="text" id="filterUser" placeholder="User...">
        <select id="filterAction">
          <option value="">All actions</option>
          <option>FileRead</option>
          <option>FileWritten</option>
          <option>FileCreate</option>
          <option>FileDelete</option>
          <option>DirectoryCreate</option>
          <option>DirectoryDelete</option>
          <option>Move</option>
          <option>Pin</option>
          <option>Unpin</option>
        </select>
        <input type="text" id="filterPath" placeholder="Path...">
        <button class="btn" onclick="loadEvents()">Search</button>
        <button class="btn btn-outline" onclick="clearFilters()">Clear</button>
      </div>
    </div>
    <div class="table-scroll" id="tableScroll">
      <table>
        <thead>
          <tr>
            <th>Time</th>
            <th>User</th>
            <th>Action</th>
            <th>Path</th>
            <th>File</th>
            <th>Filespace</th>
          </tr>
        </thead>
        <tbody id="eventsBody"></tbody>
      </table>
    </div>
    <div class="pager">
      <span id="pagerInfo">—</span>
      <div>
        <button id="prevBtn" onclick="prevPage()" disabled>&laquo; Prev</button>
        <button id="nextBtn" onclick="nextPage()">Next &raquo;</button>
      </div>
    </div>
  </div>
</div>

<script>
const PAGE_SIZE = 100;
let currentOffset = 0;
let currentSince = '7d';
let totalEvents = 0;

let timelineChart, actionChart;

// --- Filespace selector ---
const filespaceSelect = document.getElementById('filespaceSelect');
filespaceSelect.addEventListener('change', () => {
  currentOffset = 0;
  loadAll();
});

async function loadFilespaces() {
  try {
    const data = await api('/api/filespaces');
    const fsList = data.filespaces || [];
    const current = filespaceSelect.value;
    // Preserve selection across refreshes.
    filespaceSelect.innerHTML = '<option value="">All Filespaces</option>';
    fsList.forEach(fs => {
      const opt = document.createElement('option');
      opt.value = fs;
      opt.textContent = fs;
      if (fs === current) opt.selected = true;
      filespaceSelect.appendChild(opt);
    });
  } catch (e) {
    console.error('filespaces error:', e);
  }
}

// --- Time filter buttons ---
document.querySelectorAll('.time-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.time-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    currentSince = btn.dataset.since;
    currentOffset = 0;
    loadAll();
  });
});

// --- API helpers ---
async function api(path, params = {}) {
  const url = new URL(path, location.origin);
  Object.entries(params).forEach(([k, v]) => { if (v) url.searchParams.set(k, v); });
  const res = await fetch(url);
  return res.json();
}

function getFilters() {
  return {
    user: document.getElementById('filterUser').value,
    action: document.getElementById('filterAction').value,
    path: document.getElementById('filterPath').value,
    filespace: filespaceSelect.value,
    since: currentSince,
  };
}

function clearFilters() {
  document.getElementById('filterUser').value = '';
  document.getElementById('filterAction').value = '';
  document.getElementById('filterPath').value = '';
  filespaceSelect.value = '';
  currentOffset = 0;
  loadAll();
}

// --- Load data ---
async function loadStats() {
  try {
    const filters = getFilters();
    const data = await api('/api/stats', filters);
    document.getElementById('statTotal').textContent = (data.totalEvents || 0).toLocaleString();
    document.getElementById('statUsers').textContent = data.uniqueUsers || 0;
    document.getElementById('statFilespaces').textContent = data.filespaces || 0;

    if (data.oldestEvent && data.newestEvent) {
      const oldest = new Date(data.oldestEvent);
      const newest = new Date(data.newestEvent);
      document.getElementById('statRange').textContent =
        oldest.toLocaleDateString() + ' — ' + newest.toLocaleDateString();
    }
  } catch (e) {
    console.error('stats error:', e);
  }
}

async function loadEvents() {
  try {
    const filters = getFilters();
    const data = await api('/api/events', {
      ...filters,
      limit: PAGE_SIZE,
      offset: currentOffset,
    });

    totalEvents = data.total || 0;
    const events = data.events || [];
    const tbody = document.getElementById('eventsBody');

    if (events.length === 0) {
      tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;padding:30px;color:var(--dim)">No events found</td></tr>';
    } else {
      tbody.innerHTML = events.map(e => {
        const t = new Date(e.timestamp);
        const timeStr = t.toLocaleString();
        const actionClass = 'action-' + e.action;
        return '<tr>' +
          '<td title="' + e.timestamp + '">' + timeStr + '</td>' +
          '<td>' + esc(e.userName) + '</td>' +
          '<td><span class="action-badge ' + actionClass + '">' + esc(e.action) + '</span></td>' +
          '<td title="' + esc(e.entryPath) + '">' + esc(e.entryPath) + '</td>' +
          '<td>' + esc(e.fileName) + '</td>' +
          '<td>' + esc(e.filespace) + '</td>' +
          '</tr>';
      }).join('');
    }

    // Pager
    const start = totalEvents > 0 ? currentOffset + 1 : 0;
    const end = Math.min(currentOffset + events.length, totalEvents);
    document.getElementById('pagerInfo').textContent =
      start + '–' + end + ' of ' + totalEvents.toLocaleString();
    document.getElementById('prevBtn').disabled = currentOffset === 0;
    document.getElementById('nextBtn').disabled = currentOffset + PAGE_SIZE >= totalEvents;
  } catch (e) {
    console.error('events error:', e);
  }
}

const isDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
const actionColors = {
  FileRead: '#007aff', FileWritten: '#34c759', FileCreate: '#30d158',
  FileDelete: '#ff3b30', DirectoryCreate: '#00c7be', DirectoryDelete: '#ff453a',
  Move: '#ff9500', Pin: '#5856d6', Unpin: '#af52de',
  ExtendedAttributeSet: '#a2845e', ExtendedAttributeDelete: '#8e8e93',
};

async function loadTimeline() {
  try {
    const filters = getFilters();
    const data = await api('/api/histogram', filters);
    const buckets = data.buckets || [];

    const labels = buckets.map(b => {
      const d = new Date(b.time);
      return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) + ' ' +
             d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
    });
    const values = buckets.map(b => b.count);

    if (timelineChart) {
      timelineChart.data.labels = labels;
      timelineChart.data.datasets[0].data = values;
      timelineChart.update('none');
    } else {
      const ctx = document.getElementById('timelineChart').getContext('2d');
      timelineChart = new Chart(ctx, {
        type: 'bar',
        data: {
          labels,
          datasets: [{
            data: values,
            backgroundColor: isDark ? 'rgba(191,90,242,0.5)' : 'rgba(97,20,154,0.5)',
            borderColor: isDark ? '#bf5af2' : '#61149a',
            borderWidth: 1,
            borderRadius: 2,
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          animation: false,
          plugins: { legend: { display: false } },
          scales: {
            x: { display: true, ticks: { maxTicksLimit: 12, font: { size: 10 } }, grid: { display: false } },
            y: { display: true, beginAtZero: true, ticks: { font: { size: 10 } }, grid: { color: isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.05)' } }
          }
        }
      });
    }
  } catch (e) {
    console.error('timeline error:', e);
  }
}

async function loadActionCounts() {
  try {
    const filters = getFilters();
    const data = await api('/api/count', { field: 'action', ...filters });
    const counts = data.counts || {};
    const labels = Object.keys(counts);
    const values = Object.values(counts);
    const bgColors = labels.map(l => (actionColors[l] || '#8e8e93') + '99');

    if (actionChart) {
      actionChart.data.labels = labels;
      actionChart.data.datasets[0].data = values;
      actionChart.data.datasets[0].backgroundColor = bgColors;
      actionChart.update('none');
    } else {
      const ctx = document.getElementById('actionChart').getContext('2d');
      actionChart = new Chart(ctx, {
        type: 'doughnut',
        data: {
          labels,
          datasets: [{ data: values, backgroundColor: bgColors, borderWidth: 0 }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          animation: false,
          plugins: {
            legend: { position: 'right', labels: { boxWidth: 10, font: { size: 11 } } }
          }
        }
      });
    }
  } catch (e) {
    console.error('action counts error:', e);
  }
}

async function loadStatus() {
  try {
    const data = await api('/api/status');
    const dot = document.getElementById('statusDot');
    const text = document.getElementById('statusText');
    const watchers = data.watchers || [];
    const active = watchers.filter(w => w.running);

    if (active.length > 0) {
      dot.classList.add('active');
      const totalIngested = active.reduce((sum, w) => sum + (w.eventsIngested || 0), 0);
      const paths = active.map(w => w.mountPath).join(', ');
      text.textContent = 'Watching ' + active.length + ' filespace(s): ' + paths +
        ' (' + totalIngested.toLocaleString() + ' ingested)';
    } else {
      dot.classList.remove('active');
      text.textContent = 'Watcher stopped';
    }
  } catch (e) {
    document.getElementById('statusDot').classList.remove('active');
    document.getElementById('statusText').textContent = 'Connection error';
  }
}

let loadAllInFlight = false;
async function loadAll() {
  if (loadAllInFlight) return; // skip if previous refresh still running
  loadAllInFlight = true;
  try {
    await Promise.all([
      loadFilespaces(),
      loadStats(),
      loadEvents(),
      loadTimeline(),
      loadActionCounts(),
      loadStatus(),
    ]);
  } finally {
    loadAllInFlight = false;
  }
}

function prevPage() {
  currentOffset = Math.max(0, currentOffset - PAGE_SIZE);
  loadEvents();
}

function nextPage() {
  if (currentOffset + PAGE_SIZE < totalEvents) {
    currentOffset += PAGE_SIZE;
    loadEvents();
  }
}

function esc(s) {
  if (!s) return '';
  const d = document.createElement('div');
  d.textContent = s;
  return d.innerHTML;
}

// Enter key triggers search in filter inputs.
document.querySelectorAll('.filter-group input').forEach(input => {
  input.addEventListener('keydown', e => { if (e.key === 'Enter') loadEvents(); });
});

// Initial load + auto-refresh every 15 seconds.
loadAll();
setInterval(loadAll, 300000); // refresh every 5 minutes
</script>

</body>
</html>`
