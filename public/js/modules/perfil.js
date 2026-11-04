// =====================================================================
// Perfil del usuario: datos, notificaciones y correos (con pruebas), fotografía,
// cambio de contraseña, tema e instalación.
// =====================================================================
import {
  sb, state, esc, icon, refreshIcons, toast, errMsg, checkForm, prefs, fmtDateTime, APP_VERSION, avatarHTML, roleLabel,
  prepararFoto, subirFoto, borrarFotoPropia, push, pill, openModal, ganchos,
} from '../core.js';

let deferredPrompt = null;
window.addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); deferredPrompt = e; });
const instalada = () => window.matchMedia('(display-mode: standalone), (display-mode: fullscreen)').matches || window.navigator.standalone === true;

// Permisos: el rol define qué se administra; el puesto, qué se captura, si libera y si firma
function permisosTxt(p) {
  if (p.rol === 'admin') return 'Administración completa: recetas, métodos, usuarios, puestos y bitácora; captura de todas las áreas, liberación y borrado de lotes';
  const areas = (p.areas_captura || []).map((a) => ({ bromatologico: 'bromatológico', fisicoquimico: 'fisicoquímico', microbiologico: 'microbiológico', sensorial: 'sensorial' }[a] || a));
  return ['Registrar lotes', areas.length ? `capturar análisis ${areas.join(', ')}` : 'consultar análisis', p.puede_liberar ? 'liberar lotes y emitir certificados' : '',
    p.firma_certificado === 'jefe_calidad' ? 'firmar certificados como Jefe de calidad' : p.firma_certificado === 'inspector' ? 'firmar certificados como Inspector de calidad' : ''].filter(Boolean).join('; ');
}


// ---------- Notificaciones push de este dispositivo ----------
const QUE_AVISA = 'Te avisamos cuando se registra un lote y te toca capturar un área, cuando alguien más completa un área que tú también capturas, cuando un lote queda listo para liberar o no conforme, y cuando se libera un lote que registraste o capturaste.';
async function pintarPush(box) {
  if (!box) return;
  const est = await push.estado().catch(() => 'no-soportado');
  const prueba = `<button class="btn c-purple" data-n="test">${icon('bell-ring')} Enviar notificación de prueba</button>`;
  const txt = {
    activo: [pill('Activadas en este dispositivo', 'ok'), 'Quedan activas aunque cierres sesión; los avisos llegan a la última cuenta que inició sesión aquí.', `<div class="page-actions notif-acts">
        ${prueba}<button class="btn s-red" data-n="off">${icon('bell-off')} Desactivar en este dispositivo</button></div>
      <details class="notif-ajustes"><summary>${icon('smartphone')} ¿No suena o no aparece en la pantalla bloqueada?</summary>
        <p><b>Android (Chrome):</b> mantén presionado el aviso de prueba → Configuración, o ve a Ajustes → Aplicaciones → Chrome → Notificaciones → busca este sitio y activa <b>Mostrar en pantalla emergente</b>, <b>Sonido</b> y <b>Pantalla de bloqueo</b>.</p>
        <p><b>iPhone:</b> Ajustes → Notificaciones → Liberación → activa <b>Permitir notificaciones</b>, <b>Pantalla bloqueada</b> y <b>Sonidos</b>.</p>
        <p><b>Windows:</b> Configuración → Sistema → Notificaciones → activa las de Chrome o Edge y revisa que «No molestar» esté apagado.</p>
      </details>`],
    inactivo: [pill('Desactivadas en este dispositivo', 'gray'), 'Actívalas para recibir los avisos aunque no tengas el sistema abierto. Mientras tanto, los avisos aparecen en la campana del encabezado.', `<div class="page-actions notif-acts">
        <button class="btn c-green" data-n="on">${icon('bell')} Activar notificaciones</button>${prueba}</div>`],
    bloqueado: [pill('Bloqueadas', 'bad'), 'Las notificaciones están bloqueadas para este sitio. Permítelas desde la configuración del navegador (ícono del candado junto a la dirección) y vuelve a intentarlo.', `<div class="page-actions notif-acts">${prueba}</div>`],
    instalar: [pill('Requiere instalar', 'warn'), 'En iPhone y iPad las notificaciones solo funcionan con la app instalada: toca Compartir → «Agregar a pantalla de inicio», ábrela desde ese ícono y regresa aquí para activarlas.', `<div class="page-actions notif-acts">${prueba}</div>`],
    'no-soportado': [pill('No disponibles', 'gray'), 'Este navegador no admite notificaciones web. Usa Chrome, Edge o Safari actualizados. Los avisos siguen apareciendo en la campana.', `<div class="page-actions notif-acts">${prueba}</div>`],
  }[est];
  box.innerHTML = `<p style="margin:0 0 8px">${txt[0]}</p><p class="hint" style="margin:0 0 12px">${esc(txt[1])}</p>${txt[2]}`;
  refreshIcons();
  box.querySelector('[data-n="test"]')?.addEventListener('click', async (e) => {
    const b = e.currentTarget; b.disabled = true;
    try {
      // Crea un aviso de prueba en la campana y lo envía por push a tus dispositivos
      const { data, error } = await sb.functions.invoke('notificar_brom', { body: { accion: 'prueba' } });
      if (error) throw error;
      ganchos.refrescarAvisos?.();
      if (data?.push) toast('Notificación de prueba enviada. Revisa la campana y la notificación de este dispositivo.', 'success', 6000);
      else {
        toast(est === 'activo' ? 'La notificación de prueba quedó en la campana. Si no ves la notificación del dispositivo, desactiva y vuelve a activar.' : 'La notificación de prueba quedó en la campana. Activa las notificaciones para recibirlas también en este dispositivo.', 'info', 7000);
        // Aviso local, con la misma apariencia que los reales
        if (est === 'activo') {
          const reg = await navigator.serviceWorker.ready;
          reg.active?.postMessage({ tipo: 'aviso-prueba', title: 'Aviso de prueba · Liberación de producto', body: 'Así se verán los avisos de lotes en este dispositivo.', foto: state.profile.foto_url || null });
        }
      }
    } catch (err) { toast(/function|fetch|non-2xx|404/i.test(String(err?.message)) ? 'El servicio de notificaciones aún no está disponible. Inténtalo más tarde.' : errMsg(err), 'error'); }
    b.disabled = false;
  });
  box.querySelector('[data-n="on"], [data-n="off"]')?.addEventListener('click', async (e) => {
    const b = e.currentTarget; b.disabled = true;
    try {
      if (b.dataset.n === 'on') { await push.activar(); toast('Notificaciones activadas en este dispositivo.', 'success'); }
      else { await push.desactivar(); toast('Notificaciones desactivadas en este dispositivo.', 'success'); }
    } catch (err) { toast(errMsg(err), 'error'); }
    pintarPush(box);
  });
}

// ---------- Correos ----------
async function pintarCorreo(box) {
  if (!box) return;
  const p = state.profile;
  const { data } = await sb.from('brom_usuarios').select('recibe_correos').eq('id', p.id).maybeSingle();
  const recibe = data?.recibe_correos !== false;
  box.innerHTML = `<label class="switch-row"><span><b>Recibir los avisos por correo</b><small class="hint" style="display:block;margin:2px 0 0">Se envían a ${esc(p.email)}</small></span>
      <input type="checkbox" class="switch" id="pf-correos" ${recibe ? 'checked' : ''} ${data ? '' : 'disabled'}></label>
    <div class="page-actions notif-acts" style="margin-top:12px">
      <button class="btn s-blue" data-mail="vista">${icon('eye')} Vista previa del correo</button>
      <button class="btn c-teal" data-mail="enviar">${icon('send')} Enviarme un correo de prueba</button></div>`;
  refreshIcons();
  box.querySelector('#pf-correos').addEventListener('change', async (e) => {
    const on = e.target.checked;
    const { error } = await sb.rpc('brom_mis_avisos', { p_correos: on });
    if (error) { e.target.checked = !on; toast(errMsg(error), 'error'); return; }
    toast(on ? 'Recibirás los avisos también por correo.' : 'Ya no recibirás los avisos por correo; seguirán en la campana.', 'success');
  });
  box.querySelectorAll('[data-mail]').forEach((b) => b.addEventListener('click', () => correoPrueba(b)));
}
// Vista previa con datos de ejemplo (misma plantilla que los correos reales) o envío solo a tu correo
async function correoPrueba(btn) {
  const vista = btn.dataset.mail === 'vista';
  btn.disabled = true;
  try {
    const { data, error } = await sb.functions.invoke('notificar_brom', { body: { accion: 'correo_prueba', vista } });
    if (error) throw error;
    if (vista) {
      let logo = '';
      try {
        const b = await (await fetch('/logo-correo.png')).blob();
        logo = await new Promise((ok) => { const r = new FileReader(); r.onload = () => ok(r.result); r.readAsDataURL(b); });
      } catch { /* sin logo: se muestra el nombre en texto */ }
      const html = String(data.html).replace('__LOGO__', /^data:image\/png/.test(logo) ? logo : '');
      await openModal({
        title: 'Vista previa del correo', size: 'lg', submitText: 'Cerrar', onSubmit: () => true,
        subtitle: `Asunto: ${data.asunto} · De: Liberación de producto · Pet's Table`,
        body: `${data.configurado ? '' : `<div class="notice warn">${icon('info')}<span>El envío de correos aún no está configurado (falta la contraseña de aplicación de Gmail en Supabase). Esta es solo la vista previa.</span></div>`}
          <iframe class="mail-preview" title="Vista previa del correo" sandbox="" srcdoc="${esc(html)}"></iframe>
          <p class="hint" style="margin-top:8px">Datos de ejemplo de un lote listo para liberar.</p>`,
      });
    } else if (!data?.configurado) {
      toast('El envío de correos aún no está configurado: falta la contraseña de aplicación de Gmail en Supabase.', 'warning', 7000);
    } else if (data.ok) {
      toast(`Correo de prueba enviado a ${data.para}. Revisa tu bandeja (y Spam).`, 'success', 7000);
    } else {
      toast('No se pudo enviar el correo de prueba. Revisa la configuración del correo en Supabase.', 'error', 7000);
    }
  } catch (err) { toast(/function|fetch|non-2xx|404/i.test(String(err?.message)) ? 'El servicio de correos aún no está disponible. Inténtalo más tarde.' : errMsg(err), 'error'); }
  btn.disabled = false;
}
export default {
  async render(el) {
    const p = state.profile;
    const user = state.session?.user;
    const theme = prefs.get('brom.theme') || 'system';
    el.innerHTML = `
      <section class="page-intro"><div><span class="eyebrow">Cuenta</span><h1>Mi perfil</h1><p>Tus datos de acceso y preferencias.</p></div></section>
      <section class="profile-hero">
        <div class="access-photo">${avatarHTML(p.nombre, p.foto_url, 'xl')}<span class="access-check">${icon('badge-check')}</span></div>
        <div>
          <span class="access-badge">${icon(p.rol === 'admin' ? 'crown' : 'user')} ${esc(roleLabel(p.rol))}</span>
          <h2>${esc(p.nombre)}</h2>
          <p class="puesto">${esc(p.puesto || 'Puesto no registrado')}</p>
          <span class="mail">${icon('mail')} ${esc(p.email)}</span>
          <div style="margin-top:12px"><label class="btn secondary" for="pf-foto">${icon('camera')} Cambiar fotografía</label>
            <input id="pf-foto" type="file" accept="image/jpeg,image/png,image/webp" class="sr-only"></div>
        </div>
      </section>
      <div class="profile-tiles mt">
        <div class="p-tile"><span class="ti">${icon('briefcase')}</span><small>Puesto</small><b>${esc(p.puesto || 'Sin puesto registrado')}</b></div>
        <div class="p-tile"><span class="ti">${icon('building-2')}</span><small>Área</small><b>${esc(p.area || 'Sin área registrada')}</b></div>
        <div class="p-tile"><span class="ti">${icon('mail')}</span><small>Correo</small><b class="p-mail">${esc(p.email || '—')}</b></div>
        <div class="p-tile"><span class="ti">${icon('shield-check')}</span><small>Permisos</small><b class="p-perm">${esc(permisosTxt(p))}</b></div>
        <div class="p-tile"><span class="ti">${icon('clock')}</span><small>Último acceso</small><b>${fmtDateTime(user?.last_sign_in_at)}</b></div>
        <div class="p-tile"><span class="ti">${icon('info')}</span><small>Versión del sistema</small><b>${esc(APP_VERSION)}</b></div>
      </div>
      <div class="card mt notif-card">
        <div class="card-head"><div><h3>${icon('bell-ring')} Notificaciones y correos</h3><p>${esc(QUE_AVISA)}</p></div></div>
        <div class="grid grid-2">
          <div class="notif-col"><div class="section-title">${icon('smartphone')} En este dispositivo</div><div id="pf-push"><div class="skeleton" style="height:60px"></div></div></div>
          <div class="notif-col"><div class="section-title">${icon('mail')} Por correo</div><div id="pf-correo"><div class="skeleton" style="height:60px"></div></div></div>
        </div>
      </div>
      <div class="grid grid-2 mt">
        <div class="card">
          <div class="card-head"><div><h3>Cambiar contraseña</h3><p>Aplica a todas las aplicaciones de Pet's Table que usan esta cuenta.</p></div></div>
          <form id="pw-form" novalidate>
            <div class="field"><label for="pw1">Nueva contraseña <span class="req">*</span></label>
              <div class="pw-wrap"><input id="pw1" name="p1" type="password" autocomplete="new-password" minlength="8" maxlength="128" required>
              <button type="button" class="pw-toggle" data-action="toggle-pw" aria-label="Mostrar contraseña">${icon('eye')}</button></div></div>
            <div class="field"><label for="pw2">Confirmar contraseña <span class="req">*</span></label>
              <input id="pw2" name="p2" type="password" autocomplete="new-password" minlength="8" maxlength="128" required></div>
            <p class="hint">Mínimo 8 caracteres. Combina mayúsculas, minúsculas, números y símbolos.</p>
            <div class="form-error" role="alert"></div>
            <button type="submit" class="btn c-blue">${icon('key-round')} Actualizar contraseña</button>
          </form>
        </div>
        <div class="card">
          <div class="card-head"><div><h3>Apariencia</h3><p>Se guarda en este dispositivo.</p></div></div>
          <div class="seg" role="radiogroup" aria-label="Tema">
            <button data-theme-opt="light" class="${theme === 'light' ? 'active' : ''}">${icon('sun')} Claro</button>
            <button data-theme-opt="dark" class="${theme === 'dark' ? 'active' : ''}">${icon('moon')} Oscuro</button>
            <button data-theme-opt="system" class="${theme === 'system' ? 'active' : ''}">${icon('monitor-smartphone')} Sistema</button>
          </div>
          <div class="section-title" style="margin-top:22px">${icon('smartphone')} Instalar en la pantalla de inicio</div>
          ${instalada() ? `<p class="hint">${icon('check-circle-2')} Ya estás usando la aplicación instalada.</p>` : `
          <button class="btn secondary hidden" id="install-btn">${icon('download')} Instalar aplicación</button>
          <p class="hint" style="margin:10px 0 6px"><b>iPhone / iPad (Safari):</b></p>
          <ol class="steps"><li>Toca el botón <b>Compartir</b>.</li><li>Elige <b>Agregar a pantalla de inicio</b>.</li><li>Confirma el nombre “Liberación” y toca <b>Agregar</b>.</li></ol>
          <p class="hint" style="margin:10px 0 6px"><b>Android (Chrome):</b></p>
          <ol class="steps"><li>Abre el menú <b>⋮</b>.</li><li>Elige <b>Instalar aplicación</b> o <b>Agregar a pantalla principal</b>.</li></ol>`}
        </div>
      </div>`;
    refreshIcons();
    pintarPush(el.querySelector('#pf-push'));
    pintarCorreo(el.querySelector('#pf-correo'));

    el.querySelectorAll('[data-theme-opt]').forEach((b) => b.addEventListener('click', () => {
      window.__bromSetTheme?.(b.dataset.themeOpt);
      el.querySelectorAll('[data-theme-opt]').forEach((x) => x.classList.toggle('active', x === b));
    }));
    const ib = el.querySelector('#install-btn');
    if (ib && deferredPrompt) {
      ib.classList.remove('hidden');
      ib.addEventListener('click', async () => {
        deferredPrompt.prompt();
        const r = await deferredPrompt.userChoice.catch(() => null);
        if (r?.outcome === 'accepted') toast('Aplicación instalada.', 'success');
        deferredPrompt = null; ib.classList.add('hidden');
      });
    }

    el.querySelector('#pf-foto').addEventListener('change', async (e) => {
      const f = e.target.files?.[0];
      if (!f) return;
      try {
        const blob = await prepararFoto(f);
        const anterior = p.foto_url;
        const url = await subirFoto(blob);
        const { error } = await sb.rpc('brom_actualizar_mi_foto', { p_url: url });
        if (error) {
          borrarFotoPropia(url);
          throw /could not find the function/i.test(error.message) ? new Error('El cambio de fotografía todavía no está habilitado en la base de datos. Solicítalo al administrador del sistema.') : error;
        }
        borrarFotoPropia(anterior);
        p.foto_url = url;
        document.querySelectorAll('#top-avatar img, .profile-hero .avatar img').forEach((img) => { img.src = url; });
        toast('Fotografía actualizada.', 'success');
        window.dispatchEvent(new HashChangeEvent('hashchange'));
      } catch (err) { toast(errMsg(err), 'error'); }
      e.target.value = '';
    });

    const form = el.querySelector('#pw-form');
    let busy = false;
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      if (busy) return;
      form.querySelector('.form-error').textContent = '';
      if (!checkForm(form, { p2: (v, f) => (v !== f.p1.value ? 'Las contraseñas no coinciden.' : '') })) return;
      busy = true;
      const btn = form.querySelector('button[type=submit]'); btn.disabled = true;
      const { error } = await sb.auth.updateUser({ password: form.p1.value });
      busy = false; btn.disabled = false;
      if (error) {
        form.querySelector('.form-error').textContent = /same|different from the old/i.test(error.message)
          ? 'La nueva contraseña debe ser distinta de la actual.'
          : /weak|short|characters/i.test(error.message) ? 'La contraseña no cumple los requisitos de seguridad.'
          : /reauthentication|recent/i.test(error.message) ? 'Por seguridad, cierra sesión, vuelve a entrar e inténtalo de nuevo.'
          : errMsg(error);
        return;
      }
      form.reset();
      toast('Contraseña actualizada.', 'success');
    });
  },
};
