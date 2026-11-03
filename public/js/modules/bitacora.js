// =====================================================================
// Bitácora de cambios (solo administradores). Los registros los genera la
// base de datos con el trigger brom_auditar en cada alta, cambio o baja de
// lotes, análisis, recetas, métodos, especificaciones, áreas, usuarios y
// puestos; no se pueden editar ni borrar. Muestra quién hizo cada acción,
// con su foto, y una descripción breve; el detalle muestra antes y después.
// =====================================================================
import {
  sb, esc, icon, refreshIcons, openModal, emptyState, errorState, fmtDateTime, fmtNum, avatarHTML, debounce, sanitizeSearch,
  getDirectorio, getCatalogos, fmtValor, fmtDate, fechaLote, ROLES, FIRMAS,
} from '../core.js';

const POR_PAGINA = 25;
const TABLAS = {
  brom_muestras: 'Lotes', brom_resultados_analisis: 'Análisis', brom_recetas: 'Recetas', brom_catalogo_metodos: 'Métodos',
  brom_especificaciones_receta: 'Especificaciones', brom_areas_analisis: 'Áreas de análisis', brom_usuarios: 'Usuarios', brom_puestos: 'Puestos',
};
const ACC = { INSERT: ['Alta', 'ok', 'plus'], UPDATE: ['Cambio', 'info', 'pencil'], DELETE: ['Baja', 'bad', 'trash-2'] };
const CAMPOS = {
  lote: 'número de lote', receta_id: 'receta', fecha_analisis: 'fecha del lote', usuario_id: 'registró', resultado: 'resultado', resultado_texto: 'resultado',
  metodo_id: 'método', muestra_id: 'lote', codigo: 'código', nombre_receta: 'nombre', especie: 'especie', color: 'color', activa: 'estado', activo: 'estado',
  metodo: 'nombre', referencia_normativa: 'referencia normativa', unidades: 'unidad', tipo_resultado: 'tipo de resultado', parametro_referencia: 'parámetro de referencia',
  valor_referencia: 'valor de referencia', valor_referencia_max: 'valor máximo', valor_referencia_texto: 'resultado esperado', area: 'área', orden: 'orden',
  recetas_aplica: 'recetas a las que aplica', tipo_limite: 'tipo de límite', aplica: 'aplica', nombre: 'nombre', descripcion: 'descripción',
  nombre_completo: 'nombre', correo: 'correo', puesto: 'puesto', rol: 'rol', foto_url: 'fotografía', areas_captura: 'áreas que captura',
  puede_liberar: 'permiso de liberar', firma_certificado: 'firma del certificado', folio_certificado: 'folio', liberado_en: 'liberación',
  liberado_por: 'liberó', liberado_por_nombre: 'liberó', liberado_por_puesto: 'puesto de quien liberó', observaciones_liberacion: 'observaciones',
  firma_jefe_id: 'firma del Jefe de calidad', firma_jefe_nombre: 'firma del Jefe de calidad', firma_jefe_puesto: 'puesto del Jefe de calidad',
  firma_inspector_id: 'firma del Inspector de calidad', firma_inspector_nombre: 'firma del Inspector de calidad', firma_inspector_puesto: 'puesto del Inspector de calidad',
  firmas_asignadas_por: 'eligió las firmas', firmas_asignadas_en: 'fecha de las firmas', limite_cuantificacion: 'límite de cuantificación', limite_deteccion: 'límite de detección',
};
const OCULTOS = new Set(['id', 'created_at', '_cumple', 'liberado_por', 'liberado_por_puesto', 'firma_jefe_id', 'firma_inspector_id', 'firma_jefe_puesto', 'firma_inspector_puesto', 'firmas_asignadas_en']);
let root = null, token = 0, pagina = 1, filas = [], total = 0, dir = null, cat = null;

export default {
  async render(el) {
    root = el; pagina = 1;
    el.innerHTML = `
      <section class="page-intro">
        <div><span class="eyebrow">Auditoría</span><h1>Bitácora</h1>
          <p>Registro automático de altas, cambios y bajas: lotes, análisis, liberaciones, recetas, métodos, usuarios y puestos.</p></div>
      </section>
      <div class="card">
        <div class="toolbar">
          <div class="search">${icon('search')}<input type="search" id="b-q" placeholder="Buscar por persona, lote, receta o método" aria-label="Buscar" autocomplete="off"></div>
          <label class="sr-only" for="b-tabla">Módulo</label><select id="b-tabla"><option value="">Todos los módulos</option>${Object.entries(TABLAS).map(([k, v]) => `<option value="${k}">${v}</option>`).join('')}</select>
          <label class="sr-only" for="b-acc">Acción</label><select id="b-acc"><option value="">Todas las acciones</option>${Object.entries(ACC).map(([k, [l]]) => `<option value="${k}">${l}</option>`).join('')}</select>
          <span class="date-range"><input type="date" id="b-desde" aria-label="Desde"> a <input type="date" id="b-hasta" aria-label="Hasta"></span>
        </div>
        <div id="b-body"></div>
      </div>`;
    el.querySelector('#b-q').addEventListener('input', debounce(() => { pagina = 1; cargar(); }, 350));
    el.querySelectorAll('#b-tabla, #b-acc, #b-desde, #b-hasta').forEach((s) => s.addEventListener('change', () => { pagina = 1; cargar(); }));
    el.addEventListener('click', onClick);
    [dir, cat] = await Promise.all([getDirectorio(), getCatalogos().catch(() => null)]);
    await cargar();
  },
  destroy() { token++; root = null; },
};

// Límites del día en la Ciudad de México (UTC−6, sin horario de verano)
const inicioDia = (iso) => `${iso}T00:00:00-06:00`;
const finDia = (iso) => `${iso}T23:59:59.999-06:00`;

async function cargar() {
  const t = ++token;
  const body = root?.querySelector('#b-body');
  if (!body) return;
  body.innerHTML = '<div class="skeleton" style="height:220px"></div>';
  try {
    let q = sb.from('brom_bitacora').select('id, tabla, registro_id, accion, cambios, objeto, referencia, usuario_id, usuario_email, usuario_nombre, created_at', { count: 'exact' });
    const s = sanitizeSearch(root.querySelector('#b-q').value);
    if (s) q = q.or(`usuario_nombre.ilike.*${s}*,usuario_email.ilike.*${s}*,objeto.ilike.*${s}*,referencia.ilike.*${s}*`);
    const tabla = root.querySelector('#b-tabla').value, acc = root.querySelector('#b-acc').value;
    const desde = root.querySelector('#b-desde').value, hasta = root.querySelector('#b-hasta').value;
    if (tabla) q = q.eq('tabla', tabla);
    if (acc) q = q.eq('accion', acc);
    if (desde) q = q.gte('created_at', inicioDia(desde));
    if (hasta) q = q.lte('created_at', finDia(hasta));
    const ini = (pagina - 1) * POR_PAGINA;
    const { data, count, error } = await q.order('created_at', { ascending: false }).order('id', { ascending: false }).range(ini, ini + POR_PAGINA - 1);
    if (error) throw error;
    if (t !== token || !root) return;
    filas = data || []; total = count || 0;
    pintar();
  } catch (err) {
    if (t !== token || !root) return;
    console.error(err);
    body.innerHTML = errorState(err).replace('data-action="retry"', 'data-b="retry"');
    refreshIcons();
  }
}

function pintar() {
  const body = root.querySelector('#b-body');
  if (!filas.length) {
    body.innerHTML = emptyState({ ico: 'history', title: 'Sin registros', text: 'Los cambios en el sistema se registran aquí automáticamente.' });
    refreshIcons(); return;
  }
  const paginas = Math.max(1, Math.ceil(total / POR_PAGINA));
  const ini = (pagina - 1) * POR_PAGINA;
  body.innerHTML = `<div class="table-wrap responsive"><table class="table bitacora-tabla"><thead><tr><th>Fecha y hora</th><th class="col-user">Usuario</th><th>Módulo</th><th>Acción</th><th>Descripción</th><th></th></tr></thead><tbody>
    ${filas.map((b) => `<tr data-ver="${b.id}" class="clickable">
      <td data-label="Fecha y hora"><div class="td-in mono">${fmtDateTime(b.created_at)}</div></td>
      <td data-label="Usuario" class="col-user"><div class="td-in">${actorHTML(b)}</div></td>
      <td data-label="Módulo"><div class="td-in">${esc(TABLAS[b.tabla] || b.tabla)}</div></td>
      <td data-label="Acción"><div class="td-in"><span class="pill ${ACC[b.accion]?.[1] || 'gray'}">${icon(ACC[b.accion]?.[2] || 'dot')} ${esc(ACC[b.accion]?.[0] || b.accion)}</span></div></td>
      <td data-label="Descripción" class="col-desc"><div class="td-in"><span class="bit-desc">${describir(b)}</span></div></td>
      <td class="actions"><div class="td-in"><button class="icon-btn" data-ver="${b.id}" title="Ver detalle" aria-label="Ver detalle">${icon('eye')}</button></div></td></tr>`).join('')}</tbody></table></div>
    <div class="pager">
      <span>Mostrando <b>${fmtNum(ini + 1)} a ${fmtNum(ini + filas.length)}</b> de <b>${fmtNum(total)}</b> registros</span>
      <div class="pager-ctrl">
        <button class="btn secondary sm" data-pg="${pagina - 1}" ${pagina <= 1 ? 'disabled' : ''}>${icon('chevron-left')} Anterior</button>
        <span>Página ${pagina} de ${paginas}</span>
        <button class="btn secondary sm" data-pg="${pagina + 1}" ${pagina >= paginas ? 'disabled' : ''}>Siguiente ${icon('chevron-right')}</button>
      </div>
    </div>`;
  refreshIcons();
}

function onClick(e) {
  if (e.target.closest('[data-b="retry"]')) { cargar(); return; }
  const pg = e.target.closest('[data-pg]');
  if (pg && !pg.disabled) { pagina = Number(pg.dataset.pg); cargar(); return; }
  const v = e.target.closest('[data-ver]');
  if (v) detalle(filas.find((b) => String(b.id) === v.dataset.ver));
}

// ---------- Quién hizo la acción ----------
const actorNombre = (b) => b.usuario_nombre || b.usuario_email || 'Sistema';
function actorHTML(b) {
  if (!b.usuario_id && !b.usuario_email) {
    return `<div class="user-cell"><span class="avatar sm bit-sistema">${icon('cpu')}</span><span class="user-txt"><b>Sistema</b><small>Proceso automático</small></span></div>`;
  }
  const u = dir?.porId(b.usuario_id);
  return `<div class="user-cell">${avatarHTML(actorNombre(b), u?.foto, 'sm')}<span class="user-txt"><b>${esc(actorNombre(b))}</b><small>${esc(u?.puesto || b.usuario_email || '')}</small></span></div>`;
}

// ---------- Descripción breve ----------
const nuevo = (b, k) => (Array.isArray(b.cambios?.[k]) ? b.cambios[k][1] : b.cambios?.[k]);
const viejo = (b, k) => (Array.isArray(b.cambios?.[k]) ? b.cambios[k][0] : undefined);
const cambio = (b, k) => b.accion === 'UPDATE' && b.cambios && k in b.cambios;
function listaCampos(b) {
  const l = [...new Set(Object.keys(b.cambios || {}).filter((k) => !OCULTOS.has(k)).map((k) => CAMPOS[k] || k.replace(/_/g, ' ')))];
  return l.length > 1 ? `${l.slice(0, -1).join(', ')} y ${l[l.length - 1]}` : l[0] || 'datos';
}
const resTxt = (num, txt) => (txt ?? (num === null || num === undefined ? '—' : fmtValor(num)));

function describir(b) {
  const A = `<b>${esc(actorNombre(b))}</b>`;
  const O = `<b>${esc(b.objeto || 'un registro')}</b>`;
  const R = b.referencia ? ` <span class="cell-sub">· ${esc(b.referencia)}</span>` : '';
  const ins = b.accion === 'INSERT', del = b.accion === 'DELETE';
  switch (b.tabla) {
    case 'brom_muestras':
      if (ins) return `${A} registró el ${O}${R}`;
      if (del) return `${A} eliminó el ${O}${R}`;
      if (cambio(b, 'folio_certificado') && nuevo(b, 'folio_certificado')) return `${A} liberó el ${O} con el folio <b>${esc(nuevo(b, 'folio_certificado'))}</b>${R}`;
      if (cambio(b, 'folio_certificado')) return `${A} revirtió la liberación del ${O} (folio ${esc(viejo(b, 'folio_certificado') || '—')})${R}`;
      if (cambio(b, 'firma_jefe_nombre') || cambio(b, 'firma_inspector_nombre')) return `${A} eligió las firmas del certificado del ${O}: ${esc(nuevo(b, 'firma_jefe_nombre') || '—')} y ${esc(nuevo(b, 'firma_inspector_nombre') || '—')}${R}`;
      return `${A} modificó ${esc(listaCampos(b))} del ${O}${R}`;
    case 'brom_resultados_analisis': {
      const ok = b.cambios?._cumple;
      const dict = ok === true ? ' <span class="pill ok xs">Cumple</span>' : ok === false ? ' <span class="pill bad xs">No cumple</span>' : '';
      if (ins) return `${A} capturó ${O} en el ${esc(b.referencia || 'lote')}: <b>${esc(resTxt(nuevo(b, 'resultado'), nuevo(b, 'resultado_texto')))}</b>${dict}`;
      if (del) return `${A} quitó ${O} del ${esc(b.referencia || 'lote')}`;
      if (cambio(b, 'resultado') || cambio(b, 'resultado_texto')) {
        const antes = resTxt(viejo(b, 'resultado'), viejo(b, 'resultado_texto')), despues = resTxt(nuevo(b, 'resultado'), nuevo(b, 'resultado_texto'));
        return `${A} cambió ${O} del ${esc(b.referencia || 'lote')}: ${esc(antes)} → <b>${esc(despues)}</b>${dict}`;
      }
      return `${A} modificó ${O} del ${esc(b.referencia || 'lote')}`;
    }
    case 'brom_recetas':
      if (ins) return `${A} creó la receta ${O}${R}`;
      if (del) return `${A} eliminó la receta ${O}${R}`;
      if (cambio(b, 'nombre_receta')) return `${A} cambió el nombre de la receta ${esc(viejo(b, 'nombre_receta'))} a ${O}${R}`;
      if (cambio(b, 'activa')) return `${A} ${nuevo(b, 'activa') ? 'activó' : 'desactivó'} la receta ${O}${R}`;
      return `${A} modificó ${esc(listaCampos(b))} de la receta ${O}${R}`;
    case 'brom_catalogo_metodos':
      if (ins) return `${A} registró el método ${O}${R}`;
      if (del) return `${A} eliminó el método ${O}${R}`;
      if (cambio(b, 'activo')) return `${A} ${nuevo(b, 'activo') ? 'activó' : 'desactivó'} el método ${O}${R}`;
      return `${A} modificó ${esc(listaCampos(b))} del método ${O}${R}`;
    case 'brom_especificaciones_receta':
      if (ins) return `${A} definió la especificación de ${O} para ${esc(b.referencia || 'una receta')}`;
      if (del) return `${A} quitó la especificación particular de ${O} en ${esc(b.referencia || 'una receta')}`;
      return `${A} cambió la especificación de ${O} para ${esc(b.referencia || 'una receta')}`;
    case 'brom_areas_analisis':
      if (ins) return `${A} creó el área ${O}`;
      if (del) return `${A} eliminó el área ${O}`;
      return `${A} modificó ${esc(listaCampos(b))} del área ${O}`;
    case 'brom_usuarios':
      if (ins) return `${A} dio acceso a ${O}${R}`;
      if (del) return `${A} quitó el acceso de ${O}${R}`;
      if (cambio(b, 'activo')) return `${A} ${nuevo(b, 'activo') ? 'activó' : 'desactivó'} a ${O}`;
      if (cambio(b, 'rol')) return `${A} cambió el rol de ${O} a <b>${esc(ROLES[nuevo(b, 'rol')] || nuevo(b, 'rol'))}</b>`;
      if (b.objeto && b.objeto === b.usuario_nombre) return `${A} actualizó su ${esc(listaCampos(b))}`;
      return `${A} modificó ${esc(listaCampos(b))} de ${O}`;
    case 'brom_puestos':
      if (ins) return `${A} creó el puesto ${O}`;
      if (del) return `${A} eliminó el puesto ${O}`;
      return `${A} modificó ${esc(listaCampos(b))} del puesto ${O}`;
    default:
      return `${A} · ${esc(ACC[b.accion]?.[0] || b.accion)} en ${esc(TABLAS[b.tabla] || b.tabla)}`;
  }
}

// ---------- Detalle (antes y después) ----------
function valorLegible(k, v) {
  if (v === null || v === undefined || v === '') return '—';
  if (typeof v === 'boolean') return v ? 'Sí' : 'No';
  if (k === 'receta_id') return cat?.recetas.find((r) => r.id === v)?.nombre_receta || v;
  if (k === 'metodo_id') return cat?.metodos.find((m) => m.id === v)?.metodo || v;
  if (k === 'area') return cat?.area(v)?.nombre || v;
  if (k === 'usuario_id' || k === 'liberado_por') return dir?.porId(v)?.nombre_completo || v;
  if (k === 'rol') return ROLES[v] || v;
  if (k === 'firma_certificado') return FIRMAS[v] || v;
  if (k === 'recetas_aplica') return Array.isArray(v) ? v.map((id) => cat?.recetas.find((r) => r.id === id)?.nombre_receta || id).join(', ') : v;
  if (k === 'areas_captura') return Array.isArray(v) ? v.map((id) => cat?.area(id)?.nombre || id).join(', ') : v;
  if (k === 'fecha_analisis') return fmtDate(fechaLote(v));
  if (/_en$/.test(k)) return fmtDateTime(v);
  if (typeof v === 'object') return JSON.stringify(v);
  return String(v);
}
const campo = (k) => esc(CAMPOS[k] ? CAMPOS[k][0].toUpperCase() + CAMPOS[k].slice(1) : k);

function detalle(b) {
  if (!b) return;
  const c = Object.entries(b.cambios || {}).filter(([k]) => !['id', 'created_at', '_cumple'].includes(k));
  const tabla = b.accion === 'UPDATE'
    ? `<table class="diff"><thead><tr><th>Campo</th><th>Antes</th><th>Después</th></tr></thead><tbody>${c.map(([k, [o, n]]) => `<tr><td><b>${campo(k)}</b></td><td class="old">${esc(valorLegible(k, o))}</td><td class="new">${esc(valorLegible(k, n))}</td></tr>`).join('')}</tbody></table>`
    : `<table class="diff"><thead><tr><th>Campo</th><th>Valor</th></tr></thead><tbody>${c.map(([k, v]) => `<tr><td><b>${campo(k)}</b></td><td>${esc(valorLegible(k, v))}</td></tr>`).join('')}</tbody></table>`;
  openModal({
    title: `${TABLAS[b.tabla] || b.tabla} · ${ACC[b.accion]?.[0] || b.accion}`,
    subtitle: fmtDateTime(b.created_at), size: 'lg',
    body: `<div class="bit-head">${actorHTML(b)}<p class="bit-desc">${describir(b)}</p></div>${c.length ? tabla : '<p class="hint">Sin datos adicionales.</p>'}`,
  });
}
