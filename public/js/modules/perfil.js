// =====================================================================
// Perfil del usuario: datos, notificaciones y correos (con pruebas), fotografía,
// cambio de contraseña, tema e instalación.
// =====================================================================
import {
  sb, state, esc, icon, refreshIcons, toast, errMsg, checkForm, prefs, fmtDateTime, APP_VERSION, avatarHTML, roleLabel,
  prepararFoto, subirFoto, borrarFotoPropia, push, openModal, ganchos, emoji, getDirectorio,
} from '../core.js';

// Mosaico de información con ilustración
const fila = (ilus, label, valor, cls = '') => `<div class="pf-t ${cls}"><span class="pf-ico">${emoji(ilus)}</span><div><small>${esc(label)}</small><b>${esc(valor)}</b></div></div>`;
// Insignia de cuenta verificada (la misma de Ruta de calidad)
const VERIFICADO = `<svg viewBox="0 0 32 32" aria-hidden="true"><defs><linearGradient id="pf-v" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#3EA2FF"/><stop offset="1" stop-color="#1565E0"/></linearGradient></defs><g fill="url(#pf-v)">${Array.from({ length: 12 }, (_, i) => { const a = (i / 12) * Math.PI * 2; return `<circle cx="${(16 + 11.2 * Math.cos(a)).toFixed(2)}" cy="${(16 + 11.2 * Math.sin(a)).toFixed(2)}" r="4.4"/>`; }).join('')}<circle cx="16" cy="16" r="12.4"/></g><path d="M10.4 16.4l3.7 3.7 7.6-7.8" fill="none" stroke="#FFF" stroke-width="2.9" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
const AUTOR = { nombre: 'Javier Martínez González', correo: 'javier.martinez@petstable.mx' };
// Tarjeta de notificaciones: estado (on, off, pend, info), ilustración, texto y botones a la derecha
const avisosHTML = (cls, ilus, titulo, texto, acciones = '') => `<div class="avisos ${cls}"><span class="avisos-ico">${emoji(ilus)}</span>
  <div class="avisos-txt"><b>${esc(titulo)}</b><p>${esc(texto)}</p></div>${acciones ? `<div class="avisos-acc">${acciones}</div>` : ''}</div>`;

let deferredPrompt = null;
window.addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); deferredPrompt = e; });
const instalada = () => window.matchMedia('(display-mode: standalone), (display-mode: fullscreen)').matches || window.navigator.standalone === true;

// Permisos: el rol define qué se administra; el puesto, qué se captura, si libera y si firma
function permisosTxt(p) {
  if (p.rol === 'admin') return 'Acceso total';
  const areas = (p.areas_captura || []).map((a) => ({ bromatologico: 'Bromatológico', fisicoquimico: 'Fisicoquímico', microbiologico: 'Microbiológico', sensorial: 'Sensorial' }[a] || a));
  return [areas.length ? `Captura: ${areas.join(', ')}` : 'Solo consulta', p.puede_liberar ? 'Libera lotes' : '',
    p.firma_certificado ? `Firma como ${p.firma_certificado === 'jefe_calidad' ? 'Jefe de calidad' : 'Inspector de calidad'}` : ''].filter(Boolean).join(' · ');
}


// ---------- Notificaciones push de este dispositivo ----------
const QUE_AVISA = 'Te avisamos cuando te toca capturar, cuando un lote está listo para liberar, no cumple o se libera.';
async function pintarPush(box) {
  if (!box) return;
  const est = await push.estado().catch(() => 'no-soportado');
  const prueba = `<button class="btn c-purple" data-n="test">${icon('bell-ring')} Enviar notificación de prueba</button>`;
  const txt = {
    activo: ['on', 'Activadas en este dispositivo', 'Siguen activas aunque cierres sesión.', `${prueba}<button class="btn s-red" data-n="off">${icon('bell-off')} Desactivar en este dispositivo</button>`, `
      <details class="notif-ajustes"><summary>${icon('smartphone')} ¿No suena o no aparece en la pantalla bloqueada?</summary>
        <p><b>Android (Chrome):</b> mantén presionado el aviso de prueba → Configuración, o ve a Ajustes → Aplicaciones → Chrome → Notificaciones → busca este sitio y activa <b>Mostrar en pantalla emergente</b>, <b>Sonido</b> y <b>Pantalla de bloqueo</b>.</p>
        <p><b>iPhone:</b> Ajustes → Notificaciones → Liberación → activa <b>Permitir notificaciones</b>, <b>Pantalla bloqueada</b> y <b>Sonidos</b>.</p>
        <p><b>Windows:</b> Configuración → Sistema → Notificaciones → activa las de Chrome o Edge y revisa que «No molestar» esté apagado.</p>
      </details>`],
    inactivo: ['pend', 'Desactivadas en este dispositivo', 'Actívalas para recibir avisos aunque el sistema esté cerrado.', `<button class="btn c-green" data-n="on">${icon('bell')} Activar notificaciones</button>${prueba}`],
    bloqueado: ['off', 'Bloqueadas', 'Permítelas desde el candado junto a la dirección del sitio.', prueba],
    instalar: ['info', 'Requiere instalar la aplicación', 'En iPhone y iPad las notificaciones solo funcionan con la app instalada: toca Compartir → «Agregar a pantalla de inicio», ábrela desde ese ícono y regresa aquí para activarlas.', prueba],
    'no-soportado': ['off', 'No disponibles', 'Este navegador no las admite; usa Chrome, Edge o Safari.', prueba],
  }[est];
  box.innerHTML = avisosHTML(txt[0], 'celular', txt[1], txt[2], txt[3]) + (txt[4] || '');
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
  const { data } = await sb.from('brom_usuarios').select('recibe_correos, correos_admin').eq('id', p.id).maybeSingle();
  const recibe = data?.recibe_correos !== false;
  const bloqueado = data?.correos_admin === false;
  box.innerHTML = avisosHTML(bloqueado ? 'off' : recibe ? 'on' : 'pend', 'correo', bloqueado ? 'Correos desactivados por un administrador' : recibe ? 'Avisos también por correo' : 'Correos desactivados',
    bloqueado ? 'Los avisos te siguen llegando a la campana y como notificación.' : `Se envían a ${p.email}.`,
    `<button class="btn s-blue" data-mail="vista">${icon('eye')} Vista previa del correo</button>
      <button class="btn c-teal" data-mail="enviar">${icon('send')} Enviarme un correo de prueba</button>`)
    + `<label class="switch-row avisos-switch"><span><b>Recibir los avisos por correo</b></span>
      <input type="checkbox" class="switch" id="pf-correos" ${recibe ? 'checked' : ''} ${data && !bloqueado ? '' : 'disabled'}></label>`;
  refreshIcons();
  box.querySelector('#pf-correos').addEventListener('change', async (e) => {
    const on = e.target.checked;
    const { error } = await sb.rpc('brom_mis_avisos', { p_correos: on });
    if (error) { e.target.checked = !on; toast(errMsg(error), 'error'); return; }
    toast(on ? 'Recibirás los avisos también por correo.' : 'Ya no recibirás los avisos por correo; seguirán en la campana.', 'success');
    pintarCorreo(box);
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
      <div class="pf">
        <section class="pf-id">
          <div class="pf-foto">${avatarHTML(p.nombre, p.foto_url, 'xl')}<span class="pf-verif" role="img" aria-label="Cuenta identificada de Pet's Table" title="Cuenta identificada de Pet's Table">${VERIFICADO}</span></div>
          <span class="pf-rol ${p.rol === 'admin' ? 'admin' : ''}">${icon(p.rol === 'admin' ? 'crown' : 'user-round')} ${esc(roleLabel(p.rol))}</span>
          <h2>${esc(p.nombre)}</h2>
          <p class="pf-puesto">${esc(p.puesto || 'Puesto no registrado')}</p>
          <span class="pf-mail">${icon('mail')} ${esc(p.email)}</span>
          <label class="btn pf-cambiar" for="pf-foto">${icon('camera')} Cambiar fotografía</label>
          <input id="pf-foto" type="file" accept="image/jpeg,image/png,image/webp" class="sr-only">
        </section>
        <div class="pf-info">
          <section class="pf-bloque"><h3 class="pf-sec">${icon('briefcase')} Información laboral</h3>
            <div class="pf-tiles t3">${fila('gafete', 'Puesto', p.puesto || 'Sin puesto registrado')}${fila('personas', 'Área', p.area || 'Sin área registrada')}${fila('correo', 'Correo', p.email || '—', 'pf-mail-t')}</div></section>
          <section class="pf-bloque"><h3 class="pf-sec">${icon('shield-check')} Acceso</h3>
            <div class="pf-tiles t2">${fila('llave', 'Permisos', permisosTxt(p))}${fila('reloj', 'Último acceso', fmtDateTime(user?.last_sign_in_at))}</div></section>
          <section class="pf-sistema"><span class="brand-logo pf-logo" aria-hidden="true"></span>
            <div><small>Liberación de producto</small><b>Calidad de producto <i aria-hidden="true">|</i> <span>Pet's Table</span></b></div>
            <span class="pf-ver"><small>Versión</small><b>${esc(APP_VERSION)}</b></span></section>
        </div>
      </div>
      <section class="pf-bloque mt notif-card">
        <h3 class="pf-sec">${icon('bell-ring')} Notificaciones y correos</h3>
        <p class="pf-nota">${esc(QUE_AVISA)}</p>
        <div class="grid grid-2 pf-avisos">
          <div id="pf-push"><div class="skeleton" style="height:76px"></div></div>
          <div id="pf-correo"><div class="skeleton" style="height:76px"></div></div>
        </div>
      </section>
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
      </div>
      <section class="cr mt" aria-labelledby="cr-t">
        <div class="cr-foto" id="cr-foto">${avatarHTML(AUTOR.nombre, null, 'xl')}</div>
        <div class="cr-cuerpo">
          <span class="cr-eyebrow">${icon('sparkles')} Desarrollado por</span>
          <h3 id="cr-t">${esc(AUTOR.nombre)}</h3>
          <p class="cr-rol">Creador y desarrollador de la plataforma</p>
          <p class="cr-txt">Diseñó, desarrolló e implementó Liberación de producto: el registro de lotes y análisis, la liberación con certificado, los avisos y la experiencia en escritorio y celular.</p>
          <ul class="cr-etapas" aria-label="Participación"><li>Conceptualización</li><li>Diseño</li><li>Desarrollo</li><li>Implementación</li></ul>
        </div>
        <figure class="cr-firma"><span class="cr-firma-img" role="img" aria-label="Firma de ${esc(AUTOR.nombre)}"></span>
          <figcaption><b>${esc(AUTOR.nombre)}</b><small>Autor de la plataforma</small></figcaption></figure>
      </section>`;
    refreshIcons();
    pintarPush(el.querySelector('#pf-push'));
    pintarCorreo(el.querySelector('#pf-correo'));
    // Fotografía del autor: la de su cuenta (directorio de usuarios)
    getDirectorio().then((d) => {
      const a = d.lista.find((u) => String(u.correo || '').toLowerCase() === AUTOR.correo) || d.porNombre('Javier Martínez');
      const caja = el.querySelector('#cr-foto');
      if (a?.foto && caja) caja.innerHTML = avatarHTML(AUTOR.nombre, a.foto, 'xl');
    });

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
        document.querySelectorAll('#top-avatar img, .pf-foto .avatar img').forEach((img) => { img.src = url; });
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
