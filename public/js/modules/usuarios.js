// =====================================================================
// Usuarios y puestos (solo administradores), con el diseño de Servicio médico.
// · Usuarios: nombre, correo, puesto, área, rol, último acceso y estado.
// · Puestos y permisos: qué áreas captura cada puesto, si libera lotes y
//   si firma el certificado (Jefe de calidad / Inspector de calidad).
// El rol (Usuario / Administrador) define qué se administra; lo que cada
// persona captura depende de su puesto. Las cuentas son las mismas de las
// demás aplicaciones de Pet's Table (Supabase Auth).
// =====================================================================
import {
  sb, state, esc, icon, refreshIcons, toast, errMsg, openModal, confirmDialog, checkForm, emptyState, errorState, avatarHTML, roleLabel, ROLES,
  fmtDateTime, fmtNum, fotoDe, prepararFoto, subirFoto, borrarFotoPropia, debounce, sanitizeSearch, getCatalogos, invalidarCatalogos, prefs, FIRMAS, opcionCheck,
} from '../core.js';

let root = null, token = 0, usuarios = [], accesos = new Map(), cat = null, tab = 'usuarios';
let orden = { k: 'nombre', asc: true };

export default {
  async render(el) {
    root = el;
    tab = prefs.get('brom.usr.tab') === 'puestos' ? 'puestos' : 'usuarios';
    el.innerHTML = `
      <section class="page-intro">
        <div><span class="eyebrow">Administración</span><h1>Usuarios</h1>
          <p>Quién tiene acceso y con qué puesto.</p></div>
        <div class="page-actions" id="u-acts"></div>
      </section>
      <div class="tabs" role="tablist">
        <button role="tab" data-tab="usuarios">${icon('users')} Usuarios</button>
        <button role="tab" data-tab="puestos">${icon('briefcase')} Puestos y permisos</button>
      </div>
      <div data-pane="usuarios" class="card">
        <div class="toolbar">
          <div class="search">${icon('search')}<input id="u-q" type="search" placeholder="Buscar por nombre, correo o puesto" aria-label="Buscar usuario" autocomplete="off"></div>
          <label class="sr-only" for="u-rol">Rol</label>
          <select id="u-rol"><option value="">Todos los roles</option>${Object.entries(ROLES).map(([k, v]) => `<option value="${k}">${v}</option>`).join('')}</select>
          <label class="sr-only" for="u-act">Estado</label>
          <select id="u-act"><option value="">Todos</option><option value="true">Activos</option><option value="false">Inactivos</option></select>
        </div>
        <div id="u-body"></div>
      </div>
      <div data-pane="puestos" class="card hidden" id="p-body"></div>`;
    el.querySelector('#u-q').addEventListener('input', debounce(pintar, 200));
    el.querySelectorAll('#u-rol, #u-act').forEach((s) => s.addEventListener('change', pintar));
    el.addEventListener('click', (e) => onClick(e).catch((err) => { console.error(err); toast(errMsg(err), 'error'); }));
    await cargar();
  },
  destroy() { token++; root = null; },
};

async function cargar() {
  const t = ++token;
  if (!root) return;
  root.querySelector('#u-body').innerHTML = '<div class="skeleton" style="height:160px"></div>';
  try {
    const [u, ac, c] = await Promise.all([
      sb.from('brom_usuarios').select('id, correo, nombre_completo, puesto, area, rol, activo, foto_url, correos_admin').order('nombre_completo'),
      sb.rpc('brom_estado_cuentas'),
      getCatalogos({ force: true }),
    ]);
    if (u.error) throw u.error;
    if (t !== token || !root) return;
    usuarios = u.data || [];
    accesos = new Map((ac.data || []).map((x) => [x.id, x.ultimo_acceso]));
    cat = c;
    mostrarTab();
  } catch (err) {
    if (t !== token || !root) return;
    console.error(err);
    root.querySelector('#u-body').innerHTML = errorState(err).replace('data-action="retry"', 'data-u="retry"');
    refreshIcons();
  }
}

function mostrarTab() {
  prefs.set('brom.usr.tab', tab);
  root.querySelectorAll('[data-tab]').forEach((b) => { b.classList.toggle('active', b.dataset.tab === tab); b.setAttribute('aria-selected', String(b.dataset.tab === tab)); });
  root.querySelectorAll('[data-pane]').forEach((p) => p.classList.toggle('hidden', p.dataset.pane !== tab));
  root.querySelector('#u-acts').innerHTML = tab === 'usuarios'
    ? `<button class="btn primary" data-u="agregar">${icon('user-plus')} Nuevo usuario</button>`
    : `<button class="btn c-purple" data-u="nuevo-puesto">${icon('plus')} Nuevo puesto</button>`;
  if (tab === 'usuarios') pintar(); else pintarPuestos();
  refreshIcons();
}

// ---------------------------------------------------------------------
// Usuarios
// ---------------------------------------------------------------------
const CLAVES = {
  nombre: (u) => u.nombre_completo, puesto: (u) => u.puesto || '', rol: (u) => u.rol, acceso: (u) => accesos.get(u.id) || '', estado: (u) => (u.activo ? 0 : 1),
};
function th(label, k) {
  const on = orden.k === k;
  return `<th class="sortable ${on ? 'sorted' : ''} ${k === 'nombre' ? 'col-user' : ''}" data-sort="${k}" aria-sort="${on ? (orden.asc ? 'ascending' : 'descending') : 'none'}">${esc(label)}<span class="sort-ico">${on ? (orden.asc ? '▲' : '▼') : '↕'}</span></th>`;
}
function ultimoAcceso(u) {
  const a = accesos.get(u.id);
  return a ? `<span class="mono">${fmtDateTime(a)}</span>` : '<span class="cell-sub">Aún no ha entrado</span>';
}

function pintar() {
  const body = root?.querySelector('#u-body');
  if (!body || !cat) return;
  const q = sanitizeSearch(root.querySelector('#u-q').value).toLowerCase();
  const rol = root.querySelector('#u-rol').value, act = root.querySelector('#u-act').value;
  const lista = usuarios.filter((u) => (!rol || u.rol === rol) && (!act || String(u.activo) === act)
    && (!q || `${u.nombre_completo} ${u.correo} ${u.puesto || ''} ${u.area || ''}`.toLowerCase().includes(q)));
  const f = CLAVES[orden.k];
  lista.sort((a, b) => String(f(a)).localeCompare(String(f(b)), 'es', { numeric: true }) * (orden.asc ? 1 : -1));
  if (!lista.length) { body.innerHTML = emptyState({ ico: 'users', title: 'Sin usuarios', text: 'No hay perfiles que coincidan con la búsqueda.' }); refreshIcons(); return; }
  body.innerHTML = `<div class="table-wrap responsive"><table class="table usuarios-tabla"><thead><tr>
      ${th('Usuario', 'nombre')}${th('Puesto', 'puesto')}${th('Rol', 'rol')}${th('Último acceso', 'acceso')}${th('Estado', 'estado')}<th>Correos</th><th>Acciones</th></tr></thead><tbody>
    ${lista.map((u) => {
      const yo = u.id === state.session?.user?.id;
      return `<tr class="${u.activo ? '' : 'inactivo'}">
      <td class="col-user" data-label="Usuario"><div class="td-in"><div class="user-cell">${avatarHTML(u.nombre_completo, fotoDe(u))}
        <span class="user-txt"><b>${esc(u.nombre_completo)}${yo ? ' <small class="tu">(tú)</small>' : ''}</b><small>${esc(u.correo)}</small></span></div></div></td>
      <td data-label="Puesto"><div class="td-in"><span class="puesto-txt"><b>${esc(u.puesto || '—')}</b><small>${esc(u.area || 'Sin área')}</small></span></div></td>
      <td data-label="Rol"><div class="td-in">${u.rol === 'admin' ? '<span class="pill orange">Administrador</span>' : '<span class="pill info">Usuario</span>'}</div></td>
      <td data-label="Último acceso"><div class="td-in">${ultimoAcceso(u)}</div></td>
      <td data-label="Estado"><div class="td-in">${u.activo ? '<span class="pill ok">Activo</span>' : '<span class="pill gray">Inactivo</span>'}</div></td>
      <td data-label="Correos"><div class="td-in"><button class="mail-switch ${u.correos_admin === false ? '' : 'on'}" data-correos="${esc(u.id)}" role="switch" aria-checked="${u.correos_admin !== false}" title="${u.correos_admin === false ? 'Toca para activar sus correos' : 'Toca para desactivar sus correos'}">
        <span class="ms-track"><span class="ms-knob">${icon(u.correos_admin === false ? 'mail-x' : 'mail')}</span></span><span class="ms-txt">${u.correos_admin === false ? 'Desactivados' : 'Activos'}</span></button></div></td>
      <td class="actions" data-label="Acciones"><div class="td-in"><div class="row-actions">
        <button class="icon-btn" data-edit="${esc(u.id)}" aria-label="Editar" title="Editar">${icon('pencil')}</button>
        ${yo ? '' : `<button class="icon-btn ${u.activo ? 'warn' : 'ok'}" data-toggle="${esc(u.id)}" aria-label="${u.activo ? 'Desactivar' : 'Activar'}" title="${u.activo ? 'Desactivar' : 'Activar'}">${icon(u.activo ? 'user-x' : 'user-check')}</button>`}
      </div></div></td></tr>`;
    }).join('')}</tbody></table></div>
    <p class="hint">${icon('info')} <b>Administrador:</b> configura todo el sistema. <b>Usuario:</b> captura lo que permite su puesto.</p>`;
  refreshIcons();
}

async function onClick(e) {
  const tb = e.target.closest('[data-tab]');
  if (tb) { tab = tb.dataset.tab; mostrarTab(); return; }
  const so = e.target.closest('[data-sort]');
  if (so) { orden = { k: so.dataset.sort, asc: orden.k === so.dataset.sort ? !orden.asc : true }; pintar(); return; }
  if (e.target.closest('[data-u="retry"]')) { cargar(); return; }
  if (e.target.closest('[data-u="agregar"]')) { if (await agregarForm()) cargar(); return; }
  if (e.target.closest('[data-u="nuevo-puesto"]')) { if (await puestoForm()) cargar(); return; }
  const pe = e.target.closest('[data-edit-puesto]');
  if (pe) { if (await puestoForm(cat.puestos.find((p) => p.id === pe.dataset.editPuesto))) cargar(); return; }
  const pd = e.target.closest('[data-del-puesto]');
  if (pd) {
    const p = cat.puestos.find((x) => x.id === pd.dataset.delPuesto);
    if (!p || !(await confirmDialog({ title: `¿Eliminar el puesto ${p.nombre}?`, message: 'Ninguna persona lo tiene asignado. Esta acción no se puede deshacer.', confirmText: 'Eliminar', danger: true }))) return;
    const { error } = await sb.from('brom_puestos').delete().eq('id', p.id);
    if (error) throw error;
    toast('Puesto eliminado.', 'success'); invalidarCatalogos(); cargar(); return;
  }
  // Correos de avisos: control del administrador, aparte de la preferencia de cada persona
  const mc = e.target.closest('[data-correos]');
  if (mc) {
    const u = usuarios.find((x) => x.id === mc.dataset.correos);
    if (!u) return;
    // Cambio inmediato, sin confirmación; si falla, el interruptor regresa
    const activar = u.correos_admin === false;
    u.correos_admin = activar; pintar();
    const { error } = await sb.from('brom_usuarios').update({ correos_admin: activar }).eq('id', u.id);
    if (error) { u.correos_admin = !activar; pintar(); throw error; }
    toast(activar ? `Correos activados para ${u.nombre_completo}.` : `Correos desactivados para ${u.nombre_completo}.`, 'success'); return;
  }
  const tg = e.target.closest('[data-toggle]');
  if (tg) {
    const u = usuarios.find((x) => x.id === tg.dataset.toggle);
    if (!u) return;
    if (u.activo && u.rol === 'admin' && !usuarios.some((x) => x.id !== u.id && x.rol === 'admin' && x.activo)) { toast('Debe quedar al menos un administrador activo.', 'warning'); return; }
    const ok = await confirmDialog({
      title: u.activo ? 'Desactivar usuario' : 'Activar usuario', danger: u.activo, confirmText: u.activo ? 'Desactivar' : 'Activar',
      message: u.activo ? `${u.nombre_completo} ya no podrá entrar a Liberación de producto. Su cuenta en otras aplicaciones no se modifica.` : `${u.nombre_completo} podrá volver a entrar a Liberación de producto.`,
    });
    if (!ok) return;
    const { error } = await sb.from('brom_usuarios').update({ activo: !u.activo }).eq('id', u.id);
    if (error) throw error;
    toast(u.activo ? 'Usuario desactivado.' : 'Usuario activado.', 'success'); cargar(); return;
  }
  const b = e.target.closest('[data-edit]');
  if (!b) return;
  const u = usuarios.find((x) => x.id === b.dataset.edit);
  if (u && await usuarioForm(u)) cargar();
}

// Puesto y área: menú con los que ya existen y opción de escribir uno nuevo
const listaAreas = () => [...new Set(usuarios.map((u) => u.area).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'es'));
function camposPuesto(v = {}) {
  return `<div class="field"><label for="uf-pue">Puesto <span class="req">*</span></label>
      <input id="uf-pue" name="puesto" required maxlength="80" list="uf-puestos" value="${esc(v.puesto || '')}" placeholder="Elige uno o escribe un puesto nuevo" autocomplete="off">
      <datalist id="uf-puestos">${cat.puestos.filter((p) => p.activo).map((p) => `<option value="${esc(p.nombre)}">`).join('')}</datalist>
      <small class="hint" data-permisos></small></div>
    <div class="field"><label for="uf-area">Área <span class="req">*</span></label>
      <input id="uf-area" name="area" required maxlength="80" list="uf-areas" value="${esc(v.area || '')}" placeholder="Elige una o escribe un área nueva" autocomplete="off">
      <datalist id="uf-areas">${listaAreas().map((a) => `<option value="${esc(a)}">`).join('')}</datalist></div>`;
}
// Resumen de lo que permite el puesto elegido
function permisosTxt(nombre) {
  const p = cat.puestos.find((x) => x.nombre.toLowerCase() === String(nombre || '').trim().toLowerCase());
  if (!p) return nombre ? 'Puesto nuevo: se agregará al catálogo sin permisos de captura; configúralos en Puestos y permisos.' : '';
  const areas = (p.areas_captura || []).map((id) => cat.area(id).nombre);
  return [areas.length ? `Captura: ${areas.join(', ')}` : 'No captura análisis', p.puede_liberar ? 'libera lotes' : '', p.firma_certificado ? `firma como ${FIRMAS[p.firma_certificado]}` : '']
    .filter(Boolean).join(' · ') + '.';
}
function montarPermisos(form) {
  const out = form.querySelector('[data-permisos]');
  const upd = () => { out.textContent = permisosTxt(form.puesto.value); };
  form.puesto.addEventListener('input', upd); form.puesto.addEventListener('change', upd); upd();
}
const limpio = (s) => String(s || '').trim().replace(/\s+/g, ' ');
// Usa el nombre del catálogo si coincide sin importar mayúsculas; si no existe, lo agrega
async function asegurarPuesto(nombre) {
  const n = limpio(nombre);
  if (!n) return null;
  const p = cat.puestos.find((x) => x.nombre.toLowerCase() === n.toLowerCase());
  if (p) return p.nombre;
  const { error } = await sb.from('brom_puestos').insert({ nombre: n });
  if (error) throw error;
  invalidarCatalogos();
  return n;
}
const areaNormal = (a) => { const n = limpio(a); return listaAreas().find((x) => x.toLowerCase() === n.toLowerCase()) || n; };
const rolSelect = (v, dis = false) => `<div class="field"><label for="uf-rol">Rol <span class="req">*</span></label><select id="uf-rol" name="rol" required ${dis ? 'disabled' : ''}>
  ${Object.entries(ROLES).map(([k, x]) => `<option value="${k}" ${k === v ? 'selected' : ''}>${x}</option>`).join('')}</select></div>`;

function usuarioForm(u) {
  const yo = u.id === state.session?.user?.id;
  let foto = null;
  return openModal({
    title: 'Editar usuario', subtitle: u.correo, submitText: 'Guardar cambios',
    body: `<div class="photo-pick">${avatarHTML(u.nombre_completo, fotoDe(u), 'xl')}
        <div><label class="btn secondary" for="uf-foto">${icon('camera')} Cambiar fotografía</label>
          <input id="uf-foto" type="file" accept="image/jpeg,image/png,image/webp" class="sr-only">
          <p class="hint">JPG, PNG o WEBP de hasta 5 MB. Se recorta en cuadro.</p></div></div>
      <div class="form-grid">
        <div class="field full"><label for="uf-nom">Nombre completo <span class="req">*</span></label><input id="uf-nom" name="nombre" required maxlength="120" value="${esc(u.nombre_completo)}"></div>
        ${camposPuesto(u)}
        ${rolSelect(u.rol, yo)}
        <div class="field"><label for="uf-act">Estado</label><select id="uf-act" name="activo" ${yo ? 'disabled' : ''}><option value="true">Activo</option><option value="false" ${u.activo ? '' : 'selected'}>Inactivo</option></select></div>
      </div>
      <label class="switch-row" style="margin-top:12px"><span><b>${icon('mail')} Enviar correos de avisos</b><small class="hint" style="display:block;margin:2px 0 0">Si lo apagas, no recibe correos aunque los tenga activos en su perfil.</small></span>
        <input type="checkbox" name="correos" ${u.correos_admin === false ? '' : 'checked'}></label>
      ${yo ? `<p class="hint">${icon('lock')} No puedes cambiar tu propio rol ni desactivarte.</p>` : ''}`,
    onOpen: ({ form, wrap }) => {
      montarPermisos(form);
      form.querySelector('#uf-foto').addEventListener('change', async (e) => {
        const f = e.target.files?.[0];
        if (!f) return;
        try {
          foto = await prepararFoto(f);
          const av = wrap.querySelector('.photo-pick .avatar');
          av.className = 'avatar has-img xl';
          av.innerHTML = `<img src="${URL.createObjectURL(foto)}" alt="">`;
          form.dispatchEvent(new Event('input'));
        } catch (err) { toast(err.message, 'error'); }
      });
    },
    onSubmit: async ({ form }) => {
      if (!checkForm(form)) return false;
      const fila = { nombre_completo: limpio(form.nombre.value), puesto: await asegurarPuesto(form.puesto.value), area: areaNormal(form.area.value) || null, correos_admin: form.querySelector('[name="correos"]').checked };
      if (!yo) {
        fila.rol = form.rol.value; fila.activo = form.activo.value === 'true';
        const quedan = usuarios.filter((x) => x.id !== u.id && x.rol === 'admin' && x.activo).length;
        if (u.rol === 'admin' && u.activo && (fila.rol !== 'admin' || !fila.activo) && quedan === 0) throw new Error('Debe quedar al menos un administrador activo.');
      }
      if (foto) fila.foto_url = await subirFoto(foto, u.id);
      const { error } = await sb.from('brom_usuarios').update(fila).eq('id', u.id);
      if (error) throw error;
      if (foto) borrarFotoPropia(u.foto_url);
      if (yo) Object.assign(state.profile, { nombre: fila.nombre_completo, puesto: fila.puesto, area: fila.area, ...(fila.foto_url ? { foto_url: fila.foto_url } : {}) });
      invalidarCatalogos();
      toast('Usuario actualizado.', 'success');
    },
  });
}

// Alta de una cuenta que ya existe en Supabase Auth (la misma de las demás apps de Pet's Table).
// La búsqueda (brom_buscar_cuentas) sugiere la foto que la persona ya tiene en el Storage.
function agregarForm() {
  let elegida = null;
  return openModal({
    title: 'Nuevo usuario', subtitle: 'Busca a la persona por su nombre o correo corporativo.', submitText: 'Dar acceso',
    body: `<div class="field"><label for="ag-q">Buscar cuenta</label>
        <div class="search-field">${icon('search')}<input id="ag-q" type="search" autocomplete="off" placeholder="Escribe al menos dos letras del nombre o del correo"></div></div>
      <div class="cuentas" data-cuentas><p class="hint">Aparecerán las cuentas @petstable.mx que coincidan.</p></div>
      <div class="ag-datos hidden" data-datos>
        <div class="photo-pick" data-foto></div>
        <div class="form-grid">
          <div class="field full"><label for="ag-nom">Nombre completo <span class="req">*</span></label><input id="ag-nom" name="nombre" required maxlength="120"></div>
          ${camposPuesto()}
          ${rolSelect('usuario')}
        </div>
      </div>`,
    onOpen: ({ form }) => {
      montarPermisos(form);
      const box = form.querySelector('[data-cuentas]');
      let n = 0;
      const buscar = debounce(async () => {
        const q = form.querySelector('#ag-q').value.trim();
        const t = ++n;
        if (q.length < 2) { box.innerHTML = '<p class="hint">Escribe al menos dos letras.</p>'; return; }
        box.innerHTML = '<div class="skeleton" style="height:56px"></div>';
        const { data, error } = await sb.rpc('brom_buscar_cuentas', { p_q: q });
        if (t !== n) return;
        if (error) { box.innerHTML = `<p class="form-error">${esc(errMsg(error))}</p>`; return; }
        if (!data?.length) { box.innerHTML = '<p class="hint">No se encontraron cuentas con esa búsqueda. La persona debe tener una cuenta de Pet\'s Table (la que usa en las demás aplicaciones).</p>'; return; }
        box.innerHTML = data.map((c, i) => `<button type="button" class="cuenta ${c.ya_registrado ? 'ya' : ''}" data-i="${i}" ${c.ya_registrado ? 'disabled' : ''}>
          ${avatarHTML(c.nombre, c.foto_sugerida)}<span class="user-txt"><b>${esc(c.nombre)}</b><small>${esc(c.email)}</small></span>
          <span class="cuenta-est">${c.ya_registrado ? '<span class="pill gray">Ya tiene acceso</span>' : c.ultimo_acceso ? `<small>Último acceso: ${fmtDateTime(c.ultimo_acceso)}</small>` : '<small>Sin accesos</small>'}</span></button>`).join('');
        box._data = data;
        refreshIcons();
      }, 300);
      form.querySelector('#ag-q').addEventListener('input', buscar);
      box.addEventListener('click', (e) => {
        const b = e.target.closest('.cuenta:not([disabled])');
        if (!b) return;
        elegida = box._data[Number(b.dataset.i)];
        box.querySelectorAll('.cuenta').forEach((x) => x.classList.toggle('sel', x === b));
        form.querySelector('[data-datos]').classList.remove('hidden');
        form.querySelector('[data-foto]').innerHTML = `${avatarHTML(elegida.nombre, elegida.foto_sugerida, 'xl')}<div><b>${esc(elegida.email)}</b>
          <p class="hint">${elegida.foto_sugerida ? 'Se usará la fotografía que ya tiene en las aplicaciones de Pet\'s Table.' : 'Sin fotografía: se mostrarán sus iniciales. Puedes agregarla después en Editar.'}</p></div>`;
        form.nombre.value = elegida.nombre;
        form.nombre.focus();
      });
    },
    onSubmit: async ({ form, setError }) => {
      if (!elegida) { setError('Selecciona una cuenta de la lista.'); return false; }
      if (!checkForm(form)) return false;
      const n = limpio(form.puesto.value);
      const { error } = await sb.rpc('brom_agregar_cuenta', {
        p_id: elegida.id, p_nombre: limpio(form.nombre.value), p_rol: form.rol.value, p_foto: elegida.foto_sugerida || null,
        p_puesto: cat.puestos.find((x) => x.nombre.toLowerCase() === n.toLowerCase())?.nombre || n, p_area: areaNormal(form.area.value),
      });
      if (error) throw error;
      invalidarCatalogos();
      toast(`${limpio(form.nombre.value)} ya tiene acceso a Liberación de producto.`, 'success');
    },
  });
}

// ---------------------------------------------------------------------
// Puestos y permisos
// ---------------------------------------------------------------------
function pintarPuestos() {
  const body = root.querySelector('#p-body');
  if (!cat.puestos.length) { body.innerHTML = emptyState({ ico: 'briefcase', title: 'Sin puestos', text: 'Registra el primer puesto.' }); return; }
  const gente = (p) => usuarios.filter((u) => u.puesto === p.nombre);
  body.innerHTML = `<div class="table-wrap responsive"><table class="table"><thead><tr><th>Puesto</th><th>Personas</th><th>Áreas que captura</th><th>Libera lotes</th><th>Firma del certificado</th><th>Estado</th><th>Acciones</th></tr></thead><tbody>
    ${cat.puestos.map((p) => {
      const g = gente(p);
      return `<tr>
      <td data-label="Puesto"><div class="td-in cell-main">${esc(p.nombre)}</div></td>
      <td data-label="Personas"><div class="td-in">${g.length ? `<span class="avatares" title="${esc(g.map((u) => u.nombre_completo).join(', '))}">${g.slice(0, 5).map((u) => avatarHTML(u.nombre_completo, fotoDe(u), 'sm')).join('')}${g.length > 5 ? `<span class="mas">+${g.length - 5}</span>` : ''}</span>` : '<span class="cell-sub">Sin personas</span>'}</div></td>
      <td data-label="Áreas que captura"><div class="td-in"><div class="chips-areas">${(p.areas_captura || []).length ? p.areas_captura.map((id) => { const a = cat.area(id); return `<span class="area-chip" style="--ac:${esc(a.color)}"><span class="area-dot"></span>${esc(a.nombre)}</span>`; }).join('') : '<span class="cell-sub">No captura</span>'}</div></div></td>
      <td data-label="Libera lotes"><div class="td-in">${p.puede_liberar ? '<span class="pill-solida verde">Sí</span>' : '<span class="cell-sub">No</span>'}</div></td>
      <td data-label="Firma"><div class="td-in">${p.firma_certificado ? `<span class="pill-solida ${p.firma_certificado === 'jefe_calidad' ? 'naranja' : 'azul'}">${esc(FIRMAS[p.firma_certificado])}</span>` : '<span class="cell-sub">No firma</span>'}</div></td>
      <td data-label="Estado"><div class="td-in">${p.activo ? '<span class="pill ok">Activo</span>' : '<span class="pill gray">Inactivo</span>'}</div></td>
      <td class="actions" data-label="Acciones"><div class="td-in"><div class="row-actions">
        <button class="icon-btn" data-edit-puesto="${esc(p.id)}" aria-label="Editar" title="Editar">${icon('pencil')}</button>
        ${g.length ? '' : `<button class="icon-btn bad" data-del-puesto="${esc(p.id)}" aria-label="Eliminar" title="Eliminar">${icon('trash-2')}</button>`}
      </div></div></td></tr>`;
    }).join('')}</tbody></table></div>
    <p class="hint">${icon('info')} El puesto define qué captura cada persona. El certificado lo firman un <b>Jefe de calidad</b> y un <b>Inspector de calidad</b>.</p>`;
  refreshIcons();
}

function puestoForm(p = null) {
  return openModal({
    title: p ? `Editar puesto ${p.nombre}` : 'Nuevo puesto', size: 'sm', submitText: p ? 'Guardar cambios' : 'Registrar puesto',
    body: `<div class="field"><label for="pf-nom">Nombre del puesto <span class="req">*</span></label><input id="pf-nom" name="nombre" required maxlength="80" value="${esc(p?.nombre || '')}" placeholder="Por ejemplo: Inspector de calidad"></div>
      <div class="field"><label>Áreas de análisis que captura</label>
        <div class="opt-list">${cat.areas.map((a) => opcionCheck('areas', a.id, a.nombre, (p?.areas_captura || []).includes(a.id), `<span class="area-dot" style="--ac:${esc(a.color)}"></span>`)).join('')}</div></div>
      <div class="field"><label>Liberación</label><div class="opt-list">${opcionCheck('libera', '1', 'Puede liberar lotes y emitir el certificado de calidad', p?.puede_liberar)}</div></div>
      <div class="field"><label for="pf-firma">Firma en el certificado de calidad</label><select id="pf-firma" name="firma">
        <option value="">No firma</option>${Object.entries(FIRMAS).map(([k, v]) => `<option value="${k}" ${p?.firma_certificado === k ? 'selected' : ''}>${v}</option>`).join('')}</select></div>
      <div class="field"><label for="pf-act">Estado</label><select id="pf-act" name="activo"><option value="true">Activo</option><option value="false" ${p && !p.activo ? 'selected' : ''}>Inactivo (sin permisos)</option></select></div>
      ${p ? `<p class="hint">${icon('info')} Si cambias el nombre, se actualiza en todas las personas con este puesto.</p>` : ''}`,
    onSubmit: async ({ form }) => {
      if (!checkForm(form)) return false;
      const fila = {
        nombre: limpio(form.nombre.value), areas_captura: [...form.querySelectorAll('[name="areas"]:checked')].map((x) => x.value),
        puede_liberar: form.querySelector('[name="libera"]').checked, firma_certificado: form.firma.value || null, activo: form.activo.value === 'true',
      };
      const { error } = p ? await sb.from('brom_puestos').update(fila).eq('id', p.id) : await sb.from('brom_puestos').insert(fila);
      if (error) throw error;
      invalidarCatalogos();
      toast(p ? 'Puesto actualizado.' : 'Puesto registrado.', 'success');
    },
  });
}
