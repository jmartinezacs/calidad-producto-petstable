// =====================================================================
// Usuarios autorizados (brom_usuarios) — solo administradores.
// Las cuentas de acceso son de Supabase Auth (compartidas con otras apps
// de Pet's Table); aquí se administra el perfil de este portal.
// =====================================================================
import {
  sb, state, esc, icon, refreshIcons, toast, errMsg, openModal, checkForm, emptyState, errorState, avatarHTML, roleLabel, ROLES, fmtDateTime,
  fotoDe, prepararFoto, subirFoto, borrarFotoPropia, debounce, sanitizeSearch,
} from '../core.js';

let root = null, token = 0, usuarios = [];

export default {
  async render(el) {
    root = el;
    el.innerHTML = `
      <section class="page-intro">
        <div><span class="eyebrow">Administración</span><h1>Usuarios autorizados</h1>
          <p>Perfiles con acceso a Liberación de producto: rol, puesto, estado y fotografía.</p></div>
        <div class="page-actions"><button class="btn primary" data-u="agregar">${icon('user-plus')} Agregar usuario</button></div>
      </section>
      <div class="notice">${icon('info')}<span>Las cuentas son las mismas de las demás aplicaciones de Pet's Table. Con <b>Agregar usuario</b> buscas a una persona que ya tiene cuenta y le das acceso a este sitio, con su fotografía.</span></div>
      <div class="toolbar">
        <div class="search">${icon('search')}<input id="u-q" type="search" placeholder="Buscar por nombre, correo o puesto…" aria-label="Buscar usuario" autocomplete="off"></div>
        <label class="sr-only" for="u-rol">Rol</label>
        <select id="u-rol"><option value="">Todos los roles</option>${Object.entries(ROLES).map(([k, v]) => `<option value="${k}">${v}</option>`).join('')}</select>
      </div>
      <div class="card" id="u-body"></div>`;
    el.querySelector('#u-q').addEventListener('input', debounce(pintar, 200));
    el.querySelector('#u-rol').addEventListener('change', pintar);
    el.addEventListener('click', onClick);
    await cargar();
  },
  destroy() { token++; root = null; },
};

async function cargar() {
  const t = ++token;
  const body = root?.querySelector('#u-body');
  if (!body) return;
  body.innerHTML = '<div class="skeleton" style="height:160px"></div>';
  const { data, error } = await sb.from('brom_usuarios').select('id, correo, nombre_completo, puesto, rol, activo, foto_url').order('nombre_completo');
  if (t !== token || !root) return;
  if (error) { body.innerHTML = errorState(error).replace('data-action="retry"', 'data-u="retry"'); refreshIcons(); return; }
  usuarios = data || [];
  pintar();
}

function pintar() {
  const body = root?.querySelector('#u-body');
  if (!body) return;
  const q = sanitizeSearch(root.querySelector('#u-q').value).toLowerCase();
  const rol = root.querySelector('#u-rol').value;
  const lista = usuarios.filter((u) => (!rol || u.rol === rol) && (!q || `${u.nombre_completo} ${u.correo} ${u.puesto || ''}`.toLowerCase().includes(q)));
  if (!lista.length) { body.innerHTML = emptyState({ ico: 'users', title: 'Sin usuarios', text: 'No hay perfiles que coincidan con la búsqueda.' }); refreshIcons(); return; }
  body.innerHTML = `<div class="table-wrap responsive"><table class="table"><thead><tr><th>Usuario</th><th>Correo</th><th>Puesto</th><th>Rol</th><th>Estado</th><th>Acciones</th></tr></thead><tbody>
    ${lista.map((u) => `<tr>
      <td class="col-usuario" data-label="Usuario"><div class="td-in"><div class="user-cell alineada">${avatarHTML(u.nombre_completo, fotoDe(u))}<span class="user-txt"><b>${esc(u.nombre_completo)}</b>${u.id === state.session?.user?.id ? '<small class="tu">Tu cuenta</small>' : ''}</span></div></div></td>
      <td data-label="Correo"><div class="td-in">${esc(u.correo)}</div></td>
      <td data-label="Puesto"><div class="td-in cell-sub">${esc(u.puesto || '—')}</div></td>
      <td data-label="Rol"><div class="td-in"><span class="pill ${u.rol === 'admin' ? 'orange' : u.rol === 'analista' ? 'info' : 'gray'}">${esc(roleLabel(u.rol))}</span></div></td>
      <td data-label="Estado"><div class="td-in">${u.activo ? '<span class="pill ok">Activo</span>' : '<span class="pill gray">Inactivo</span>'}</div></td>
      <td class="actions" data-label="Acciones"><div class="td-in"><div class="row-actions"><button class="icon-btn" data-edit="${esc(u.id)}" aria-label="Editar" title="Editar">${icon('pencil')}</button></div></div></td>
    </tr>`).join('')}</tbody></table></div>`;
  refreshIcons();
}

async function onClick(e) {
  if (e.target.closest('[data-u="retry"]')) { cargar(); return; }
  if (e.target.closest('[data-u="agregar"]')) { if (await agregarForm()) cargar(); return; }
  const b = e.target.closest('[data-edit]');
  if (!b) return;
  const u = usuarios.find((x) => x.id === b.dataset.edit);
  if (u && await usuarioForm(u)) cargar();
}

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
        <div class="field full"><label for="uf-pue">Puesto</label><input id="uf-pue" name="puesto" maxlength="120" value="${esc(u.puesto || '')}"></div>
        <div class="field"><label for="uf-rol">Rol</label><select id="uf-rol" name="rol" ${yo ? 'disabled' : ''}>${Object.entries(ROLES).map(([k, v]) => `<option value="${k}" ${k === u.rol ? 'selected' : ''}>${v}</option>`).join('')}</select></div>
        <div class="field"><label for="uf-act">Estado</label><select id="uf-act" name="activo" ${yo ? 'disabled' : ''}><option value="true">Activo</option><option value="false" ${u.activo ? '' : 'selected'}>Inactivo</option></select></div>
      </div>
      ${yo ? `<p class="hint">${icon('lock')} No puedes cambiar tu propio rol ni desactivarte.</p>` : ''}
      <div class="notice">${icon('shield-check')}<span><b>Analista de laboratorio:</b> registra lotes y captura análisis bromatológicos. <b>Jefatura de calidad:</b> captura análisis fisicoquímicos, microbiológicos y sensoriales y libera lotes. <b>Administrador:</b> todo, además de catálogos y usuarios.</span></div>`,
    onOpen: ({ form, wrap }) => {
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
      const fila = { nombre_completo: form.nombre.value.trim().replace(/\s+/g, ' '), puesto: form.puesto.value.trim() || null };
      if (!yo) {
        fila.rol = form.rol.value; fila.activo = form.activo.value === 'true';
        const quedan = usuarios.filter((x) => x.id !== u.id && x.rol === 'admin' && x.activo).length;
        if (u.rol === 'admin' && u.activo && (fila.rol !== 'admin' || !fila.activo) && quedan === 0) throw new Error('Debe quedar al menos un administrador activo.');
      }
      if (foto) fila.foto_url = await subirFoto(foto, u.id);
      const { error } = await sb.from('brom_usuarios').update(fila).eq('id', u.id);
      if (error) throw error;
      if (foto) borrarFotoPropia(u.foto_url);
      if (yo) { Object.assign(state.profile, { nombre: fila.nombre_completo, puesto: fila.puesto, ...(fila.foto_url ? { foto_url: fila.foto_url } : {}) }); }
      toast('Usuario actualizado.', 'success');
    },
  });
}

// Alta de una cuenta que ya existe en Supabase Auth (la misma de las demás apps de Pet's Table).
// La búsqueda (brom_buscar_cuentas) sugiere la foto que la persona ya tiene en el Storage.
function agregarForm() {
  let elegida = null;
  return openModal({
    title: 'Agregar usuario', subtitle: 'Busca a la persona por su nombre o correo corporativo.', submitText: 'Dar acceso',
    body: `<div class="field"><label for="ag-q">Buscar cuenta</label>
        <div class="search-field">${icon('search')}<input id="ag-q" type="search" autocomplete="off" placeholder="Escribe al menos dos letras del nombre o del correo"></div></div>
      <div class="cuentas" data-cuentas><p class="hint">Aparecerán las cuentas @petstable.mx que coincidan.</p></div>
      <div class="ag-datos hidden" data-datos>
        <div class="photo-pick" data-foto></div>
        <div class="form-grid">
          <div class="field full"><label for="ag-nom">Nombre completo <span class="req">*</span></label><input id="ag-nom" name="nombre" required maxlength="120"></div>
          <div class="field full"><label for="ag-pue">Puesto</label><input id="ag-pue" name="puesto" maxlength="120" placeholder="Por ejemplo: Analista de laboratorio"></div>
          <div class="field full"><label for="ag-rol">Rol <span class="req">*</span></label><select id="ag-rol" name="rol" required>
            ${Object.entries(ROLES).map(([k, v]) => `<option value="${k}" ${k === 'analista' ? 'selected' : ''}>${v}</option>`).join('')}</select></div>
        </div>
        <div class="notice">${icon('shield-check')}<span><b>Analista de laboratorio:</b> registra lotes y captura análisis bromatológicos. <b>Jefatura de calidad:</b> captura los análisis fisicoquímicos, microbiológicos y sensoriales y libera los lotes. <b>Administrador:</b> todo lo anterior, catálogos y usuarios.</span></div>
      </div>`,
    onOpen: ({ form }) => {
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
        const datos = form.querySelector('[data-datos]');
        datos.classList.remove('hidden');
        form.querySelector('[data-foto]').innerHTML = `${avatarHTML(elegida.nombre, elegida.foto_sugerida, 'xl')}<div><b>${esc(elegida.email)}</b>
          <p class="hint">${elegida.foto_sugerida ? 'Se usará la fotografía que ya tiene en las aplicaciones de Pet\'s Table.' : 'Sin fotografía: se mostrarán sus iniciales. Puedes agregarla después en Editar.'}</p></div>`;
        form.nombre.value = elegida.nombre;
        form.nombre.focus();
      });
    },
    onSubmit: async ({ form, setError }) => {
      if (!elegida) { setError('Selecciona una cuenta de la lista.'); return false; }
      if (!checkForm(form)) return false;
      const { error } = await sb.rpc('brom_agregar_cuenta', {
        p_id: elegida.id, p_nombre: form.nombre.value.trim().replace(/\s+/g, ' '), p_puesto: form.puesto.value.trim() || null,
        p_rol: form.rol.value, p_foto: elegida.foto_sugerida || null,
      });
      if (error) throw error;
      toast(`${form.nombre.value.trim()} ya tiene acceso a Liberación de producto.`, 'success');
    },
  });
}
