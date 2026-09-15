/* ============================================================
   Dashboard de Campañas On-Site
   Lee data/latest.json (generado por scripts/fetch_data.py vía
   GitHub Actions) y arma tablas + gráficos 100% en el navegador.
   Sin build step, sin dependencias más que Chart.js (CDN).
   ============================================================ */

const CONFIG = {
  dataUrl: 'data/latest.json',
  locale: 'es-CL',
  currency: 'CLP',
  topNTipos: 4, // series simultáneas en el gráfico "por tipo de campaña"
};

const fmtInt = new Intl.NumberFormat(CONFIG.locale, { maximumFractionDigits: 0 });
const fmtMoney = new Intl.NumberFormat(CONFIG.locale, { style: 'currency', currency: CONFIG.currency, maximumFractionDigits: 0 });
const fmtPct = (x) => (isFinite(x) ? (x * 100).toFixed(1) + '%' : '—');

// Nombres amigables para "Tipo de campaña" (emarsys_campaign_id). Un tipo
// que no esté en este mapa se muestra tal cual viene de la hoja, para que
// nunca "desaparezca" un tipo nuevo que todavía no le pusimos alias.
const TIPO_LABELS = {
  'pers-overlay-pdp': 'Pop-up',
  'pers-pop-up-ext': 'Sticky',
  'pers-text-pdp': 'Texto PDP',
  'pers-banner-plp': 'Banner PLP',
  'pers-sticky-multiple': 'Sticky Multiple',
  'pers-banner-menu': 'Banner Menu',
};
function tipoLabel(id) { return TIPO_LABELS[id] || id; }

// ---------- Utilidades de fecha (siempre en horario LOCAL, nunca UTC) ----------
function toISO(d) {
  const y = d.getFullYear(), m = String(d.getMonth() + 1).padStart(2, '0'), day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}
function parseISO(iso) {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d);
}
function addDays(iso, n) {
  const d = parseISO(iso);
  d.setDate(d.getDate() + n);
  return toISO(d);
}
// Rango por defecto: día 1 del mes en curso hasta ayer (GA4 recién suele
// tener el día de hoy con datos incompletos). Si hoy es día 1, no hay
// "ayer" dentro del mes en curso — en ese caso el rango es solo hoy, para
// no terminar con "hasta" antes que "desde".
function defaultRange() {
  const today = new Date();
  const start = toISO(new Date(today.getFullYear(), today.getMonth(), 1));
  let end = toISO(new Date(today.getFullYear(), today.getMonth(), today.getDate() - 1));
  if (end < start) end = toISO(today);
  return { start, end };
}
function defaultComparePeriod(start, end) {
  const days = Math.round((parseISO(end) - parseISO(start)) / 86400000) + 1;
  const cmpEnd = addDays(start, -1);
  const cmpStart = addDays(cmpEnd, -(days - 1));
  return { start: cmpStart, end: cmpEnd };
}

// ---------- Colores (leídos de las variables CSS, respeta tema claro/oscuro) ----------
function cssVar(name) {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}
function palette() {
  return {
    series: [cssVar('--series-1'), cssVar('--series-2'), cssVar('--series-3'), cssVar('--series-4'), cssVar('--series-5')],
    other: cssVar('--series-other'),
    grid: cssVar('--gridline'),
    axis: cssVar('--baseline'),
    text: cssVar('--text-secondary'),
    tooltipBg: cssVar('--text-primary'),
    tooltipText: cssVar('--page-plane'),
    seq100: cssVar('--seq-100'),
    seq700: cssVar('--seq-700'),
  };
}

// ---------- Estado ----------
const state = {
  rows: [],
  generatedAt: null,
  marcas: [],
  tipos: [],
  filters: { start: null, end: null, marca: '', tipo: '' },
  compare: { enabled: false, start: null, end: null },
  charts: {}, // id -> Chart.js instance
  lastTableData: {}, // id -> {headers, rows, sortValues} para el toggle "ver como tabla"
  tableSort: {}, // tableId -> {index, dir} — se mantiene entre re-renders (cambios de filtro)
};

// ---------- Carga de datos ----------
async function loadData() {
  const res = await fetch(CONFIG.dataUrl, { cache: 'no-store' });
  if (!res.ok) throw new Error('No se pudo leer ' + CONFIG.dataUrl);
  const json = await res.json();
  state.rows = json.rows || [];
  state.generatedAt = json.generated_at || null;
  state.marcas = Array.from(new Set(state.rows.map(r => r.marca))).sort();
  state.tipos = Array.from(new Set(state.rows.map(r => r.campaignId))).sort();
}

// ---------- Filtrado ----------
function filterRows(rows, { start, end, marca, tipo }) {
  return rows.filter(r =>
    r.fecha >= start && r.fecha <= end &&
    (!marca || r.marca === marca) &&
    (!tipo || r.campaignId === tipo)
  );
}

// ---------- Agregaciones ----------
function aggregateByMarca(rows) {
  const m = new Map();
  rows.forEach(r => {
    if (!m.has(r.marca)) m.set(r.marca, { marca: r.marca, campañas: new Set(), ingresos: 0 });
    const g = m.get(r.marca);
    g.campañas.add(r.campaignName);
    g.ingresos += r.ingresos;
  });
  return Array.from(m.values()).map(g => ({
    marca: g.marca,
    qCampanas: g.campañas.size,
    ingresos: g.ingresos,
    ingresosPorCampana: g.campañas.size ? g.ingresos / g.campañas.size : 0,
  })).sort((a, b) => b.ingresos - a.ingresos);
}

function aggregateByCampaign(rows) {
  const m = new Map();
  rows.forEach(r => {
    const key = r.marca + '|' + r.campaignName + '|' + r.campaignId;
    if (!m.has(key)) m.set(key, { marca: r.marca, campaignName: r.campaignName, campaignId: r.campaignId, view: 0, click: 0, addToCart: 0, purchase: 0, ingresos: 0, dias: new Set() });
    const g = m.get(key);
    g.view += r.view; g.click += r.click; g.addToCart += r.addToCart; g.purchase += r.purchase; g.ingresos += r.ingresos;
    g.dias.add(r.fecha);
  });
  return Array.from(m.values()).map(g => ({
    ...g,
    diasActivo: g.dias.size, // días distintos con datos dentro del período filtrado
    ctr: g.view ? g.click / g.view : 0,
    pctCarrito: g.click ? g.addToCart / g.click : 0,
    pctCompra: g.addToCart ? g.purchase / g.addToCart : 0,
    conversionTotal: g.view ? g.purchase / g.view : 0,
  })).sort((a, b) => b.ingresos - a.ingresos);
}

function aggregateByTipo(rows) {
  const m = new Map();
  rows.forEach(r => {
    if (!m.has(r.campaignId)) m.set(r.campaignId, { campaignId: r.campaignId, campañas: new Set(), ingresos: 0 });
    const g = m.get(r.campaignId);
    g.campañas.add(r.marca + '|' + r.campaignName);
    g.ingresos += r.ingresos;
  });
  return Array.from(m.values()).map(g => ({
    campaignId: g.campaignId,
    qCampanas: g.campañas.size,
    ingresos: g.ingresos,
    ingresosPorCampana: g.campañas.size ? g.ingresos / g.campañas.size : 0,
  })).sort((a, b) => b.ingresos - a.ingresos);
}

function aggregateByDate(rows) {
  const m = new Map();
  rows.forEach(r => {
    if (!m.has(r.fecha)) m.set(r.fecha, { fecha: r.fecha, view: 0, click: 0, addToCart: 0, purchase: 0, ingresos: 0 });
    const g = m.get(r.fecha);
    g.view += r.view; g.click += r.click; g.addToCart += r.addToCart; g.purchase += r.purchase; g.ingresos += r.ingresos;
  });
  return Array.from(m.values()).sort((a, b) => a.fecha < b.fecha ? -1 : a.fecha > b.fecha ? 1 : 0);
}

// Serie diaria completa (sin huecos) entre start y end, alineada por índice de día.
function dailySeries(rows, start, end) {
  const byDate = new Map(aggregateByDate(rows).map(d => [d.fecha, d]));
  const out = [];
  let cursor = start, idx = 1;
  while (cursor <= end) {
    const g = byDate.get(cursor) || { view: 0, click: 0, addToCart: 0, purchase: 0, ingresos: 0 };
    out.push({ dayIndex: idx, fecha: cursor, ...g });
    cursor = addDays(cursor, 1);
    idx++;
  }
  return out;
}

function aggregateTipoPorDia(rows) {
  const totals = new Map();
  rows.forEach(r => totals.set(r.campaignId, (totals.get(r.campaignId) || 0) + r.ingresos));
  const ranked = Array.from(totals.entries()).sort((a, b) => b[1] - a[1]).map(e => e[0]);
  const top = ranked.slice(0, CONFIG.topNTipos);
  const topSet = new Set(top);
  const hayOtros = ranked.length > top.length;

  const perDateTipo = new Map();
  rows.forEach(r => {
    const label = topSet.has(r.campaignId) ? r.campaignId : 'Otros';
    if (!perDateTipo.has(r.fecha)) perDateTipo.set(r.fecha, new Map());
    const dayMap = perDateTipo.get(r.fecha);
    dayMap.set(label, (dayMap.get(label) || 0) + r.ingresos);
  });

  const fechas = Array.from(perDateTipo.keys()).sort();
  const labels = top.concat(hayOtros ? ['Otros'] : []);
  const series = labels.map(label => ({
    label: label === 'Otros' ? 'Otros' : tipoLabel(label),
    data: fechas.map(f => perDateTipo.get(f).get(label) || 0),
  }));
  return { fechas, series };
}

function aggregateMatrix(rows) {
  const marcas = new Set(), tipos = new Set();
  const cell = new Map();
  rows.forEach(r => {
    marcas.add(r.marca); tipos.add(r.campaignId);
    const key = r.marca + '|' + r.campaignId;
    if (!cell.has(key)) cell.set(key, { ingresos: 0, campañas: new Set() });
    const c = cell.get(key);
    c.ingresos += r.ingresos;
    c.campañas.add(r.campaignName);
  });
  return {
    marcas: Array.from(marcas).sort(),
    tipos: Array.from(tipos).sort(),
    get(marca, tipo) {
      const c = cell.get(marca + '|' + tipo);
      if (!c) return null;
      return { ingresos: c.ingresos, qCampanas: c.campañas.size, ingresosPorCampana: c.ingresos / c.campañas.size };
    },
  };
}

function deltaPct(actual, anterior) {
  if (!anterior) return actual ? Infinity : 0;
  return (actual - anterior) / anterior;
}

// Celda de variación lista para insertar en una tabla: neutral ('—' gris)
// cuando no hay período anterior con el que comparar, para no pintar de
// verde/rojo algo que en realidad es "sin dato".
function deltaCell(actual, anteriorExiste, anteriorValor) {
  if (!anteriorExiste) return { text: '—', cls: 'prev' };
  const dp = deltaPct(actual, anteriorValor);
  if (!isFinite(dp)) return { text: '—', cls: 'prev' };
  return { text: (dp >= 0 ? '▲ ' : '▼ ') + Math.abs(dp * 100).toFixed(1) + '%', cls: 'delta ' + (dp >= 0 ? 'up' : 'down') };
}

// ---------- Render: KPIs ----------
function renderKpis(rows, rowsCmp) {
  const totalIngresos = rows.reduce((s, r) => s + r.ingresos, 0);
  const qCampanas = new Set(rows.map(r => r.marca + '|' + r.campaignName)).size;
  const totalViews = rows.reduce((s, r) => s + r.view, 0);
  const totalClicks = rows.reduce((s, r) => s + r.click, 0);
  const ctr = totalViews ? totalClicks / totalViews : 0;

  let cmp = null;
  if (rowsCmp) {
    const ci = rowsCmp.reduce((s, r) => s + r.ingresos, 0);
    const cq = new Set(rowsCmp.map(r => r.marca + '|' + r.campaignName)).size;
    const cv = rowsCmp.reduce((s, r) => s + r.view, 0);
    const cc = rowsCmp.reduce((s, r) => s + r.click, 0);
    cmp = { ingresos: ci, qCampanas: cq, views: cv, ctr: cv ? cc / cv : 0 };
  }

  const kpis = [
    { label: 'Ingresos totales', value: fmtMoney.format(totalIngresos), delta: cmp ? deltaPct(totalIngresos, cmp.ingresos) : null },
    { label: 'Campañas', value: fmtInt.format(qCampanas), delta: cmp ? deltaPct(qCampanas, cmp.qCampanas) : null },
    { label: 'Views', value: fmtInt.format(totalViews), delta: cmp ? deltaPct(totalViews, cmp.views) : null },
    { label: 'CTR', value: fmtPct(ctr), delta: cmp ? deltaPct(ctr, cmp.ctr) : null },
  ];

  const wrap = document.getElementById('kpi-row');
  wrap.innerHTML = '';
  kpis.forEach(k => {
    const div = document.createElement('div');
    div.className = 'kpi';
    const label = document.createElement('div'); label.className = 'label'; label.textContent = k.label;
    const value = document.createElement('div'); value.className = 'value'; value.textContent = k.value;
    div.append(label, value);
    if (k.delta !== null && isFinite(k.delta)) {
      const delta = document.createElement('div');
      delta.className = 'delta ' + (k.delta >= 0 ? 'up' : 'down');
      delta.textContent = (k.delta >= 0 ? '▲ ' : '▼ ') + Math.abs(k.delta * 100).toFixed(1) + '% vs período anterior';
      div.appendChild(delta);
    }
    wrap.appendChild(div);
  });
}

// ---------- Render: tablas ----------
// Compara dos valores "crudos" (número o texto) para ordenar. Los valores
// vacíos/null (ej. "—" cuando no hay período anterior) siempre quedan al
// final, sin importar la dirección del orden.
function compareValues(a, b) {
  const aNull = a === null || a === undefined || a === '';
  const bNull = b === null || b === undefined || b === '';
  if (aNull && bNull) return 0;
  if (aNull) return 1;
  if (bNull) return -1;
  if (typeof a === 'number' && typeof b === 'number') {
    const na = isFinite(a) ? a : (a > 0 ? Number.MAX_VALUE : -Number.MAX_VALUE);
    const nb = isFinite(b) ? b : (b > 0 ? Number.MAX_VALUE : -Number.MAX_VALUE);
    return na - nb;
  }
  return String(a).localeCompare(String(b), CONFIG.locale, { numeric: true, sensitivity: 'base' });
}

// sortValues: arreglo paralelo a `rows`, mismo largo por fila, con el valor
// "crudo" (número o texto) de cada columna — se usa solo para ordenar, la
// celda que se ve en pantalla sigue siendo la de `rows` (ya formateada).
// tableId: string estable para recordar el orden elegido entre re-renders
// (cambios de filtro). Si se omiten sortValues/tableId, la tabla no es
// clickeable para ordenar (ej. cuando no hay valores crudos disponibles).
function buildTable(container, { headers, rows, totals, className, sortValues, tableId, showRank }) {
  const sortable = !!(sortValues && tableId);

  function render() {
    container.innerHTML = '';
    const table = document.createElement('table');
    table.className = 'data' + (className ? ' ' + className : '');

    const sortState = sortable ? state.tableSort[tableId] : null;
    let order = rows.map((_, i) => i);
    if (sortState) {
      order.sort((ia, ib) => {
        const cmp = compareValues(sortValues[ia][sortState.index], sortValues[ib][sortState.index]);
        return sortState.dir === 'asc' ? cmp : -cmp;
      });
    }

    const thead = document.createElement('thead');
    const trh = document.createElement('tr');
    if (showRank) {
      const thRank = document.createElement('th');
      thRank.className = 'rank';
      thRank.textContent = '#';
      trh.appendChild(thRank);
    }
    headers.forEach((h, i) => {
      const th = document.createElement('th');
      if (i === 0) th.className = 'txt';
      let label = h;
      if (sortable) {
        th.classList.add('sortable');
        if (sortState && sortState.index === i) label += sortState.dir === 'asc' ? ' ▲' : ' ▼';
        th.addEventListener('click', () => {
          const cur = state.tableSort[tableId];
          state.tableSort[tableId] = (cur && cur.index === i)
            ? { index: i, dir: cur.dir === 'desc' ? 'asc' : 'desc' }
            : { index: i, dir: 'desc' };
          render();
        });
      }
      th.textContent = label;
      trh.appendChild(th);
    });
    thead.appendChild(trh);
    table.appendChild(thead);

    const tbody = document.createElement('tbody');
    if (rows.length === 0) {
      const tr = document.createElement('tr');
      const td = document.createElement('td');
      td.colSpan = headers.length + (showRank ? 1 : 0);
      td.className = 'txt';
      td.textContent = 'Sin datos para este filtro.';
      tr.appendChild(td);
      tbody.appendChild(tr);
    }
    order.forEach((rowIdx, pos) => {
      const cells = rows[rowIdx];
      const tr = document.createElement('tr');
      if (showRank) {
        const tdRank = document.createElement('td');
        tdRank.className = 'rank';
        tdRank.textContent = String(pos + 1);
        tr.appendChild(tdRank);
      }
      cells.forEach((c, i) => {
        const td = document.createElement('td');
        if (i === 0) td.className = 'txt';
        if (c && c.cls) td.className = (td.className ? td.className + ' ' : '') + c.cls;
        td.textContent = c && typeof c === 'object' ? c.text : c;
        tr.appendChild(td);
      });
      tbody.appendChild(tr);
    });
    table.appendChild(tbody);

    if (totals) {
      const tfoot = document.createElement('tfoot');
      const tr = document.createElement('tr');
      if (showRank) { const td = document.createElement('td'); td.className = 'rank'; tr.appendChild(td); }
      totals.forEach((c, i) => {
        const td = document.createElement('td');
        if (i === 0) td.className = 'txt';
        td.textContent = c;
        tr.appendChild(td);
      });
      tfoot.appendChild(tr);
      table.appendChild(tfoot);
    }

    container.appendChild(table);
  }

  render();
}

function renderTablaGeneral(rows, rowsCmp) {
  const data = aggregateByMarca(rows);
  const cmpData = rowsCmp ? new Map(aggregateByMarca(rowsCmp).map(d => [d.marca, d])) : null;

  const headers = ['Marca', 'Q campañas', 'Ingresos', 'Ingresos/campaña'];
  const finalHeaders = cmpData
    ? ['Marca', 'Q campañas', 'Q camp. (ant.)', 'Ingresos', 'Ingresos (ant.)', 'Δ Ingresos', 'Ingresos/campaña', 'Ingresos/camp. (ant.)']
    : headers;

  const rowsOut = [];
  const sortValues = [];
  data.forEach(d => {
    if (!cmpData) {
      rowsOut.push([d.marca, fmtInt.format(d.qCampanas), fmtMoney.format(d.ingresos), fmtMoney.format(d.ingresosPorCampana)]);
      sortValues.push([d.marca, d.qCampanas, d.ingresos, d.ingresosPorCampana]);
      return;
    }
    const c = cmpData.get(d.marca);
    const dp = c ? deltaPct(d.ingresos, c.ingresos) : null;
    rowsOut.push([
      d.marca,
      fmtInt.format(d.qCampanas),
      { text: c ? fmtInt.format(c.qCampanas) : '—', cls: 'prev' },
      fmtMoney.format(d.ingresos),
      { text: c ? fmtMoney.format(c.ingresos) : '—', cls: 'prev' },
      deltaCell(d.ingresos, !!c, c ? c.ingresos : 0),
      fmtMoney.format(d.ingresosPorCampana),
      { text: c ? fmtMoney.format(c.ingresosPorCampana) : '—', cls: 'prev' },
    ]);
    sortValues.push([
      d.marca, d.qCampanas, c ? c.qCampanas : null, d.ingresos, c ? c.ingresos : null,
      dp,
      d.ingresosPorCampana, c ? c.ingresosPorCampana : null,
    ]);
  });

  const totalIngresos = data.reduce((s, d) => s + d.ingresos, 0);
  const totalCampanas = data.reduce((s, d) => s + d.qCampanas, 0);
  const totals = cmpData
    ? ['Total', fmtInt.format(totalCampanas), '', fmtMoney.format(totalIngresos), '', '', '', '']
    : ['Total', fmtInt.format(totalCampanas), fmtMoney.format(totalIngresos), ''];

  buildTable(document.getElementById('tabla-general'), { headers: finalHeaders, rows: rowsOut, totals, sortValues, tableId: 'tabla-general', showRank: true });
}

function renderTablaCampanas(rows, rowsCmp) {
  const data = aggregateByCampaign(rows);
  const cmpData = rowsCmp ? new Map(aggregateByCampaign(rowsCmp).map(d => [d.marca + '|' + d.campaignName + '|' + d.campaignId, d])) : null;

  const base = ['Marca', 'Campaña', 'Días activo', 'View', 'Click', 'CTR', 'Add to cart', '% Carrito', 'Purchase', '% Compra', 'Conv. total', 'Ingresos'];
  const headers = cmpData ? base.concat(['Ingresos (ant.)', 'Δ Ingresos']) : base;

  const rowsOut = [];
  const sortValues = [];
  data.forEach(d => {
    const row = [
      d.marca, d.campaignName, fmtInt.format(d.diasActivo),
      fmtInt.format(d.view), fmtInt.format(d.click), fmtPct(d.ctr),
      fmtInt.format(d.addToCart), fmtPct(d.pctCarrito),
      fmtInt.format(d.purchase), fmtPct(d.pctCompra), fmtPct(d.conversionTotal),
      fmtMoney.format(d.ingresos),
    ];
    const sv = [
      d.marca, d.campaignName, d.diasActivo,
      d.view, d.click, d.ctr,
      d.addToCart, d.pctCarrito,
      d.purchase, d.pctCompra, d.conversionTotal,
      d.ingresos,
    ];
    if (cmpData) {
      const c = cmpData.get(d.marca + '|' + d.campaignName + '|' + d.campaignId);
      row.push({ text: c ? fmtMoney.format(c.ingresos) : '—', cls: 'prev' });
      row.push(deltaCell(d.ingresos, !!c, c ? c.ingresos : 0));
      sv.push(c ? c.ingresos : null);
      sv.push(c ? deltaPct(d.ingresos, c.ingresos) : null);
    }
    rowsOut.push(row);
    sortValues.push(sv);
  });

  buildTable(document.getElementById('tabla-campanas'), { headers, rows: rowsOut, sortValues, tableId: 'tabla-campanas', showRank: true });
}

function renderTablaTipos(rows, rowsCmp) {
  const data = aggregateByTipo(rows);
  const cmpData = rowsCmp ? new Map(aggregateByTipo(rowsCmp).map(d => [d.campaignId, d])) : null;

  const base = ['Tipo de campaña', 'Q campañas', 'Ingresos', 'Ingresos/campaña'];
  const headers = cmpData ? base.concat(['Ingresos (ant.)', 'Δ Ingresos']) : base;

  const rowsOut = [];
  const sortValues = [];
  data.forEach(d => {
    const label = tipoLabel(d.campaignId);
    const row = [label, fmtInt.format(d.qCampanas), fmtMoney.format(d.ingresos), fmtMoney.format(d.ingresosPorCampana)];
    const sv = [label, d.qCampanas, d.ingresos, d.ingresosPorCampana];
    if (cmpData) {
      const c = cmpData.get(d.campaignId);
      row.push({ text: c ? fmtMoney.format(c.ingresos) : '—', cls: 'prev' });
      row.push(deltaCell(d.ingresos, !!c, c ? c.ingresos : 0));
      sv.push(c ? c.ingresos : null);
      sv.push(c ? deltaPct(d.ingresos, c.ingresos) : null);
    }
    rowsOut.push(row);
    sortValues.push(sv);
  });

  buildTable(document.getElementById('tabla-tipos'), { headers, rows: rowsOut, sortValues, tableId: 'tabla-tipos', showRank: true });
}

function mixColor(hexA, hexB, t) {
  const a = hexA.match(/\w\w/g).map(x => parseInt(x, 16));
  const b = hexB.match(/\w\w/g).map(x => parseInt(x, 16));
  const c = a.map((v, i) => Math.round(v + (b[i] - v) * t));
  return `rgb(${c[0]},${c[1]},${c[2]})`;
}

function renderMatriz(rows) {
  const mx = aggregateMatrix(rows);
  const pal = palette();
  let max = 0;
  mx.marcas.forEach(m => mx.tipos.forEach(t => {
    const c = mx.get(m, t);
    if (c && c.ingresosPorCampana > max) max = c.ingresosPorCampana;
  }));

  const container = document.getElementById('tabla-matriz');
  container.innerHTML = '';
  const table = document.createElement('table');
  table.className = 'data heatmap';

  const thead = document.createElement('thead');
  const trh = document.createElement('tr');
  const thCorner = document.createElement('th'); thCorner.className = 'txt'; thCorner.textContent = 'Marca \\ Tipo';
  trh.appendChild(thCorner);
  mx.tipos.forEach(t => { const th = document.createElement('th'); th.textContent = tipoLabel(t); trh.appendChild(th); });
  thead.appendChild(trh);
  table.appendChild(thead);

  const tbody = document.createElement('tbody');
  if (mx.marcas.length === 0) {
    const tr = document.createElement('tr');
    const td = document.createElement('td'); td.className = 'txt'; td.textContent = 'Sin datos para este filtro.';
    tr.appendChild(td); tbody.appendChild(tr);
  }
  mx.marcas.forEach(m => {
    const tr = document.createElement('tr');
    const tdLabel = document.createElement('td'); tdLabel.className = 'txt'; tdLabel.textContent = m;
    tr.appendChild(tdLabel);
    mx.tipos.forEach(t => {
      const c = mx.get(m, t);
      const td = document.createElement('td');
      td.className = 'cell' + (c ? '' : ' empty');
      if (c) {
        const norm = max ? c.ingresosPorCampana / max : 0;
        td.style.backgroundColor = mixColor(pal.seq100, pal.seq700, norm);
        td.style.color = norm > 0.55 ? '#fff' : '#0b0b0b';
        td.textContent = fmtMoney.format(Math.round(c.ingresosPorCampana));
        td.title = `${m} × ${tipoLabel(t)}: ${c.qCampanas} campaña(s), ${fmtMoney.format(c.ingresos)} en total`;
      } else {
        td.textContent = '—';
      }
      tr.appendChild(td);
    });
    tbody.appendChild(tr);
  });
  table.appendChild(tbody);
  container.appendChild(table);
}

// ---------- Render: gráficos ----------
function destroyChart(id) {
  if (state.charts[id]) { state.charts[id].destroy(); delete state.charts[id]; }
}

function baseLineOptions(pal) {
  return {
    responsive: true,
    maintainAspectRatio: false,
    interaction: { mode: 'index', intersect: false },
    plugins: {
      legend: { position: 'top', labels: { color: pal.text, boxWidth: 14, usePointStyle: true } },
      tooltip: {
        backgroundColor: pal.tooltipBg,
        titleColor: pal.tooltipText,
        bodyColor: pal.tooltipText,
        borderWidth: 0,
        padding: 8,
        cornerRadius: 6,
      },
    },
    scales: {
      x: { grid: { color: pal.grid }, ticks: { color: pal.text, maxRotation: 0, autoSkip: true } },
      y: { grid: { color: pal.grid }, ticks: { color: pal.text }, beginAtZero: true },
    },
    elements: { line: { borderWidth: 2, tension: 0.15 }, point: { radius: 0, hoverRadius: 4 } },
  };
}

function renderChartIngresos(rows, rowsCmp, start, end) {
  const pal = palette();
  destroyChart('ingresos');
  const ctx = document.getElementById('chart-ingresos').getContext('2d');

  let labels, datasets, tableRows, sortValues;
  if (rowsCmp) {
    const cur = dailySeries(rows, start, end);
    const cmpRange = defaultComparePeriod(start, end); // solo para largo; el período real ya viene filtrado
    const cmp = dailySeries(rowsCmp, state.compare.start, state.compare.end);
    const n = Math.min(cur.length, cmp.length);
    labels = Array.from({ length: n }, (_, i) => 'Día ' + (i + 1));
    datasets = [
      { label: 'Ingresos (actual)', data: cur.slice(0, n).map(d => d.ingresos), borderColor: pal.series[0], backgroundColor: pal.series[0] },
      { label: 'Ingresos (anterior)', data: cmp.slice(0, n).map(d => d.ingresos), borderColor: pal.series[0], borderDash: [6, 4], backgroundColor: pal.series[0] },
    ];
    tableRows = labels.map((l, i) => [l, fmtMoney.format(datasets[0].data[i]), fmtMoney.format(datasets[1].data[i])]);
    sortValues = labels.map((l, i) => [l, datasets[0].data[i], datasets[1].data[i]]);
    state.lastTableData['chart-ingresos'] = { headers: ['Período', 'Actual', 'Anterior'], rows: tableRows, sortValues };
  } else {
    const serie = dailySeries(rows, start, end);
    labels = serie.map(d => d.fecha);
    datasets = [{ label: 'Ingresos', data: serie.map(d => d.ingresos), borderColor: pal.series[0], backgroundColor: pal.series[0] }];
    state.lastTableData['chart-ingresos'] = {
      headers: ['Fecha', 'Ingresos'],
      rows: serie.map(d => [d.fecha, fmtMoney.format(d.ingresos)]),
      sortValues: serie.map(d => [d.fecha, d.ingresos]),
    };
  }

  const opts = baseLineOptions(pal);
  opts.plugins.tooltip.callbacks = { label: (c) => c.dataset.label + ': ' + fmtMoney.format(c.parsed.y) };
  state.charts.ingresos = new Chart(ctx, { type: 'line', data: { labels, datasets }, options: opts });
}

function renderChartEventos(rows, start, end) {
  const pal = palette();
  destroyChart('eventos');
  const ctx = document.getElementById('chart-eventos').getContext('2d');
  const serie = dailySeries(rows, start, end);
  const labels = serie.map(d => d.fecha);
  const specs = [
    { key: 'view', label: 'View', color: pal.series[0] },
    { key: 'click', label: 'Click', color: pal.series[1] },
    { key: 'addToCart', label: 'Add to cart', color: pal.series[2] },
    { key: 'purchase', label: 'Purchase', color: pal.series[3] },
  ];
  const datasets = specs.map(s => ({ label: s.label, data: serie.map(d => d[s.key]), borderColor: s.color, backgroundColor: s.color }));

  state.lastTableData['chart-eventos'] = {
    headers: ['Fecha', ...specs.map(s => s.label)],
    rows: serie.map((d, i) => [d.fecha, ...specs.map(s => fmtInt.format(d[s.key]))]),
    sortValues: serie.map(d => [d.fecha, ...specs.map(s => d[s.key])]),
  };

  const opts = baseLineOptions(pal);
  opts.plugins.tooltip.callbacks = { label: (c) => c.dataset.label + ': ' + fmtInt.format(c.parsed.y) };
  // Clic en un ítem de la leyenda prende/apaga ese evento — comportamiento
  // nativo de Chart.js (legend.onClick por defecto), lo dejamos explícito
  // y con cursor de mano para que se note que es clickeable. El eje Y se
  // reajusta solo a lo que quede visible.
  opts.plugins.legend.onClick = (evt, legendItem, legend) => {
    const chart = legend.chart;
    const idx = legendItem.datasetIndex;
    chart.setDatasetVisibility(idx, !chart.isDatasetVisible(idx));
    chart.update();
  };
  opts.plugins.legend.onHover = (evt) => { evt.native.target.style.cursor = 'pointer'; };
  opts.plugins.legend.onLeave = (evt) => { evt.native.target.style.cursor = 'default'; };
  state.charts.eventos = new Chart(ctx, { type: 'line', data: { labels, datasets }, options: opts });
}

function renderChartTiposTiempo(rows) {
  const pal = palette();
  destroyChart('tiposTiempo');
  const ctx = document.getElementById('chart-tipos-tiempo').getContext('2d');
  const { fechas, series } = aggregateTipoPorDia(rows);
  const colorFor = (label, i) => label === 'Otros' ? pal.other : pal.series[i % pal.series.length];
  const datasets = series.map((s, i) => ({ label: s.label, data: s.data, borderColor: colorFor(s.label, i), backgroundColor: colorFor(s.label, i) }));

  state.lastTableData['chart-tipos-tiempo'] = {
    headers: ['Fecha', ...series.map(s => s.label)],
    rows: fechas.map((f, i) => [f, ...series.map(s => fmtMoney.format(s.data[i]))]),
    sortValues: fechas.map((f, i) => [f, ...series.map(s => s.data[i])]),
  };

  const opts = baseLineOptions(pal);
  opts.plugins.tooltip.callbacks = { label: (c) => c.dataset.label + ': ' + fmtMoney.format(c.parsed.y) };
  state.charts.tiposTiempo = new Chart(ctx, { type: 'line', data: { labels: fechas, datasets }, options: opts });
}

// ---------- Toggle "ver como tabla" ----------
function wireTableToggles() {
  document.querySelectorAll('[data-table-toggle]').forEach(btn => {
    btn.addEventListener('click', () => {
      const chartId = btn.getAttribute('data-table-toggle');
      const canvas = document.getElementById(chartId);
      const box = canvas.closest('.chart-box') || canvas.parentElement;
      let tableEl = box.parentElement.querySelector('.inline-table-view');
      if (tableEl) {
        tableEl.remove();
        canvas.parentElement.hidden = false;
        btn.textContent = 'Ver como tabla';
        return;
      }
      const data = state.lastTableData[chartId];
      if (!data) return;
      const wrap = document.createElement('div');
      wrap.className = 'inline-table-view table-scroll';
      buildTable(wrap, { headers: data.headers, rows: data.rows, sortValues: data.sortValues, tableId: chartId + '-inline' });
      canvas.parentElement.hidden = true;
      canvas.parentElement.after(wrap);
      btn.textContent = 'Ver como gráfico';
    });
  });
}

// ---------- Orquestación ----------
function currentFilters() {
  const def = defaultRange();
  return {
    start: document.getElementById('f-start').value || def.start,
    end: document.getElementById('f-end').value || def.end,
    marca: document.getElementById('f-marca').value,
    tipo: document.getElementById('f-tipo').value,
  };
}

function renderAll() {
  const f = currentFilters();
  state.filters = f;

  const compareOn = document.getElementById('f-compare-on').checked;
  let cmpStart = null, cmpEnd = null;
  if (compareOn) {
    cmpStart = document.getElementById('f-cmp-start').value;
    cmpEnd = document.getElementById('f-cmp-end').value;
    if (!cmpStart || !cmpEnd) {
      const d = defaultComparePeriod(f.start, f.end);
      cmpStart = d.start; cmpEnd = d.end;
      document.getElementById('f-cmp-start').value = cmpStart;
      document.getElementById('f-cmp-end').value = cmpEnd;
    }
  }
  state.compare = { enabled: compareOn, start: cmpStart, end: cmpEnd };

  const rows = filterRows(state.rows, f);
  const rowsCmp = compareOn ? filterRows(state.rows, { ...f, start: cmpStart, end: cmpEnd }) : null;

  document.getElementById('general-chart-range').textContent = compareOn
    ? `${f.start} → ${f.end}  vs.  ${cmpStart} → ${cmpEnd}`
    : `${f.start} → ${f.end}`;

  renderKpis(rows, rowsCmp);
  renderChartIngresos(rows, rowsCmp, f.start, f.end);
  renderChartEventos(rows, f.start, f.end);
  renderTablaGeneral(rows, rowsCmp);

  renderChartTiposTiempo(rows);
  renderTablaCampanas(rows, rowsCmp);
  renderTablaTipos(rows, rowsCmp);
  renderMatriz(rows);
}

function wireFilters() {
  document.getElementById('f-start').addEventListener('change', renderAll);
  document.getElementById('f-end').addEventListener('change', renderAll);
  document.getElementById('f-marca').addEventListener('change', renderAll);
  document.getElementById('f-tipo').addEventListener('change', renderAll);

  const cmpOn = document.getElementById('f-compare-on');
  const cmpRange = document.getElementById('compare-range');
  cmpOn.addEventListener('change', () => {
    cmpRange.hidden = !cmpOn.checked;
    renderAll();
  });
  document.getElementById('f-cmp-start').addEventListener('change', renderAll);
  document.getElementById('f-cmp-end').addEventListener('change', renderAll);
}

function wireTabs() {
  const tabs = document.querySelectorAll('nav.tabs button');
  tabs.forEach(btn => {
    btn.addEventListener('click', () => {
      tabs.forEach(b => b.setAttribute('aria-selected', 'false'));
      btn.setAttribute('aria-selected', 'true');
      document.getElementById('tab-general').hidden = btn.dataset.tab !== 'general';
      document.getElementById('tab-campanas').hidden = btn.dataset.tab !== 'campanas';
    });
  });
}

function populateSelectOptions() {
  const marcaSel = document.getElementById('f-marca');
  state.marcas.forEach(m => {
    const opt = document.createElement('option'); opt.value = m; opt.textContent = m;
    marcaSel.appendChild(opt);
  });
  const tipoSel = document.getElementById('f-tipo');
  state.tipos.forEach(t => {
    const opt = document.createElement('option'); opt.value = t; opt.textContent = tipoLabel(t);
    tipoSel.appendChild(opt);
  });
}

async function init() {
  const def = defaultRange();
  document.getElementById('f-start').value = def.start;
  document.getElementById('f-end').value = def.end;

  wireTabs();
  wireFilters();
  wireTableToggles();
  try {
    await loadData();
  } catch (e) {
    document.getElementById('actualizado').textContent = 'No se pudieron cargar los datos (' + e.message + ')';
    return;
  }
  populateSelectOptions();
  document.getElementById('actualizado').textContent = state.generatedAt
    ? 'Datos actualizados: ' + new Date(state.generatedAt).toLocaleString(CONFIG.locale)
    : 'Datos cargados';
  renderAll();
}

document.addEventListener('DOMContentLoaded', init);
