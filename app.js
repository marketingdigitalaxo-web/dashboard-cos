/* ============================================================
   Dashboard de Campañas On-Site — estilos
   Tema oscuro navy + acento morado (inspirado en referencia "Dashdark X").
   Paleta y roles de color siguen la convención de la skill dataviz:
   variables por rol, no valores sueltos en el cuerpo del CSS. La paleta
   categórica de gráficos fue validada con scripts/validate_palette.js
   (Lightness band, Chroma floor, CVD separation, Normal-vision floor,
   Contraste vs. superficie) contra --surface-1 = #141a2e.
   ============================================================ */

:root {
  color-scheme: dark;
  --page-plane:     #0a0e1a;   /* fondo de página, el más oscuro */
  --surface-1:      #141a2e;   /* tarjetas / paneles */
  --surface-2:      #1b2340;   /* elementos anidados: inputs, hover de fila */
  --text-primary:   #ffffff;
  --text-secondary: #a8adc7;
  --text-muted:     #6b7094;
  --gridline:       #232a45;
  --baseline:       #323a5c;
  --border:         rgba(255,255,255,0.08);

  --accent:         #8b5cf6;   /* morado — color de destacar (UI, no serie) */
  --accent-strong:  #7c3aed;

  /* Paleta categórica de gráficos — validada contra --surface-1 */
  --series-1: #8b5cf6; /* morado  (serie principal, ej. ingresos) */
  --series-2: #d95926; /* naranjo */
  --series-3: #199e70; /* aqua    */
  --series-4: #c98500; /* ámbar   */
  --series-5: #3987e5; /* azul    */
  --series-other: #4a5178; /* "Otros" — gris azulado, fuera del set categórico */

  --status-good:      #22c55e;
  --status-warning:   #f5a623;
  --status-critical:  #ef4444;
  --status-good-bg:     rgba(34,197,94,0.15);
  --status-warning-bg:  rgba(245,166,35,0.15);
  --status-critical-bg: rgba(239,68,68,0.15);

  --seq-100: #1c2140;
  --seq-400: #5b3fa6;
  --seq-700: #7c3aed;

  --radius: 14px;
  --radius-sm: 9px;
  --font: system-ui, -apple-system, "Segoe UI", sans-serif;
}

/* Tema claro opcional (no hay switch en la UI todavía; queda disponible
   activando data-theme="light" en <html> si más adelante se agrega uno). */
:root[data-theme="light"] {
  color-scheme: light;
  --page-plane:     #f9f9f7;
  --surface-1:      #fcfcfb;
  --surface-2:      #f2f1ed;
  --text-primary:   #0b0b0b;
  --text-secondary: #52514e;
  --text-muted:     #898781;
  --gridline:       #e1e0d9;
  --baseline:       #c3c2b7;
  --border:         rgba(11,11,11,0.10);

  --accent:         #7c3aed;
  --accent-strong:  #6d28d9;

  --series-1: #7c3aed;
  --series-2: #eb6834;
  --series-3: #1baf7a;
  --series-4: #eda100;
  --series-5: #2a78d6;
  --series-other: #b8b6ae;

  --status-good: #0ca30c;
  --status-warning: #c97a00;
  --status-critical: #d03b3b;
  --status-good-bg:     rgba(12,163,12,0.12);
  --status-warning-bg:  rgba(201,122,0,0.12);
  --status-critical-bg: rgba(208,59,59,0.12);

  --seq-100: #e4dbfc;
  --seq-400: #9d6ef0;
  --seq-700: #5b21b6;
}

* { box-sizing: border-box; }

body {
  margin: 0;
  padding: 0;
  background: var(--page-plane);
  color: var(--text-primary);
  font-family: var(--font);
  font-size: 14px;
  line-height: 1.45;
}

.wrap {
  max-width: 1280px;
  margin: 0 auto;
  padding: 20px 16px 64px;
}

/* ---------- Encabezado ---------- */
header.top {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 8px;
  margin-bottom: 16px;
}
header.top h1 {
  font-size: 20px;
  margin: 0;
  color: var(--text-primary);
}
.actualizado {
  color: var(--text-muted);
  font-size: 12px;
}

/* ---------- Navegación (índice) ---------- */
nav.tabs {
  display: flex;
  gap: 4px;
  border-bottom: 1px solid var(--gridline);
  margin-bottom: 20px;
}
nav.tabs button {
  appearance: none;
  border: none;
  background: none;
  font: inherit;
  font-weight: 600;
  color: var(--text-secondary);
  padding: 10px 14px;
  cursor: pointer;
  border-radius: var(--radius-sm) var(--radius-sm) 0 0;
  border-bottom: 2px solid transparent;
  margin-bottom: -1px;
  transition: background .12s ease, color .12s ease;
}
nav.tabs button:hover {
  color: var(--text-primary);
  background: var(--surface-1);
}
nav.tabs button[aria-selected="true"] {
  color: var(--text-primary);
  background: var(--surface-1);
  border-bottom-color: var(--accent);
}

/* ---------- Filtros ---------- */
.filters {
  display: flex;
  align-items: flex-end;
  flex-wrap: wrap;
  gap: 14px;
  background: var(--surface-1);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  padding: 14px 16px;
  margin-bottom: 20px;
}
.filter-field {
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.filter-field label {
  font-size: 11px;
  text-transform: uppercase;
  letter-spacing: .03em;
  color: var(--text-muted);
}
.filter-field select,
.filter-field input[type="date"] {
  font: inherit;
  padding: 7px 10px;
  border-radius: var(--radius-sm);
  border: 1px solid var(--baseline);
  background: var(--surface-2);
  color: var(--text-primary);
  min-width: 140px;
  color-scheme: inherit;
}
.filter-field select:focus,
.filter-field input[type="date"]:focus {
  outline: none;
  border-color: var(--accent);
  box-shadow: 0 0 0 3px color-mix(in srgb, var(--accent) 25%, transparent);
}
.filter-field.compare-toggle {
  flex-direction: row;
  align-items: center;
  gap: 6px;
}
.filter-field.compare-toggle label {
  text-transform: none;
  font-size: 13px;
  color: var(--text-primary);
}
.filter-field.compare-toggle input[type="checkbox"] {
  accent-color: var(--accent);
  width: 15px;
  height: 15px;
}
.compare-range {
  display: flex;
  gap: 10px;
  align-items: flex-end;
}
.compare-range[hidden] { display: none; }

/* ---------- Tarjetas / KPIs ---------- */
.kpi-row {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
  gap: 12px;
  margin-bottom: 20px;
}
.kpi {
  background: var(--surface-1);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  padding: 16px 18px;
}
.kpi .label {
  color: var(--text-muted);
  font-size: 12px;
  margin-bottom: 8px;
}
.kpi .value {
  font-size: 26px;
  font-weight: 700;
  font-variant-numeric: proportional-nums;
  color: var(--text-primary);
}
.kpi .delta {
  display: inline-flex;
  align-items: center;
  gap: 3px;
  font-size: 11px;
  font-weight: 600;
  margin-top: 8px;
  padding: 3px 8px;
  border-radius: 999px;
}
.kpi .delta.up   { color: var(--status-good);     background: var(--status-good-bg); }
.kpi .delta.down { color: var(--status-critical);  background: var(--status-critical-bg); }
.kpi .delta.prev { color: var(--text-muted);       background: var(--surface-2); }

/* ---------- Tarjeta de gráfico ---------- */
.card {
  background: var(--surface-1);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  padding: 16px;
  margin-bottom: 20px;
}
.card-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  margin-bottom: 10px;
}
.card-head h2 {
  font-size: 15px;
  margin: 0;
  color: var(--text-primary);
}
.card-head .sub {
  color: var(--text-muted);
  font-size: 12px;
}
.chart-row {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 16px;
}
@media (max-width: 760px) {
  .chart-row { grid-template-columns: 1fr; }
}
.chart-box { position: relative; height: 220px; }
.chart-box canvas { max-width: 100%; }

.link-btn {
  background: none;
  border: none;
  color: var(--accent);
  font: inherit;
  font-size: 12px;
  cursor: pointer;
  padding: 0;
  text-decoration: underline;
}
.link-btn:hover { color: var(--accent-strong); }

/* ---------- Tablas ---------- */
.table-scroll {
  overflow-x: auto;
}
table.data {
  border-collapse: collapse;
  width: 100%;
  font-size: 13px;
}
table.data caption {
  text-align: left;
  color: var(--text-muted);
  font-size: 12px;
  margin-bottom: 6px;
}
table.data th, table.data td {
  padding: 8px 10px;
  border-bottom: 1px solid var(--gridline);
  text-align: right;
  white-space: nowrap;
  font-variant-numeric: tabular-nums;
  color: var(--text-primary);
}
table.data th:first-child, table.data td:first-child,
table.data th.txt, table.data td.txt {
  text-align: left;
  font-variant-numeric: normal;
}
table.data th.sortable {
  cursor: pointer;
  user-select: none;
  white-space: nowrap;
}
table.data th.sortable:hover { color: var(--text-primary); }
table.data td.rank, table.data th.rank {
  text-align: center;
  color: var(--text-muted);
  font-variant-numeric: tabular-nums;
  width: 1%;
}

/* "Resumen por campaña" puede tener cientos de filas — se deja un alto
   fijo (~10 filas) con scroll interno propio y encabezado siempre
   visible, para que la pestaña "Campañas" no quede kilométrica. */
#tabla-campanas {
  max-height: 430px;
  overflow-y: auto;
}
table.data thead th {
  color: var(--text-secondary);
  font-weight: 600;
  border-bottom: 1px solid var(--baseline);
  position: sticky;
  top: 0;
  background: var(--surface-1);
}
table.data tbody tr:hover { background: var(--surface-2); }
table.data td.prev { color: var(--text-muted); }
table.data td.delta.up { color: var(--status-good); }
table.data td.delta.down { color: var(--status-critical); }
table.data tfoot td {
  font-weight: 700;
  border-top: 1px solid var(--baseline);
  border-bottom: none;
}

/* ---------- Heatmap (Marca x Tipo) ---------- */
table.heatmap td.cell {
  text-align: center;
  color: #fff;
  font-variant-numeric: tabular-nums;
  min-width: 90px;
  border-radius: 6px;
}
table.heatmap td.cell.empty {
  color: var(--text-muted);
  background: var(--surface-1) !important;
}

/* ---------- Tooltip de gráfico (Chart.js custom) ---------- */
.chart-tooltip {
  position: absolute;
  pointer-events: none;
  background: var(--text-primary);
  color: var(--page-plane);
  border-radius: 8px;
  padding: 8px 10px;
  font-size: 12px;
  transform: translate(-50%, -110%);
  transition: opacity .08s ease;
  z-index: 5;
  white-space: nowrap;
  box-shadow: 0 8px 24px rgba(0,0,0,0.35);
}
.chart-tooltip .row { display: flex; align-items: center; gap: 6px; margin-top: 2px; }
.chart-tooltip .swatch { width: 10px; height: 2px; display: inline-block; }
.chart-tooltip .val { font-weight: 700; margin-left: auto; padding-left: 10px; }

/* ---------- Estado vacío ---------- */
.empty-state {
  color: var(--text-muted);
  text-align: center;
  padding: 30px 10px;
  font-size: 13px;
}

footer.note {
  color: var(--text-muted);
  font-size: 11px;
  margin-top: 24px;
}
