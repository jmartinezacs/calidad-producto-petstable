// =====================================================================
// Resultados: análisis gráfico por receta y método, y Detalle de resultados.
// Flujo reactivo: filtro → conjunto filtrado → cálculos → gráficas → medias → tabla.
// Gráficas, conteos, medias y tabla usan SIEMPRE el mismo conjunto filtrado;
// la paginación (20 filas) solo afecta a la tabla.
// =====================================================================
import {
  esc, icon, refreshIcons, toast, emptyState, errorState, fmtDate, fmtNum, todayISO, fechaLote,
  dictamenPill, refLabel, resultadoTxt, tipoLabel, criterio, getCatalogos, getResultados, makeChart, destroyCharts,
  toCSV, descargar, cssVar, fmtValor, prefs, mesLargo, recetaTxt, getDirectorio, personaHTML, especieIco, especieImg,
} from '../core.js';

const POR_PAGINA = 20;
let root = null, token = 0, filas = [], pagina = 1, cat = null, dir = null;

export default {
  async render(el, params = {}) {
    root = el; pagina = 1;
    el.innerHTML = `
      <section class="page-intro">
        <div><span class="eyebrow">Calidad de producto</span><h1>Resultados</h1>
          <p>Tendencia histórica por receta, área y método, con límites de especificación y media del periodo filtrado.</p></div>
        <div class="page-actions"><button class="btn c-sheets" data-r="csv">${icon('file-spreadsheet')} Exportar</button></div>
      </section>
      <div class="card filtros-card">
        <div class="filtros">
          <div class="field"><label for="r-periodo">Periodo</label><select id="r-periodo"><option value="">Todo el histórico</option></select></div>
          <div class="field"><label for="r-receta">Receta</label><select id="r-receta"><option value="">Todas las recetas</option></select></div>
          <div class="field"><label for="r-area">Área de análisis</label><select id="r-area"><option value="">Todas las áreas</option></select></div>
          <div class="field"><label for="r-metodo">Método</label><select id="r-metodo"><option value="">Todos los métodos</option></select></div>
          <button class="btn ghost" data-r="limpiar">${icon('filter-x')} Limpiar filtros</button>
        </div>
        <div class="filtros-resumen" id="r-resumen"></div>
      </div>
      <div id="r-graficas" class="mt"></div>
      <section class="card mt">
        <div class="card-head"><div><h3>Detalle de resultados</h3><p>Mismo conjunto filtrado que las gráficas · ${POR_PAGINA} registros por página</p></div></div>
        <div id="r-tabla"></div>
      </section>`;
    el.addEventListener('click', onClick);
    el.querySelector('#r-periodo').addEventListener('change', aplicar);
    el.querySelectorAll('#r-receta, #r-area').forEach((s) => s.addEventListener('change', () => { llenarMetodos(); aplicar(); }));
    el.querySelector('#r-metodo').addEventListener('change', aplicar);
    await cargar(params);
  },
  destroy() { token++; root = null; },
};

async function cargar(params = {}) {
  const t = ++token;
  root.querySelector('#r-graficas').innerHTML = `<div class="trend-grid">${'<div class="card"><div class="skeleton" style="width:40%"></div><div class="skeleton mt" style="height:260px"></div></div>'.repeat(2)}</div>`;
  try {
    const [c, rows, d] = await Promise.all([getCatalogos({ force: true }), getResultados(), getDirectorio()]);
    if (t !== token || !root) return;
    cat = c; dir = d;
    filas = rows.map((r) => {
      const m = r.brom_muestras;
      return {
        ...r, lote: m.lote, receta_id: m.receta_id, fecha: fechaLote(m.fecha_analisis),
        receta: cat.recetas.find((x) => x.id === m.receta_id) || { codigo: '—', nombre_receta: 'Receta no disponible', color: '#64748B' },
        metodo: criterio(cat.metodos.find((x) => x.id === r.metodo_id), cat.spec(m.receta_id, r.metodo_id)),
        area: cat.area(cat.metodos.find((x) => x.id === r.metodo_id)?.area),
      };
    });
    llenarFiltros(params);
    aplicar();
  } catch (err) {
    if (t !== token || !root) return;
    console.error(err);
    root.querySelector('#r-graficas').innerHTML = `<div class="card">${errorState(err).replace('data-action="retry"', 'data-r="retry"')}</div>`;
    root.querySelector('#r-tabla').innerHTML = '';
    refreshIcons();
  }
}

function llenarFiltros(params) {
  const per = root.querySelector('#r-periodo'), rec = root.querySelector('#r-receta');
  const meses = [...new Set(filas.map((f) => f.fecha.slice(0, 7)).filter(Boolean))].sort().reverse();
  const anios = [...new Set(meses.map((m) => m.slice(0, 4)))];
  per.innerHTML = '<option value="">Todo el histórico</option><option value="d90">Últimos 90 días</option><option value="d180">Últimos 180 días</option>'
    + anios.map((a) => `<option value="y${a}">Año ${a}</option>`).join('')
    + meses.map((m) => `<option value="m${m}">${esc(mesLargo(m))}</option>`).join('');
  const usadas = new Set(filas.map((f) => f.receta_id));
  rec.innerHTML = '<option value="">Todas las recetas</option>' + cat.recetas.filter((r) => usadas.has(r.id))
    .map((r) => `<option value="${esc(r.id)}">${esc(recetaTxt(r))}</option>`).join('');
  const areasUsadas = new Set(filas.map((f) => f.area.id));
  root.querySelector('#r-area').innerHTML = '<option value="">Todas las áreas</option>' + cat.areas.filter((a) => areasUsadas.has(a.id))
    .map((a) => `<option value="${esc(a.id)}">${esc(a.nombre)}</option>`).join('');
  guardadoArea(params.area);
  const guardado = (k, sel, v) => { if (v && [...sel.options].some((o) => o.value === v)) sel.value = v; };
  guardado('per', per, params.periodo ?? prefs.get('brom.res.periodo'));
  guardado('rec', rec, params.receta);
  llenarMetodos(params.metodo);
}

function guardadoArea(v) { const s = root.querySelector('#r-area'); if (v && [...s.options].some((o) => o.value === v)) s.value = v; }

// El filtro de método muestra solo los métodos con resultados en la receta y el área elegidas
function llenarMetodos(preferido) {
  const sel = root.querySelector('#r-metodo');
  const prev = preferido || sel.value;
  const rec = root.querySelector('#r-receta').value, area = root.querySelector('#r-area').value;
  const ids = new Set(filas.filter((f) => (!rec || f.receta_id === rec) && (!area || f.area.id === area)).map((f) => f.metodo_id));
  const metodos = cat.metodos.filter((m) => ids.has(m.id));
  sel.innerHTML = '<option value="">Todos los métodos</option>' + metodos.map((m) => `<option value="${esc(m.id)}">${esc(m.metodo)}</option>`).join('');
  sel.value = metodos.some((m) => m.id === prev) ? prev : '';
}

function enPeriodo(fecha, p) {
  if (!p) return true;
  if (p[0] === 'm') return fecha.startsWith(p.slice(1));
  if (p[0] === 'y') return fecha.startsWith(p.slice(1));
  const dias = Number(p.slice(1));
  const d = new Date(`${todayISO()}T12:00:00Z`); d.setUTCDate(d.getUTCDate() - dias + 1);
  return fecha >= d.toISOString().slice(0, 10);
}

function filtradas() {
  const p = root.querySelector('#r-periodo').value, rec = root.querySelector('#r-receta').value, met = root.querySelector('#r-metodo').value;
  const area = root.querySelector('#r-area').value;
  return filas.filter((f) => enPeriodo(f.fecha, p) && (!rec || f.receta_id === rec) && (!area || f.area.id === area) && (!met || f.metodo_id === met));
}

// Cambio de filtro: todo se recalcula y la tabla vuelve a la primera página
function aplicar() {
  if (!root || !cat) return;
  prefs.set('brom.res.periodo', root.querySelector('#r-periodo').value);
  pagina = 1;
  const datos = filtradas();
  resumen(datos);
  graficas(datos);
  tabla(datos);
}

function resumen(datos) {
  const ok = datos.filter((d) => d.cumple === true).length, no = datos.filter((d) => d.cumple === false).length;
  const pend = datos.length - ok - no;
  const lotes = new Set(datos.map((d) => d.muestra_id)).size;
  const pct = ok + no ? Math.round((ok / (ok + no)) * 1000) / 10 : null;
  root.querySelector('#r-resumen').innerHTML = `
    <span class="chip-stat">${icon('layers')} <b>${fmtNum(lotes)}</b> ${lotes === 1 ? 'lote' : 'lotes'}</span>
    <span class="chip-stat">${icon('flask-conical')} <b>${fmtNum(datos.length)}</b> ${datos.length === 1 ? 'resultado' : 'resultados'}</span>
    <span class="chip-stat ok">${icon('check')} <b>${fmtNum(ok)}</b> cumplen</span>
    <span class="chip-stat bad">${icon('x')} <b>${fmtNum(no)}</b> no cumplen</span>
    ${pend ? `<span class="chip-stat warn">${icon('hourglass')} <b>${fmtNum(pend)}</b> pendientes</span>` : ''}
    ${pct !== null ? `<span class="chip-stat info">${icon('percent')} <b>${pct.toLocaleString('es-MX')} %</b> de cumplimiento</span>` : ''}`;
  refreshIcons();
}

// ---------------------------------------------------------------------
// Gráficas
// ---------------------------------------------------------------------
const stats = (vals) => {
  const n = vals.length;
  if (!n) return null;
  const media = vals.reduce((a, b) => a + b, 0) / n; // x̄ = (Σ xᵢ) / n
  const de = n > 1 ? Math.sqrt(vals.reduce((a, b) => a + (b - media) ** 2, 0) / (n - 1)) : 0;
  return { n, media, de, min: Math.min(...vals), max: Math.max(...vals) };
};

// Etiquetas de valor solo en puntos representativos y sin encimarse.
// No se elimina ningún punto: solo se omite su etiqueta.
const etiquetasRepresentativas = {
  id: 'bromEtiquetasLinea',
  afterDatasetsDraw(chart) {
    const ds = chart.data.datasets[0];
    if (!ds?._etiquetas) return;
    const meta = chart.getDatasetMeta(0);
    const { ctx, chartArea } = chart;
    const zoom = !!chart.canvas.dataset.zoom;
    const n = ds.data.length;
    const max = Math.max(2, Math.floor((chartArea.right - chartArea.left) / (zoom ? 70 : 58)));
    const idx = new Set();
    if (n <= max) for (let i = 0; i < n; i++) idx.add(i);
    else for (let k = 0; k < max; k++) idx.add(Math.round((k * (n - 1)) / (max - 1)));
    // Siempre se etiquetan los puntos fuera de especificación, el mínimo y el máximo
    (ds._fuera || []).forEach((i) => idx.add(i));
    const nums = ds.data.map((v) => (typeof v === 'number' ? v : null));
    const validos = nums.filter((v) => v !== null);
    if (validos.length) { idx.add(nums.indexOf(Math.max(...validos))); idx.add(nums.indexOf(Math.min(...validos))); }
    ctx.save();
    ctx.font = `700 ${zoom ? 13 : 10.5}px Inter, Segoe UI, system-ui, sans-serif`;
    ctx.textAlign = 'center'; ctx.textBaseline = 'bottom';
    const cajas = [];
    [...idx].sort((a, b) => (ds._fuera?.includes(b) ? 1 : 0) - (ds._fuera?.includes(a) ? 1 : 0) || a - b).forEach((i) => {
      const el = meta.data[i], v = ds.data[i];
      if (!el || v === null || v === undefined || el.skip) return;
      const txt = ds._cualitativo ? (v === 1 ? 'Positivo' : 'Negativo') : fmtValor(v, 3);
      const w = ctx.measureText(txt).width + 6, h = zoom ? 16 : 13;
      let y = el.y - 7;
      if (y - h < chartArea.top) y = el.y + h + 7;
      // Dentro del área de la gráfica: no se corta en los bordes ni tapa el eje
      const x = Math.min(Math.max(el.x, chartArea.left + w / 2), chartArea.right - w / 2 + 14);
      const caja = { x1: x - w / 2, x2: x + w / 2, y1: y - h, y2: y };
      if (cajas.some((c) => c.x1 < caja.x2 && caja.x1 < c.x2 && c.y1 < caja.y2 && caja.y1 < c.y2)) return;
      cajas.push(caja);
      ctx.fillStyle = ds._fuera?.includes(i) ? (cssVar('--bad') || '#C42F37') : (cssVar('--text') || '#172431');
      ctx.fillText(txt, x, y);
    });
    ctx.restore();
  },
};

function graficas(datos) {
  destroyCharts();
  const box = root.querySelector('#r-graficas');
  if (!filas.length) {
    box.innerHTML = `<div class="card">${emptyState({ ico: 'line-chart', title: 'Aún no hay resultados', text: 'Registra lotes con resultados para ver aquí su tendencia.' })}</div>`;
    refreshIcons(); return;
  }
  if (!datos.length) {
    box.innerHTML = `<div class="card">${emptyState({ ico: 'search-x', title: 'Sin resultados para los filtros', text: 'Cambia el periodo, la receta, el área o el método.' })}</div>`;
    refreshIcons(); return;
  }
  // Agrupación: receta → método (en el orden del catálogo: área y orden del método)
  const porReceta = new Map();
  datos.forEach((d) => {
    if (!porReceta.has(d.receta_id)) porReceta.set(d.receta_id, { receta: d.receta, metodos: new Map(), n: 0 });
    const g = porReceta.get(d.receta_id);
    g.n++;
    if (!g.metodos.has(d.metodo_id)) g.metodos.set(d.metodo_id, []);
    g.metodos.get(d.metodo_id).push(d);
  });
  const posMetodo = (id) => cat.metodos.findIndex((m) => m.id === id);
  const grupos = [...porReceta.values()].sort((a, b) => String(a.receta.codigo).localeCompare(String(b.receta.codigo), 'es'));
  const pendientes = [];
  box.innerHTML = grupos.map((g, gi) => {
    const metodos = [...g.metodos.values()].sort((a, b) => posMetodo(a[0].metodo_id) - posMetodo(b[0].metodo_id));
    return `<div class="receta-sep" style="--rc:${esc(g.receta.color || '#F58020')}"><b>${esc(g.receta.nombre_receta)}</b><span class="rs-cod">${esc(g.receta.codigo)}</span>
        ${g.receta.especie ? `<span class="rs-especie">${especieImg(g.receta.especie, "sm")}${esc(g.receta.especie)}</span>` : ''}
        <span class="rs-count">${fmtNum(g.n)} ${g.n === 1 ? 'resultado' : 'resultados'} · ${metodos.length} ${metodos.length === 1 ? 'método' : 'métodos'}</span></div>
      <div class="trend-grid">${metodos.map((items, mi) => {
        const id = `tr-${gi}-${mi}`;
        pendientes.push([id, items]);
        return tarjetaGrafica(id, items);
      }).join('')}</div>`;
  }).join('');
  refreshIcons();
  pendientes.forEach(([id, items]) => (items[0].metodo.tipo_resultado === 'numerico' ? dibujar(id, items) : dibujarCumplimiento(id, items)));
}

function tarjetaGrafica(id, items) {
  const m = items[0].metodo;
  const num = m.tipo_resultado === 'numerico';
  const vals = items.map((i) => Number(i.resultado)).filter((v) => num && Number.isFinite(v));
  const s = stats(vals);
  const ok = items.filter((i) => i.cumple === true).length, no = items.filter((i) => i.cumple === false).length;
  const pct = ok + no ? Math.round((ok / (ok + no)) * 100) : null;
  const u = m.unidades ? ` ${m.unidades}` : '';
  return `<div class="card trend-card ${num ? '' : 'trend-cumple'}">
    <div class="card-head"><div><h3>${esc(m.metodo)}</h3><p><span class="area-dot" style="--ac:${esc(items[0].area.color)}"></span>${esc(items[0].area.nombre)} · ${esc(refLabel(m))}${m.particular ? ' (específico de la receta)' : ''}</p></div>
      ${pct !== null ? `<span class="pill ${no ? 'bad' : 'ok'}">${pct} % cumple</span>` : ''}</div>
    <div class="trend-stats">
      <span><small>Registros</small><b>${fmtNum(items.length)}</b></span>
      ${s ? `<span class="media"><small>Media</small><b>${fmtValor(s.media, 3)}${esc(u)}</b></span>
      <span><small>Desviación estándar</small><b>${fmtValor(s.de, 3)}</b></span>
      <span><small>Mínimo y máximo</small><b>${fmtValor(s.min, 3)} – ${fmtValor(s.max, 3)}</b></span>` : `<span class="ok-stat"><small>Cumplen</small><b>${fmtNum(ok)}</b></span>`}
      <span class="${no ? 'bad' : ''}"><small>Fuera de especificación</small><b>${fmtNum(no)}</b></span>
    </div>
    <div tabindex="0" title="Ampliar gráfica" class="chart-box ${num ? 'trend-box' : 'sm'}"><canvas id="${id}" role="img" aria-label="${num ? 'Tendencia' : 'Cumplimiento'} de ${esc(m.metodo)} en ${esc(items[0].receta.nombre_receta)}"></canvas></div>
  </div>`;
}

// Métodos de verificación o cualitativos: porcentaje de lotes que cumplen
function dibujarCumplimiento(id, items) {
  const ok = items.filter((i) => i.cumple === true).length, no = items.filter((i) => i.cumple === false).length;
  const pend = items.length - ok - no;
  const etiquetas = ['Cumple', 'No cumple', 'Pendiente'], valores = [ok, no, pend], colores = ['#16A34A', '#E0464E', '#F59E0B'];
  const usar = valores.map((v, i) => i).filter((i) => valores[i] > 0);
  makeChart(document.getElementById(id), {
    type: 'doughnut',
    data: { labels: usar.map((i) => etiquetas[i]), datasets: [{ data: usar.map((i) => valores[i]), backgroundColor: usar.map((i) => colores[i]), _porcentaje: true,
      _centro: { valor: ok + no ? `${Math.round((ok / (ok + no)) * 1000) / 10} %` : '—', etiqueta: 'Cumplen', color: no ? '#E0464E' : '#16A34A' } }] },
    options: {
      plugins: {
        legend: { position: 'bottom' },
        tooltip: { callbacks: { label: (c) => ` ${c.label}: ${fmtNum(c.raw)} ${c.raw === 1 ? 'lote' : 'lotes'} (${Math.round((c.raw / items.length) * 1000) / 10} %)` } },
      },
    },
  });
}

const fechaCompleta = (iso) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`;
function dibujar(id, items0) {
  const items = [...items0].sort((a, b) => (a.fecha === b.fecha ? String(a.created_at).localeCompare(String(b.created_at)) : a.fecha.localeCompare(b.fecha)));
  const m = items[0].metodo;
  const color = items[0].receta.color || '#F58020';
  const valores = items.map((i) => (Number.isFinite(Number(i.resultado)) && i.resultado !== null ? Number(i.resultado) : null));
  // Arreglo (no Set): la gráfica ampliada copia los datos como JSON
  const fuera = items.map((it, i) => (it.cumple === false ? i : -1)).filter((i) => i >= 0);
  const rojo = '#E0464E', turq = '#0891B2';
  const datasets = [{
    label: m.metodo, data: valores, borderColor: color, backgroundColor: color, _area: true,
    borderWidth: 2.6, cubicInterpolationMode: 'monotone', spanGaps: true, borderCapStyle: 'round',
    pointRadius: items.map((_, i) => (fuera.includes(i) ? 5 : 3)), pointHoverRadius: 7,
    pointBackgroundColor: items.map((_, i) => (fuera.includes(i) ? rojo : color)), pointBorderColor: '#fff', pointBorderWidth: 1.2,
    _etiquetas: true, _fuera: fuera, _cualitativo: false,
  }];
  const linea = (label, v, c, dash) => ({ label, data: items.map(() => v), borderColor: c, backgroundColor: c, borderDash: dash, borderWidth: 1.8, pointRadius: 0, pointHoverRadius: 0, pointStyle: 'line', fill: false });
  const p = m.parametro_referencia || 'ninguno';
  const refs = [];
  if (m.valor_referencia !== null && m.valor_referencia !== undefined && p !== 'ninguno') {
    const ref = Number(m.valor_referencia);
    const nombre = { minimo: 'Límite mínimo', maximo: 'Límite máximo', exacto: 'Valor exacto', rango: 'Límite inferior' }[p] || 'Referencia';
    datasets.push(linea(`${nombre} (${fmtValor(ref)})`, ref, rojo, [7, 5])); refs.push(ref);
    if (p === 'rango' && m.valor_referencia_max !== null) {
      const mx = Number(m.valor_referencia_max);
      datasets.push(linea(`Límite superior (${fmtValor(mx)})`, mx, '#9333EA', [7, 5])); refs.push(mx);
    }
  }
  const vals = valores.filter((v) => v !== null);
  const s = stats(vals);
  if (s) { datasets.push(linea(`Media (${fmtValor(s.media, 3)})`, s.media, turq, [3, 4])); refs.push(s.media); }
  // Eje Y: incluye todos los datos, los límites y la media (sin cambiar el tamaño de la gráfica)
  const todos = [...vals, ...refs];
  const lo = Math.min(...todos), hi = Math.max(...todos);
  const pad = (hi - lo) * 0.15 || Math.abs(hi) * 0.06 || 1;
  // suggestedMin/Max: Chart.js redondea a marcas "limpias" sin dejar fuera ningún valor
  const y = { suggestedMin: lo - pad, suggestedMax: hi + pad, beginAtZero: false, ticks: { maxTicksLimit: 7, callback: (v) => fmtValor(v, 2) }, title: { display: !!m.unidades, text: m.unidades || '' } };
  const u = m.unidades ? ` ${m.unidades}` : '';
  makeChart(document.getElementById(id), {
    type: 'line',
    data: { labels: items.map((i) => fechaCompleta(i.fecha)), datasets },
    plugins: [etiquetasRepresentativas],
    options: {
      layout: { padding: { top: 8, right: 22, left: 6 } },
      interaction: { mode: 'index', intersect: false },
      plugins: {
        legend: { position: 'bottom' },
        tooltip: {
          callbacks: {
            title: (c) => { const it = items[c[0].dataIndex]; return `Lote ${it.lote} · ${fmtDate(it.fecha)}`; },
            label: (c) => {
              if (c.datasetIndex === 0) {
                const it = items[c.dataIndex];
                return ` ${resultadoTxt(it, m)} · ${it.cumple === true ? 'Cumple' : it.cumple === false ? 'No cumple' : 'Pendiente'}`;
              }
              return ` ${c.dataset.label}${u}`;
            },
          },
        },
      },
      scales: { x: { ticks: { autoSkip: true, maxRotation: 0, maxTicksLimit: 6, font: { size: 10 } } }, y },
    },
  });
}

// ---------------------------------------------------------------------
// Tabla de detalle (paginada; no limita los datos de las gráficas)
// ---------------------------------------------------------------------
function tabla(datos) {
  const box = root.querySelector('#r-tabla');
  if (!datos.length) { box.innerHTML = emptyState({ ico: 'table', title: 'Sin registros', text: 'No hay resultados para los filtros seleccionados.' }); refreshIcons(); return; }
  const orden = [...datos].sort((a, b) => b.fecha.localeCompare(a.fecha) || String(b.created_at).localeCompare(String(a.created_at)));
  const paginas = Math.max(1, Math.ceil(orden.length / POR_PAGINA));
  pagina = Math.min(Math.max(1, pagina), paginas);
  const desde = (pagina - 1) * POR_PAGINA;
  const vista = orden.slice(desde, desde + POR_PAGINA);
  box.innerHTML = `<div class="table-wrap responsive"><table class="table tabla-una-linea"><thead><tr>
      <th>Fecha del lote</th><th>Lote</th><th>Receta</th><th>Área</th><th>Método</th><th>Resultado</th><th>Especificación</th><th>Dictamen</th><th>Registró</th></tr></thead>
    <tbody>${vista.map((d) => `<tr>
      <td data-label="Fecha del lote"><div class="td-in">${fmtDate(d.fecha)}</div></td>
      <td data-label="Lote"><div class="td-in cell-main">${esc(d.lote)}</div></td>
      <td data-label="Receta"><div class="td-in"><span class="receta-nom"><span class="receta-dot" style="--rc:${esc(d.receta.color || '#64748B')}"></span>${esc(d.receta.nombre_receta)}</span></div></td>
      <td data-label="Área"><div class="td-in"><span class="area-dot" style="--ac:${esc(d.area.color)}"></span>${esc(d.area.nombre)}</div></td>
      <td data-label="Método"><div class="td-in">${esc(d.metodo.metodo)}</div></td>
      <td data-label="Resultado"><div class="td-in"><b>${esc(resultadoTxt(d, d.metodo))}</b></div></td>
      <td data-label="Especificación"><div class="td-in cell-sub">${esc(refLabel(d.metodo))}</div></td>
      <td data-label="Dictamen"><div class="td-in">${dictamenPill(d.cumple)}</div></td>
      <td data-label="Registró"><div class="td-in">${personaHTML(d.analista_texto, dir)}</div></td></tr>`).join('')}</tbody></table></div>
    <div class="pager">
      <span>Mostrando <b>${fmtNum(desde + 1)} a ${fmtNum(desde + vista.length)}</b> de <b>${fmtNum(orden.length)}</b></span>
      <div class="pager-ctrl">
        <button class="btn secondary sm" data-pg="${pagina - 1}" ${pagina <= 1 ? 'disabled' : ''}>${icon('chevron-left')} Anterior</button>
        <span>Página ${pagina} de ${paginas}</span>
        <button class="btn secondary sm" data-pg="${pagina + 1}" ${pagina >= paginas ? 'disabled' : ''}>Siguiente ${icon('chevron-right')}</button>
      </div>
    </div>`;
  refreshIcons();
}

function onClick(e) {
  const pg = e.target.closest('[data-pg]');
  if (pg && !pg.disabled) { pagina = Number(pg.dataset.pg); tabla(filtradas()); return; }
  const a = e.target.closest('[data-r]');
  if (!a) return;
  if (a.dataset.r === 'retry') { cargar(); return; }
  if (a.dataset.r === 'limpiar') {
    ['#r-periodo', '#r-receta', '#r-area'].forEach((s) => { root.querySelector(s).value = ''; });
    llenarMetodos(''); aplicar(); return;
  }
  if (a.dataset.r === 'csv') {
    const datos = filtradas();
    if (!datos.length) { toast('No hay resultados para exportar.', 'warning'); return; }
    const csv = toCSV([...datos].sort((x, y) => y.fecha.localeCompare(x.fecha)), [
      { label: 'Fecha del lote', get: (d) => fmtDate(d.fecha) },
      { label: 'Lote', get: (d) => d.lote },
      { label: 'Código de receta', get: (d) => d.receta.codigo },
      { label: 'Receta', get: (d) => d.receta.nombre_receta },
      { label: 'Especie', get: (d) => d.receta.especie },
      { label: 'Área de análisis', get: (d) => d.area.nombre },
      { label: 'Método', get: (d) => d.metodo.metodo },
      { label: 'Resultado', get: (d) => d.resultado_texto ?? (d.resultado === null ? '' : Number(d.resultado)) },
      { label: 'Unidad', get: (d) => d.metodo.unidades },
      { label: 'Especificación', get: (d) => refLabel(d.metodo) },
      { label: 'Dictamen', get: (d) => (d.cumple === true ? 'Cumple' : d.cumple === false ? 'No cumple' : 'Pendiente') },
      { label: 'Registró', get: (d) => d.analista_texto },
    ]);
    descargar(`resultados-liberacion-${todayISO()}.csv`, csv);
    toast(`Se exportaron ${fmtNum(datos.length)} resultados.`, 'success');
  }
}
