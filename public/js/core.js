// =====================================================================
// Núcleo compartido: cliente Supabase, estado de sesión y utilidades UI.
// =====================================================================
const cfg = window.BROM_CONFIG || {};
export const TZ = 'America/Mexico_City';
export const APP_VERSION = cfg.APP_VERSION || '1.0.0';

// ---------- Almacenamiento de sesión ("Mantener sesión") ----------
function safe(fn, fallback) { try { return fn(); } catch { return fallback; } }
export const prefs = {
  get: (k) => safe(() => localStorage.getItem(k), null),
  set: (k, v) => safe(() => localStorage.setItem(k, v)),
  del: (k) => safe(() => localStorage.removeItem(k)),
};
const memory = new Map();
function activeStore() {
  const remember = prefs.get('brom.remember') !== '0';
  return safe(() => (remember ? window.localStorage : window.sessionStorage), null);
}
const authStorage = {
  getItem: (k) => safe(() => activeStore()?.getItem(k), null) ?? memory.get(k) ?? null,
  setItem: (k, v) => { if (safe(() => (activeStore()?.setItem(k, v), true), false) !== true) memory.set(k, v); },
  removeItem: (k) => { memory.delete(k); safe(() => localStorage.removeItem(k)); safe(() => sessionStorage.removeItem(k)); },
};

if (!window.supabase || !cfg.SUPABASE_URL || !cfg.SUPABASE_ANON_KEY) {
  throw new Error('Configuración de Supabase no disponible.');
}
export const sb = window.supabase.createClient(cfg.SUPABASE_URL, cfg.SUPABASE_ANON_KEY, {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, storage: authStorage, storageKey: 'brom-auth' },
});

export const state = { session: null, profile: null, isAdmin: false };
// Funciones que un módulo publica para otro sin importarlo (evita dependencias circulares)
export const ganchos = {};

// ---------- Formato y fechas ----------
export const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export function todayISO() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
}
export function nowHHMM() {
  return new Intl.DateTimeFormat('en-GB', { timeZone: TZ, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(new Date());
}
export function addDays(iso, n) {
  const d = new Date(iso + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10);
}
export function isoDow(iso) { const d = new Date(iso + 'T12:00:00Z').getUTCDay(); return d === 0 ? 7 : d; }
export function isWeekday(iso) { const d = isoDow(iso); return d >= 1 && d <= 5; }
export const fmtDate = (iso) => (iso ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}` : '—');
export const fmtTime = (t) => (t ? String(t).slice(0, 5) : '—');
export function fmtDateTime(ts) {
  if (!ts) return '—';
  return new Intl.DateTimeFormat('es-MX', { timeZone: TZ, day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(new Date(ts));
}
export function fmtLongDate(iso) {
  return new Intl.DateTimeFormat('es-MX', { timeZone: 'UTC', weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }).format(new Date(iso + 'T12:00:00Z'));
}
export function monthShort(iso) {
  return new Intl.DateTimeFormat('es-MX', { timeZone: 'UTC', month: 'long' }).format(new Date(iso + 'T12:00:00Z'));
}
export const fmtNum = (n) => new Intl.NumberFormat('es-MX').format(Number(n || 0));

export function initials(name) {
  return String(name || '?').trim().split(/\s+/).slice(0, 2).map((p) => p[0]).join('').toUpperCase();
}
export const pill = (text, cls = 'gray') => `<span class="pill ${cls}">${esc(text)}</span>`;
export const icon = (name, cls = '') => `<i data-lucide="${name}"${cls ? ` class="${cls}"` : ''}></i>`;
export function refreshIcons() { try { window.lucide?.createIcons(); } catch { /* sin íconos */ } }

export function sanitizeSearch(q) { return String(q || '').replace(/[%,()*\\"'`;:]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 60); }
export function debounce(fn, ms = 300) { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; }

// ---------- Catálogos de negocio ----------
export const ROLES = { admin: 'Administrador', analista: 'Analista de laboratorio', calidad: 'Jefatura de calidad' };
export const roleLabel = (r) => ROLES[r] || r || '—';
// Dictamen: true cumple, false no cumple, null pendiente (lo calculan los triggers de la base)
export function dictamenPill(v) {
  if (v === true) return `<span class="pill ok">${icon('check')} Cumple</span>`;
  if (v === false) return `<span class="pill bad">${icon('x')} No cumple</span>`;
  return `<span class="pill warn">${icon('hourglass')} Pendiente</span>`;
}
export const TIPOS_RESULTADO = { numerico: 'Cuantitativo', positivo_negativo: 'Cualitativo (positivo o negativo)', verificacion: 'Verificación (cumple o no cumple)', texto: 'Texto' };
export const tipoLabel = (t) => TIPOS_RESULTADO[t] || 'Cuantitativo';
export const PARAMETROS = { ninguno: 'Sin parámetro', minimo: 'Mínimo', maximo: 'Máximo', exacto: 'Valor exacto', rango: 'Rango' };
// Especificación por receta (brom_especificaciones_receta.tipo_limite) → parámetro del método
const LIMITE_A_PARAM = { min: 'minimo', max: 'maximo', exacto: 'exacto', rango: 'rango', na: 'ninguno' };
export const PARAM_A_LIMITE = { minimo: 'min', maximo: 'max', exacto: 'exacto', rango: 'rango', ninguno: 'na' };
// Criterio aplicable: la especificación de la receta tiene prioridad sobre la del método
// (misma regla que brom_evaluar_resultado)
export function criterio(metodo, spec) {
  const m = { ...(metodo || {}) };
  if (spec && spec.aplica !== false) {
    m.parametro_referencia = LIMITE_A_PARAM[spec.tipo_limite] || 'ninguno';
    m.valor_referencia = spec.valor_referencia ?? m.valor_referencia;
    m.valor_referencia_max = spec.valor_referencia_max ?? m.valor_referencia_max;
    m.valor_referencia_texto = spec.valor_referencia_texto ?? m.valor_referencia_texto;
    m.particular = true;
  }
  return m;
}
export const fmtValor = (v, max = 4) => (v === null || v === undefined || v === '' ? '—' : new Intl.NumberFormat('es-MX', { maximumFractionDigits: max }).format(Number(v)));
export function refLabel(m) {
  const p = String(m?.parametro_referencia || 'ninguno').toLowerCase();
  const u = m?.unidades ? ` ${m.unidades}` : '';
  if (m?.tipo_resultado === 'verificacion') return 'Debe cumplir el criterio de calidad';
  if (m?.tipo_resultado && m.tipo_resultado !== 'numerico') {
    return p === 'exacto' && m.valor_referencia_texto ? `Esperado: ${m.valor_referencia_texto}` : 'Sin criterio de cumplimiento';
  }
  if (p === 'minimo') return `Mínimo ${fmtValor(m.valor_referencia)}${u}`;
  if (p === 'maximo') return `Máximo ${fmtValor(m.valor_referencia)}${u}`;
  if (p === 'exacto') return `Exacto ${fmtValor(m.valor_referencia)}${u}`;
  if (p === 'rango') return `De ${fmtValor(m.valor_referencia)} a ${fmtValor(m.valor_referencia_max)}${u}`;
  return 'Sin criterio de cumplimiento';
}
export const resultadoTxt = (r, m) => (r?.resultado_texto ?? (r?.resultado !== null && r?.resultado !== undefined ? `${fmtValor(r.resultado)}${m?.unidades ? ` ${m.unidades}` : ''}` : '—'));
// Fecha del lote (YYYY-MM-DD) en hora de Ciudad de México a partir de fecha_analisis
export function fechaLote(ts) {
  if (!ts) return '';
  return new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(ts));
}
// Mes completo con año: «Julio de 2026» (nunca abreviado)
export function mesLargo(ym) {
  const s = new Intl.DateTimeFormat('es-MX', { timeZone: 'UTC', month: 'long', year: 'numeric' }).format(new Date(`${ym.slice(0, 7)}-15T12:00:00Z`));
  return s.charAt(0).toUpperCase() + s.slice(1);
}
// Número de lote a partir de la fecha: DDMMYY (27/09/2026 → 270926)
export const loteDesdeFecha = (iso) => (iso ? `${iso.slice(8, 10)}${iso.slice(5, 7)}${iso.slice(2, 4)}` : '');
export const UNIDADES = ['%', 'g', 'kg', 'mg', 'µg', 'ng', 'mg/kg', 'g/kg', 'g/100g', 'mg/100g', 'mL/100g', 'mg/L', 'g/L', 'µg/L', 'µg/mL', 'ng/mL',
  'mol', 'mmol', 'mol/L', 'mmol/L', 'meq/L', 'mL', 'L', 'µL', 'ppm', 'ppb', 'mg/m³', 'UFC/g', 'UFC/mL', 'UFC/cm²', 'pH', 'AW', '°Brix',
  '°C', '°F', 'kcal', 'kJ', 'kcal/100g', 'kJ/100g', 'mS/cm', 'µS/cm', 'NTU', 'Pa', 'kPa', 'bar', 'mmHg', 'rpm', 's', 'min', 'h', 'µm', 'mm', 'cm'];
export const ESPECIES = ['Canino', 'Felino'];

// Catálogos (áreas, recetas, métodos y especificaciones) en caché de sesión
let catP = null;
export function getCatalogos({ force = false } = {}) {
  if (!catP || force) {
    catP = Promise.all([
      sb.from('brom_areas_analisis').select('id, nombre, descripcion, color, orden, roles_captura, activa').order('orden'),
      sb.from('brom_recetas').select('id, codigo, nombre_receta, activa, especie, color').order('codigo'),
      sb.from('brom_catalogo_metodos').select('id, metodo, referencia_normativa, unidades, activo, tipo_resultado, parametro_referencia, valor_referencia, valor_referencia_max, valor_referencia_texto, area, orden').order('orden').order('metodo'),
      sb.from('brom_especificaciones_receta').select('id, receta_id, metodo_id, tipo_limite, valor_referencia, valor_referencia_max, valor_referencia_texto, aplica'),
    ]).then((rs) => {
      rs.forEach((r) => { if (r.error) throw r.error; });
      const [areas, recetas, metodos0, specs] = rs.map((r) => r.data || []);
      const ordenArea = new Map(areas.map((a) => [a.id, a.orden]));
      const metodos = [...metodos0].sort((a, b) => (ordenArea.get(a.area) ?? 99) - (ordenArea.get(b.area) ?? 99) || a.orden - b.orden || a.metodo.localeCompare(b.metodo, 'es'));
      const specMap = new Map(specs.map((s) => [`${s.receta_id}|${s.metodo_id}`, s]));
      const spec = (recetaId, metodoId) => specMap.get(`${recetaId}|${metodoId}`) || null;
      const area = (id) => areas.find((a) => a.id === id) || { id, nombre: 'Sin área', color: '#64748B', roles_captura: [], orden: 99 };
      // Métodos que se exigen para liberar un lote de la receta (misma regla que brom_metodos_requeridos)
      const requeridos = (recetaId) => metodos.filter((m) => m.activo && area(m.area).activa !== false && spec(recetaId, m.id)?.aplica !== false);
      return { areas, recetas, metodos, specs, spec, area, requeridos };
    }).catch((e) => { catP = null; throw e; });
  }
  return catP;
}
export function invalidarCatalogos() { catP = null; }
export const puedeCapturar = (area) => state.isAdmin || (area?.roles_captura || []).includes(state.profile?.rol);
export const puedeLiberar = () => ['admin', 'calidad'].includes(state.profile?.rol);
export const recetaTxt = (r) => (r ? `${r.codigo} · ${r.nombre_receta}${r.especie ? ` (${r.especie})` : ''}` : 'Receta no disponible');

// Estado de liberación de un lote:
// liberado (con folio) · no_conforme (algún resultado no cumple) · listo (todos los análisis
// requeridos cumplen) · en_proceso (faltan análisis por capturar o evaluar)
export const ESTADOS_LOTE = {
  liberado: { label: 'Liberado', cls: 'ok', ico: 'badge-check', color: '#16A34A' },
  listo: { label: 'Listo para liberar', cls: 'info', ico: 'shield-check', color: '#1BC7C7' },
  en_proceso: { label: 'En proceso', cls: 'warn', ico: 'hourglass', color: '#F59E0B' },
  no_conforme: { label: 'No conforme', cls: 'bad', ico: 'triangle-alert', color: '#E0464E' },
};
export function estadoLote(lote, resultados, cat) {
  const req = cat.requeridos(lote.receta_id);
  const porMetodo = new Map((resultados || []).map((r) => [r.metodo_id, r]));
  const faltan = req.filter((m) => porMetodo.get(m.id)?.cumple == null);
  const fallan = (resultados || []).filter((r) => r.cumple === false);
  const porArea = cat.areas.filter((a) => a.activa !== false).map((a) => {
    const ms = req.filter((m) => m.area === a.id);
    const rs = ms.map((m) => porMetodo.get(m.id));
    return {
      area: a, total: ms.length,
      cumple: rs.filter((r) => r?.cumple === true).length,
      noCumple: (resultados || []).filter((r) => r.cumple === false && cat.metodos.find((m) => m.id === r.metodo_id)?.area === a.id).length,
      pendientes: rs.filter((r) => r?.cumple == null).length,
    };
  }).filter((x) => x.total > 0 || x.noCumple > 0);
  const estado = lote.liberado_en ? 'liberado' : fallan.length ? 'no_conforme' : faltan.length ? 'en_proceso' : 'listo';
  return { estado, faltan, fallan, porArea, requeridos: req.length, completos: req.length - faltan.length };
}
export const estadoPill = (e, extra = '') => { const x = ESTADOS_LOTE[e] || ESTADOS_LOTE.en_proceso; return `<span class="pill ${x.cls}">${icon(x.ico)} ${esc(x.label)}${extra}</span>`; };

// Todos los resultados con su lote (base de Panel y Resultados)
export async function getResultados() {
  return fetchAll(() => sb.from('brom_resultados_analisis')
    .select('id, muestra_id, metodo_id, resultado, resultado_texto, cumple, analista_texto, created_at, brom_muestras!inner(id, lote, fecha_analisis, receta_id, dictamen_global, liberado_en)')
    .order('created_at', { ascending: true }).order('id'));
}

// ---------- Errores ----------
const CONSTRAINT_MSG = {
  brom_recetas_codigo_key: 'Ya existe una receta con ese código.',
  brom_catalogo_metodos_metodo_key: 'Ya existe un método con ese nombre.',
  brom_recetas_nombre_especie_key: 'Ya existe una receta con ese nombre para la misma especie.',
  brom_areas_analisis_nombre_key: 'Ya existe un área con ese nombre.',
  brom_areas_analisis_pkey: 'Ya existe un área con esa clave.',
  brom_catalogo_metodos_rango_check: 'En un rango, el valor mínimo debe ser menor o igual al máximo.',
  brom_especificaciones_valores_check: 'Revisa los valores de la especificación: el rango requiere mínimo y máximo, y los demás límites un solo valor.',
  brom_especificaciones_receta_unique: 'Esa receta ya tiene una especificación para el método.',
  brom_resultados_muestra_metodo_unique: 'El lote ya tiene un resultado para ese método.',
  brom_resultados_analisis_metodo_id_fkey: 'El método tiene resultados registrados; desactívalo en lugar de eliminarlo.',
  brom_usuarios_rol_check: 'El rol debe ser Administrador, Analista o Calidad.',
};
export function errMsg(err) {
  if (!err) return 'Ocurrió un error inesperado.';
  const msg = err.message || String(err);
  for (const [k, v] of Object.entries(CONSTRAINT_MSG)) if (msg.includes(k) || err.details?.includes?.(k)) return v;
  if (err.code === '23505') return 'El registro ya existe (dato duplicado).';
  if (err.code === '23503') return 'No se puede eliminar porque tiene registros relacionados. Puede desactivarlo en su lugar.';
  if (err.code === '23514') return 'Algún dato no cumple las reglas de validación.';
  if (err.code === '42501') return msg.includes('permission denied') || msg.includes('row-level security') ? 'No tiene permiso para realizar esta acción.' : msg;
  if (err.code === 'P0001') return msg;
  if (/row-level security|permission denied|Unauthorized/i.test(msg)) return 'No tiene permiso para realizar esta acción.';
  if (/exceeded the maximum allowed size|Payload too large/i.test(msg)) return 'El archivo es demasiado grande.';
  if (err.code === 'PGRST301' || /JWT expired|invalid JWT/i.test(msg)) return 'Su sesión expiró. Vuelva a iniciar sesión.';
  if (/Failed to fetch|NetworkError|Load failed|network/i.test(msg)) return 'No hay conexión con el servidor. Verifique su red e intente de nuevo.';
  return msg;
}
// Lanza el error de una respuesta de Supabase
export function must(res) { if (res.error) throw res.error; return res; }

// ---------- Toasts ----------
export function toast(message, type = 'info', ms = 4200) {
  const root = document.getElementById('toasts');
  const el = document.createElement('div');
  const ic = { success: 'check-circle-2', error: 'alert-octagon', warning: 'alert-triangle', info: 'info' }[type] || 'info';
  el.className = `toast ${type}`;
  el.setAttribute('role', type === 'error' ? 'alert' : 'status');
  el.innerHTML = `${icon(ic)}<div class="t-body">${esc(message)}</div><button type="button" aria-label="Cerrar">${icon('x')}</button>`;
  el.querySelector('button').addEventListener('click', () => el.remove());
  root.appendChild(el); refreshIcons();
  setTimeout(() => el.remove(), type === 'error' ? Math.max(ms, 7000) : ms);
}

// ---------- Modales ----------
let modalDepth = 0;
export function openModal({ title, subtitle = '', body = '', submitText = 'Guardar', onSubmit = null, size = '', danger = false, onOpen = null, confirmDiscard = true }) {
  return new Promise((resolve) => {
    const root = document.getElementById('modal-root');
    const wrap = document.createElement('div');
    wrap.className = 'modal';
    wrap.innerHTML = `
      <form class="modal-box ${size}" role="dialog" aria-modal="true" aria-labelledby="mt-${modalDepth}" novalidate>
        <header class="modal-head">
          <div><h3 id="mt-${modalDepth}">${esc(title)}</h3>${subtitle ? `<p>${esc(subtitle)}</p>` : ''}</div>
          <button type="button" class="icon-btn" data-close aria-label="Cerrar">${icon('x')}</button>
        </header>
        <div class="modal-body">${body}</div>
        <footer class="modal-foot">
          ${onSubmit
            ? `<div class="form-error" role="alert"></div>
               <button type="button" class="btn secondary" data-close>Cancelar</button>
               <button type="submit" class="btn ${danger ? 'danger' : 'primary'}" data-submit>${esc(submitText)}</button>`
            : `<button type="button" class="btn secondary" data-close>Cerrar</button>`}
        </footer>
      </form>`;
    modalDepth++;
    root.appendChild(wrap);
    document.body.classList.add('modal-open');
    const form = wrap.querySelector('form');
    const errBox = wrap.querySelector('.form-error');
    let dirty = false, busy = false, result;
    form.addEventListener('input', () => { dirty = true; });

    const finish = () => {
      wrap.remove(); modalDepth--;
      document.removeEventListener('keydown', onKey);
      if (!root.children.length) document.body.classList.remove('modal-open');
      resolve(result);
    };
    const close = async (force = false) => {
      if (busy) return;
      if (!force && dirty && onSubmit && confirmDiscard) {
        const ok = await confirmDialog({ title: '¿Descartar cambios?', message: 'Hay información capturada que no se ha guardado.', confirmText: 'Descartar', danger: true });
        if (!ok) return;
      }
      finish();
    };
    const onKey = (e) => { if (e.key === 'Escape' && root.lastElementChild === wrap) { e.preventDefault(); close(); } };
    document.addEventListener('keydown', onKey);
    wrap.addEventListener('click', (e) => { if (e.target.closest('[data-close]')) close(); });

    const ctx = {
      form, wrap,
      setError: (m) => { if (errBox) errBox.textContent = m || ''; },
      close: (value) => { result = value; finish(); },
    };
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      if (!onSubmit || busy) return;
      ctx.setError('');
      const btn = form.querySelector('[data-submit]');
      busy = true; btn.disabled = true;
      const label = btn.innerHTML; btn.innerHTML = `<span class="spinner sm"></span> Guardando…`;
      try {
        const r = await onSubmit(ctx);
        if (r !== false) { result = r === undefined ? true : r; busy = false; finish(); return; }
      } catch (err) {
        console.error(err);
        ctx.setError(errMsg(err));
      }
      busy = false; btn.disabled = false; btn.innerHTML = label; refreshIcons();
    });
    refreshIcons();
    onOpen?.(ctx);
    setTimeout(() => form.querySelector('input:not([type=hidden]):not([disabled]), select, textarea')?.focus({ preventScroll: true }), 30);
  });
}

// Confirmación (opcionalmente con texto obligatorio, p. ej. motivo de cancelación)
export function confirmDialog({ title, message = '', confirmText = 'Confirmar', danger = false, input = null }) {
  const body = `<p style="margin:0 0 6px">${esc(message)}</p>
    ${input ? `<div class="field"><label for="cd-input">${esc(input.label)} ${input.required ? '<span class="req">*</span>' : ''}</label>
      <textarea id="cd-input" name="value" maxlength="${input.maxlength || 300}" ${input.required ? 'required' : ''} placeholder="${esc(input.placeholder || '')}"></textarea></div>` : ''}`;
  return openModal({
    title, body, submitText: confirmText, danger, size: 'sm', confirmDiscard: false,
    onSubmit: ({ form }) => {
      if (input) {
        if (!checkForm(form)) return false;
        return { value: form.elements.value.value.trim() };
      }
      return true;
    },
  }).then((r) => r || false);
}

// ---------- Validación de formularios ----------
function validityMessage(el) {
  const v = el.validity;
  if (v.valueMissing) return 'Campo obligatorio.';
  if (v.typeMismatch) return el.type === 'email' ? 'Correo electrónico inválido.' : 'Formato inválido.';
  if (v.patternMismatch) return el.dataset.patternMsg || 'Formato inválido.';
  if (v.tooShort) return `Mínimo ${el.minLength} caracteres.`;
  if (v.tooLong) return `Máximo ${el.maxLength} caracteres.`;
  if (v.rangeUnderflow) return `El valor mínimo es ${el.min}.`;
  if (v.rangeOverflow) return `El valor máximo es ${el.max}.`;
  if (v.stepMismatch) return 'Use un número entero.';
  if (v.badInput) return 'Valor inválido.';
  return 'Valor inválido.';
}
export function fieldError(el, msg) {
  const field = el.closest('.field') || el.parentElement;
  field.classList.add('invalid');
  const s = document.createElement('small'); s.className = 'field-error'; s.textContent = msg;
  field.appendChild(s);
}
export function clearErrors(form) {
  form.querySelectorAll('.field-error').forEach((e) => e.remove());
  form.querySelectorAll('.invalid').forEach((e) => e.classList.remove('invalid'));
}
export function checkForm(form, custom = {}) {
  clearErrors(form);
  let first = null;
  for (const el of form.elements) {
    if (!el.name || el.disabled || el.type === 'button' || el.type === 'submit') continue;
    let msg = '';
    if (el.required && typeof el.value === 'string' && el.type !== 'radio' && !el.value.trim()) msg = 'Campo obligatorio.';
    else if (el.willValidate && !el.checkValidity()) msg = validityMessage(el);
    if (!msg && custom[el.name]) msg = custom[el.name](el.value, form) || '';
    if (msg && !el.closest('.field')?.classList.contains('invalid')) { fieldError(el, msg); first ??= el; }
  }
  if (first) (first._cs?.btn || first).focus();
  return !first;
}
export function formValues(form) {
  const o = {};
  for (const [k, v] of new FormData(form).entries()) o[k] = typeof v === 'string' ? v.trim() : v;
  return o;
}
export const nullIfEmpty = (v) => (v === '' || v === undefined ? null : v);

// Contadores de caracteres en textareas con data-counter
export function bindCounters(root) {
  root.querySelectorAll('textarea[maxlength][data-counter]').forEach((ta) => {
    const lab = root.querySelector(`label[for="${ta.id}"]`);
    if (!lab) return;
    const c = document.createElement('span'); c.className = 'counter'; lab.appendChild(c);
    const upd = () => { c.textContent = `${ta.value.length}/${ta.maxLength}`; };
    ta.addEventListener('input', upd); upd();
  });
}

// ---------- Estados vacíos ----------
export function emptyState({ ico = 'inbox', title, text = '', action = '' }) {
  return `<div class="empty"><div class="empty-ico">${icon(ico)}</div><b>${esc(title)}</b>${text ? `<p>${esc(text)}</p>` : ''}${action}</div>`;
}
export function errorState(err, retryAction = 'retry') {
  return `<div class="empty error"><div class="empty-ico">${icon('wifi-off')}</div><b>No se pudo cargar la información</b><p>${esc(errMsg(err))}</p>
    <button class="btn secondary" data-action="${retryAction}">${icon('refresh-cw')} Reintentar</button></div>`;
}


// ---------- Gráficas ----------
const charts = new Set();
const chartConfigs = new WeakMap();
export function cssVar(name) { return getComputedStyle(document.documentElement).getPropertyValue(name).trim(); }
// Colores distintos para cada barra o segmento (no se repiten mientras alcancen)
export const PALETTE = ['#F58020', '#1BC7C7', '#7C3AED', '#16A34A', '#DB2777', '#2563EB', '#CA8A04', '#0891B2', '#DC2626', '#65A30D',
  '#9333EA', '#0D9488', '#E8890C', '#4F46E5', '#BE185D', '#475569'];
export const colorN = (i) => PALETTE[i % PALETTE.length];
// Etiqueta de datos: el valor centrado dentro de cada barra o segmento de pastel
// (se dibuja en el canvas, así que también aparece al copiar la gráfica)
const etiquetasDatos = {
  id: 'bromEtiquetas',
  afterDatasetsDraw(chart) {
    const tipo = chart.config.type;
    if (!['bar', 'doughnut', 'pie'].includes(tipo)) return;
    const { ctx } = chart;
    const horiz = chart.options.indexAxis === 'y';
    ctx.save();
    ctx.font = `800 ${chart.canvas.dataset.zoom ? 15 : 11}px Inter, Segoe UI, system-ui, sans-serif`;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    chart.data.datasets.forEach((ds, di) => {
      const meta = chart.getDatasetMeta(di);
      if (meta.hidden || meta.type === 'line') return;
      meta.data.forEach((el, i) => {
        const v = Number(ds.data[i]);
        if (!v || el.hidden) return;
        // _porcentaje: el segmento muestra su proporción del total (gráficas de pastel)
        const total = ds._porcentaje ? ds.data.reduce((s, n) => s + Number(n || 0), 0) : 0;
        const label = ds._porcentaje ? `${new Intl.NumberFormat('es-MX', { maximumFractionDigits: 1 }).format((v / total) * 100)} %`
          : `${new Intl.NumberFormat('es-MX', { maximumFractionDigits: 1 }).format(v)}${ds._sufijo || ''}`;
        let x, y, dentro = true;
        if (tipo === 'bar') {
          const p = el.getProps(['x', 'y', 'base'], true);
          const largo = horiz ? Math.abs(p.x - p.base) : Math.abs(p.base - p.y);
          const ancho = ctx.measureText(label).width + 6;
          dentro = largo >= (horiz ? ancho : 16);
          if (dentro) { x = horiz ? (p.x + p.base) / 2 : p.x; y = horiz ? p.y : (p.y + p.base) / 2; }
          else { x = horiz ? p.x + ancho / 2 + 2 : p.x; y = horiz ? p.y : p.y - 9; }
        } else {
          if (el.circumference < 0.12) return;
          ({ x, y } = el.tooltipPosition(true));
        }
        if (dentro) {
          ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(9, 13, 18, .45)'; ctx.lineJoin = 'round';
          ctx.strokeText(label, x, y);
          ctx.fillStyle = '#FFFFFF';
        } else ctx.fillStyle = cssVar('--text') || '#172431';
        ctx.fillText(label, x, y);
      });
    });
    ctx.restore();
  },
};
export function makeChart(canvas, config) {
  if (!window.Chart || !canvas) return null;
  const muted = cssVar('--muted') || '#687B8C', line = cssVar('--line') || '#E3EAEF', text = cssVar('--text') || '#172431';
  window.Chart.defaults.font.family = 'Inter, Segoe UI, system-ui, sans-serif';
  window.Chart.defaults.color = muted;
  const c = new window.Chart(canvas, {
    ...config,
    plugins: [...(config.plugins || []), etiquetasDatos],
    options: {
      responsive: true, maintainAspectRatio: false, animation: { duration: 350 },
      ...(config.options?.interaction ? { interaction: config.options.interaction } : {}),
      ...(config.options?.layout ? { layout: config.options.layout } : {}),
      plugins: {
        legend: { labels: { color: text, boxWidth: 12, boxHeight: 12, usePointStyle: true }, ...(config.options?.plugins?.legend || {}) },
        tooltip: { backgroundColor: '#102536', padding: 10, cornerRadius: 10, ...(config.options?.plugins?.tooltip || {}) },
      },
      scales: ['doughnut', 'pie'].includes(config.type) ? {} : {
        x: { grid: { color: line, drawTicks: false }, ticks: { color: muted, precision: 0 }, border: { display: false }, ...(config.options?.scales?.x || {}) },
        y: { grid: { color: line, drawTicks: false }, ticks: { color: muted, precision: 0 }, border: { display: false }, beginAtZero: true, ...(config.options?.scales?.y || {}) },
      },
      ...(config.options?.indexAxis ? { indexAxis: config.options.indexAxis } : {}),
      ...(config.type === 'doughnut' ? { cutout: '64%' } : {}),
    },
  });
  charts.add(c);
  chartConfigs.set(c, config);
  // El recuadro de información se oculta al salir de la gráfica (no se queda fijo)
  const ocultar = () => { try { c.setActiveElements([]); c.tooltip?.setActiveElements([], { x: 0, y: 0 }); c.update('none'); } catch { /* gráfica destruida */ } };
  canvas.addEventListener('mouseleave', ocultar);
  canvas.addEventListener('pointerleave', ocultar);
  canvas.addEventListener('blur', ocultar);
  return c;
}
// Cambio de tema inmediato: re-colorea las gráficas sin volver a consultar datos
export function restyleCharts() {
  const muted = cssVar('--muted'), line = cssVar('--line'), text = cssVar('--text');
  charts.forEach((c) => {
    try {
      const o = c.options;
      if (o.plugins?.legend?.labels) o.plugins.legend.labels.color = text;
      for (const s of Object.values(o.scales || {})) {
        if (s.ticks) s.ticks.color = muted;
        if (s.grid) s.grid.color = line;
      }
      c.update('none');
    } catch { /* gráfica ya destruida */ }
  });
}
export function destroyCharts() { charts.forEach((c) => { try { c.destroy(); } catch { /* ya destruida */ } }); charts.clear(); }

// ---------- Gráfica ampliada ----------
// Al tocar o hacer clic en una gráfica se abre sola, en grande, sobre un fondo
// limpio (útil para tomar captura) y con la opción de guardarla como imagen.
let zoomAbierto = null;
export function ampliarGrafica(canvas) {
  const orig = window.Chart?.getChart(canvas);
  const config = orig && chartConfigs.get(orig);
  if (!config || zoomAbierto) return;
  const card = canvas.closest('.card');
  const titulo = card?.querySelector('.card-head h3')?.textContent.trim() || canvas.getAttribute('aria-label') || 'Gráfica';
  const sub = card?.querySelector('.card-head p')?.textContent.trim() || '';
  const total = card?.querySelector('.card-head .total-badge')?.textContent.trim() || '';
  const ov = document.createElement('div');
  ov.className = 'chart-zoom';
  ov.setAttribute('role', 'dialog');
  ov.setAttribute('aria-modal', 'true');
  ov.setAttribute('aria-label', titulo);
  ov.innerHTML = `
    <div class="cz-card">
      <div class="cz-head">
        <div class="cz-tit"><h2>${esc(titulo)}</h2>${sub ? `<p>${esc(sub)}</p>` : ''}${total ? `<span class="total-badge">${esc(total)}</span>` : ''}</div>
        <div class="cz-acts">
          <button type="button" class="btn secondary" data-cz="png">${icon('image-down')} <span>Guardar imagen</span></button>
          <button type="button" class="icon-btn" data-cz="cerrar" aria-label="Cerrar" title="Cerrar (Esc)">${icon('x')}</button>
        </div>
      </div>
      <div class="cz-body"><canvas data-zoom="1" role="img" aria-label="${esc(titulo)}"></canvas></div>
      <div class="cz-pie"><span>Liberación de producto · Pet's Table</span><span class="cz-girar">${icon('smartphone')} Gira el teléfono para verla más grande</span></div>
    </div>`;
  document.body.appendChild(ov);
  document.body.classList.add('modal-open');
  refreshIcons();
  const cfg = { ...config, data: JSON.parse(JSON.stringify(config.data)) };
  cfg.data.datasets?.forEach((d) => { if (d.maxBarThickness) d.maxBarThickness = Math.round(d.maxBarThickness * 1.8); });
  const zc = makeChart(ov.querySelector('canvas'), cfg);
  charts.delete(zc);
  // Letras más grandes en la vista ampliada
  try {
    for (const s of Object.values(zc.options.scales || {})) if (s.ticks) s.ticks.font = { size: 14, weight: '600' };
    if (zc.options.plugins?.legend?.labels) zc.options.plugins.legend.labels.font = { size: 14 };
    zc.update('none');
  } catch { /* opciones no disponibles */ }
  const cerrar = () => {
    document.removeEventListener('keydown', onKey);
    try { zc.destroy(); } catch { /* ya destruida */ }
    ov.remove();
    if (!document.querySelector('.modal')) document.body.classList.remove('modal-open');
    zoomAbierto = null;
    canvas.focus?.();
  };
  const onKey = (e) => { if (e.key === 'Escape') cerrar(); };
  document.addEventListener('keydown', onKey);
  ov.addEventListener('click', (e) => {
    if (e.target === ov || e.target.closest('[data-cz="cerrar"]')) cerrar();
    else if (e.target.closest('[data-cz="png"]')) guardarGrafica(zc, titulo, [sub, total].filter(Boolean).join(' · '));
  });
  zoomAbierto = cerrar;
  ov.querySelector('[data-cz="cerrar"]').focus();
}
export function cerrarGraficaAmpliada() { zoomAbierto?.(); }
window.addEventListener('hashchange', () => zoomAbierto?.());

// Imagen PNG con título, subtítulo y la gráfica sobre fondo sólido
async function guardarGrafica(chart, titulo, sub) {
  const src = chart.canvas, esc2 = 2;
  const w = src.width, h = src.height, pad = 24 * esc2, top = (sub ? 78 : 56) * esc2;
  const c = document.createElement('canvas');
  c.width = w + pad * 2; c.height = h + top + pad;
  const ctx = c.getContext('2d');
  ctx.fillStyle = cssVar('--card') || '#FFFFFF';
  ctx.fillRect(0, 0, c.width, c.height);
  ctx.fillStyle = cssVar('--text') || '#172431';
  ctx.font = `800 ${22 * esc2}px Inter, Segoe UI, system-ui, sans-serif`;
  ctx.textBaseline = 'top';
  ctx.fillText(titulo, pad, pad);
  if (sub) {
    ctx.fillStyle = cssVar('--muted') || '#687B8C';
    ctx.font = `500 ${14 * esc2}px Inter, Segoe UI, system-ui, sans-serif`;
    ctx.fillText(sub, pad, pad + 32 * esc2);
  }
  ctx.drawImage(src, pad, top);
  const nombre = `${titulo.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '').toLowerCase() || 'grafica'}.png`;
  const blob = await new Promise((r) => c.toBlob(r, 'image/png'));
  if (!blob) { toast('No se pudo generar la imagen.', 'error'); return; }
  const file = new File([blob], nombre, { type: 'image/png' });
  // En celulares: compartir / guardar en fotos; en computadora: descarga directa
  if (matchMedia('(pointer: coarse)').matches && navigator.canShare?.({ files: [file] })) {
    try { await navigator.share({ files: [file], title: titulo }); return; } catch (err) { if (err?.name === 'AbortError') return; }
  }
  const url = URL.createObjectURL(blob);
  const a = Object.assign(document.createElement('a'), { href: url, download: nombre });
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
  toast('Imagen de la gráfica guardada.', 'success');
}
document.addEventListener('click', (e) => {
  const box = e.target.closest('.chart-box');
  const cv = box?.querySelector('canvas');
  if (cv && !e.target.closest('.chart-zoom')) ampliarGrafica(cv);
});
// En pantallas táctiles, tocar fuera de una gráfica oculta su recuadro de información
document.addEventListener('pointerdown', (e) => {
  if (e.target.closest?.('canvas')) return;
  charts.forEach((c) => { try { if (c.tooltip?.getActiveElements?.().length) { c.setActiveElements([]); c.tooltip.setActiveElements([], { x: 0, y: 0 }); c.update('none'); } } catch { /* destruida */ } });
}, true);
document.addEventListener('keydown', (e) => {
  if ((e.key === 'Enter' || e.key === ' ') && e.target.matches?.('.chart-box')) { e.preventDefault(); const cv = e.target.querySelector('canvas'); if (cv) ampliarGrafica(cv); }
});


// ---------- Exportación de archivos ----------
// Lee todas las filas de una consulta en páginas de 1,000 (límite del servidor)
export async function fetchAll(build, max = 50000) {
  const out = [];
  for (let from = 0; from < max; from += 1000) {
    const { data, error } = await build().range(from, from + 999);
    if (error) throw error;
    out.push(...data);
    if (data.length < 1000) break;
  }
  return out;
}
// CSV compatible con Excel (UTF-8 con BOM, separado por comas)
export function toCSV(rows, cols) {
  const cell = (v) => {
    if (v === null || v === undefined) return '';
    if (typeof v === 'number') return String(v);
    // Evita que Excel interprete texto como fórmula
    const s = /^[=+\-@\t\r]/.test(String(v)) ? `'${v}` : String(v);
    return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return '﻿' + [cols.map((c) => cell(c.label)).join(','), ...rows.map((r) => cols.map((c) => cell(c.get(r))).join(','))].join('\r\n');
}
export function descargar(nombre, contenido, tipo = 'text/csv;charset=utf-8') {
  const url = URL.createObjectURL(new Blob([contenido], { type: tipo }));
  const a = Object.assign(document.createElement('a'), { href: url, download: nombre });
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

// ---------- Fotos de usuario ----------
// Avatar con foto (si existe) y respaldo de iniciales cuando la imagen no carga
export function avatarHTML(nombre, fotoUrl, cls = '') {
  const ini = esc(initials(nombre));
  if (fotoUrl && /^https:\/\//.test(fotoUrl)) {
    return `<span class="avatar has-img ${cls}" data-ini="${ini}"><img src="${esc(fotoUrl)}" alt="" loading="lazy" referrerpolicy="no-referrer"></span>`;
  }
  return `<span class="avatar ${cls}">${ini}</span>`;
}
document.addEventListener('error', (e) => {
  const img = e.target;
  if (img?.tagName === 'IMG' && img.parentElement?.classList.contains('avatar')) {
    const span = img.parentElement; span.classList.remove('has-img'); span.textContent = span.dataset.ini || '?';
  }
}, true);

export const FOTO_MAX_MB = 5;
// Recorta al centro, reduce a 320×320 y convierte a JPEG antes de subir (fotos ligeras)
export async function prepararFoto(file) {
  if (!/^image\/(jpeg|png|webp)$/.test(file.type)) throw new Error('La foto debe ser JPG, PNG o WEBP.');
  if (file.size > FOTO_MAX_MB * 1024 * 1024) throw new Error(`La foto no debe superar ${FOTO_MAX_MB} MB.`);
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = () => rej(new Error('No se pudo leer la imagen.')); i.src = url; });
    const s = Math.min(img.naturalWidth, img.naturalHeight), size = 320;
    const c = document.createElement('canvas'); c.width = size; c.height = size;
    const ctx = c.getContext('2d'); ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, size, size);
    ctx.drawImage(img, (img.naturalWidth - s) / 2, (img.naturalHeight - s) / 2, s, s, 0, 0, size, size);
    return await new Promise((res, rej) => c.toBlob((b) => (b ? res(b) : rej(new Error('No se pudo procesar la imagen.'))), 'image/jpeg', 0.86));
  } finally { URL.revokeObjectURL(url); }
}
// Cada foto va en la carpeta del usuario dueño: avatares_brom/<uid>/<aleatorio>.jpg
export async function subirFoto(blob, uid = state.session?.user?.id) {
  const path = `${uid}/${crypto.randomUUID ? crypto.randomUUID() : Date.now() + '-' + Math.random().toString(36).slice(2)}.jpg`;
  const { error } = await sb.storage.from('avatares_brom').upload(path, blob, { contentType: 'image/jpeg', upsert: false, cacheControl: '31536000' });
  if (error) throw /bucket not found/i.test(error.message) ? new Error('El almacenamiento de fotos todavía no está habilitado. Solicítalo al administrador del sistema.') : error;
  return sb.storage.from('avatares_brom').getPublicUrl(path).data.publicUrl;
}
// Borra una foto anterior solo si pertenece al bucket propio (nunca toca "avatares")
export async function borrarFotoPropia(url) {
  const m = /\/storage\/v1\/object\/public\/avatares_brom\/(.+)$/.exec(url || '');
  if (m) await sb.storage.from('avatares_brom').remove([decodeURIComponent(m[1])]).catch(() => {});
}
// Fotos históricas del bucket público "avatares" (compartido, solo lectura) para
// los perfiles que aún no tienen foto_url propia.
const FOTOS_HISTORICAS = {
  'javier.martinez@petstable.mx': 'Javier.png', 'nelisa.ramirez@petstable.mx': 'Nelisa.png',
  'camila@petstable.mx': 'Camila.png', 'rafa@petstable.mx': 'Rafael.png', 'eduardo@petstable.mx': 'Eduardo.png',
};
export function fotoDe(u) {
  if (u?.foto_url) return u.foto_url;
  const f = FOTOS_HISTORICAS[String(u?.correo || '').toLowerCase()];
  return f ? `${cfg.SUPABASE_URL}/storage/v1/object/public/avatares/${f}` : null;
}

// ---------- Menús desplegables con el estilo del sistema ----------
// Reemplaza visualmente <select> y <input list> por un menú propio. El control
// original se conserva (oculto) para validación, FormData y eventos "change".
const CHEVRON = '<svg class="cs-chev" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m6 9 6 6 6-6"/></svg>';
const CHECK = '<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 6 9 17l-5-5"/></svg>';
let csAbierto = null;
function csCerrar(enfocar = false) {
  if (!csAbierto) return;
  const { panel, anchor } = csAbierto;
  panel.remove(); anchor.setAttribute('aria-expanded', 'false');
  csAbierto = null;
  if (enfocar) anchor.focus();
}
function csUbicar(panel, anchor) {
  const r = anchor.getBoundingClientRect();
  const alto = Math.min(panel.scrollHeight, 300);
  const abajo = innerHeight - r.bottom;
  panel.style.width = `${Math.max(r.width, 200)}px`;
  panel.style.left = `${Math.max(8, Math.min(r.left, innerWidth - 8 - Math.max(r.width, 200)))}px`;
  if (abajo < alto + 12 && r.top > abajo) { panel.style.top = ''; panel.style.bottom = `${innerHeight - r.top + 6}px`; }
  else { panel.style.bottom = ''; panel.style.top = `${r.bottom + 6}px`; }
}
const sinAcentos = (s) => String(s).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
// Mientras se escribe en el buscador del menú, el teclado del celular cambia el tamaño
// de la ventana y desplaza la página: en ese caso el menú se reacomoda en lugar de cerrarse
// (cerrarlo provocaba un ciclo abrir/cerrar con el teclado).
const csEscribiendo = () => !!csAbierto?.buscador && document.activeElement === csAbierto.buscador;
// items: [{ value, label, disabled, selected }]; onPick(value); buscar: muestra un buscador arriba
function csAbrir(anchor, items, onPick, { buscar = false } = {}) {
  csCerrar();
  if (!items.length) return;
  const panel = document.createElement('div');
  panel.className = `cs-panel${buscar ? ' cs-con-buscador' : ''}`; panel.setAttribute('role', 'listbox');
  panel.innerHTML = (buscar ? `<div class="cs-buscar"><input type="search" placeholder="Buscar…" autocomplete="off" autocorrect="off" spellcheck="false" enterkeyhint="search" aria-label="Buscar en la lista"></div>` : '')
    + items.map((it, i) => `<div class="cs-opt ${it.selected ? 'sel' : ''} ${it.disabled ? 'dis' : ''} ${it.ph ? 'ph' : ''}" role="option" data-i="${i}" aria-selected="${it.selected ? 'true' : 'false'}" ${it.disabled ? 'aria-disabled="true"' : ''}>
      <span>${esc(it.label)}</span>${it.selected ? CHECK : ''}</div>`).join('')
    + (buscar ? '<div class="cs-vacio hidden">Sin coincidencias.</div>' : '');
  document.body.appendChild(panel);
  csUbicar(panel, anchor);
  anchor.setAttribute('aria-expanded', 'true');
  const opts = [...panel.querySelectorAll('.cs-opt')];
  let visibles = items.map((_, i) => i);
  let hl = Math.max(0, items.findIndex((x) => x.selected));
  const pintar = (desplazar = true) => {
    opts.forEach((o, i) => o.classList.toggle('hl', i === hl));
    if (desplazar) opts[hl]?.scrollIntoView({ block: 'nearest' });
  };
  pintar();
  const elegir = (i) => { const it = items[i]; if (!it || it.disabled) return; csCerrar(true); onPick(it.value); };
  const mover = (d) => {
    const pos = visibles.indexOf(hl);
    let p = pos < 0 ? (d > 0 ? -1 : visibles.length) : pos;
    do { p += d; } while (p >= 0 && p < visibles.length && items[visibles[p]].disabled);
    if (p >= 0 && p < visibles.length) { hl = visibles[p]; pintar(); }
  };
  let buscador = null;
  if (buscar) {
    buscador = panel.querySelector('.cs-buscar input');
    buscador.addEventListener('input', () => {
      const q = sinAcentos(buscador.value.trim());
      const palabras = q.split(/\s+/).filter(Boolean);
      visibles = [];
      items.forEach((it, i) => {
        const ok = !it.ph && palabras.every((w) => sinAcentos(it.label).includes(w));
        const mostrar = !q || ok;
        opts[i].classList.toggle('hidden', !mostrar);
        if (mostrar) visibles.push(i);
      });
      panel.querySelector('.cs-vacio').classList.toggle('hidden', visibles.length > 0);
      if (!visibles.includes(hl)) hl = visibles.find((i) => !items[i].disabled) ?? -1;
      pintar(false);
      panel.scrollTop = 0;
    });
    // Solo en computadora se enfoca el buscador al abrir; en celular/tableta el teclado
    // aparece únicamente si la persona toca el buscador.
    if (matchMedia('(pointer: fine)').matches) buscador.focus({ preventScroll: true });
  }
  // Evita que el botón pierda el foco al tocar una opción (pero sí deja enfocar el buscador)
  panel.addEventListener('mousedown', (e) => { if (e.target !== buscador) e.preventDefault(); });
  panel.addEventListener('click', (e) => { const o = e.target.closest('.cs-opt'); if (o) elegir(Number(o.dataset.i)); });
  csAbierto = {
    panel, anchor, buscador,
    key: (e) => {
      const enBuscador = e.target === buscador;
      if (e.key === 'ArrowDown') { e.preventDefault(); mover(1); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); mover(-1); }
      else if (e.key === 'Enter') { e.preventDefault(); elegir(hl); }
      else if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); csCerrar(true); }
      else if (e.key === 'Tab') csCerrar();
      else if (!enBuscador && e.key.length === 1 && /\S/.test(e.key) && anchor.tagName !== 'INPUT') {
        if (buscador) { buscador.focus({ preventScroll: true }); return; }
        const k = e.key.toLowerCase();
        const j = items.findIndex((it, i) => i > hl && !it.disabled && it.label.toLowerCase().startsWith(k));
        const j2 = j >= 0 ? j : items.findIndex((it) => !it.disabled && it.label.toLowerCase().startsWith(k));
        if (j2 >= 0) { hl = j2; pintar(); }
      }
    },
  };
}
document.addEventListener('mousedown', (e) => {
  if (csAbierto && !csAbierto.panel.contains(e.target) && !csAbierto.anchor.contains(e.target)) csCerrar();
}, true);
document.addEventListener('scroll', (e) => {
  if (!csAbierto || csAbierto.panel.contains(e.target)) return;
  if (csEscribiendo()) csUbicar(csAbierto.panel, csAbierto.anchor); else csCerrar();
}, true);
window.addEventListener('resize', () => {
  if (csEscribiendo()) csUbicar(csAbierto.panel, csAbierto.anchor); else csCerrar();
});
document.addEventListener('keydown', (e) => {
  if (csAbierto && (e.target === csAbierto.anchor || (csAbierto.buscador && e.target === csAbierto.buscador))) csAbierto.key(e);
}, true);

const valueDesc = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value');
const indexDesc = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'selectedIndex');
function mejorarSelect(sel) {
  if (sel._cs || sel.multiple || sel.size > 1 || 'native' in sel.dataset) return;
  const wrap = document.createElement('div');
  wrap.className = 'cs';
  if (sel.style.cssText) { wrap.style.cssText = sel.style.cssText; sel.style.cssText = ''; }
  sel.parentNode.insertBefore(wrap, sel);
  wrap.appendChild(sel);
  sel.classList.add('cs-native'); sel.tabIndex = -1; sel.setAttribute('aria-hidden', 'true');
  const btn = document.createElement('button');
  btn.type = 'button'; btn.className = 'cs-btn';
  btn.setAttribute('aria-haspopup', 'listbox'); btn.setAttribute('aria-expanded', 'false');
  const lab = sel.id ? document.querySelector(`label[for="${CSS.escape(sel.id)}"]`) : null;
  btn.setAttribute('aria-label', sel.getAttribute('aria-label') || lab?.textContent.replace('*', '').trim() || 'Seleccionar');
  wrap.appendChild(btn);
  const sync = () => {
    const o = sel.options[sel.selectedIndex];
    btn.innerHTML = `<span class="cs-val ${!sel.value ? 'ph' : ''}">${esc(o ? o.textContent : '—')}</span>${CHEVRON}`;
    btn.disabled = sel.disabled;
  };
  // Reflejar cambios hechos por código (value / selectedIndex / opciones / disabled)
  Object.defineProperty(sel, 'value', { configurable: true, get() { return valueDesc.get.call(this); }, set(v) { valueDesc.set.call(this, v); sync(); } });
  Object.defineProperty(sel, 'selectedIndex', { configurable: true, get() { return indexDesc.get.call(this); }, set(v) { indexDesc.set.call(this, v); sync(); } });
  new MutationObserver(sync).observe(sel, { childList: true, subtree: true, attributes: true, attributeFilter: ['disabled', 'selected'] });
  sel.addEventListener('change', sync);
  btn.addEventListener('click', () => {
    if (csAbierto?.anchor === btn) { csCerrar(); return; }
    const items = [...sel.options].filter((o) => !o.hidden).map((o) => ({
      value: o.value, label: o.textContent, disabled: o.disabled, selected: o.index === sel.selectedIndex, ph: o.value === '',
    }));
    csAbrir(btn, items, (v) => {
      valueDesc.set.call(sel, v); sync();
      sel.dispatchEvent(new Event('input', { bubbles: true }));
      sel.dispatchEvent(new Event('change', { bubbles: true }));
    }, { buscar: 'buscar' in sel.dataset });
  });
  btn.addEventListener('keydown', (e) => {
    if (!csAbierto && ['ArrowDown', 'ArrowUp', 'Enter', ' '].includes(e.key)) { e.preventDefault(); btn.click(); }
  });
  sel._cs = { btn, sync };
  sync();
}
function mejorarDatalist(inp) {
  if (inp._cs) return;
  const dl = document.getElementById(inp.getAttribute('list'));
  if (!dl) return;
  inp.removeAttribute('list');
  inp.setAttribute('autocomplete', 'off');
  inp.setAttribute('aria-autocomplete', 'list'); inp.setAttribute('aria-expanded', 'false');
  inp.parentElement.classList.add('cs-dl');
  const mostrar = () => {
    const q = inp.value.trim().toLowerCase();
    const items = [...dl.options].map((o) => ({ value: o.value, label: o.label && o.label !== o.value ? `${o.value} · ${o.label}` : o.value }))
      .filter((it) => !q || it.label.toLowerCase().includes(q));
    if (!items.length || (items.length === 1 && items[0].value.toLowerCase() === q)) { if (csAbierto?.anchor === inp) csCerrar(); return; }
    csAbrir(inp, items.slice(0, 50), (v) => {
      inp.value = v;
      inp.dispatchEvent(new Event('input', { bubbles: true }));
      inp.dispatchEvent(new Event('change', { bubbles: true }));
      setTimeout(() => csCerrar(), 0);
    });
  };
  inp.addEventListener('focus', mostrar);
  inp.addEventListener('input', (e) => { if (e.isTrusted) mostrar(); });
  inp.addEventListener('keydown', (e) => { if (!csAbierto && e.key === 'ArrowDown') { e.preventDefault(); mostrar(); } });
  inp._cs = { mostrar };
}
export function mejorarControles(root = document) {
  root.querySelectorAll?.('select').forEach(mejorarSelect);
  root.querySelectorAll?.('input[list]').forEach(mejorarDatalist);
}
new MutationObserver((muts) => {
  for (const m of muts) for (const n of m.addedNodes) {
    if (n.nodeType !== 1) continue;
    if (n.tagName === 'SELECT') mejorarSelect(n);
    else if (n.tagName === 'INPUT' && n.hasAttribute('list')) mejorarDatalist(n);
    else mejorarControles(n);
  }
}).observe(document.documentElement, { childList: true, subtree: true });
// Un clic en la etiqueta de un select mejorado enfoca su botón
document.addEventListener('click', (e) => {
  const lab = e.target.closest('label[for]');
  const c = lab && document.getElementById(lab.htmlFor);
  if (c?._cs?.btn) { e.preventDefault(); c._cs.btn.focus(); }
});


export function navigate(hash) { if (location.hash !== hash) location.hash = hash; else window.dispatchEvent(new HashChangeEvent('hashchange')); }
