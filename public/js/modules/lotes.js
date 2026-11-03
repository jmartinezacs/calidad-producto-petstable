// =====================================================================
// Lotes analizados (brom_muestras): consulta, registro, edición y borrado.
// El dictamen de cada resultado y del lote lo calculan los triggers
// brom_evaluar_resultado y brom_actualizar_dictamen_muestra.
// =====================================================================
import {
  sb, state, esc, icon, refreshIcons, toast, errMsg, openModal, confirmDialog, emptyState, errorState,
  fmtDate, fmtNum, todayISO, fechaLote, loteDesdeFecha, dictamenPill, refLabel, resultadoTxt, tipoLabel, criterio,
  getCatalogos, invalidarCatalogos, fetchAll, toCSV, descargar, debounce, sanitizeSearch, ganchos,
} from '../core.js';

const POR_PAGINA = 12;
let root = null, token = 0, lotes = [], pagina = 1;

const SELECT_LOTE = 'id, lote, fecha_analisis, dictamen_global, usuario_id, created_at, receta_id, brom_resultados_analisis(id, metodo_id, resultado, resultado_texto, cumple, analista_texto, created_at)';

export default {
  async render(el, params = {}) {
    root = el; pagina = 1;
    el.innerHTML = `
      <section class="page-intro">
        <div><span class="eyebrow">Laboratorio</span><h1>Lotes analizados</h1>
          <p>Registra un lote, selecciona los métodos que correspondan y captura sus resultados en la misma operación.</p></div>
        <div class="page-actions">
          <button class="btn secondary" data-l="csv">${icon('file-spreadsheet')} Exportar</button>
          <button class="btn primary" data-l="nuevo">${icon('plus')} Nuevo lote</button>
        </div>
      </section>
      <div class="toolbar">
        <div class="search">${icon('search')}<input id="l-q" type="search" placeholder="Buscar por número de lote…" aria-label="Buscar lote" autocomplete="off"></div>
        <label class="sr-only" for="l-receta">Receta</label><select id="l-receta"><option value="">Todas las recetas</option></select>
        <label class="sr-only" for="l-dict">Dictamen</label>
        <select id="l-dict"><option value="">Todos los dictámenes</option><option value="true">Cumple</option><option value="false">No cumple</option><option value="null">Pendiente</option></select>
        <label class="sr-only" for="l-mes">Periodo</label><select id="l-mes"><option value="">Todo el histórico</option></select>
      </div>
      <div id="l-resumen" class="lote-resumen"></div>
      <div id="l-body"></div>`;
    if (params.dictamen) el.querySelector('#l-dict').value = params.dictamen;
    el.addEventListener('click', onClick);
    el.querySelector('#l-q').addEventListener('input', debounce(() => { pagina = 1; pintar(); }, 250));
    el.querySelectorAll('#l-receta, #l-dict, #l-mes').forEach((s) => s.addEventListener('change', () => { pagina = 1; pintar(); }));
    await cargar();
  },
  destroy() { token++; root = null; },
};

async function cargar() {
  const t = ++token;
  const body = root?.querySelector('#l-body');
  if (!body) return;
  body.innerHTML = `<div class="lote-grid">${'<div class="card"><div class="skeleton" style="width:50%"></div><div class="skeleton mt" style="height:80px"></div></div>'.repeat(4)}</div>`;
  try {
    const [cat, data] = await Promise.all([
      getCatalogos(),
      fetchAll(() => sb.from('brom_muestras').select(SELECT_LOTE).order('fecha_analisis', { ascending: false }).order('created_at', { ascending: false })),
    ]);
    if (t !== token) return;
    lotes = data.map((m) => ({ ...m, receta: cat.recetas.find((r) => r.id === m.receta_id) || null, fecha: fechaLote(m.fecha_analisis) }));
    llenarFiltros(cat);
    pintar();
  } catch (err) {
    if (t !== token) return;
    console.error(err);
    body.innerHTML = errorState(err).replace('data-action="retry"', 'data-l="retry"');
    refreshIcons();
  }
}

function llenarFiltros(cat) {
  const selR = root.querySelector('#l-receta'), selM = root.querySelector('#l-mes');
  const r0 = selR.value, m0 = selM.value;
  selR.innerHTML = '<option value="">Todas las recetas</option>' + cat.recetas.map((r) => `<option value="${esc(r.id)}">${esc(r.codigo)} — ${esc(r.nombre_receta)}</option>`).join('');
  const meses = [...new Set(lotes.map((l) => l.fecha.slice(0, 7)).filter(Boolean))].sort().reverse();
  selM.innerHTML = '<option value="">Todo el histórico</option>' + meses.map((m) => `<option value="${m}">${esc(mesLargo(m))}</option>`).join('');
  selR.value = r0; selM.value = meses.includes(m0) ? m0 : '';
}
const mesLargo = (ym) => {
  const s = new Intl.DateTimeFormat('es-MX', { timeZone: 'UTC', month: 'long', year: 'numeric' }).format(new Date(`${ym}-15T12:00:00Z`));
  return s.charAt(0).toUpperCase() + s.slice(1);
};

function filtrados() {
  const q = sanitizeSearch(root.querySelector('#l-q').value).toLowerCase();
  const rec = root.querySelector('#l-receta').value, dic = root.querySelector('#l-dict').value, mes = root.querySelector('#l-mes').value;
  return lotes.filter((l) => (!q || String(l.lote).toLowerCase().includes(q))
    && (!rec || l.receta_id === rec)
    && (!dic || String(l.dictamen_global) === dic)
    && (!mes || l.fecha.startsWith(mes)));
}

function pintar() {
  if (!root) return;
  const lista = filtrados();
  const body = root.querySelector('#l-body');
  const n = (v) => lista.filter((l) => l.dictamen_global === v).length;
  root.querySelector('#l-resumen').innerHTML = lotes.length ? `
    <span class="chip-stat">${icon('layers')} <b>${fmtNum(lista.length)}</b> lote(s)</span>
    <span class="chip-stat ok">${icon('check')} <b>${fmtNum(n(true))}</b> cumplen</span>
    <span class="chip-stat bad">${icon('x')} <b>${fmtNum(n(false))}</b> no cumplen</span>
    <span class="chip-stat warn">${icon('hourglass')} <b>${fmtNum(n(null))}</b> pendientes</span>` : '';
  if (!lotes.length) {
    body.innerHTML = emptyState({ ico: 'flask-conical', title: 'Aún no hay lotes registrados', text: 'Registra el primer lote con sus resultados analíticos.', action: `<button class="btn primary" data-l="nuevo">${icon('plus')} Nuevo lote</button>` });
    refreshIcons(); return;
  }
  if (!lista.length) {
    body.innerHTML = emptyState({ ico: 'search-x', title: 'Sin resultados', text: 'No hay lotes que coincidan con los filtros aplicados.' });
    refreshIcons(); return;
  }
  const paginas = Math.max(1, Math.ceil(lista.length / POR_PAGINA));
  pagina = Math.min(pagina, paginas);
  const desde = (pagina - 1) * POR_PAGINA;
  getCatalogos().then((cat) => {
    if (!root) return;
    body.innerHTML = `<div class="lote-grid">${lista.slice(desde, desde + POR_PAGINA).map((l) => tarjeta(l, cat)).join('')}</div>
      <div class="pager">
        <span>Mostrando <b>${fmtNum(desde + 1)}–${fmtNum(Math.min(lista.length, desde + POR_PAGINA))}</b> de <b>${fmtNum(lista.length)}</b> lotes</span>
        <div class="pager-ctrl">
          <button class="icon-btn" data-pg="${pagina - 1}" ${pagina <= 1 ? 'disabled' : ''} aria-label="Página anterior">${icon('chevron-left')}</button>
          <span>Pág. ${pagina} / ${paginas}</span>
          <button class="icon-btn" data-pg="${pagina + 1}" ${pagina >= paginas ? 'disabled' : ''} aria-label="Página siguiente">${icon('chevron-right')}</button>
        </div>
      </div>`;
    refreshIcons();
  });
}

function puedeEditar(l) { return state.isAdmin || l.usuario_id === state.session?.user?.id; }

function tarjeta(l, cat) {
  const res = [...(l.brom_resultados_analisis || [])].sort((a, b) => nombreMetodo(cat, a.metodo_id).localeCompare(nombreMetodo(cat, b.metodo_id), 'es'));
  const quien = [...new Set(res.map((r) => r.analista_texto).filter(Boolean))].join(', ');
  const cls = l.dictamen_global === true ? 'ok' : l.dictamen_global === false ? 'bad' : 'warn';
  return `<article class="card lote-card ${cls}">
    <header class="lote-head">
      <div><span class="lote-num">${icon('package')} Lote ${esc(l.lote)}</span>
        <p>${esc(l.receta ? `${l.receta.codigo} — ${l.receta.nombre_receta}` : 'Receta no disponible')}</p></div>
      ${dictamenPill(l.dictamen_global)}
    </header>
    <div class="lote-meta"><span>${icon('calendar')} ${fmtDate(l.fecha)}</span>${quien ? `<span>${icon('user')} ${esc(quien)}</span>` : ''}<span>${icon('list-checks')} ${res.length} método(s)</span></div>
    <div class="table-wrap"><table class="table compact"><thead><tr><th>Método</th><th>Resultado</th><th>Referencia</th><th>Dictamen</th></tr></thead><tbody>
      ${res.map((r) => {
        const m = criterio(cat.metodos.find((x) => x.id === r.metodo_id), cat.spec(l.receta_id, r.metodo_id));
        return `<tr><td class="cell-main">${esc(m.metodo || '—')}</td><td><b>${esc(resultadoTxt(r, m))}</b></td><td class="cell-sub">${esc(refLabel(m))}</td><td>${dictamenPill(r.cumple)}</td></tr>`;
      }).join('') || '<tr><td colspan="4" class="cell-sub">Sin resultados capturados</td></tr>'}
    </tbody></table></div>
    ${puedeEditar(l) ? `<footer class="lote-acts">
      <button class="btn secondary sm" data-l="editar" data-id="${esc(l.id)}">${icon('pencil')} Editar</button>
      ${state.isAdmin ? `<button class="btn ghost sm danger-txt" data-l="borrar" data-id="${esc(l.id)}">${icon('trash-2')} Borrar</button>` : ''}
    </footer>` : ''}
  </article>`;
}
const nombreMetodo = (cat, id) => cat.metodos.find((m) => m.id === id)?.metodo || '';

async function onClick(e) {
  const pg = e.target.closest('[data-pg]');
  if (pg && !pg.disabled) { pagina = Number(pg.dataset.pg); pintar(); root.querySelector('.toolbar')?.scrollIntoView({ behavior: 'smooth', block: 'start' }); return; }
  const a = e.target.closest('[data-l]');
  if (!a) return;
  const act = a.dataset.l;
  if (act === 'retry') return cargar();
  if (act === 'nuevo') { if (await openLoteForm()) cargar(); return; }
  if (act === 'csv') return exportar();
  const l = lotes.find((x) => x.id === a.dataset.id);
  if (!l) return;
  if (act === 'editar') { if (await openLoteForm(l)) cargar(); return; }
  if (act === 'borrar') {
    const ok = await confirmDialog({
      title: `¿Borrar el lote ${l.lote}?`, danger: true, confirmText: 'Borrar lote',
      message: `Se eliminará el lote y sus ${(l.brom_resultados_analisis || []).length} resultado(s). Esta acción no se puede deshacer.`,
    });
    if (!ok) return;
    const { error } = await sb.from('brom_muestras').delete().eq('id', l.id);
    if (error) { toast(errMsg(error), 'error'); return; }
    toast(`Lote ${l.lote} eliminado.`, 'success');
    cargar();
  }
}

async function exportar() {
  const lista = filtrados();
  if (!lista.length) { toast('No hay lotes para exportar con los filtros actuales.', 'warning'); return; }
  const cat = await getCatalogos();
  const filas = lista.flatMap((l) => (l.brom_resultados_analisis || []).map((r) => ({ l, r, m: criterio(cat.metodos.find((x) => x.id === r.metodo_id), cat.spec(l.receta_id, r.metodo_id)) })));
  const csv = toCSV(filas, [
    { label: 'Fecha del lote', get: (x) => fmtDate(x.l.fecha) },
    { label: 'Lote', get: (x) => x.l.lote },
    { label: 'Código de receta', get: (x) => x.l.receta?.codigo },
    { label: 'Receta', get: (x) => x.l.receta?.nombre_receta },
    { label: 'Método', get: (x) => x.m.metodo },
    { label: 'Resultado', get: (x) => (x.r.resultado_texto ?? (x.r.resultado === null ? '' : Number(x.r.resultado))) },
    { label: 'Unidad', get: (x) => x.m.unidades },
    { label: 'Referencia', get: (x) => refLabel(x.m) },
    { label: 'Dictamen del método', get: (x) => (x.r.cumple === true ? 'Cumple' : x.r.cumple === false ? 'No cumple' : 'Pendiente') },
    { label: 'Dictamen del lote', get: (x) => (x.l.dictamen_global === true ? 'Cumple' : x.l.dictamen_global === false ? 'No cumple' : 'Pendiente') },
    { label: 'Registró', get: (x) => x.r.analista_texto },
  ]);
  descargar(`lotes-analizados-${todayISO()}.csv`, csv);
  toast(`Se exportaron ${fmtNum(filas.length)} resultados de ${fmtNum(lista.length)} lotes.`, 'success');
}

// ---------------------------------------------------------------------
// Formulario de lote (nuevo o edición)
// ---------------------------------------------------------------------
// Evaluación previa en pantalla (orientativa): la definitiva la hace la base de datos
function prever(m, valor) {
  if (valor === '' || valor === null || valor === undefined) return null;
  const p = m.parametro_referencia || 'ninguno';
  if (m.tipo_resultado !== 'numerico') {
    return p === 'exacto' ? String(valor).trim().toLowerCase() === String(m.valor_referencia_texto || '').trim().toLowerCase() : true;
  }
  const v = Number(valor), ref = m.valor_referencia === null ? null : Number(m.valor_referencia), max = m.valor_referencia_max === null ? null : Number(m.valor_referencia_max);
  if (!Number.isFinite(v)) return null;
  if (p === 'minimo') return ref !== null && v >= ref;
  if (p === 'maximo') return ref !== null && v <= ref;
  if (p === 'exacto') return ref !== null && v === ref;
  if (p === 'rango') return ref !== null && max !== null && v >= ref && v <= max;
  return true;
}

function calendario(sel) {
  const hoy = todayISO();
  let cursor = (sel || hoy).slice(0, 7);
  const wrap = document.createElement('div');
  wrap.className = 'cal';
  const dibujar = (valor) => {
    const [y, mo] = cursor.split('-').map(Number);
    const ini = (new Date(Date.UTC(y, mo - 1, 1)).getUTCDay() + 6) % 7;
    const dias = new Date(Date.UTC(y, mo, 0)).getUTCDate();
    const celdas = Array.from({ length: ini }, () => '<span></span>').concat(Array.from({ length: dias }, (_, i) => {
      const iso = `${cursor}-${String(i + 1).padStart(2, '0')}`;
      return `<button type="button" class="cal-d ${iso === valor ? 'sel' : ''} ${iso === hoy ? 'hoy' : ''}" data-cal-d="${iso}" ${iso > hoy ? 'disabled title="Fecha futura"' : ''}>${i + 1}</button>`;
    }));
    wrap.innerHTML = `<div class="cal-head"><button type="button" class="icon-btn" data-cal="-1" aria-label="Mes anterior">${icon('chevron-left')}</button>
      <b>${esc(mesLargo(cursor))}</b><button type="button" class="icon-btn" data-cal="1" aria-label="Mes siguiente">${icon('chevron-right')}</button></div>
      <div class="cal-sem">${['L', 'M', 'M', 'J', 'V', 'S', 'D'].map((d) => `<span>${d}</span>`).join('')}</div>
      <div class="cal-grid">${celdas.join('')}</div>
      <div class="cal-foot"><button type="button" class="link-btn" data-cal-d="${hoy}">Hoy</button></div>`;
    refreshIcons();
  };
  wrap.mover = (d, valor) => {
    const [y, mo] = cursor.split('-').map(Number);
    const f = new Date(Date.UTC(y, mo - 1 + d, 1));
    cursor = `${f.getUTCFullYear()}-${String(f.getUTCMonth() + 1).padStart(2, '0')}`;
    dibujar(valor);
  };
  wrap.dibujar = dibujar;
  dibujar(sel);
  return wrap;
}

export async function openLoteForm(lote = null) {
  let cat;
  try { cat = await getCatalogos({ force: true }); } catch (err) { toast(errMsg(err), 'error'); return false; }
  const edit = !!lote;
  const previos = new Map((lote?.brom_resultados_analisis || []).map((r) => [r.metodo_id, r]));
  const recetas = cat.recetas.filter((r) => r.activa || r.id === lote?.receta_id);
  if (!recetas.length) { toast('No hay recetas activas. Registra una en Recetas y métodos.', 'warning'); return false; }
  const fecha0 = lote?.fecha || '';
  const body = `
    <div class="lote-form">
      <section class="lf-block">
        <div class="lf-title">${icon('calendar-days')} Fecha y lote</div>
        <div class="field"><label>Fecha del lote <span class="req">*</span></label>
          <input type="hidden" name="fecha" value="${esc(fecha0)}">
          <button type="button" class="date-btn" data-date-btn aria-haspopup="dialog">${icon('calendar')}<span>${fecha0 ? esc(fmtDateLarga(fecha0)) : 'Selecciona una fecha'}</span></button>
          <div class="cal-pop hidden" data-cal-pop></div></div>
        <div class="field"><label for="lf-lote">Número de lote</label>
          <input id="lf-lote" name="lote" readonly value="${esc(lote?.lote || '')}" placeholder="Se genera con la fecha (DDMMAA)">
          <small class="hint">Se genera automáticamente con la fecha: 27/09/2026 → 270926.</small></div>
      </section>
      <section class="lf-block">
        <div class="lf-title">${icon('book-open')} Receta</div>
        <div class="field"><label for="lf-receta">Receta <span class="req">*</span></label>
          <select id="lf-receta" name="receta" data-buscar required><option value="">Selecciona una receta</option>
          ${recetas.map((r) => `<option value="${esc(r.id)}" ${r.id === lote?.receta_id ? 'selected' : ''}>${esc(r.codigo)} — ${esc(r.nombre_receta)}${r.activa ? '' : ' (inactiva)'}</option>`).join('')}</select></div>
      </section>
      <section class="lf-block full">
        <div class="lf-title">${icon('list-checks')} Métodos y resultados <span class="pill info">Dictamen automático</span></div>
        <p class="hint" style="margin-top:0">Marca los métodos que se realizaron y captura su resultado. La referencia mostrada ya considera la especificación particular de la receta.</p>
        <div class="metodo-grid" data-metodos>${emptyState({ ico: 'book-open', title: 'Selecciona una receta', text: 'Se mostrarán los métodos disponibles con su referencia.' })}</div>
      </section>
    </div>`;

  return openModal({
    title: edit ? `Editar lote ${lote.lote}` : 'Nuevo lote',
    subtitle: edit ? 'Modifica la fecha, la receta o los resultados. No se crea un lote nuevo.' : 'Registra el lote, selecciona los métodos y captura sus resultados.',
    size: 'lg', submitText: edit ? 'Guardar cambios' : 'Registrar lote', body,
    onOpen: ({ form }) => {
      const pop = form.querySelector('[data-cal-pop]');
      const btnFecha = form.querySelector('[data-date-btn]');
      const cal = calendario(fecha0);
      pop.appendChild(cal);
      const ponerFecha = (iso) => {
        form.elements.fecha.value = iso;
        btnFecha.querySelector('span').textContent = fmtDateLarga(iso);
        // En edición se conserva el número original mientras no cambie la fecha
        form.elements.lote.value = edit && iso === fecha0 ? lote.lote : loteDesdeFecha(iso);
        btnFecha.closest('.field').classList.remove('invalid');
        btnFecha.closest('.field').querySelector('.field-error')?.remove();
        form.dispatchEvent(new Event('input'));
      };
      btnFecha.addEventListener('click', () => { pop.classList.toggle('hidden'); cal.dibujar(form.elements.fecha.value); });
      pop.addEventListener('click', (e) => {
        const d = e.target.closest('[data-cal-d]');
        if (d && !d.disabled) { ponerFecha(d.dataset.calD); pop.classList.add('hidden'); return; }
        const mv = e.target.closest('[data-cal]');
        if (mv) cal.mover(Number(mv.dataset.cal), form.elements.fecha.value);
      });
      form.addEventListener('mousedown', (e) => { if (!pop.classList.contains('hidden') && !e.target.closest('[data-cal-pop], [data-date-btn]')) pop.classList.add('hidden'); });

      const box = form.querySelector('[data-metodos]');
      const pintarMetodos = () => {
        const recetaId = form.elements.receta.value;
        if (!recetaId) return;
        // Conserva lo capturado al cambiar de receta
        const capt = new Map([...box.querySelectorAll('.metodo-card')].map((c) => [c.dataset.id, { on: c.querySelector('[data-chk]').checked, v: c.querySelector('[data-val]').value }]));
        const metodos = cat.metodos.filter((m) => m.activo || previos.has(m.id));
        if (!metodos.length) { box.innerHTML = emptyState({ ico: 'book-x', title: 'Sin métodos activos', text: 'Registra métodos en Recetas y métodos.' }); refreshIcons(); return; }
        box.innerHTML = metodos.map((m0) => {
          const m = criterio(m0, cat.spec(recetaId, m0.id));
          const prev = previos.get(m0.id);
          const c = capt.get(m0.id);
          const on = c ? c.on : !!prev;
          const val = c ? c.v : (prev ? (prev.resultado_texto ?? prev.resultado ?? '') : '');
          const input = m.tipo_resultado === 'numerico'
            ? `<input type="number" step="any" data-val value="${esc(val)}" placeholder="Resultado${m.unidades ? ` (${esc(m.unidades)})` : ''}" aria-label="Resultado de ${esc(m.metodo)}" ${on ? '' : 'disabled'}>`
            : m.tipo_resultado === 'positivo_negativo'
              ? `<select data-val aria-label="Resultado de ${esc(m.metodo)}" ${on ? '' : 'disabled'}><option value="">Selecciona…</option>${['Positivo', 'Negativo'].map((o) => `<option ${val === o ? 'selected' : ''}>${o}</option>`).join('')}</select>`
              : `<input type="text" maxlength="120" data-val value="${esc(val)}" placeholder="Resultado" aria-label="Resultado de ${esc(m.metodo)}" ${on ? '' : 'disabled'}>`;
          return `<div class="metodo-card ${on ? 'on' : ''}" data-id="${esc(m0.id)}">
            <label class="mc-head"><input type="checkbox" data-chk ${on ? 'checked' : ''}><span class="mc-box">${icon('check')}</span>
              <span class="mc-name"><b>${esc(m.metodo)}</b><small>${esc(tipoLabel(m.tipo_resultado))}${m0.activo ? '' : ' · inactivo'}</small></span></label>
            <div class="mc-ref ${m.particular ? 'part' : ''}">${icon('target')} ${esc(refLabel(m))}${m.particular ? ' · específico de la receta' : ''}</div>
            <div class="mc-in">${input}<span class="mc-prev" data-prev></span></div>
          </div>`;
        }).join('');
        box.querySelectorAll('.metodo-card').forEach(previa);
        refreshIcons();
      };
      const previa = (card) => {
        const m = criterio(cat.metodos.find((x) => x.id === card.dataset.id), cat.spec(form.elements.receta.value, card.dataset.id));
        const on = card.querySelector('[data-chk]').checked;
        const r = on ? prever(m, card.querySelector('[data-val]').value) : null;
        card.querySelector('[data-prev]').innerHTML = !on || r === null ? '' : r ? `<span class="pill ok">${icon('check')} Cumple</span>` : `<span class="pill bad">${icon('x')} No cumple</span>`;
        refreshIcons();
      };
      box.addEventListener('change', (e) => {
        const card = e.target.closest('.metodo-card');
        if (!card) return;
        if (e.target.matches('[data-chk]')) {
          card.classList.toggle('on', e.target.checked);
          const inp = card.querySelector('[data-val]');
          inp.disabled = !e.target.checked;
          if (e.target.checked) inp.focus();
        }
        previa(card);
      });
      box.addEventListener('input', (e) => { const card = e.target.closest('.metodo-card'); if (card && e.target.matches('[data-val]')) previa(card); });
      form.elements.receta.addEventListener('change', pintarMetodos);
      pintarMetodos();
    },
    onSubmit: async ({ form, setError }) => {
      const fecha = form.elements.fecha.value;
      const recetaId = form.elements.receta.value;
      const loteNum = form.elements.lote.value.trim();
      if (!fecha) { setError('Selecciona la fecha del lote.'); return false; }
      if (fecha > todayISO()) { setError('La fecha del lote no puede ser futura.'); return false; }
      if (!recetaId) { setError('Selecciona una receta.'); return false; }
      const cards = [...form.querySelectorAll('.metodo-card')].filter((c) => c.querySelector('[data-chk]').checked);
      if (!cards.length) { setError('Selecciona al menos un método.'); return false; }
      const faltan = cards.filter((c) => !String(c.querySelector('[data-val]').value).trim());
      if (faltan.length) {
        faltan[0].querySelector('[data-val]').focus();
        setError(`Captura el resultado de ${faltan.length === 1 ? 'el método seleccionado' : `los ${faltan.length} métodos seleccionados`}.`);
        return false;
      }
      const resultados = cards.map((c) => {
        const m = cat.metodos.find((x) => x.id === c.dataset.id);
        const v = String(c.querySelector('[data-val]').value).trim();
        const num = m.tipo_resultado === 'numerico';
        return { metodo_id: m.id, tipo_resultado: m.tipo_resultado, resultado: num ? Number(v) : null, resultado_texto: num ? null : v, analista: state.profile.nombre };
      });
      if (resultados.some((r) => r.tipo_resultado === 'numerico' && !Number.isFinite(r.resultado))) { setError('Revisa los resultados numéricos.'); return false; }
      if (edit && !state.isAdmin && [...previos.keys()].some((id) => !resultados.some((r) => r.metodo_id === id))) {
        setError('Solo un administrador puede quitar métodos ya capturados.'); return false;
      }
      // Aviso (no bloquea) si ya existe el mismo lote con la misma receta
      const dup = lotes.find((l) => l.id !== lote?.id && l.lote === loteNum && l.receta_id === recetaId);
      if (dup && !(await confirmDialog({ title: 'Lote ya registrado', message: `Ya existe el lote ${loteNum} para esta receta (${fmtDate(dup.fecha)}). ¿Deseas registrarlo de todos modos?`, confirmText: 'Sí, continuar' }))) return false;

      if (!edit) {
        const { error } = await sb.rpc('brom_registrar_muestra_con_resultados', {
          p_lote: loteNum, p_receta_id: recetaId, p_usuario_id: state.session.user.id, p_resultados: resultados, p_fecha_lote: fecha,
        });
        if (error) throw error;
        toast(`Lote ${loteNum} registrado.`, 'success');
      } else {
        await actualizarLote(lote, { loteNum, recetaId, fecha, resultados });
        toast(`Lote ${loteNum} actualizado.`, 'success');
      }
      invalidarCatalogos();
      return true;
    },
  });
}
ganchos.openLoteForm = openLoteForm;

const fmtDateLarga = (iso) => new Intl.DateTimeFormat('es-MX', { timeZone: 'UTC', weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }).format(new Date(`${iso}T12:00:00Z`));

// Edición en una sola transacción (RPC). Si la función aún no existe en la base,
// se usa el procedimiento anterior por pasos.
async function actualizarLote(lote, { loteNum, recetaId, fecha, resultados }) {
  const { error } = await sb.rpc('brom_actualizar_muestra_con_resultados', {
    p_muestra_id: lote.id, p_lote: loteNum, p_receta_id: recetaId, p_fecha_lote: fecha, p_resultados: resultados,
  });
  if (!error) return;
  if (error.code !== 'PGRST202' && !/could not find the function/i.test(error.message)) throw error;
  const r1 = await sb.from('brom_muestras').update({ lote: loteNum, receta_id: recetaId, fecha_analisis: `${fecha}T00:00:00-06:00` }).eq('id', lote.id);
  if (r1.error) throw r1.error;
  const previos = lote.brom_resultados_analisis || [];
  for (const r of resultados) {
    const old = previos.find((p) => p.metodo_id === r.metodo_id);
    const fila = { resultado: r.resultado, resultado_texto: r.resultado_texto, analista_texto: r.analista };
    const q = old
      ? await sb.from('brom_resultados_analisis').update(fila).eq('id', old.id)
      : await sb.from('brom_resultados_analisis').insert({ ...fila, muestra_id: lote.id, metodo_id: r.metodo_id });
    if (q.error) throw q.error;
  }
  const quitar = previos.filter((p) => !resultados.some((r) => r.metodo_id === p.metodo_id)).map((p) => p.id);
  if (quitar.length) {
    const q = await sb.from('brom_resultados_analisis').delete().in('id', quitar);
    if (q.error) throw q.error;
  }
}
