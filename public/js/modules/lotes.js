// =====================================================================
// Lotes y liberación (brom_muestras): registro, captura de análisis por área,
// liberación por la Jefatura de calidad y certificado de calidad.
// El dictamen de cada resultado lo calcula brom_evaluar_resultado; quién
// captura cada área lo valida brom_validar_resultado; la liberación la
// valida brom_liberar_lote (todos los análisis requeridos deben cumplir).
// =====================================================================
import {
  sb, state, esc, icon, refreshIcons, toast, errMsg, openModal, confirmDialog, emptyState, errorState,
  fmtDate, fmtDateTime, fmtNum, todayISO, fechaLote, loteDesdeFecha, mesLargo, dictamenPill, refLabel, resultadoTxt, tipoLabel, criterio,
  getCatalogos, invalidarCatalogos, fetchAll, toCSV, descargar, debounce, sanitizeSearch, ganchos, estadoLote, estadoPill, ESTADOS_LOTE,
  puedeCapturar, puedeLiberar, recetaTxt, roleLabel, getDirectorio, avatarHTML, puedeElegirFirmas, FIRMAS, especieIco, especieHTML, avisar,
} from '../core.js';
import { generarCertificado } from './certificado.js';

const POR_PAGINA = 12;
let root = null, token = 0, lotes = [], pagina = 1, cat = null, dir = null;

const SELECT_LOTE = 'id, lote, fecha_analisis, dictamen_global, usuario_id, created_at, receta_id, folio_certificado, liberado_en, liberado_por_nombre, liberado_por_puesto, observaciones_liberacion, firma_jefe_id, firma_jefe_nombre, firma_jefe_puesto, firma_inspector_id, firma_inspector_nombre, firma_inspector_puesto, brom_resultados_analisis(id, metodo_id, resultado, resultado_texto, cumple, analista_texto, created_at)';

export default {
  async render(el, params = {}) {
    root = el; pagina = 1;
    el.innerHTML = `
      <section class="page-intro">
        <div><span class="eyebrow">Calidad de producto</span><h1>Lotes y liberación</h1>
          <p>Cada lote se libera cuando sus análisis bromatológicos, fisicoquímicos, microbiológicos y sensoriales cumplen la especificación.</p></div>
        <div class="page-actions">
          <button class="btn c-sheets" data-l="csv">${icon('file-spreadsheet')} Exportar</button>
          <button class="btn primary" data-l="nuevo">${icon('plus')} Nuevo lote</button>
        </div>
      </section>
      <div class="toolbar">
        <div class="search lote-search">${icon('search')}<input id="l-q" type="search" placeholder="Buscar por número de lote o folio" aria-label="Buscar lote" autocomplete="off"></div>
        <label class="sr-only" for="l-receta">Receta</label><select id="l-receta"><option value="">Todas las recetas</option></select>
        <label class="sr-only" for="l-estado">Estado</label>
        <select id="l-estado"><option value="">Todos los estados</option>${Object.entries(ESTADOS_LOTE).map(([k, v]) => `<option value="${k}">${v.label}</option>`).join('')}</select>
        <label class="sr-only" for="l-mes">Periodo</label><select id="l-mes"><option value="">Todo el histórico</option></select>
      </div>
      <div id="l-resumen" class="lote-resumen"></div>
      <div id="l-body"></div>`;
    if (params.estado) el.querySelector('#l-estado').value = params.estado;
    if (params.q) el.querySelector('#l-q').value = params.q;
    el.addEventListener('click', onClick);
    el.querySelector('#l-q').addEventListener('input', debounce(() => { pagina = 1; pintar(); }, 250));
    el.querySelectorAll('#l-receta, #l-estado, #l-mes').forEach((s) => s.addEventListener('change', () => { pagina = 1; pintar(); }));
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
    const [c, data, d] = await Promise.all([
      getCatalogos({ force: true }),
      fetchAll(() => sb.from('brom_muestras').select(SELECT_LOTE).order('fecha_analisis', { ascending: false }).order('created_at', { ascending: false })),
      getDirectorio(),
    ]);
    if (t !== token || !root) return;
    cat = c; dir = d;
    lotes = data.map((m) => {
      const res = m.brom_resultados_analisis || [];
      return { ...m, res, receta: cat.recetas.find((r) => r.id === m.receta_id) || null, fecha: fechaLote(m.fecha_analisis), ...estadoLote(m, res, cat) };
    });
    llenarFiltros();
    pintar();
  } catch (err) {
    if (t !== token || !root) return;
    console.error(err);
    body.innerHTML = errorState(err).replace('data-action="retry"', 'data-l="retry"');
    refreshIcons();
  }
}

function llenarFiltros() {
  const selR = root.querySelector('#l-receta'), selM = root.querySelector('#l-mes');
  const r0 = selR.value, m0 = selM.value;
  selR.innerHTML = '<option value="">Todas las recetas</option>' + cat.recetas.map((r) => `<option value="${esc(r.id)}">${esc(recetaTxt(r))}</option>`).join('');
  const meses = [...new Set(lotes.map((l) => l.fecha.slice(0, 7)).filter(Boolean))].sort().reverse();
  selM.innerHTML = '<option value="">Todo el histórico</option>' + meses.map((m) => `<option value="${m}">${esc(mesLargo(m))}</option>`).join('');
  selR.value = r0; selM.value = meses.includes(m0) ? m0 : '';
}

function filtrados() {
  const q = sanitizeSearch(root.querySelector('#l-q').value).toLowerCase();
  const rec = root.querySelector('#l-receta').value, est = root.querySelector('#l-estado').value, mes = root.querySelector('#l-mes').value;
  return lotes.filter((l) => (!q || String(l.lote).toLowerCase().includes(q) || String(l.folio_certificado || '').toLowerCase().includes(q))
    && (!rec || l.receta_id === rec) && (!est || l.estado === est) && (!mes || l.fecha.startsWith(mes)));
}

function pintar() {
  if (!root) return;
  const lista = filtrados();
  const body = root.querySelector('#l-body');
  const n = (e) => lotes.filter((l) => l.estado === e).length;
  // Resumen en recuadros: lotes mostrados y uno por estado (al tocarlo filtra)
  const estSel = root.querySelector('#l-estado').value;
  root.querySelector('#l-resumen').innerHTML = lotes.length ? `<button class="rs-tile ${estSel ? '' : 'on'}" data-filtro="" style="--ec:#F58020">
      <span class="rs-ico">${icon('layers')}</span><span class="rs-txt"><b>${fmtNum(lista.length)}<small> de ${fmtNum(lotes.length)}</small></b><span>Lotes mostrados</span></span></button>`
    + Object.entries(ESTADOS_LOTE).map(([k, v]) => `<button class="rs-tile ${estSel === k ? 'on' : ''}" data-filtro="${k}" style="--ec:${esc(v.color)}">
      <span class="rs-ico">${icon(v.ico)}</span><span class="rs-txt"><b>${fmtNum(n(k))}</b><span>${esc(v.label)}</span></span></button>`).join('') : '';
  if (!lotes.length) {
    body.innerHTML = emptyState({ ico: 'flask-conical', title: 'Aún no hay lotes registrados', text: 'Registra el primer lote con sus análisis.', action: `<button class="btn primary" data-l="nuevo">${icon('plus')} Nuevo lote</button>` });
    refreshIcons(); return;
  }
  if (!lista.length) {
    body.innerHTML = emptyState({ ico: 'search-x', title: 'Sin resultados', text: 'No hay lotes que coincidan con los filtros aplicados.' });
    refreshIcons(); return;
  }
  const paginas = Math.max(1, Math.ceil(lista.length / POR_PAGINA));
  pagina = Math.min(pagina, paginas);
  const desde = (pagina - 1) * POR_PAGINA;
  body.innerHTML = `<div class="lote-grid">${lista.slice(desde, desde + POR_PAGINA).map(tarjeta).join('')}</div>
    <div class="pager">
      <span>Mostrando <b>${fmtNum(desde + 1)} a ${fmtNum(Math.min(lista.length, desde + POR_PAGINA))}</b> de <b>${fmtNum(lista.length)}</b> lotes</span>
      <div class="pager-ctrl">
        <button class="btn secondary sm" data-pg="${pagina - 1}" ${pagina <= 1 ? 'disabled' : ''}>${icon('chevron-left')} Anterior</button>
        <span>Página ${pagina} de ${paginas}</span>
        <button class="btn secondary sm" data-pg="${pagina + 1}" ${pagina >= paginas ? 'disabled' : ''}>Siguiente ${icon('chevron-right')}</button>
      </div>
    </div>`;
  refreshIcons();
}

const esDueno = (l) => l.usuario_id === state.session?.user?.id;
const capturaAlgo = () => cat.areas.some((a) => a.activa !== false && puedeCapturar(a));

// Quién registró el lote y quiénes capturaron análisis, con su foto
function personas(l) {
  const reg = dir?.porId(l.usuario_id);
  const otros = [...new Set(l.res.map((r) => r.analista_texto).filter(Boolean))].filter((n) => n !== reg?.nombre_completo);
  const foto = (n, u) => avatarHTML(n, (u || dir?.porNombre(n))?.foto, 'sm');
  return `<div class="lote-gente">
    ${reg ? `<span class="persona" title="Registró el lote">${foto(reg.nombre_completo, reg)}<span><small>Registró</small><b>${esc(reg.nombre_completo)}</b></span></span>` : ''}
    ${otros.length ? `<span class="persona" title="${esc(otros.join(', '))}"><span class="avatares">${otros.slice(0, 4).map((n) => foto(n)).join('')}</span><span><small>Capturó</small><b>${esc(otros.length === 1 ? otros[0] : `${otros[0]} y ${otros.length - 1} más`)}</b></span></span>` : ''}
  </div>`;
}

function tarjeta(l) {
  const color = l.receta?.color || '#64748B';
  const filasArea = cat.areas.map((a) => {
    const rs = l.res.filter((r) => cat.metodos.find((m) => m.id === r.metodo_id)?.area === a.id)
      .sort((x, y) => cat.metodos.findIndex((m) => m.id === x.metodo_id) - cat.metodos.findIndex((m) => m.id === y.metodo_id));
    if (!rs.length) return '';
    return `<tr class="area-row"><td colspan="4"><span class="area-dot" style="--ac:${esc(a.color)}"></span>${esc(a.nombre)}</td></tr>` + rs.map((r) => {
      const m = criterio(cat.metodos.find((x) => x.id === r.metodo_id), cat.spec(l.receta_id, r.metodo_id));
      return `<tr><td class="cell-main">${esc(m.metodo || '—')}</td><td><b>${esc(resultadoTxt(r, m))}</b></td><td class="cell-sub">${esc(refLabel(m))}</td><td>${dictamenPill(r.cumple)}</td></tr>`;
    }).join('');
  }).join('');
  const editable = !l.liberado_en && (state.isAdmin || esDueno(l) || capturaAlgo());
  return `<article class="card lote-card est-${l.estado}" style="--rc:${esc(color)}">
    <header class="lote-head">
      <div><span class="lote-num">${icon('package')} Lote ${esc(l.lote)}</span>
        <p class="lote-receta"><span class="receta-dot" style="--rc:${esc(color)}"></span><b>${esc(l.receta?.nombre_receta || 'Receta no disponible')}</b>
          ${l.receta ? `<span class="codigo">${esc(l.receta.codigo)}</span>${especieHTML(l.receta.especie)}` : ''}</p></div>
      ${estadoPill(l.estado)}
    </header>
    <div class="lote-meta"><span>${icon('calendar')} ${fmtDate(l.fecha)}</span>
      <span>${icon('list-checks')} ${l.completos} de ${l.requeridos} análisis evaluados</span></div>
    ${personas(l)}
    <div class="area-progreso">${l.porArea.map((p) => `<span class="ap ${p.noCumple ? 'bad' : p.pendientes ? 'warn' : 'ok'}" style="--ac:${esc(p.area.color)}" title="${esc(p.area.nombre)}: ${p.cumple} de ${p.total} cumplen${p.noCumple ? `, ${p.noCumple} no cumplen` : ''}">
      ${icon(p.noCumple ? 'x' : p.pendientes ? 'hourglass' : 'check')}<b>${esc(p.area.nombre)}</b><small>${p.cumple} de ${p.total}</small></span>`).join('')}</div>
    ${l.liberado_en ? `<div class="liberado-info">${icon('badge-check')}<span>Liberado por <b>${esc(l.liberado_por_nombre || '—')}</b> el ${fmtDateTime(l.liberado_en)} · Folio <b>${esc(l.folio_certificado)}</b>${l.firma_jefe_id ? `<br>Firman: ${esc(l.firma_jefe_nombre)} y ${esc(l.firma_inspector_nombre)}` : '<br>Firmas del certificado pendientes de elegir'}</span></div>` : ''}
    ${filasArea ? `<details class="lote-det"><summary>${icon('chevron-down')} Ver los ${l.res.length} análisis capturados</summary><div class="table-wrap"><table class="table compact"><thead><tr><th>Método</th><th>Resultado</th><th>Especificación</th><th>Dictamen</th></tr></thead><tbody>${filasArea}</tbody></table></div></details>`
      : '<p class="cell-sub" style="margin:0">Sin análisis capturados.</p>'}
    <footer class="lote-acts">
      ${l.liberado_en ? `<button class="btn c-teal sm" data-l="certificado" data-id="${esc(l.id)}">${icon('file-check-2')} Certificado de calidad</button>` : ''}
      ${l.estado === 'listo' && puedeLiberar() ? `<button class="btn c-green sm" data-l="liberar" data-id="${esc(l.id)}">${icon('badge-check')} Liberar lote</button>` : ''}
      ${editable ? `<button class="btn c-blue sm" data-l="editar" data-id="${esc(l.id)}">${icon('pencil')} ${esDueno(l) || state.isAdmin ? 'Editar y capturar' : 'Capturar análisis'}</button>` : ''}
      ${l.liberado_en && l.firma_jefe_id && state.isAdmin ? `<button class="btn s-purple sm" data-l="firmas" data-id="${esc(l.id)}">${icon('pen-line')} Firmas</button>` : ''}
      ${l.liberado_en && state.isAdmin ? `<button class="btn s-amber sm" data-l="revertir" data-id="${esc(l.id)}">${icon('rotate-ccw')} Revertir liberación</button>` : ''}
      ${state.isAdmin ? `<button class="btn s-red sm" data-l="borrar" data-id="${esc(l.id)}">${icon('trash-2')} Borrar</button>` : ''}
    </footer>
  </article>`;
}

async function onClick(e) {
  const pg = e.target.closest('[data-pg]');
  if (pg && !pg.disabled) { pagina = Number(pg.dataset.pg); pintar(); root.querySelector('.toolbar')?.scrollIntoView({ behavior: 'smooth', block: 'start' }); return; }
  const fl = e.target.closest('[data-filtro]');
  if (fl) { const s = root.querySelector('#l-estado'); s.value = s.value === fl.dataset.filtro ? '' : fl.dataset.filtro; s.dispatchEvent(new Event('change')); return; }
  const a = e.target.closest('[data-l]');
  if (!a) return;
  const act = a.dataset.l;
  if (act === 'retry') return cargar();
  if (act === 'nuevo') { if (await openLoteForm()) cargar(); return; }
  if (act === 'csv') return exportar();
  const l = lotes.find((x) => x.id === a.dataset.id);
  if (!l) return;
  if (act === 'editar') { if (await openLoteForm(l)) cargar(); return; }
  if (act === 'liberar') { if (await liberar(l)) cargar(); return; }
  if (act === 'certificado') {
    a.disabled = true;
    try { await certificado(l); } catch (err) { console.error(err); toast(errMsg(err), 'error'); }
    a.disabled = false; return;
  }
  if (act === 'firmas') { if (await elegirFirmas(l, true)) cargar(); return; }
  if (act === 'revertir') {
    const r = await confirmDialog({
      title: `¿Revertir la liberación del lote ${l.lote}?`, danger: true, confirmText: 'Revertir liberación',
      message: `El certificado ${l.folio_certificado} deja de ser válido y el lote vuelve a quedar abierto para corregir sus análisis. Queda registrado en la bitácora.`,
      input: { label: 'Motivo de la reversión', required: true, maxlength: 300, placeholder: 'Por ejemplo: corrección del resultado de humedad' },
    });
    if (!r) return;
    const { error } = await sb.rpc('brom_revertir_liberacion', { p_muestra_id: l.id, p_motivo: r.value });
    if (error) { toast(errMsg(error), 'error'); return; }
    toast(`Se revirtió la liberación del lote ${l.lote}.`, 'success');
    cargar(); return;
  }
  if (act === 'borrar') {
    const ok = await confirmDialog({
      title: `¿Borrar el lote ${l.lote}?`, danger: true, confirmText: 'Borrar lote',
      message: `Se eliminará el lote y sus ${l.res.length} resultados${l.liberado_en ? `, incluido el registro de su liberación (folio ${l.folio_certificado})` : ''}. Esta acción no se puede deshacer.`,
    });
    if (!ok) return;
    const { error } = await sb.from('brom_muestras').delete().eq('id', l.id);
    if (error) { toast(errMsg(error), 'error'); return; }
    toast(`Lote ${l.lote} eliminado.`, 'success');
    cargar();
  }
}

// ---------------------------------------------------------------------
// Liberación
// ---------------------------------------------------------------------
// Firmas del certificado: un Jefe de calidad y un Inspector de calidad (según su puesto)
function camposFirmas(l = {}) {
  const lista = (tipo) => (dir?.lista || []).filter((u) => u.activo && u.firma_certificado === tipo);
  const jefes = lista('jefe_calidad'), insp = lista('inspector');
  const yo = state.session?.user?.id;
  const jefe0 = l.firma_jefe_id || (jefes.some((u) => u.id === yo) ? yo : jefes.length === 1 ? jefes[0].id : '');
  const opc = (us, sel) => us.map((u) => `<option value="${esc(u.id)}" ${u.id === sel ? 'selected' : ''}>${esc(u.nombre_completo)}</option>`).join('');
  if (!jefes.length || !insp.length) {
    return `<div class="notice warn">${icon('triangle-alert')}<span>Para firmar el certificado se necesita al menos una persona activa con puesto que firme como <b>Jefe de calidad</b> y otra como <b>Inspector de calidad</b> (Usuarios → Puestos y permisos).</span></div>`;
  }
  return `<div class="firmas-pick">
    <div class="field"><label for="fx-jefe">${icon('pen-line')} Firma del ${FIRMAS.jefe_calidad} <span class="req">*</span></label>
      <select id="fx-jefe" name="jefe" required><option value="">Selecciona</option>${opc(jefes, jefe0)}</select></div>
    <div class="field"><label for="fx-insp">${icon('pen-line')} Firma del ${FIRMAS.inspector} <span class="req">*</span></label>
      <select id="fx-insp" name="inspector" required><option value="">Selecciona</option>${opc(insp, l.firma_inspector_id || '')}</select></div>
  </div>`;
}

async function liberar(l) {
  const filas = l.porArea.map((p) => `<li><span class="area-dot" style="--ac:${esc(p.area.color)}"></span><b>${esc(p.area.nombre)}</b> ${p.cumple} de ${p.total} análisis cumplen</li>`).join('');
  const r = await openModal({
    title: `Liberar el lote ${l.lote}`, subtitle: `${recetaTxt(l.receta)} · Lote del ${fmtDate(l.fecha)}`, submitText: 'Liberar y emitir certificado', confirmDiscard: false,
    body: `<div class="notice">${icon('shield-check')}<span>Todos los análisis requeridos cumplen la especificación. Al liberar se asigna un folio y se emite el certificado de calidad.</span></div>
      <ul class="lib-areas">${filas}</ul>
      ${camposFirmas()}
      <p class="hint">${icon('info')} Las firmas quedan guardadas para este certificado.</p>
      <div class="field"><label for="lib-obs">Observaciones (opcional)</label><textarea id="lib-obs" name="obs" maxlength="400" data-counter placeholder="Aparecen en el certificado de calidad"></textarea></div>
      <p class="hint">Liberará: <b>${esc(state.profile.nombre)}</b> · ${esc(state.profile.puesto || roleLabel(state.profile.rol))}</p>`,
    onSubmit: async ({ form, setError }) => {
      if (!form.jefe || !form.jefe.value || !form.inspector.value) { setError('Selecciona al Jefe de calidad y al Inspector de calidad que firman el certificado.'); return false; }
      const { data, error } = await sb.rpc('brom_liberar_lote', { p_muestra_id: l.id, p_observaciones: form.obs.value.trim() || null, p_firma_jefe: form.jefe.value, p_firma_inspector: form.inspector.value });
      if (error) throw error;
      avisar();
      return data;
    },
  });
  if (!r) return false;
  toast(`Lote ${l.lote} liberado con el folio ${r}.`, 'success', 6000);
  try {
    const { data } = await sb.from('brom_muestras').select(SELECT_LOTE).eq('id', l.id).single();
    if (data) await generarCertificado(data, data.brom_resultados_analisis || [], cat);
  } catch (err) { console.error(err); toast(`Lote liberado. Descarga el certificado desde la tarjeta del lote. (${errMsg(err)})`, 'warning'); }
  return true;
}

// Elección (la primera vez) o cambio (administrador) de las firmas de un lote liberado
async function elegirFirmas(l, cambio = false) {
  const ok = await openModal({
    title: cambio ? `Firmas del certificado ${l.folio_certificado}` : 'Firmas del certificado de calidad',
    subtitle: `Lote ${l.lote} · ${recetaTxt(l.receta)}`, size: 'sm', submitText: cambio ? 'Guardar firmas' : 'Guardar y descargar', confirmDiscard: false,
    body: `<p class="hint" style="margin-top:0">${cambio ? 'Solo un administrador puede cambiar las firmas ya asignadas.' : 'Elige quién firma este certificado. La elección queda guardada y ya no se vuelve a pedir.'}</p>${camposFirmas(l)}`,
    onSubmit: async ({ form, setError }) => {
      if (!form.jefe || !form.jefe.value || !form.inspector.value) { setError('Selecciona las dos firmas.'); return false; }
      const { error } = await sb.rpc('brom_asignar_firmas', { p_muestra_id: l.id, p_firma_jefe: form.jefe.value, p_firma_inspector: form.inspector.value });
      if (error) throw error;
      return true;
    },
  });
  if (ok) toast('Firmas del certificado guardadas.', 'success');
  return ok;
}

async function certificado(l) {
  if (!l.firma_jefe_id) {
    if (!puedeElegirFirmas()) { toast('Este certificado aún no tiene firmas. Debe elegirlas el Jefe de calidad o un administrador.', 'warning', 6500); return; }
    if (!(await elegirFirmas(l))) return;
  }
  const { data, error } = await sb.from('brom_muestras').select(SELECT_LOTE).eq('id', l.id).single();
  if (error) throw error;
  await generarCertificado(data, data.brom_resultados_analisis || [], cat);
  if (!l.firma_jefe_id) cargar();
}

async function exportar() {
  const lista = filtrados();
  if (!lista.length) { toast('No hay lotes para exportar con los filtros actuales.', 'warning'); return; }
  const filas = lista.flatMap((l) => l.res.map((r) => {
    const m0 = cat.metodos.find((x) => x.id === r.metodo_id);
    return { l, r, a: cat.area(m0?.area), m: criterio(m0, cat.spec(l.receta_id, r.metodo_id)) };
  }));
  const csv = toCSV(filas, [
    { label: 'Fecha del lote', get: (x) => fmtDate(x.l.fecha) },
    { label: 'Lote', get: (x) => x.l.lote },
    { label: 'Código de receta', get: (x) => x.l.receta?.codigo },
    { label: 'Receta', get: (x) => x.l.receta?.nombre_receta },
    { label: 'Especie', get: (x) => x.l.receta?.especie },
    { label: 'Área de análisis', get: (x) => x.a.nombre },
    { label: 'Método', get: (x) => x.m.metodo },
    { label: 'Resultado', get: (x) => (x.r.resultado_texto ?? (x.r.resultado === null ? '' : Number(x.r.resultado))) },
    { label: 'Unidad', get: (x) => x.m.unidades },
    { label: 'Especificación', get: (x) => refLabel(x.m) },
    { label: 'Dictamen del método', get: (x) => (x.r.cumple === true ? 'Cumple' : x.r.cumple === false ? 'No cumple' : 'Pendiente') },
    { label: 'Estado del lote', get: (x) => ESTADOS_LOTE[x.l.estado].label },
    { label: 'Folio del certificado', get: (x) => x.l.folio_certificado },
    { label: 'Registró', get: (x) => x.r.analista_texto },
  ]);
  descargar(`lotes-liberacion-${todayISO()}.csv`, csv);
  toast(`Se exportaron ${fmtNum(filas.length)} resultados de ${fmtNum(lista.length)} lotes.`, 'success');
}

// ---------------------------------------------------------------------
// Formulario de lote (nuevo o edición / captura por área)
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

const DIAS = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];
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
      <div class="cal-sem">${DIAS.map((d) => `<span>${d}</span>`).join('')}</div>
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
const fmtDateLarga = (iso) => new Intl.DateTimeFormat('es-MX', { timeZone: 'UTC', weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }).format(new Date(`${iso}T12:00:00Z`));

function entrada(m, val, on) {
  const aria = `aria-label="Resultado de ${esc(m.metodo)}"`;
  if (m.tipo_resultado === 'numerico') return `<span class="mc-num"><input type="number" step="any" data-val value="${esc(val)}" placeholder="Resultado" ${aria} ${on ? '' : 'disabled'}>${m.unidades ? `<span class="mc-unit">${esc(m.unidades)}</span>` : ''}</span>`;
  if (m.tipo_resultado === 'verificacion') {
    return `<input type="hidden" data-val value="${esc(val)}"><div class="seg-check" role="group" ${aria}>
      <button type="button" class="${val === 'Cumple' ? 'on ok' : ''}" data-ver="Cumple">${icon('check')} Cumple</button>
      <button type="button" class="${val === 'No cumple' ? 'on bad' : ''}" data-ver="No cumple">${icon('x')} No cumple</button></div>`;
  }
  if (m.tipo_resultado === 'positivo_negativo') {
    return `<select data-val ${aria} ${on ? '' : 'disabled'}><option value="">Selecciona una opción</option>${['Positivo', 'Negativo'].map((o) => `<option ${val === o ? 'selected' : ''}>${o}</option>`).join('')}</select>`;
  }
  return `<input type="text" maxlength="120" data-val value="${esc(val)}" placeholder="Resultado" ${aria} ${on ? '' : 'disabled'}>`;
}

export async function openLoteForm(lote = null) {
  let c;
  try { c = await getCatalogos({ force: true }); cat = c; } catch (err) { toast(errMsg(err), 'error'); return false; }
  const edit = !!lote;
  const previos = new Map((lote?.res || lote?.brom_resultados_analisis || []).map((r) => [r.metodo_id, r]));
  const recetas = c.recetas.filter((r) => r.activa || r.id === lote?.receta_id);
  if (!recetas.length) { toast('No hay recetas activas. Registra una en Recetas y métodos.', 'warning'); return false; }
  // Fecha, número de lote y receta: al registrar, o quien registró el lote, o un administrador
  const cabecera = !edit || state.isAdmin || lote.usuario_id === state.session?.user?.id;
  const fecha0 = lote?.fecha || '';
  const rol = state.profile.puesto || roleLabel(state.profile.rol);
  const body = `
    <div class="lote-form">
      <section class="lf-block">
        <div class="lf-title"><span class="lf-step">1</span>${icon('calendar-days')} Fecha y lote</div>
        <div class="field"><label>Fecha del lote <span class="req">*</span></label>
          <input type="hidden" name="fecha" value="${esc(fecha0)}">
          <button type="button" class="date-btn" data-date-btn aria-haspopup="dialog" ${cabecera ? '' : 'disabled'}>${icon('calendar')}<span>${fecha0 ? esc(fmtDateLarga(fecha0)) : 'Selecciona una fecha'}</span></button>
          <div class="cal-pop hidden" data-cal-pop></div></div>
        <div class="field"><label for="lf-lote">Número de lote</label>
          <input id="lf-lote" name="lote" readonly value="${esc(lote?.lote || '')}" placeholder="Se genera con la fecha (día, mes y año)">
          <small class="hint">Se genera con la fecha: 27/09/2026 se convierte en 270926.</small></div>
      </section>
      <section class="lf-block">
        <div class="lf-title"><span class="lf-step">2</span>${icon('book-open')} Receta</div>
        <div class="field"><label for="lf-receta">Receta <span class="req">*</span></label>
          <select id="lf-receta" name="receta" data-buscar required ${cabecera ? '' : 'disabled'}><option value="">Selecciona una receta</option>
          ${recetas.map((r) => `<option value="${esc(r.id)}" ${r.id === lote?.receta_id ? 'selected' : ''}>${esc(recetaTxt(r))}${r.activa ? '' : ' (inactiva)'}</option>`).join('')}</select></div>
        <div class="lf-receta-info" data-receta-info></div>
        ${cabecera ? '' : `<p class="hint">${icon('lock')} Solo quien registró el lote o un administrador cambian la fecha y la receta.</p>`}
      </section>
      <section class="lf-block full lf-analisis">
        <div class="lf-title"><span class="lf-step">3</span>${icon('list-checks')} Análisis por área <span class="pill info">${icon('sparkles')} Dictamen automático</span></div>
        <div class="lf-progreso hidden" data-progreso><div class="lfp-txt"><b data-prog-n>0</b> de <b data-prog-t>0</b> análisis con resultado</div><div class="lfp-bar"><span data-prog-bar></span></div></div>
        <p class="hint" style="margin-top:0">Marca los métodos realizados y captura su resultado. Capturas como <b>${esc(rol)}</b>; las áreas que no te corresponden se muestran solo para consulta.</p>
        <div data-metodos>${emptyState({ ico: 'book-open', title: 'Selecciona una receta', text: 'Se mostrarán los análisis que requiere con su especificación.' })}</div>
      </section>
    </div>`;

  return openModal({
    title: edit ? `Lote ${lote.lote}` : 'Nuevo lote',
    subtitle: edit ? 'Captura o corrige los análisis. Los cambios actualizan el mismo lote.' : 'Registra el lote, selecciona los análisis realizados y captura sus resultados.',
    size: 'lg', submitText: edit ? 'Guardar análisis' : 'Registrar lote', body,
    onOpen: ({ form }) => {
      const pop = form.querySelector('[data-cal-pop]');
      const btnFecha = form.querySelector('[data-date-btn]');
      const calend = calendario(fecha0);
      pop.appendChild(calend);
      const ponerFecha = (iso) => {
        form.elements.fecha.value = iso;
        btnFecha.querySelector('span').textContent = fmtDateLarga(iso);
        form.elements.lote.value = edit && iso === fecha0 ? lote.lote : loteDesdeFecha(iso);
        form.dispatchEvent(new Event('input'));
      };
      btnFecha.addEventListener('click', () => { pop.classList.toggle('hidden'); calend.dibujar(form.elements.fecha.value); });
      pop.addEventListener('click', (e) => {
        const d = e.target.closest('[data-cal-d]');
        if (d && !d.disabled) { ponerFecha(d.dataset.calD); pop.classList.add('hidden'); return; }
        const mv = e.target.closest('[data-cal]');
        if (mv) calend.mover(Number(mv.dataset.cal), form.elements.fecha.value);
      });
      form.addEventListener('mousedown', (e) => { if (!pop.classList.contains('hidden') && !e.target.closest('[data-cal-pop], [data-date-btn]')) pop.classList.add('hidden'); });

      const box = form.querySelector('[data-metodos]');
      // Avance de la captura: análisis marcados con resultado / análisis mostrados
      const progreso = () => {
        const cards = [...box.querySelectorAll('.metodo-card')];
        const n = cards.filter((k) => k.querySelector('[data-chk]').checked && String(k.querySelector('[data-val]').value).trim()).length;
        const p = form.querySelector('[data-progreso]');
        p.classList.toggle('hidden', !cards.length);
        p.querySelector('[data-prog-n]').textContent = n;
        p.querySelector('[data-prog-t]').textContent = cards.length;
        p.querySelector('[data-prog-bar]').style.width = `${cards.length ? Math.round((n / cards.length) * 100) : 0}%`;
        p.classList.toggle('completo', !!cards.length && n === cards.length);
        box.querySelectorAll('.area-sec').forEach((sec) => {
          const ks = [...sec.querySelectorAll('.metodo-card')];
          const h = ks.filter((k) => k.querySelector('[data-chk]').checked && String(k.querySelector('[data-val]').value).trim()).length;
          const el = sec.querySelector('[data-area-n]');
          if (el) { el.textContent = `${h} de ${ks.length}`; el.classList.toggle('ok', h === ks.length); }
        });
      };
      // Resumen de la receta elegida: color, código, especie y análisis requeridos por área
      const infoReceta = () => {
        const r = c.recetas.find((x) => x.id === form.elements.receta.value);
        const el = form.querySelector('[data-receta-info]');
        if (!r) { el.innerHTML = `<div class="lri-vacio">${icon('chef-hat')} Elige la receta para ver los análisis que requiere.</div>`; refreshIcons(); return; }
        const req = c.requeridos(r.id);
        const porArea = c.areas.map((a) => [a, req.filter((m) => m.area === a.id).length]).filter(([, n]) => n);
        el.innerHTML = `<div class="lri" style="--rc:${esc(r.color || '#64748B')}">
          <span class="lri-ico">${icon('chef-hat')}</span>
          <div class="lri-main"><b>${esc(r.nombre_receta)}</b><span><span class="codigo">${esc(r.codigo)}</span>${especieHTML(r.especie)}</span></div>
          <div class="lri-num"><b>${req.length}</b><small>análisis</small></div></div>
          <div class="lri-areas">${porArea.map(([a, n]) => `<span style="--ac:${esc(a.color)}"><i></i>${esc(a.nombre)} <b>${n}</b></span>`).join('')}</div>`;
        refreshIcons();
      };
      const pintarMetodos = () => {
        infoReceta();
        const recetaId = form.elements.receta.value;
        if (!recetaId) { progreso(); return; }
        const capt = new Map([...box.querySelectorAll('.metodo-card')].map((k) => [k.dataset.id, { on: k.querySelector('[data-chk]').checked, v: k.querySelector('[data-val]').value }]));
        const req = new Set(c.requeridos(recetaId).map((m) => m.id));
        box.innerHTML = c.areas.filter((a) => a.activa !== false || c.metodos.some((m) => m.area === a.id && previos.has(m.id))).map((a) => {
          const metodos = c.metodos.filter((m) => m.area === a.id && (req.has(m.id) || previos.has(m.id)));
          if (!metodos.length) return '';
          const puede = puedeCapturar(a);
          return `<section class="area-sec ${puede ? '' : 'solo-lectura'}" style="--ac:${esc(a.color)}" data-area="${esc(a.id)}">
            <header class="area-head"><span class="area-ico">${icon(puede ? 'flask-conical' : 'lock')}</span><b>${esc(a.nombre)}</b><span class="area-n" data-area-n>0 de ${metodos.length}</span>
              ${puede ? (metodos.some((m) => m.tipo_resultado === 'verificacion') ? `<button type="button" class="link-btn" data-todo-cumple>${icon('check-check')} Marcar todo como cumple</button>` : '')
                : `<span class="pill gray">${icon('lock')} Lo captura: ${esc(c.puestosArea(a.id).map((p) => p.nombre).join(' o ') || 'un administrador')}</span>`}</header>
            <div class="metodo-grid">${metodos.map((m0) => {
              const m = criterio(m0, c.spec(recetaId, m0.id));
              const prev = previos.get(m0.id);
              const k = capt.get(m0.id);
              const on = k ? k.on : !!prev;
              const val = k ? k.v : (prev ? (prev.resultado_texto ?? prev.resultado ?? '') : '');
              return `<div class="metodo-card ${on ? 'on' : ''} ${puede ? '' : 'bloq'}" data-id="${esc(m0.id)}" data-tipo="${esc(m.tipo_resultado)}">
                <label class="mc-head"><input type="checkbox" data-chk ${on ? 'checked' : ''} ${puede ? '' : 'disabled'}><span class="mc-box">${icon('check')}</span>
                  <span class="mc-name"><b>${esc(m.metodo)}</b><small>${esc(tipoLabel(m.tipo_resultado))}${m0.activo ? '' : ' · inactivo'}</small></span></label>
                <div class="mc-ref ${m.particular ? 'part' : ''}">${icon('target')} ${esc(refLabel(m))}${m.particular ? ' · específico de la receta' : ''}</div>
                <div class="mc-in">${entrada(m, val, on && puede)}<span class="mc-prev" data-prev></span></div>
              </div>`;
            }).join('')}</div></section>`;
        }).join('') || emptyState({ ico: 'book-x', title: 'Sin análisis configurados', text: 'Registra métodos en Recetas y métodos.' });
        box.querySelectorAll('.metodo-card').forEach(previa);
        progreso();
        refreshIcons();
      };
      const previa = (card) => {
        const m = criterio(c.metodos.find((x) => x.id === card.dataset.id), c.spec(form.elements.receta.value, card.dataset.id));
        const on = card.querySelector('[data-chk]').checked;
        const r = on ? prever(m, card.querySelector('[data-val]').value) : null;
        card.querySelector('[data-prev]').innerHTML = !on || r === null || m.tipo_resultado === 'verificacion' ? '' : r ? `<span class="pill ok">${icon('check')} Cumple</span>` : `<span class="pill bad">${icon('x')} No cumple</span>`;
        refreshIcons();
      };
      const activar = (card, on) => {
        card.querySelector('[data-chk]').checked = on;
        card.classList.toggle('on', on);
        const inp = card.querySelector('[data-val]');
        if (card.dataset.tipo !== 'verificacion') inp.disabled = !on;
        else if (!on) { inp.value = ''; card.querySelectorAll('[data-ver]').forEach((b) => b.classList.remove('on', 'ok', 'bad')); }
      };
      const verificar = (card, v) => {
        activar(card, true);
        card.querySelector('[data-val]').value = v;
        card.querySelectorAll('[data-ver]').forEach((b) => { const s = b.dataset.ver === v; b.classList.toggle('on', s); b.classList.toggle('ok', s && v === 'Cumple'); b.classList.toggle('bad', s && v !== 'Cumple'); });
        form.dispatchEvent(new Event('input'));
      };
      box.addEventListener('click', (e) => {
        const vb = e.target.closest('[data-ver]');
        if (vb) { const card = vb.closest('.metodo-card'); if (!card.classList.contains('bloq')) verificar(card, vb.dataset.ver); return; }
        const todo = e.target.closest('[data-todo-cumple]');
        if (todo) {
          todo.closest('.area-sec').querySelectorAll('.metodo-card[data-tipo="verificacion"]:not(.bloq)').forEach((card) => verificar(card, 'Cumple'));
          return;
        }
      });
      box.addEventListener('change', (e) => {
        const card = e.target.closest('.metodo-card');
        if (!card) return;
        if (e.target.matches('[data-chk]')) {
          activar(card, e.target.checked);
          if (e.target.checked && card.dataset.tipo !== 'verificacion') card.querySelector('[data-val]').focus();
        }
        previa(card);
        progreso();
      });
      box.addEventListener('input', (e) => { const card = e.target.closest('.metodo-card'); if (card && e.target.matches('[data-val]')) { previa(card); progreso(); } });
      box.addEventListener('click', (e) => { if (e.target.closest('[data-ver], [data-todo-cumple]')) progreso(); });
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
      // Solo se envían las áreas que el usuario captura (las demás no se modifican)
      const cards = [...form.querySelectorAll('.area-sec:not(.solo-lectura) .metodo-card')].filter((k) => k.querySelector('[data-chk]').checked);
      if (!edit && !cards.length) { setError('Selecciona al menos un análisis.'); return false; }
      const faltan = cards.filter((k) => !String(k.querySelector('[data-val]').value).trim());
      if (faltan.length) {
        faltan[0].scrollIntoView({ block: 'center', behavior: 'smooth' });
        setError(`Captura el resultado de ${faltan.length === 1 ? 'el análisis seleccionado' : `los ${faltan.length} análisis seleccionados`}.`);
        return false;
      }
      const resultados = cards.map((k) => {
        const m = c.metodos.find((x) => x.id === k.dataset.id);
        const v = String(k.querySelector('[data-val]').value).trim();
        const num = m.tipo_resultado === 'numerico';
        return { metodo_id: m.id, tipo_resultado: m.tipo_resultado, resultado: num ? Number(v) : null, resultado_texto: num ? null : v };
      });
      if (resultados.some((r) => r.tipo_resultado === 'numerico' && !Number.isFinite(r.resultado))) { setError('Revisa los resultados numéricos.'); return false; }
      const propios = [...previos.keys()].filter((id) => puedeCapturar(c.area(c.metodos.find((m) => m.id === id)?.area)));
      if (edit && !state.isAdmin && propios.some((id) => !resultados.some((r) => r.metodo_id === id))) {
        setError('Solo un administrador puede quitar análisis ya capturados.'); return false;
      }
      const dup = lotes.find((l) => l.id !== lote?.id && l.lote === loteNum && l.receta_id === recetaId);
      if (dup && !(await confirmDialog({ title: 'Lote ya registrado', message: `Ya existe el lote ${loteNum} para esta receta (${fmtDate(dup.fecha)}). ¿Deseas registrarlo de todos modos?`, confirmText: 'Sí, continuar' }))) return false;

      if (!edit) {
        const { error } = await sb.rpc('brom_registrar_muestra_con_resultados', {
          p_lote: loteNum, p_receta_id: recetaId, p_usuario_id: state.session.user.id, p_resultados: resultados, p_fecha_lote: fecha,
        });
        if (error) throw error;
        avisar();
        toast(`Lote ${loteNum} registrado.`, 'success');
      } else {
        const { error } = await sb.rpc('brom_actualizar_muestra_con_resultados', {
          p_muestra_id: lote.id, p_lote: loteNum, p_receta_id: recetaId, p_fecha_lote: fecha, p_resultados: resultados,
        });
        if (error) throw error;
        avisar();
        toast(`Lote ${loteNum} actualizado.`, 'success');
      }
      invalidarCatalogos();
      return true;
    },
  });
}
ganchos.openLoteForm = openLoteForm;
