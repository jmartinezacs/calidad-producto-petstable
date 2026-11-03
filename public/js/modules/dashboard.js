// =====================================================================
// Panel general: indicadores, gráficas de cumplimiento, últimos lotes,
// no conformidades, accesos rápidos y tarjeta de acceso autorizado.
// Las cifras se calculan con los lotes y resultados de la base de datos.
// =====================================================================
import {
  sb, state, esc, icon, refreshIcons, todayISO, fmtDate, fmtDateTime, fmtNum, makeChart, destroyCharts, emptyState, errorState,
  navigate, prefs, avatarHTML, fechaLote, dictamenPill, roleLabel, getCatalogos, getResultados, fetchAll, ganchos, monthShort,
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
          <p>Estado actual de los análisis bromatológicos de producto terminado.</p>
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
      fetchAll(() => sb.from('brom_muestras').select('id, lote, fecha_analisis, receta_id, dictamen_global, created_at').order('fecha_analisis', { ascending: false })),
    ]);
    if (t !== token || !root) return;
    const desde = desdePeriodo(root.querySelector('#dash-period').value);
    const lotes = mues.map((m) => ({ ...m, fecha: fechaLote(m.fecha_analisis) })).filter((m) => !desde || m.fecha >= desde);
    const ids = new Set(lotes.map((l) => l.id));
    const rs = res.filter((r) => ids.has(r.muestra_id));
    destroyCharts();
    body.innerHTML = contenido(cat, lotes, rs) + quickHTML() + accesoHTML();
    refreshIcons();
    drawCharts(cat, lotes, rs);
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

function chartCard(id, title, sub, cls = '', total = '') {
  return `<div class="card"><div class="card-head center"><div><h3>${esc(title)}</h3>${sub ? `<p>${esc(sub)}</p>` : ''}${total ? `<span class="total-badge">${total}</span>` : ''}</div></div>
    <div tabindex="0" title="Ampliar gráfica" class="chart-box ${cls}"><canvas id="${id}" role="img" aria-label="${esc(title)}"></canvas></div></div>`;
}

function contenido(cat, lotes, rs) {
  const ok = rs.filter((r) => r.cumple === true).length, no = rs.filter((r) => r.cumple === false).length;
  const pend = rs.length - ok - no;
  const pct = ok + no ? `${(Math.round((ok / (ok + no)) * 1000) / 10).toLocaleString('es-MX')}%` : '—';
  const lotesNo = lotes.filter((l) => l.dictamen_global === false);
  const lotesPend = lotes.filter((l) => l.dictamen_global === null).length;
  const receta = (id) => cat.recetas.find((r) => r.id === id);
  const ultimos = lotes.slice(0, 6);
  const nombreM = (id) => cat.metodos.find((m) => m.id === id)?.metodo || 'Método';
  const fueraPorLote = new Map();
  rs.filter((r) => r.cumple === false).forEach((r) => {
    if (!fueraPorLote.has(r.muestra_id)) fueraPorLote.set(r.muestra_id, []);
    fueraPorLote.get(r.muestra_id).push(nombreM(r.metodo_id));
  });
  const lista = (ls, vacio) => (ls.length ? `<div class="list">${ls.map((l) => {
    const rc = receta(l.receta_id);
    const fuera = fueraPorLote.get(l.id);
    return `<button class="list-item" data-dash="#/lotes" style="text-align:left;cursor:pointer;color:inherit">
      <div class="date-chip"><small>${esc(monthShort(l.fecha))}</small><b>${esc(l.fecha.slice(8, 10))}</b></div>
      <div class="li-main"><b>Lote ${esc(l.lote)}</b><span>${esc(rc ? `${rc.codigo} · ${rc.nombre_receta}` : 'Receta')}${fuera ? ` · Fuera: ${esc(fuera.join(', '))}` : ''}</span></div>
      ${dictamenPill(l.dictamen_global)}</button>`;
  }).join('')}</div>` : vacio);

  if (!lotes.length) {
    return `<div class="card">${emptyState({ ico: 'flask-conical', title: 'Sin lotes en el periodo', text: 'Cambia el periodo o registra un lote nuevo.', action: `<button class="btn primary" data-dash="nuevo-lote">${icon('plus')} Nuevo lote</button>` })}</div>`;
  }
  return `
    <div class="grid grid-4">
      ${kpi('i-blue', 'flask-conical', 'Lotes analizados', fmtNum(lotes.length), 'Registrados en el periodo', '#/lotes')}
      ${kpi('c2 i-amber', 'list-checks', 'Resultados', fmtNum(rs.length), 'Análisis capturados', '#/resultados')}
      ${kpi('c3 i-violet', 'badge-check', 'Cumplimiento', pct, `${fmtNum(ok)} de ${fmtNum(ok + no)} resultados evaluados`, '#/resultados')}
      ${kpi(no ? 'danger i-pink' : 'c4 i-pink', 'triangle-alert', 'Fuera de especificación', fmtNum(no), 'Resultados que no cumplen', '#/lotes?dictamen=false')}
    </div>
    <div class="grid grid-3 mt">
      ${statusCard(lotesNo.length ? 'bad' : '', 'Lotes no conformes', 'Con al menos un método fuera de especificación', lotesNo.length, '#/lotes?dictamen=false')}
      ${statusCard(pend || lotesPend ? 'warn' : '', 'Resultados pendientes', 'Sin dictamen todavía', pend, '#/lotes?dictamen=null')}
      ${statusCard('', 'Catálogo analítico', `${fmtNum(cat.recetas.filter((r) => r.activa).length)} recetas y ${fmtNum(cat.metodos.filter((m) => m.activo).length)} métodos activos`, cat.recetas.filter((r) => r.activa).length + cat.metodos.filter((m) => m.activo).length, '#/catalogos')}
    </div>
    <div class="grid grid-main mt">
      ${chartCard('ch-mes', 'Lotes por mes', 'Según el dictamen del lote')}
      ${chartCard('ch-dict', 'Dictamen de resultados', `${fmtNum(rs.length)} resultados en el periodo`)}
    </div>
    <div class="grid grid-2 mt">
      ${chartCard('ch-receta', 'Cumplimiento por receta', 'Porcentaje de resultados que cumplen', 'sm')}
      ${chartCard('ch-metodo', 'Fuera de especificación por método', 'Número de resultados que no cumplen', 'sm', `Total: <b>${fmtNum(no)}</b>`)}
    </div>
    <div class="grid grid-2 mt">
      <div class="card">${cardHead('Últimos lotes', 'Por fecha del lote', `<button class="btn secondary" data-dash="#/lotes">${icon('flask-conical')} Ver lotes</button>`)}${lista(ultimos, '')}</div>
      <div class="card">${cardHead('No conformidades', 'Lotes con algún método fuera de especificación', `<button class="btn secondary" data-dash="#/lotes?dictamen=false">${icon('triangle-alert')} Ver todos</button>`)}
        ${lista(lotesNo.slice(0, 6), emptyState({ ico: 'shield-check', title: 'Sin no conformidades', text: 'Todos los lotes del periodo cumplen la especificación.' }))}</div>
    </div>`;
}

function quickHTML() {
  const items = [['nuevo-lote', 'flask-conical', 'Nuevo lote', 'Registrar lote y resultados'],
    ['#/resultados', 'line-chart', 'Tendencias', 'Gráficas por receta y método'],
    ['#/catalogos', 'book-open-check', 'Catálogo analítico', 'Recetas, métodos y especificaciones'],
    ['#/ayuda', 'circle-help', 'Preguntas frecuentes', 'Cómo usar el portal']];
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

const COLORES = ['#F58020', '#1BC7C7', '#2563EB', '#16A34A', '#7C3AED', '#DB2777', '#E8890C', '#0891B2'];
function drawCharts(cat, lotes, rs) {
  // Lotes por mes, apilados por dictamen
  const meses = [...new Set(lotes.map((l) => l.fecha.slice(0, 7)))].sort();
  const cuenta = (ym, v) => lotes.filter((l) => l.fecha.startsWith(ym) && l.dictamen_global === v).length;
  makeChart(document.getElementById('ch-mes'), {
    type: 'bar',
    data: {
      labels: meses.map((m) => `${monthShort(`${m}-15`)} ${m.slice(2, 4)}`),
      datasets: [
        { label: 'Cumple', data: meses.map((m) => cuenta(m, true)), backgroundColor: '#1BB56F', borderRadius: 6, maxBarThickness: 34, stack: 'd' },
        { label: 'No cumple', data: meses.map((m) => cuenta(m, false)), backgroundColor: '#E0464E', borderRadius: 6, maxBarThickness: 34, stack: 'd' },
        { label: 'Pendiente', data: meses.map((m) => cuenta(m, null)), backgroundColor: '#FFB020', borderRadius: 6, maxBarThickness: 34, stack: 'd' },
      ],
    },
    options: { scales: { x: { stacked: true }, y: { stacked: true } } },
  });
  const ok = rs.filter((r) => r.cumple === true).length, no = rs.filter((r) => r.cumple === false).length;
  makeChart(document.getElementById('ch-dict'), {
    type: 'doughnut',
    data: { labels: ['Cumple', 'No cumple', 'Pendiente'], datasets: [{ data: [ok, no, rs.length - ok - no], backgroundColor: ['#1BB56F', '#E0464E', '#FFB020'], borderWidth: 0 }] },
    options: { plugins: { legend: { position: 'bottom' } } },
  });
  const recetas = cat.recetas.filter((r) => rs.some((x) => x.brom_muestras.receta_id === r.id));
  const pct = (arr) => { const e = arr.filter((x) => x.cumple !== null); return e.length ? Math.round((e.filter((x) => x.cumple).length / e.length) * 1000) / 10 : 0; };
  makeChart(document.getElementById('ch-receta'), {
    type: 'bar',
    data: { labels: recetas.map((r) => r.nombre_receta), datasets: [{ label: '% que cumple', data: recetas.map((r) => pct(rs.filter((x) => x.brom_muestras.receta_id === r.id))), backgroundColor: recetas.map((_, i) => COLORES[i % COLORES.length]), borderRadius: 6, maxBarThickness: 46 }] },
    options: { plugins: { legend: { display: false } }, scales: { y: { min: 0, max: 100, ticks: { callback: (v) => `${v}%` } } } },
  });
  const metodos = cat.metodos.filter((m) => rs.some((x) => x.metodo_id === m.id));
  makeChart(document.getElementById('ch-metodo'), {
    type: 'bar',
    data: { labels: metodos.map((m) => m.metodo), datasets: [{ label: 'No cumplen', data: metodos.map((m) => rs.filter((x) => x.metodo_id === m.id && x.cumple === false).length), backgroundColor: '#E0464E', borderRadius: 6, maxBarThickness: 22 }] },
    options: { indexAxis: 'y', plugins: { legend: { display: false } } },
  });
}
