// =====================================================================
// Usuarios autorizados (brom_usuarios) — solo administradores.
// Las cuentas de acceso son de Supabase Auth (compartidas con otras apps
// de Pet's Table); aquí se administra el perfil de este portal.
// =====================================================================
import {
  sb, state, esc, icon, refreshIcons, toast, openModal, checkForm, emptyState, errorState, avatarHTML, roleLabel, ROLES,
  fotoDe, prepararFoto, subirFoto, borrarFotoPropia, debounce, sanitizeSearch,
} from '../core.js';

let root = null, token = 0, usuarios = [];

export default {
  async render(el) {
    root = el;
    el.innerHTML = `
      <section class="page-intro">
        <div><span class="eyebrow">Administración</span><h1>Usuarios autorizados</h1>
          <p>Perfiles con acceso a Análisis Bromatológicos: rol, puesto, estado y fotografía.</p></div>
      </section>
      <div class="notice">${icon('info')}<span>Las cuentas de acceso se crean en Supabase Auth y son las mismas de las demás aplicaciones de Pet's Table. Por seguridad, este portal no crea credenciales desde el navegador: aquí se administran los perfiles ya vinculados.</span></div>
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
      <td data-label="Usuario"><div class="td-in"><div class="user-cell">${avatarHTML(u.nombre_completo, fotoDe(u))}<b>${esc(u.nombre_completo)}</b>${u.id === state.session?.user?.id ? ' <span class="pill info">Tú</span>' : ''}</div></div></td>
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
      <div class="notice">${icon('shield-check')}<span><b>Administrador:</b> gestiona catálogos, usuarios y puede borrar lotes. <b>Analista</b> y <b>Calidad:</b> registran lotes y editan los suyos.</span></div>`,
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
