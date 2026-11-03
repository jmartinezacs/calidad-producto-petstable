// =====================================================================
// Perfil del usuario: datos, fotografía, cambio de contraseña, tema e instalación.
// =====================================================================
import {
  sb, state, esc, icon, refreshIcons, toast, errMsg, checkForm, prefs, fmtDateTime, APP_VERSION, avatarHTML, roleLabel,
  prepararFoto, subirFoto, borrarFotoPropia,
} from '../core.js';

let deferredPrompt = null;
window.addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); deferredPrompt = e; });
const instalada = () => window.matchMedia('(display-mode: standalone), (display-mode: fullscreen)').matches || window.navigator.standalone === true;

const PERMISOS = {
  admin: 'Gestión completa: catálogos, especificaciones, usuarios, captura de todas las áreas, liberación y borrado de lotes',
  analista: 'Registrar lotes y capturar los análisis bromatológicos; editar los lotes que registró',
  calidad: 'Capturar los análisis fisicoquímicos, microbiológicos, sensoriales y bromatológicos; liberar lotes y emitir certificados',
};

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
        <div class="p-tile"><span class="ti">${icon('shield-check')}</span><small>Permisos</small><b>${esc(PERMISOS[p.rol] || '')}</b></div>
        <div class="p-tile"><span class="ti">${icon('clock')}</span><small>Último acceso</small><b>${fmtDateTime(user?.last_sign_in_at)}</b></div>
        <div class="p-tile"><span class="ti">${icon('info')}</span><small>Versión del sistema</small><b>${esc(APP_VERSION)}</b></div>
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
            <button type="submit" class="btn primary">${icon('key-round')} Actualizar contraseña</button>
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
