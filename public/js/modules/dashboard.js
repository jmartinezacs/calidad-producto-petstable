// =====================================================================
// Panel general: estado de liberación de los lotes, cumplimiento por receta,
// área y método, listas de lotes por liberar y no conformidades,
// accesos rápidos y tarjeta de acceso autorizado.
// =====================================================================
import {
  sb, state, esc, icon, refreshIcons, todayISO, fmtDate, fmtDateTime, fmtNum, makeChart, destroyCharts, emptyState, errorState,
  navigate, prefs, avatarHTML, fechaLote, roleLabel, getCatalogos, getResultados, fetchAll, ganchos, mesLargo,
  estadoLote, estadoPill, ESTADOS_LOTE, colorN, recetaTxt, puedeLiberar, mesCorto,
} from '../core.js';

let root, token = 0;

function desdePeriodo(p) {
  const hoy = todayISO();
  if (p === 'anio') return `${hoy.slice(0, 4)}-01-01`;
  if (p === 'mes') return `${hoy.slice(0, 7)}-01`;
  if (p === '90' || p === '30') { const d = new Date(`${hoy}T12:00:00Z`); d.setUTCDate(d.getUTCDate() - Number(p) + 1); return d.toISOString().slice(0, 10); }
  return '';
}

export default {
  async render(el) {
    root = el;
    const p = state.profile;
    const per = prefs.get('brom.dash.period') || 'todo';
    el.innerHTML = `
      <section class="page-intro">
        <div>
          <span class="eyebrow">Panel general</span>
          <h1 class="hello">Hola, ${esc(p.nombre.split(' ')[0])} <span class="paws" aria-hidden="true">${icon('paw-print')}${icon('paw-print')}</span></h1>
          <p>Estado de liberación de los lotes y cumplimiento de sus análisis bromatológicos, fisicoquímicos, microbiológicos y sensoriales.</p>
        </div>
        <div class="toolbar" style="margin:0">
          <label class="sr-only" for="dash-period">Periodo</label>
          <select id="dash-period">
            <option value="todo">Todo el histórico</option><option value="mes">Mes en curso</option>
            <option value="30">Últimos 30 días</option><option value="90">Últimos 90 días</option><option value="anio">Año en curso</option>
          </select>
        </div>
      </section>
      <div id="dash-body" class="dash"></div>`;
    const sel = el.querySelector('#dash-period');
    sel.value = per;
    sel.addEventListener('change', () => { prefs.set('brom.dash.period', sel.value); load(); });
    el.addEventListener('click', onClick);
    el.addEventListener('keydown', (e) => {
      if ((e.key === 'Enter' || e.key === ' ') && e.target.matches('[data-dash][role="link"]')) { e.preventDefault(); e.target.click(); }
    });
    await load();
  },
  destroy() { token++; root = null; },
};

async function onClick(e) {
  const a = e.target.closest('[data-dash]');
  if (!a) return;
  const act = a.dataset.dash;
  if (act === 'retry') return load();
  if (act === 'nuevo-lote') { if (await ganchos.openLoteForm?.()) load(); return; }
  if (act.startsWith('#')) navigate(act);
}

async function load() {
  const t = ++token;
  const body = root?.querySelector('#dash-body');
  if (!body) return;
  if (!body.children.length) body.innerHTML = `<div class="grid grid-4">${'<div class="kpi"><div class="skeleton" style="width:60%"></div><div class="skeleton" style="height:30px;width:40%"></div></div>'.repeat(4)}</div>`;
  try {
    const [cat, res, mues] = await Promise.all([
      getCatalogos({ force: true }),
      getResultados(),
      fetchAll(() => sb.from('brom_muestras').select('id, lote, fecha_analisis, receta_id, dictamen_global, created_at, liberado_en, folio_certificado').order('fecha_analisis', { ascending: false })),
    ]);
    if (t !== token || !root) return;
    const desde = desdePeriodo(root.querySelector('#dash-period').value);
    const porLote = new Map();
    res.forEach((r) => { if (!porLote.has(r.muestra_id)) porLote.set(r.muestra_id, []); porLote.get(r.muestra_id).push(r); });
    const lotes = mues.map((m) => ({ ...m, fecha: fechaLote(m.fecha_analisis), ...estadoLote(m, porLote.get(m.id) || [], cat) })).filter((m) => !desde || m.fecha >= desde);
    const ids = new Set(lotes.map((l) => l.id));
    const rs = res.filter((r) => ids.has(r.muestra_id));
    destroyCharts();
    body.innerHTML = contenido(cat, lotes, rs) + quickHTML() + accesoHTML();
    refreshIcons();
    if (lotes.length) drawCharts(cat, lotes, rs);
  } catch (err) {
    if (t !== token) return;
    console.error(err);
    body.innerHTML = errorState(err).replace('data-action="retry"', 'data-dash="retry"');
    refreshIcons();
  }
}

const kpi = (cls, ico, label, value, desc, go = '') =>
  `<div class="kpi ${cls} ${go ? 'clickable' : ''}" ${go ? `data-dash="${go}" role="link" tabindex="0"` : ''}>
    <div class="kpi-head"><span class="kpi-ico">${icon(ico)}</span><small>${esc(label)}</small></div>
    <strong>${value}</strong>
    <span class="desc">${esc(desc)}</span></div>`;

const statusCard = (cls, title, desc, n, go = '') =>
  `<div class="status-card ${go ? 'clickable' : ''}" ${go ? `data-dash="${go}" role="link" tabindex="0"` : ''}>
    <div class="status-head"><span class="dot blinking ${cls}"></span><b>${esc(title)}</b></div><p>${esc(desc)}</p><span class="num">${fmtNum(n)}</span></div>`;

const cardHead = (title, sub = '', btn = '') =>
  `<div class="card-head center"><div><h3>${esc(title)}</h3>${sub ? `<p>${esc(sub)}</p>` : ''}</div>${btn}</div>`;

function chartCard(id, title, sub, cls = '', total = '', alto = 0, ico = 'bar-chart-3', color = '#F58020') {
  return `<div class="card chart-card" style="--cc:${color}"><div class="card-head center"><span class="cc-ico" aria-hidden="true">${icon(ico)}</span><div><h3>${esc(title)}</h3>${sub ? `<p>${esc(sub)}</p>` : ''}${total ? `<span class="total-badge">${total}</span>` : ''}</div></div>
    <div tabindex="0" title="Ampliar gráfica" class="chart-box ${cls}"${alto ? ` style="height:${alto}px"` : ''}><canvas id="${id}" role="img" aria-label="${esc(title)}"></canvas></div></div>`;
}

const pct = (a, b) => (b ? `${(Math.round((a / b) * 1000) / 10).toLocaleString('es-MX')} %` : 'Sin datos');

function contenido(cat, lotes, rs) {
  if (!lotes.length) {
    return `<div class="card">${emptyState({ ico: 'flask-conical', title: 'Sin lotes en el periodo', text: 'Cambia el periodo o registra un lote nuevo.', action: `<button class="btn primary" data-dash="nuevo-lote">${icon('plus')} Nuevo lote</button>` })}</div>`;
  }
  const n = (e) => lotes.filter((l) => l.estado === e).length;
  const ok = rs.filter((r) => r.cumple === true).length, no = rs.filter((r) => r.cumple === false).length;
  const receta = (id) => cat.recetas.find((r) => r.id === id);
  const lista = (ls, vacio) => (ls.length ? `<div class="list">${ls.map((l) => {
    const rc = receta(l.receta_id);
    const det = l.estado === 'no_conforme' ? `No cumple: ${l.fallan.map((r) => cat.metodos.find((m) => m.id === r.metodo_id)?.metodo).filter(Boolean).join(', ')}`
      : l.estado === 'en_proceso' ? `${l.completos} de ${l.requeridos} análisis evaluados` : l.estado === 'liberado' ? `Folio ${l.folio_certificado}` : 'Todos los análisis cumplen';
    return `<button class="list-item" data-dash="#/lotes" style="text-align:left;cursor:pointer;color:inherit">
      <div class="date-chip" style="--rc:${esc(rc?.color || '#64748B')}"><small>${esc(mesLargo(l.fecha).split(' ')[0])}</small><b>${esc(l.fecha.slice(8, 10))}</b></div>
      <div class="li-main"><b>Lote ${esc(l.lote)} · ${esc(rc?.nombre_receta || 'Receta')}</b><span>${esc(det)}</span></div>
      ${estadoPill(l.estado)}</button>`;
  }).join('')}</div>` : vacio);
  return `
    <div class="grid grid-4">
      ${kpi('k-orange', 'flask-conical', 'Lotes analizados', fmtNum(lotes.length), 'Registrados en el periodo', '#/lotes')}
      ${kpi('k-blue', 'badge-check', 'Lotes liberados', fmtNum(n('liberado')), `${pct(n('liberado'), lotes.length)} de los lotes del periodo`, '#/lotes?estado=liberado')}
      ${kpi('k-green', 'percent', 'Cumplimiento', pct(ok, ok + no), `${fmtNum(ok)} de ${fmtNum(ok + no)} análisis evaluados cumplen`, '#/resultados')}
      ${kpi(no ? 'k-red danger' : 'k-red', 'triangle-alert', 'Fuera de especificación', fmtNum(no), 'Análisis que no cumplen', '#/lotes?estado=no_conforme')}
    </div>
    <div class="grid grid-3 mt">
      ${statusCard(n('listo') ? 'ok' : '', 'Listos para liberar', puedeLiberar() ? 'Todos sus análisis cumplen: puedes liberarlos' : 'Esperan la liberación de la Jefatura de calidad', n('listo'), '#/lotes?estado=listo')}
      ${statusCard(n('en_proceso') ? 'warn' : '', 'En proceso', 'Con análisis por capturar o evaluar', n('en_proceso'), '#/lotes?estado=en_proceso')}
      ${statusCard(n('no_conforme') ? 'bad' : '', 'No conformes', 'Con al menos un análisis fuera de especificación', n('no_conforme'), '#/lotes?estado=no_conforme')}
    </div>
    <div class="grid grid-main mt">
      ${chartCard('ch-mes', 'Lotes por mes', 'Según su estado de liberación', '', '', 0, 'calendar-range', '#2563EB')}
      ${chartCard('ch-pct', 'Porcentaje de cumplimiento', `${fmtNum(ok + no)} análisis evaluados en el periodo`, '', '', 0, 'circle-check-big', '#16A34A')}
    </div>
    <div class="grid grid-2 mt">
      ${chartCard('ch-receta', 'Cumplimiento por receta', 'Porcentaje de análisis que cumplen', 'sm', '', 0, 'chef-hat', '#F58020')}
      ${chartCard('ch-area', 'Cumplimiento por área de análisis', 'Porcentaje de análisis que cumplen', 'sm', '', 0, 'microscope', '#7C3AED')}
    </div>
    <div class="grid grid-2 mt">
      ${chartCard('ch-metodo', 'Fuera de especificación por método', 'Número de análisis que no cumplen', 'sm', `Total: <b>${fmtNum(no)}</b>`, Math.max(220, 40 + new Set(rs.map((r) => r.metodo_id)).size * 24), 'triangle-alert', '#DC2626')}
      ${chartCard('ch-estado', 'Lotes por estado', `${fmtNum(lotes.length)} ${lotes.length === 1 ? 'lote' : 'lotes'} en el periodo`, 'sm', '', Math.max(220, 40 + new Set(rs.map((r) => r.metodo_id)).size * 24) + 34, 'pie-chart', '#0891B2')}
    </div>
    <div class="grid grid-2 mt">
      <div class="card">${cardHead('Listos para liberar', 'Todos sus análisis cumplen', `<button class="btn s-green" data-dash="#/lotes?estado=listo">${icon('badge-check')} Ver lotes</button>`)}
        ${lista(lotes.filter((l) => l.estado === 'listo').slice(0, 6), emptyState({ ico: 'inbox', title: 'Sin lotes por liberar', text: 'Aquí aparecen los lotes con todos sus análisis en cumplimiento.' }))}</div>
      <div class="card">${cardHead('No conformidades', 'Lotes con algún análisis fuera de especificación', `<button class="btn s-red" data-dash="#/lotes?estado=no_conforme">${icon('triangle-alert')} Ver todos</button>`)}
        ${lista(lotes.filter((l) => l.estado === 'no_conforme').slice(0, 6), emptyState({ ico: 'shield-check', title: 'Sin no conformidades', text: 'Ningún lote del periodo tiene análisis fuera de especificación.' }))}</div>
    </div>`;
}

function quickHTML() {
  const items = [['nuevo-lote', 'flask-conical', 'Nuevo lote', 'Registrar lote y análisis'],
    ['#/lotes?estado=listo', 'badge-check', 'Liberar lotes', 'Lotes con todos sus análisis en cumplimiento'],
    ['#/resultados', 'line-chart', 'Tendencias', 'Gráficas por receta y método'],
    ['#/ayuda', 'circle-help', 'Ayuda y guía', 'Preguntas frecuentes y guía en PDF']];
  return `<section class="card mt quick-section">${cardHead('Accesos rápidos', 'Las acciones más utilizadas')}
    <div class="quick-grid">
      ${items.map(([a, ic, t, s]) => `<button class="quick-action" data-dash="${a}"><span class="qi">${icon(ic)}</span><b>${esc(t)}</b><span>${esc(s)}</span></button>`).join('')}
    </div></section>`;
}

function accesoHTML() {
  const p = state.profile;
  const u = state.session?.user;
  return `<section class="access-card mt" aria-label="Acceso autorizado">
    <div class="access-photo">${avatarHTML(p.nombre, p.foto_url, 'xl')}<span class="access-check">${icon('badge-check')}</span></div>
    <div class="access-info">
      <span class="access-badge">${icon('shield-check')} Acceso autorizado</span>
      <h2>${esc(p.nombre)}</h2>
      <p class="access-puesto">${esc(p.puesto || 'Puesto no registrado')}</p>
      <div class="access-tags">
        <span>${icon(state.isAdmin ? 'crown' : 'user')} ${esc(roleLabel(p.rol))}</span>
        <span>${icon('mail')} ${esc(p.email)}</span>
        <span>${icon('clock')} Último acceso: ${fmtDateTime(u?.last_sign_in_at)}</span>
      </div>
      <p class="access-foot">${icon('lock')} Sesión verificada con tu cuenta corporativa Pet's Table.</p>
    </div>
  </section>`;
}

const porcentaje = (arr) => { const e = arr.filter((x) => x.cumple !== null); return e.length ? Math.round((e.filter((x) => x.cumple).length / e.length) * 1000) / 10 : 0; };
const ejePct = { y: { min: 0, max: 100, ticks: { callback: (v) => `${v} %` } } };

function drawCharts(cat, lotes, rs) {
  const estados = Object.entries(ESTADOS_LOTE);
  // Lotes por mes, apilados por estado («Nov 2026»)
  const meses = [...new Set(lotes.map((l) => l.fecha.slice(0, 7)))].sort();
  makeChart(document.getElementById('ch-mes'), {
    type: 'bar',
    data: {
      labels: meses.map((m) => mesCorto(m)),
      datasets: estados.map(([k, v]) => ({ label: v.label, data: meses.map((m) => lotes.filter((l) => l.fecha.startsWith(m) && l.estado === k).length), backgroundColor: v.color, borderRadius: 6, maxBarThickness: 38, stack: 'e' })),
    },
    options: { scales: { x: { stacked: true, ticks: { font: { size: 10.5 }, maxRotation: 0, autoSkip: true } }, y: { stacked: true } } },
  });
  // Porcentaje de cumplimiento (dona con el porcentaje que cumple al centro)
  const ok = rs.filter((r) => r.cumple === true).length, no = rs.filter((r) => r.cumple === false).length, pend = rs.length - ok - no;
  const seg = [['Cumple', ok, '#16A34A'], ['No cumple', no, '#E0464E'], ['Pendiente', pend, '#F59E0B']].filter((s) => s[1] > 0);
  makeChart(document.getElementById('ch-pct'), {
    type: 'doughnut',
    data: { labels: seg.map((s) => s[0]), datasets: [{ data: seg.map((s) => s[1]), backgroundColor: seg.map((s) => s[2]), _porcentaje: true,
      _centro: { valor: pct(ok, ok + no), etiqueta: 'Cumplen', color: '#16A34A' } }] },
    options: { plugins: { legend: { position: 'bottom' }, tooltip: { callbacks: { label: (c) => ` ${c.label}: ${fmtNum(c.raw)} análisis (${pct(c.raw, rs.length)})` } } } },
  });
  // Cumplimiento por receta (color característico de cada receta)
  const recetas = cat.recetas.filter((r) => rs.some((x) => x.brom_muestras.receta_id === r.id));
  makeChart(document.getElementById('ch-receta'), {
    type: 'bar',
    data: { labels: recetas.map((r) => r.nombre_receta), datasets: [{ label: 'Cumplimiento', data: recetas.map((r) => porcentaje(rs.filter((x) => x.brom_muestras.receta_id === r.id))), backgroundColor: recetas.map((r) => r.color), borderRadius: 6, maxBarThickness: 52, _sufijo: ' %' }] },
    options: { plugins: { legend: { display: false } }, scales: ejePct },
  });
  // Cumplimiento por área
  const metArea = new Map(cat.metodos.map((m) => [m.id, m.area]));
  const areas = cat.areas.filter((a) => rs.some((x) => metArea.get(x.metodo_id) === a.id));
  makeChart(document.getElementById('ch-area'), {
    type: 'bar',
    data: { labels: areas.map((a) => a.nombre), datasets: [{ label: 'Cumplimiento', data: areas.map((a) => porcentaje(rs.filter((x) => metArea.get(x.metodo_id) === a.id))), backgroundColor: areas.map((a) => a.color), borderRadius: 6, maxBarThickness: 52, _sufijo: ' %' }] },
    options: { plugins: { legend: { display: false } }, scales: ejePct },
  });
  // Fuera de especificación por método (un color distinto por barra)
  const metodos = cat.metodos.filter((m) => rs.some((x) => x.metodo_id === m.id));
  makeChart(document.getElementById('ch-metodo'), {
    type: 'bar',
    data: { labels: metodos.map((m) => m.metodo), datasets: [{ label: 'No cumplen', data: metodos.map((m) => rs.filter((x) => x.metodo_id === m.id && x.cumple === false).length), backgroundColor: metodos.map((_, i) => colorN(i)), borderRadius: 6, maxBarThickness: 22 }] },
    options: { indexAxis: 'y', plugins: { legend: { display: false } }, scales: { y: { ticks: { autoSkip: false, font: { size: 10.5 } } } } },
  });
  // Lotes por estado
  makeChart(document.getElementById('ch-estado'), {
    type: 'doughnut',
    data: { labels: estados.map(([, v]) => v.label), datasets: [{ data: estados.map(([k]) => lotes.filter((l) => l.estado === k).length), backgroundColor: estados.map(([, v]) => v.color),
      _centro: { valor: fmtNum(lotes.length), etiqueta: lotes.length === 1 ? 'Lote' : 'Lotes' } }] },
    options: { plugins: { legend: { position: 'bottom' } } },
  });
}
