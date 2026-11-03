// =====================================================================
// Recetas y métodos: catálogos analíticos y especificaciones por receta.
// Consulta para todos; alta, edición y activación solo para administradores
// (las políticas RLS de las tablas brom_ lo imponen en la base de datos).
// =====================================================================
import {
  sb, state, esc, icon, refreshIcons, toast, errMsg, openModal, confirmDialog, checkForm, emptyState, errorState, fmtNum,
  getCatalogos, invalidarCatalogos, refLabel, tipoLabel, criterio, PARAMETROS, PARAM_A_LIMITE, UNIDADES, prefs, fmtValor, fetchAll,
} from '../core.js';

let root = null, token = 0, tab = 'recetas', recetaSel = '';

export default {
  async render(el, params = {}) {
    root = el;
    tab = ['recetas', 'metodos', 'especificaciones'].includes(params.tab) ? params.tab : (prefs.get('brom.cat.tab') || 'recetas');
    el.innerHTML = `
      <section class="page-intro">
        <div><span class="eyebrow">Configuración</span><h1>Recetas y métodos</h1>
          <p>Catálogos que alimentan el registro de lotes y la evaluación automática de resultados.</p></div>
        <div class="page-actions" id="cat-acts"></div>
      </section>
      <div class="tabs" role="tablist">
        <button data-tab="recetas" role="tab">${icon('book-open')} Recetas</button>
        <button data-tab="metodos" role="tab">${icon('flask-round')} Métodos</button>
        <button data-tab="especificaciones" role="tab">${icon('sliders-horizontal')} Especificaciones por receta</button>
      </div>
      ${state.isAdmin ? '' : `<div class="notice">${icon('info')}<span>Consulta de solo lectura. La creación y edición de catálogos corresponde a un administrador.</span></div>`}
      <div class="card" id="cat-body"></div>`;
    el.addEventListener('click', onClick);
    await pintar();
  },
  destroy() { token++; root = null; },
};

async function pintar() {
  const t = ++token;
  if (!root) return;
  prefs.set('brom.cat.tab', tab);
  root.querySelectorAll('[data-tab]').forEach((b) => { b.classList.toggle('active', b.dataset.tab === tab); b.setAttribute('aria-selected', String(b.dataset.tab === tab)); });
  const acts = root.querySelector('#cat-acts');
  acts.innerHTML = !state.isAdmin ? '' : tab === 'recetas' ? `<button class="btn primary" data-c="nueva-receta">${icon('plus')} Nueva receta</button>`
    : tab === 'metodos' ? `<button class="btn primary" data-c="nuevo-metodo">${icon('plus')} Nuevo método</button>` : '';
  const body = root.querySelector('#cat-body');
  body.innerHTML = '<div class="skeleton" style="height:180px"></div>';
  try {
    const cat = await getCatalogos({ force: true });
    if (t !== token || !root) return;
    if (tab === 'recetas') body.innerHTML = await recetasHTML(cat);
    else if (tab === 'metodos') body.innerHTML = metodosHTML(cat);
    else body.innerHTML = especHTML(cat);
    if (tab === 'especificaciones') {
      body.querySelector('#esp-receta')?.addEventListener('change', (e) => { recetaSel = e.target.value; pintar(); });
    }
  } catch (err) {
    if (t !== token) return;
    console.error(err);
    body.innerHTML = errorState(err).replace('data-action="retry"', 'data-c="retry"');
  }
  refreshIcons();
}

const estadoPill = (v, f = false) => (v ? `<span class="pill ok">${f ? 'Activa' : 'Activo'}</span>` : `<span class="pill gray">${f ? 'Inactiva' : 'Inactivo'}</span>`);
const acciones = (attr, id) => (state.isAdmin ? `<td class="actions" data-label="Acciones"><div class="td-in"><div class="row-actions"><button class="icon-btn" ${attr}="${esc(id)}" aria-label="Editar" title="Editar">${icon('pencil')}</button></div></div></td>` : '');

async function recetasHTML(cat) {
  if (!cat.recetas.length) return emptyState({ ico: 'book-open', title: 'Sin recetas', text: 'Registra la primera receta del catálogo.' });
  const lotes = await fetchAll(() => sb.from('brom_muestras').select('receta_id')).catch(() => []);
  const n = (id) => lotes.filter((l) => l.receta_id === id).length;
  return `<div class="table-wrap responsive"><table class="table"><thead><tr><th>Código</th><th>Receta</th><th>Lotes</th><th>Especificaciones</th><th>Estado</th>${state.isAdmin ? '<th>Acciones</th>' : ''}</tr></thead><tbody>
    ${cat.recetas.map((r) => `<tr>
      <td data-label="Código"><div class="td-in cell-main">${esc(r.codigo)}</div></td>
      <td data-label="Receta"><div class="td-in">${esc(r.nombre_receta)}</div></td>
      <td data-label="Lotes"><div class="td-in mono">${fmtNum(n(r.id))}</div></td>
      <td data-label="Especificaciones"><div class="td-in"><button class="link-btn" data-c="ver-esp" data-id="${esc(r.id)}">${fmtNum(cat.specs.filter((s) => s.receta_id === r.id).length)} particular(es)</button></div></td>
      <td data-label="Estado"><div class="td-in">${estadoPill(r.activa, true)}</div></td>
      ${acciones('data-edit-receta', r.id)}</tr>`).join('')}</tbody></table></div>`;
}

function metodosHTML(cat) {
  if (!cat.metodos.length) return emptyState({ ico: 'flask-round', title: 'Sin métodos', text: 'Registra el primer método analítico.' });
  return `<div class="table-wrap responsive"><table class="table"><thead><tr><th>Método</th><th>Tipo</th><th>Criterio general</th><th>Unidad</th><th>Referencia normativa</th><th>Estado</th>${state.isAdmin ? '<th>Acciones</th>' : ''}</tr></thead><tbody>
    ${cat.metodos.map((m) => `<tr>
      <td data-label="Método"><div class="td-in cell-main">${esc(m.metodo)}</div></td>
      <td data-label="Tipo"><div class="td-in"><span class="pill ${m.tipo_resultado === 'numerico' ? 'info' : 'orange'}">${esc(tipoLabel(m.tipo_resultado))}</span></div></td>
      <td data-label="Criterio general"><div class="td-in">${esc(refLabel(m))}</div></td>
      <td data-label="Unidad"><div class="td-in">${esc(m.unidades || '—')}</div></td>
      <td data-label="Referencia normativa"><div class="td-in cell-sub">${esc(m.referencia_normativa || '—')}</div></td>
      <td data-label="Estado"><div class="td-in">${estadoPill(m.activo)}</div></td>
      ${acciones('data-edit-metodo', m.id)}</tr>`).join('')}</tbody></table></div>`;
}

function especHTML(cat) {
  if (!cat.recetas.length) return emptyState({ ico: 'book-open', title: 'Sin recetas', text: 'Registra una receta para definir sus especificaciones.' });
  if (!cat.recetas.some((r) => r.id === recetaSel)) recetaSel = cat.recetas[0].id;
  const metodos = cat.metodos.filter((m) => m.activo || cat.spec(recetaSel, m.id));
  return `<div class="esp-head">
      <div class="field" style="max-width:420px;flex:1"><label for="esp-receta">Receta</label>
        <select id="esp-receta">${cat.recetas.map((r) => `<option value="${esc(r.id)}" ${r.id === recetaSel ? 'selected' : ''}>${esc(r.codigo)} — ${esc(r.nombre_receta)}</option>`).join('')}</select></div>
      <div class="notice" style="flex:2">${icon('info')}<span>La especificación particular tiene prioridad sobre el criterio general del método al evaluar los resultados de esta receta. Se aplica a los resultados que se registren o editen a partir del cambio.</span></div>
    </div>
    ${metodos.length ? `<div class="table-wrap responsive"><table class="table"><thead><tr><th>Método</th><th>Criterio general</th><th>Criterio aplicable a la receta</th><th>Origen</th>${state.isAdmin ? '<th>Acciones</th>' : ''}</tr></thead><tbody>
      ${metodos.map((m) => {
        const s = cat.spec(recetaSel, m.id);
        return `<tr>
          <td data-label="Método"><div class="td-in cell-main">${esc(m.metodo)}</div></td>
          <td data-label="Criterio general"><div class="td-in cell-sub">${esc(refLabel(m))}</div></td>
          <td data-label="Criterio aplicable"><div class="td-in"><b>${esc(refLabel(criterio(m, s)))}</b></div></td>
          <td data-label="Origen"><div class="td-in">${s ? '<span class="pill orange">Particular</span>' : '<span class="pill gray">General</span>'}</div></td>
          ${state.isAdmin ? `<td class="actions" data-label="Acciones"><div class="td-in"><div class="row-actions">
            ${m.tipo_resultado !== 'numerico' ? '<span class="cell-sub">Solo cuantitativos</span>' : ''}
            <button class="icon-btn ${m.tipo_resultado !== 'numerico' ? 'hidden' : ''}" data-edit-esp="${esc(m.id)}" aria-label="Definir especificación" title="Definir especificación">${icon('pencil')}</button>
            ${s ? `<button class="icon-btn bad" data-del-esp="${esc(s.id)}" aria-label="Quitar especificación" title="Usar el criterio general">${icon('rotate-ccw')}</button>` : ''}
          </div></div></td>` : ''}</tr>`;
      }).join('')}</tbody></table></div>` : emptyState({ ico: 'flask-round', title: 'Sin métodos activos' })}`;
}

async function onClick(e) {
  const tb = e.target.closest('[data-tab]');
  if (tb) { tab = tb.dataset.tab; pintar(); return; }
  const cat = await getCatalogos();
  const a = e.target.closest('[data-c], [data-edit-receta], [data-edit-metodo], [data-edit-esp], [data-del-esp]');
  if (!a) return;
  let ok = false;
  if (a.dataset.c === 'retry') { pintar(); return; }
  if (a.dataset.c === 'ver-esp') { recetaSel = a.dataset.id; tab = 'especificaciones'; pintar(); return; }
  if (a.dataset.c === 'nueva-receta') ok = await recetaForm();
  else if (a.dataset.c === 'nuevo-metodo') ok = await metodoForm();
  else if (a.dataset.editReceta) ok = await recetaForm(cat.recetas.find((r) => r.id === a.dataset.editReceta));
  else if (a.dataset.editMetodo) ok = await metodoForm(cat.metodos.find((m) => m.id === a.dataset.editMetodo));
  else if (a.dataset.editEsp) ok = await especForm(cat, recetaSel, cat.metodos.find((m) => m.id === a.dataset.editEsp));
  else if (a.dataset.delEsp) {
    if (await confirmDialog({ title: '¿Usar el criterio general?', message: 'Se quitará la especificación particular de esta receta para el método.', confirmText: 'Quitar especificación', danger: true })) {
      const { error } = await sb.from('brom_especificaciones_receta').delete().eq('id', a.dataset.delEsp);
      if (error) { toast(errMsg(error), 'error'); return; }
      toast('Especificación eliminada.', 'success'); ok = true;
    }
  }
  if (ok) { invalidarCatalogos(); pintar(); }
}

function recetaForm(r = null) {
  return openModal({
    title: r ? 'Editar receta' : 'Nueva receta', size: 'sm', submitText: r ? 'Guardar cambios' : 'Registrar receta',
    body: `<div class="field"><label for="rf-cod">Código <span class="req">*</span></label><input id="rf-cod" name="codigo" required maxlength="30" value="${esc(r?.codigo || '')}" placeholder="Ej. Receta-04"></div>
      <div class="field"><label for="rf-nom">Nombre de la receta <span class="req">*</span></label><input id="rf-nom" name="nombre" required maxlength="120" value="${esc(r?.nombre_receta || '')}" placeholder="Nombre comercial"></div>
      <div class="field"><label for="rf-act">Estado</label><select id="rf-act" name="activa"><option value="true">Activa</option><option value="false" ${r && !r.activa ? 'selected' : ''}>Inactiva</option></select>
        <small class="hint">Una receta inactiva no aparece al registrar lotes nuevos; su historial se conserva.</small></div>`,
    onSubmit: async ({ form }) => {
      if (!checkForm(form)) return false;
      const fila = { codigo: form.codigo.value.trim(), nombre_receta: form.nombre.value.trim().replace(/\s+/g, ' '), activa: form.activa.value === 'true' };
      const { error } = r ? await sb.from('brom_recetas').update(fila).eq('id', r.id) : await sb.from('brom_recetas').insert(fila);
      if (error) throw error;
      toast(r ? 'Receta actualizada.' : 'Receta registrada.', 'success');
    },
  });
}

// Campos de criterio compartidos por método y especificación
function criterioCampos(prefijo, tipo, param, m = {}) {
  const opts = Object.entries(PARAMETROS).filter(([k]) => tipo === 'numerico' || ['ninguno', 'exacto'].includes(k));
  return `<div class="field"><label for="${prefijo}-param">Parámetro de referencia</label>
      <select id="${prefijo}-param" name="param">${opts.map(([k, v]) => `<option value="${k}" ${k === param ? 'selected' : ''}>${v}</option>`).join('')}</select></div>
    <div class="field" data-num><label for="${prefijo}-val"><span data-lbl>Valor de referencia</span> <span class="req">*</span></label><input id="${prefijo}-val" name="valor" type="number" step="any" value="${esc(m.valor_referencia ?? '')}"></div>
    <div class="field" data-max><label for="${prefijo}-max">Valor máximo <span class="req">*</span></label><input id="${prefijo}-max" name="valor_max" type="number" step="any" value="${esc(m.valor_referencia_max ?? '')}"></div>
    <div class="field" data-txt><label for="${prefijo}-txt">Resultado esperado <span class="req">*</span></label>
      <select id="${prefijo}-txt" name="valor_texto"><option value="">Selecciona…</option>${['Positivo', 'Negativo'].map((o) => `<option ${m.valor_referencia_texto === o ? 'selected' : ''}>${o}</option>`).join('')}</select></div>`;
}
function criterioVisibilidad(form, tipo) {
  const p = form.param.value;
  const num = tipo === 'numerico';
  const show = (sel, v) => { const f = form.querySelector(sel); f.classList.toggle('hidden', !v); f.querySelectorAll('input, select').forEach((i) => { i.disabled = !v; i.required = v; }); };
  show('[data-num]', num && p !== 'ninguno');
  show('[data-max]', num && p === 'rango');
  show('[data-txt]', !num && p === 'exacto');
  const lbl = form.querySelector('[data-lbl]');
  if (lbl) lbl.textContent = p === 'rango' ? 'Valor mínimo' : p === 'minimo' ? 'Límite mínimo' : p === 'maximo' ? 'Límite máximo' : 'Valor de referencia';
}
function criterioValores(form, tipo) {
  const p = form.param.value;
  const num = tipo === 'numerico';
  const v = num && p !== 'ninguno' ? Number(form.valor.value) : null;
  const mx = num && p === 'rango' ? Number(form.valor_max.value) : null;
  if (p === 'rango' && v > mx) throw new Error('El valor mínimo debe ser menor o igual al máximo.');
  return { p, v, mx, txt: !num && p === 'exacto' ? form.valor_texto.value : null };
}

function metodoForm(m = null) {
  const tipo0 = m?.tipo_resultado || 'numerico';
  const unidades = m?.unidades && !UNIDADES.includes(m.unidades) ? [m.unidades, ...UNIDADES] : UNIDADES;
  return openModal({
    title: m ? 'Editar método' : 'Nuevo método', subtitle: 'Define el tipo de resultado y su criterio general de aceptación.', submitText: m ? 'Guardar cambios' : 'Registrar método',
    body: `<div class="form-grid">
      <div class="field"><label for="mf-nom">Método <span class="req">*</span></label><input id="mf-nom" name="metodo" required maxlength="80" value="${esc(m?.metodo || '')}" placeholder="Ej. Humedad"></div>
      <div class="field"><label for="mf-tipo">Tipo de resultado</label><select id="mf-tipo" name="tipo">
        <option value="numerico">Cuantitativo (numérico)</option><option value="positivo_negativo" ${tipo0 === 'positivo_negativo' ? 'selected' : ''}>Cualitativo (Positivo / Negativo)</option>
        ${tipo0 === 'texto' ? '<option value="texto" selected>Texto</option>' : ''}</select></div>
      <div data-crit class="full form-grid" style="padding:0"></div>
      <div class="field" data-unid><label for="mf-uni">Unidad</label><select id="mf-uni" name="unidades" data-buscar><option value="">Sin unidad</option>${unidades.map((u) => `<option ${u === m?.unidades ? 'selected' : ''}>${esc(u)}</option>`).join('')}</select></div>
      <div class="field"><label for="mf-act">Estado</label><select id="mf-act" name="activo"><option value="true">Activo</option><option value="false" ${m && !m.activo ? 'selected' : ''}>Inactivo</option></select></div>
      <div class="field full"><label for="mf-norma">Referencia normativa</label><input id="mf-norma" name="norma" maxlength="160" value="${esc(m?.referencia_normativa || '')}" placeholder="Ej. NOM-116-SSA1-1994 o criterio interno"></div>
    </div>
    ${m ? `<div class="notice warn">${icon('info')}<span>Un cambio de criterio aplica a los resultados que se registren o editen después; los dictámenes ya calculados no se modifican.</span></div>` : ''}`,
    onOpen: ({ form }) => {
      const crit = form.querySelector('[data-crit]');
      const montar = (param) => {
        const tipo = form.tipo.value;
        crit.innerHTML = criterioCampos('mf', tipo, param, m || {});
        form.querySelector('[data-unid]').classList.toggle('hidden', tipo !== 'numerico');
        criterioVisibilidad(form, tipo);
        form.param.addEventListener('change', () => criterioVisibilidad(form, form.tipo.value));
      };
      montar(m?.parametro_referencia || 'ninguno');
      form.tipo.addEventListener('change', () => montar('ninguno'));
    },
    onSubmit: async ({ form }) => {
      if (!checkForm(form)) return false;
      const tipo = form.tipo.value;
      const c = criterioValores(form, tipo);
      const fila = {
        metodo: form.metodo.value.trim().replace(/\s+/g, ' '), tipo_resultado: tipo, parametro_referencia: c.p,
        valor_referencia: c.v, valor_referencia_max: c.mx, valor_referencia_texto: c.txt,
        unidades: tipo === 'numerico' ? form.unidades.value || null : null,
        referencia_normativa: form.norma.value.trim() || null, activo: form.activo.value === 'true',
      };
      const { error } = m ? await sb.from('brom_catalogo_metodos').update(fila).eq('id', m.id) : await sb.from('brom_catalogo_metodos').insert(fila);
      if (error) throw error;
      toast(m ? 'Método actualizado.' : 'Método registrado.', 'success');
    },
  });
}

function especForm(cat, recetaId, m) {
  const r = cat.recetas.find((x) => x.id === recetaId);
  const s = cat.spec(recetaId, m.id);
  const base = s ? criterio(m, s) : m;
  return openModal({
    title: `Especificación de ${m.metodo}`, subtitle: `${r.codigo} — ${r.nombre_receta} · Criterio general: ${refLabel(m)}`, size: 'sm',
    submitText: 'Guardar especificación',
    body: `<div data-crit></div>${m.unidades ? `<p class="hint">Unidad del método: <b>${esc(m.unidades)}</b></p>` : ''}`,
    onOpen: ({ form }) => {
      form.querySelector('[data-crit]').innerHTML = criterioCampos('ef', m.tipo_resultado, base.parametro_referencia || 'ninguno', s ? base : {});
      criterioVisibilidad(form, m.tipo_resultado);
      form.param.addEventListener('change', () => criterioVisibilidad(form, m.tipo_resultado));
    },
    onSubmit: async ({ form }) => {
      if (!checkForm(form)) return false;
      const c = criterioValores(form, m.tipo_resultado);
      const fila = {
        receta_id: recetaId, metodo_id: m.id, tipo_limite: PARAM_A_LIMITE[c.p],
        valor_referencia: c.v, valor_referencia_max: c.mx, valor_referencia_texto: c.txt,
      };
      const { error } = s ? await sb.from('brom_especificaciones_receta').update(fila).eq('id', s.id) : await sb.from('brom_especificaciones_receta').insert(fila);
      if (error) throw error;
      toast(`Especificación de ${m.metodo}: ${refLabel(criterio(m, fila))}.`, 'success');
    },
  });
}
