// =====================================================================
// Recetas y métodos: recetas por especie, métodos por área de análisis (con su
// criterio y las recetas a las que aplican) y áreas (quién captura cada una).
// Consulta para todos; alta y edición solo para administradores
// (las políticas RLS de las tablas brom_ lo imponen en la base de datos).
// =====================================================================
import {
  sb, state, esc, icon, refreshIcons, toast, errMsg, openModal, confirmDialog, checkForm, emptyState, errorState, fmtNum,
  getCatalogos, invalidarCatalogos, refLabel, tipoLabel, criterio, PARAMETROS, PARAM_A_LIMITE, UNIDADES, prefs, fetchAll,
  ESPECIES, especieHTML, recetaTxt, opcionCheck, PROTEINAS, proteinaHTML,
} from '../core.js';

let root = null, token = 0, tab = 'recetas';
const TABS = ['recetas', 'metodos', 'areas'];
const COLORES_RECETA = [['#F58020', 'Naranja'], ['#1BC7C7', 'Turquesa'], ['#16A34A', 'Verde'], ['#7C3AED', 'Violeta'], ['#DB2777', 'Rosa'], ['#2563EB', 'Azul'], ['#CA8A04', 'Mostaza'], ['#DC2626', 'Rojo']];

export default {
  async render(el, params = {}) {
    root = el;
    tab = TABS.includes(params.tab) ? params.tab : (TABS.includes(prefs.get('brom.cat.tab')) ? prefs.get('brom.cat.tab') : 'recetas');
    el.innerHTML = `
      <section class="page-intro">
        <div><span class="eyebrow">Configuración</span><h1>Recetas y métodos</h1>
          <p>Catálogos que definen qué se analiza en cada lote, con qué especificación y quién lo captura.</p></div>
        <div class="page-actions" id="cat-acts"></div>
      </section>
      <div class="tabs" role="tablist">
        <button data-tab="recetas" role="tab">${icon('book-open')} Recetas</button>
        <button data-tab="metodos" role="tab">${icon('flask-round')} Métodos</button>
        <button data-tab="areas" role="tab">${icon('layers')} Áreas de análisis</button>
      </div>
      ${state.isAdmin ? '' : `<div class="notice">${icon('info')}<span>Consulta de solo lectura. La creación y edición de catálogos corresponde a un administrador.</span></div>`}
      <div class="card" id="cat-body"></div>`;
    el.addEventListener('click', (e) => onClick(e).catch((err) => { console.error(err); toast(errMsg(err), 'error'); }));
    await pintar();
  },
  destroy() { token++; root = null; },
};

async function pintar() {
  const t = ++token;
  if (!root) return;
  prefs.set('brom.cat.tab', tab);
  root.querySelectorAll('[data-tab]').forEach((b) => { b.classList.toggle('active', b.dataset.tab === tab); b.setAttribute('aria-selected', String(b.dataset.tab === tab)); });
  root.querySelector('#cat-acts').innerHTML = !state.isAdmin ? '' : tab === 'recetas' ? `<button class="btn primary" data-c="nueva-receta">${icon('plus')} Nueva receta</button>`
    : tab === 'metodos' ? `<button class="btn c-blue" data-c="nuevo-metodo">${icon('plus')} Nuevo método</button>`
    : tab === 'areas' ? `<button class="btn c-purple" data-c="nueva-area">${icon('plus')} Nueva área</button>` : '';
  const body = root.querySelector('#cat-body');
  body.innerHTML = '<div class="skeleton" style="height:180px"></div>';
  try {
    const cat = await getCatalogos({ force: true });
    if (t !== token || !root) return;
    if (tab === 'recetas') body.innerHTML = await recetasHTML(cat);
    else if (tab === 'metodos') body.innerHTML = metodosHTML(cat);
    else body.innerHTML = areasHTML(cat);
  } catch (err) {
    if (t !== token) return;
    console.error(err);
    body.innerHTML = errorState(err).replace('data-action="retry"', 'data-c="retry"');
  }
  refreshIcons();
}

const estadoPill = (v, f = false) => (v ? `<span class="pill ok">${f ? 'Activa' : 'Activo'}</span>` : `<span class="pill gray">${f ? 'Inactiva' : 'Inactivo'}</span>`);
const acciones = (botones) => (state.isAdmin ? `<td class="actions" data-label="Acciones"><div class="td-in"><div class="row-actions">${botones}</div></div></td>` : '');
const editar = (attr, id, t = 'Editar') => `<button class="icon-btn" ${attr}="${esc(id)}" aria-label="${t}" title="${t}">${icon('pencil')}</button>`;
// Cada puesto con su propio color (el mismo en todas las áreas)
const COLORES_PUESTO = ['#2563EB', '#16A34A', '#7C3AED', '#DB2777', '#0891B2', '#CA8A04', '#DC2626', '#0D9488', '#4F46E5', '#E8890C'];
const puestoChip = (cat, p) => {
  const i = [...cat.puestos].sort((x, y) => String(x.nombre).localeCompare(String(y.nombre), 'es')).findIndex((x) => x.nombre === p.nombre);
  return `<span class="puesto-chip" style="--pc:${COLORES_PUESTO[Math.max(0, i) % COLORES_PUESTO.length]}">${icon('id-card')}${esc(p.nombre)}</span>`;
};
const areaChip = (a) => `<span class="area-chip" style="--ac:${esc(a.color)}"><span class="area-dot"></span>${esc(a.nombre)}</span>`;

async function recetasHTML(cat) {
  if (!cat.recetas.length) return emptyState({ ico: 'book-open', title: 'Sin recetas', text: 'Registra la primera receta del catálogo.' });
  const lotes = await fetchAll(() => sb.from('brom_muestras').select('receta_id')).catch(() => []);
  const n = (id) => lotes.filter((l) => l.receta_id === id).length;
  return `<div class="table-wrap responsive"><table class="table recetas-tabla"><thead><tr><th>Receta</th><th>Código</th><th>Proteína</th><th>Especie</th><th>Lotes</th><th>Análisis requeridos</th><th>Estado</th>${state.isAdmin ? '<th>Acciones</th>' : ''}</tr></thead><tbody>
    ${cat.recetas.map((r) => `<tr>
      <td data-label="Receta"><div class="td-in"><span class="receta-nom"><span class="receta-dot" style="--rc:${esc(r.color)}"></span><b>${esc(r.nombre_receta)}</b></span></div></td>
      <td data-label="Código"><div class="td-in"><span class="codigo">${esc(r.codigo)}</span></div></td>
      <td data-label="Proteína"><div class="td-in">${proteinaHTML(r.proteina) || "—"}</div></td>
      <td data-label="Especie"><div class="td-in">${especieHTML(r.especie)}</div></td>
      <td data-label="Lotes"><div class="td-in num">${fmtNum(n(r.id))}</div></td>
      <td data-label="Análisis requeridos"><div class="td-in num">${fmtNum(cat.requeridos(r.id).length)}</div></td>
      <td data-label="Estado"><div class="td-in">${estadoPill(r.activa, true)}</div></td>
      ${acciones(`${editar('data-edit-receta', r.id)}<button class="icon-btn" data-dup-receta="${esc(r.id)}" aria-label="Duplicar para otra especie" title="Duplicar para otra especie">${icon('copy-plus')}</button>`)}</tr>`).join('')}</tbody></table></div>
    <p class="hint">${icon('info')} Una misma receta puede existir para perro y para gato, cada una con su código y sus métodos. Usa ${icon('copy-plus')} para duplicarla.</p>`;
}

function metodosHTML(cat) {
  if (!cat.metodos.length) return emptyState({ ico: 'flask-round', title: 'Sin métodos', text: 'Registra el primer método analítico.' });
  return `<div class="table-wrap responsive"><table class="table"><thead><tr><th>Área</th><th>Método</th><th>Tipo de resultado</th><th>Criterio general</th><th>Unidad</th><th>Aplica a</th><th>Estado</th>${state.isAdmin ? '<th>Acciones</th>' : ''}</tr></thead><tbody>
    ${cat.metodos.map((m) => `<tr>
      <td data-label="Área"><div class="td-in">${areaChip(cat.area(m.area))}</div></td>
      <td data-label="Método"><div class="td-in cell-main" title="${esc(m.referencia_normativa || '')}">${esc(m.metodo)}</div></td>
      <td data-label="Tipo"><div class="td-in cell-sub">${esc(tipoLabel(m.tipo_resultado))}</div></td>
      <td data-label="Criterio general"><div class="td-in">${esc(refLabel(m))}</div></td>
      <td data-label="Unidad"><div class="td-in">${esc(m.unidades || '—')}</div></td>
      <td data-label="Aplica a"><div class="td-in">${aplicaHTML(cat, m)}</div></td>
      <td data-label="Estado"><div class="td-in">${estadoPill(m.activo)}</div></td>
      ${acciones(`${editar('data-edit-metodo', m.id)}<button class="icon-btn" data-dup-metodo="${esc(m.id)}" aria-label="Duplicar método" title="Duplicar método">${icon('copy')}</button>`)}</tr>`).join('')}</tbody></table></div>
    <p class="hint">${icon('info')} Usa ${icon('copy')} para duplicar un método (por ejemplo, Humedad con otro criterio) y asignarlo solo a algunas recetas.</p>`;
}
// Recetas en las que se evalúa un método
function aplicaHTML(cat, m) {
  if (!m.recetas_aplica) return '<span class="pill gray">Todas las recetas</span>';
  const rs = cat.recetas.filter((r) => m.recetas_aplica.includes(r.id));
  if (!rs.length) return '<span class="pill bad">Ninguna receta</span>';
  return `<span class="recetas-mini">${rs.map((r) => `<span class="receta-nom sm"><span class="receta-dot" style="--rc:${esc(r.color)}"></span>${esc(r.nombre_receta)}</span>`).join('')}</span>`;
}

function areasHTML(cat) {
  if (!cat.areas.length) return emptyState({ ico: 'layers', title: 'Sin áreas', text: 'Registra las áreas de análisis.' });
  return `<div class="table-wrap responsive"><table class="table"><thead><tr><th>Área</th><th>Descripción</th><th>Métodos</th><th>Captura</th><th>Estado</th>${state.isAdmin ? '<th>Acciones</th>' : ''}</tr></thead><tbody>
    ${cat.areas.map((a) => `<tr>
      <td data-label="Área"><div class="td-in">${areaChip(a)}</div></td>
      <td data-label="Descripción"><div class="td-in cell-sub">${esc(a.descripcion || '—')}</div></td>
      <td data-label="Métodos"><div class="td-in mono">${fmtNum(cat.metodos.filter((m) => m.area === a.id && m.activo).length)}</div></td>
      <td data-label="Captura"><div class="td-in"><div class="chips-areas">${cat.puestosArea(a.id).map((p) => puestoChip(cat, p)).join('')}<span class="puesto-chip admin">${icon('crown')}Administrador</span></div></div></td>
      <td data-label="Estado"><div class="td-in">${estadoPill(a.activa, true)}</div></td>
      ${acciones(editar('data-edit-area', a.id))}</tr>`).join('')}</tbody></table></div>
    <p class="hint">${icon('info')} Un lote se libera cuando todos los métodos activos de las áreas activas que aplican a su receta cumplen. Quién captura cada área se define por puesto (Usuarios → Puestos y permisos); los administradores capturan cualquier área.</p>`;
}

async function onClick(e) {
  const tb = e.target.closest('[data-tab]');
  if (tb) { tab = tb.dataset.tab; pintar(); return; }
  const a = e.target.closest('[data-c], [data-edit-receta], [data-dup-receta], [data-edit-metodo], [data-dup-metodo], [data-edit-area]');
  if (!a) return;
  const cat = await getCatalogos();
  let ok = false;
  if (a.dataset.c === 'retry') { pintar(); return; }
  if (a.dataset.c === 'nueva-receta') ok = await recetaForm(cat);
  else if (a.dataset.c === 'nuevo-metodo') ok = await metodoForm(cat);
  else if (a.dataset.c === 'nueva-area') ok = await areaForm(cat);
  else if (a.dataset.editReceta) ok = await recetaForm(cat, cat.recetas.find((r) => r.id === a.dataset.editReceta));
  else if (a.dataset.dupReceta) ok = await recetaForm(cat, null, cat.recetas.find((r) => r.id === a.dataset.dupReceta));
  else if (a.dataset.editMetodo) ok = await metodoForm(cat, cat.metodos.find((m) => m.id === a.dataset.editMetodo));
  else if (a.dataset.dupMetodo) ok = await metodoForm(cat, null, cat.metodos.find((m) => m.id === a.dataset.dupMetodo));
  else if (a.dataset.editArea) ok = await areaForm(cat, cat.areas.find((x) => x.id === a.dataset.editArea));
  if (ok) { invalidarCatalogos(); pintar(); }
}

// Siguiente código libre: REC-01, REC-02…
const siguienteCodigo = (cat) => {
  const n = Math.max(0, ...cat.recetas.map((r) => Number(/^REC-(\d+)/.exec(r.codigo)?.[1] || 0)));
  return `REC-${String(n + 1).padStart(2, '0')}`;
};

// Color: hexadecimal ↔ HSL (para el selector de tonalidad, intensidad y luminosidad)
function hexAHsl(hex) {
  const m = /^#?([0-9a-f]{6})$/i.exec(String(hex || ''));
  const n = m ? parseInt(m[1], 16) : 0xF58020;
  const r = ((n >> 16) & 255) / 255, g = ((n >> 8) & 255) / 255, b = (n & 255) / 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b), l = (max + min) / 2;
  let h = 0, s = 0;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    h = max === r ? (g - b) / d + (g < b ? 6 : 0) : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
    h *= 60;
  }
  return { h: Math.round(h), s: Math.round(s * 100), l: Math.round(l * 100) };
}
function hslAHex(h, s, l) {
  s /= 100; l /= 100;
  const k = (n) => (n + h / 30) % 12, a = s * Math.min(l, 1 - l);
  const f = (n) => Math.round(255 * (l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1))))).toString(16).padStart(2, '0');
  return `#${f(0)}${f(8)}${f(4)}`.toUpperCase();
}

// r: receta a editar · base: receta a duplicar para otra especie (copia sus métodos asignados)
function recetaForm(cat, r = null, base = null) {
  const v = r || (base ? { ...base, codigo: siguienteCodigo(cat), especie: ESPECIES.find((e) => e.v !== base.especie)?.v || 'Perro', activa: true }
    : { codigo: siguienteCodigo(cat), nombre_receta: '', especie: 'Perro', proteina: '', color: COLORES_RECETA[cat.recetas.length % COLORES_RECETA.length][0], activa: true });
  const especies = [...ESPECIES, ...[...new Set(cat.recetas.map((x) => x.especie))].filter((e) => !ESPECIES.some((x) => x.v === e)).map((e) => ({ v: e, ico: 'paw-print' }))];
  const c0 = /^#[0-9a-f]{6}$/i.test(v.color || '') ? v.color.toUpperCase() : '#F58020';
  const hsl = hexAHsl(c0);
  return openModal({
    title: r ? 'Editar receta' : base ? `Duplicar ${base.nombre_receta} para otra especie` : 'Nueva receta',
    subtitle: base ? 'Los métodos asignados a la receta original también se asignan a la copia.' : 'Datos de la receta y su color característico en gráficas y etiquetas.',
    submitText: r ? 'Guardar cambios' : 'Registrar receta',
    body: `<div class="rf-preview" data-preview style="--rc:${c0}">
        <span class="rfp-ico" data-pv-ico>${icon(PROTEINAS[v.proteina]?.ico || 'chef-hat')}</span>
        <div class="rfp-main"><b data-pv-nom>${esc(v.nombre_receta || 'Nombre de la receta')}</b>
          <span><span class="codigo">${esc(v.codigo)}</span><span data-pv-esp>${especieHTML(v.especie, 'sm')}</span><span data-pv-pro>${proteinaHTML(v.proteina)}</span></span></div>
        <span class="rfp-chip">Vista previa</span></div>
      <section class="form-sec"><h4>${icon('id-card')} Identificación</h4>
        <div class="form-grid">
          <div class="field"><label for="rf-cod">Código</label>
            <div class="input-lock">${icon('lock')}<input id="rf-cod" name="codigo" readonly value="${esc(v.codigo)}"></div>
            <small class="hint">${r ? 'El código no cambia.' : 'Se asigna en automático, en orden.'}</small></div>
          <div class="field"><label for="rf-nom">Nombre de la receta <span class="req">*</span></label><input id="rf-nom" name="nombre" required maxlength="120" value="${esc(v.nombre_receta)}" placeholder="Nombre comercial"></div>
          <div class="field"><label for="rf-esp">Especie <span class="req">*</span></label><select id="rf-esp" name="especie" required>
            ${especies.map((x) => `<option value="${esc(x.v)}" data-ico="${esc(x.ico)}" ${x.v === v.especie ? 'selected' : ''}>${esc(x.v)}</option>`).join('')}</select></div>
          <div class="field"><label for="rf-pro">Proteína base</label><select id="rf-pro" name="proteina"><option value="">Sin especificar</option>
            ${Object.entries(PROTEINAS).map(([k, p]) => `<option value="${k}" data-ico="${p.ico}" ${k === v.proteina ? 'selected' : ''}>${esc(p.label)}</option>`).join('')}</select></div>
          <div class="field"><label for="rf-act">Estado</label><select id="rf-act" name="activa"><option value="true">Activa</option><option value="false" ${v.activa ? '' : 'selected'}>Inactiva</option></select>
            <small class="hint">Una receta inactiva no aparece al registrar lotes; su historial se conserva.</small></div>
        </div></section>
      <section class="form-sec"><h4>${icon('palette')} Color característico</h4>
        <div class="color-studio">
          <label class="cst-swatch" title="Elegir un color exacto"><input type="color" name="color" value="${c0}"><span data-hex>${c0}</span></label>
          <div class="cst-sliders">
            <label><span>Tonalidad</span><input type="range" class="rng rng-hue" name="hue" min="0" max="359" value="${hsl.h}"></label>
            <label><span>Intensidad</span><input type="range" class="rng rng-sat" name="sat" min="15" max="100" value="${hsl.s}"></label>
            <label><span>Luminosidad</span><input type="range" class="rng rng-lum" name="lum" min="22" max="70" value="${hsl.l}"></label>
          </div>
        </div>
        <div class="color-presets">${COLORES_RECETA.map(([c, n]) => `<button type="button" data-color="${c}" style="--rc:${c}" title="${n}" aria-label="${n}"></button>`).join('')}</div>
        <small class="hint">Se usa en las gráficas, separadores y etiquetas de la receta.</small></section>`,
    onOpen: ({ form }) => {
      const pv = form.querySelector('[data-preview]');
      const pintar = (hex, desdeSliders = false) => {
        form.color.value = hex;
        form.querySelector('[data-hex]').textContent = hex.toUpperCase();
        pv.style.setProperty('--rc', hex);
        const h = hexAHsl(hex);
        if (!desdeSliders) { form.hue.value = h.h; form.sat.value = h.s; form.lum.value = h.l; }
        form.style.setProperty('--h', form.hue.value);
        form.style.setProperty('--s', `${form.sat.value}%`);
        form.style.setProperty('--l', `${form.lum.value}%`);
        form.querySelectorAll('[data-color]').forEach((b) => b.classList.toggle('on', b.dataset.color.toUpperCase() === hex.toUpperCase()));
      };
      const desdeRangos = () => { pintar(hslAHex(Number(form.hue.value), Number(form.sat.value), Number(form.lum.value)), true); };
      ['hue', 'sat', 'lum'].forEach((k) => form[k].addEventListener('input', desdeRangos));
      form.color.addEventListener('input', () => pintar(form.color.value));
      form.querySelector('.color-presets').addEventListener('click', (e) => { const b = e.target.closest('[data-color]'); if (b) { pintar(b.dataset.color); form.dispatchEvent(new Event('input')); } });
      form.nombre.addEventListener('input', () => { form.querySelector('[data-pv-nom]').textContent = form.nombre.value.trim() || 'Nombre de la receta'; });
      const cambios = () => {
        form.querySelector('[data-pv-esp]').innerHTML = especieHTML(form.especie.value, 'sm');
        form.querySelector('[data-pv-pro]').innerHTML = proteinaHTML(form.proteina.value);
        form.querySelector('[data-pv-ico]').innerHTML = icon(PROTEINAS[form.proteina.value]?.ico || 'chef-hat');
        refreshIcons();
      };
      form.especie.addEventListener('change', cambios); form.proteina.addEventListener('change', cambios);
      pintar(c0);
    },
    onSubmit: async ({ form }) => {
      if (!checkForm(form)) return false;
      const fila = { nombre_receta: form.nombre.value.trim().replace(/\s+/g, ' '), especie: form.especie.value, proteina: form.proteina.value || null, color: form.color.value.toUpperCase(), activa: form.activa.value === 'true' };
      if (r) {
        const { error } = await sb.from('brom_recetas').update(fila).eq('id', r.id);
        if (error) throw error;
        toast('Receta actualizada.', 'success');
        return true;
      }
      // Código siguiente al momento de guardar (por si otra persona registró una receta)
      const frescas = await getCatalogos({ force: true });
      fila.codigo = siguienteCodigo(frescas);
      const { data, error } = await sb.from('brom_recetas').insert(fila).select('id').single();
      if (error) throw error;
      if (base) {
        // Los métodos asignados solo a algunas recetas también se asignan a la copia
        for (const m of cat.metodos.filter((x) => x.recetas_aplica?.includes(base.id))) {
          const q = await sb.from('brom_catalogo_metodos').update({ recetas_aplica: [...m.recetas_aplica, data.id] }).eq('id', m.id);
          if (q.error) throw q.error;
        }
        toast(`Receta ${fila.codigo} creada para ${fila.especie.toLowerCase()}.`, 'success');
      } else toast(`Receta ${fila.codigo} registrada.`, 'success');
      return true;
    },
  });
}

// Campos del criterio de un método
function criterioCampos(prefijo, tipo, param, m = {}) {
  const opts = Object.entries(PARAMETROS).filter(([k]) => tipo === 'numerico' || ['ninguno', 'exacto'].includes(k));
  return `<div class="field"><label for="${prefijo}-param">Parámetro de referencia</label>
      <select id="${prefijo}-param" name="param">${opts.map(([k, v]) => `<option value="${k}" ${k === param ? 'selected' : ''}>${v}</option>`).join('')}</select></div>
    <div class="field" data-num><label for="${prefijo}-val"><span data-lbl>Valor de referencia</span> <span class="req">*</span></label><input id="${prefijo}-val" name="valor" type="number" step="any" value="${esc(m.valor_referencia ?? '')}"></div>
    <div class="field" data-max><label for="${prefijo}-max">Valor máximo <span class="req">*</span></label><input id="${prefijo}-max" name="valor_max" type="number" step="any" value="${esc(m.valor_referencia_max ?? '')}"></div>
    <div class="field" data-txt><label for="${prefijo}-txt">Resultado esperado <span class="req">*</span></label>
      <select id="${prefijo}-txt" name="valor_texto"><option value="">Selecciona una opción</option>${['Positivo', 'Negativo'].map((o) => `<option ${m.valor_referencia_texto === o ? 'selected' : ''}>${o}</option>`).join('')}</select></div>`;
}
function criterioVisibilidad(form, tipo) {
  const p = form.param?.value || 'ninguno';
  const num = tipo === 'numerico';
  const show = (sel, v) => { const f = form.querySelector(sel); if (!f) return; f.classList.toggle('hidden', !v); f.querySelectorAll('input, select').forEach((i) => { i.disabled = !v; i.required = v; }); };
  show('[data-num]', num && p !== 'ninguno');
  show('[data-max]', num && p === 'rango');
  show('[data-txt]', tipo === 'positivo_negativo' && p === 'exacto');
  const lbl = form.querySelector('[data-lbl]');
  if (lbl) lbl.textContent = p === 'rango' ? 'Valor mínimo' : p === 'minimo' ? 'Límite mínimo' : p === 'maximo' ? 'Límite máximo' : 'Valor de referencia';
}
function criterioValores(form, tipo) {
  if (tipo === 'verificacion') return { p: 'exacto', v: null, mx: null, txt: 'Cumple' };
  const p = form.param.value;
  const num = tipo === 'numerico';
  const v = num && p !== 'ninguno' ? Number(form.valor.value) : null;
  const mx = num && p === 'rango' ? Number(form.valor_max.value) : null;
  if (p === 'rango' && v > mx) throw new Error('El valor mínimo debe ser menor o igual al máximo.');
  return { p, v, mx, txt: !num && p === 'exacto' ? form.valor_texto.value : null };
}

// m: método a editar · base: método a duplicar (se copian sus campos; cambias solo lo necesario)
// Orden automático: al final del área (después del último método)
const siguienteOrden = (cat, area, sinId) => Math.max(0, ...cat.metodos.filter((x) => x.area === area && x.id !== sinId).map((x) => Number(x.orden) || 0)) + 1;

function metodoForm(cat, m = null, base = null) {
  const v = m || base || null;
  const tipo0 = v?.tipo_resultado || 'numerico';
  const unidades = v?.unidades && !UNIDADES.includes(v.unidades) ? [v.unidades, ...UNIDADES] : UNIDADES;
  const recetas = cat.recetas.filter((r) => r.activa || v?.recetas_aplica?.includes(r.id));
  const todas = !v?.recetas_aplica;
  return openModal({
    title: m ? 'Editar método' : base ? `Duplicar ${base.metodo}` : 'Nuevo método',
    subtitle: base ? 'Se copian todos sus datos: cambia solo lo necesario (por ejemplo, las recetas o el criterio).' : 'Define el área, el tipo de resultado, su criterio general y a qué recetas aplica.',
    submitText: m ? 'Guardar cambios' : base ? 'Crear copia' : 'Registrar método',
    body: `<section class="form-sec"><h4>${icon('flask-round')} Método</h4>
      <div class="form-grid">
        <div class="field"><label for="mf-nom">Nombre del método <span class="req">*</span></label><input id="mf-nom" name="metodo" required maxlength="80" value="${esc(v?.metodo || '')}" placeholder="Por ejemplo: Humedad"></div>
        <div class="field"><label for="mf-area">Área de análisis <span class="req">*</span></label><select id="mf-area" name="area" required>
          ${cat.areas.map((a) => `<option value="${esc(a.id)}" ${a.id === (v?.area || 'bromatologico') ? 'selected' : ''}>${esc(a.nombre)}</option>`).join('')}</select>
          <small class="hint">${m ? 'Conserva su lugar dentro del área.' : 'Se agrega al final del área, en automático.'}</small></div>
        <div class="field"><label for="mf-tipo">Tipo de resultado</label><select id="mf-tipo" name="tipo">
          ${['numerico', 'verificacion', 'positivo_negativo'].map((t) => `<option value="${t}" ${t === tipo0 ? 'selected' : ''}>${esc(tipoLabel(t))}</option>`).join('')}
          ${tipo0 === 'texto' ? '<option value="texto" selected>Texto</option>' : ''}</select></div>
        <div class="field"><label for="mf-act">Estado</label><select id="mf-act" name="activo"><option value="true">Activo</option><option value="false" ${v && !v.activo ? 'selected' : ''}>Inactivo</option></select></div>
      </div></section>
      <section class="form-sec"><h4>${icon('target')} Criterio de aceptación</h4>
        <div class="form-grid">
          <div data-crit class="full form-grid" style="padding:0"></div>
          <div class="field" data-unid><label for="mf-uni">Unidad</label><select id="mf-uni" name="unidades" data-buscar><option value="">Sin unidad</option>${unidades.map((u) => `<option ${u === v?.unidades ? 'selected' : ''}>${esc(u)}</option>`).join('')}</select></div>
          <div class="field full"><label for="mf-norma">Referencia normativa</label><input id="mf-norma" name="norma" maxlength="160" value="${esc(v?.referencia_normativa || '')}" placeholder="Por ejemplo: NOM-116-SSA1-1994 o criterio interno"></div>
        </div>
        <p class="hint" data-hint-ver>${icon('info')} En un método de verificación se marca «Cumple» o «No cumple» para cada lote.</p></section>
      <section class="form-sec"><h4>${icon('chef-hat')} Recetas en las que se evalúa</h4>
        <div class="field"><label for="mf-alc">¿A qué recetas aplica? <span class="req">*</span></label>
          <select id="mf-alc" name="alcance"><option value="todas" ${todas && !base ? 'selected' : ''}>A todas las recetas</option><option value="algunas" ${!todas || base ? 'selected' : ''}>Solo a las recetas que elija</option></select></div>
        <div class="receta-pick-grid" data-recetas>${recetas.map((r) => recetaPick(r, base ? false : todas || v.recetas_aplica.includes(r.id))).join('')}</div>
        ${base ? `<div class="opt-list" style="margin-top:10px">${opcionCheck('quitar', '1', `Quitar las recetas elegidas del método original «${base.metodo}» (para que no se exijan los dos)`, true)}</div>` : ''}</section>
    ${m ? `<div class="notice warn">${icon('info')}<span>Un cambio de criterio aplica a los resultados que se registren o editen después; los dictámenes ya calculados no se modifican.</span></div>` : ''}`,
    onOpen: ({ form }) => {
      const crit = form.querySelector('[data-crit]');
      const montar = (param) => {
        const tipo = form.tipo.value;
        crit.innerHTML = tipo === 'verificacion' ? '' : criterioCampos('mf', tipo, param, v || {});
        form.querySelector('[data-unid]').classList.toggle('hidden', tipo !== 'numerico');
        form.querySelector('[data-hint-ver]').classList.toggle('hidden', tipo !== 'verificacion');
        criterioVisibilidad(form, tipo);
        form.param?.addEventListener('change', () => criterioVisibilidad(form, form.tipo.value));
      };
      montar(v?.parametro_referencia || 'ninguno');
      form.tipo.addEventListener('change', () => montar('ninguno'));
      const alc = () => form.querySelector('[data-recetas]').classList.toggle('hidden', form.alcance.value === 'todas');
      form.alcance.addEventListener('change', alc); alc();
    },
    onSubmit: async ({ form, setError }) => {
      if (!checkForm(form)) return false;
      const tipo = form.tipo.value;
      const c = criterioValores(form, tipo);
      const elegidas = [...form.querySelectorAll('[name="recetas"]:checked')].map((x) => x.value);
      if (form.alcance.value === 'algunas' && !elegidas.length) { setError('Elige al menos una receta.'); return false; }
      const fila = {
        metodo: form.metodo.value.trim().replace(/\s+/g, ' '), tipo_resultado: tipo, parametro_referencia: c.p, area: form.area.value, orden: m && m.area === form.area.value ? (m.orden ?? 0) : siguienteOrden(cat, form.area.value, m?.id),
        valor_referencia: c.v, valor_referencia_max: c.mx, valor_referencia_texto: c.txt,
        unidades: tipo === 'numerico' ? form.unidades.value || null : null,
        referencia_normativa: form.norma.value.trim() || null, activo: form.activo.value === 'true',
        recetas_aplica: form.alcance.value === 'todas' ? null : elegidas,
      };
      if (m) {
        const { error } = await sb.from('brom_catalogo_metodos').update(fila).eq('id', m.id);
        if (error) throw error;
        toast('Método actualizado.', 'success'); return true;
      }
      const { data, error } = await sb.from('brom_catalogo_metodos').insert(fila).select('id').single();
      if (error) throw error;
      if (base) {
        if (form.querySelector('[name="quitar"]')?.checked && fila.recetas_aplica) {
          const resto = (base.recetas_aplica || cat.recetas.map((r) => r.id)).filter((id) => !fila.recetas_aplica.includes(id));
          const q = await sb.from('brom_catalogo_metodos').update({ recetas_aplica: resto }).eq('id', base.id);
          if (q.error) throw q.error;
        }
        toast(`Se creó la copia de ${base.metodo}.`, 'success');
      } else toast('Método registrado.', 'success');
      return true;
    },
  });
}

// Tarjeta seleccionable de una receta (selector de recetas de un método)
const recetaPick = (r, on) => `<label class="receta-pick" style="--rc:${esc(r.color || '#64748B')}">
  <input type="checkbox" name="recetas" value="${esc(r.id)}" ${on ? 'checked' : ''}>
  <span class="rp-color" aria-hidden="true">${icon(PROTEINAS[r.proteina]?.ico || 'chef-hat')}</span>
  <span class="rp-txt"><b>${esc(r.nombre_receta)}</b><small>${esc(r.codigo)}</small></span>
  <span class="rp-check" aria-hidden="true">${icon('check')}</span></label>`;

// Clave interna del área a partir de su nombre (sin acentos, minúsculas y guion bajo)
const claveArea = (cat, nombre) => {
  const base = String(nombre).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 28) || 'area';
  let id = base, i = 2;
  while (cat.areas.some((x) => x.id === id)) id = `${base}_${i++}`;
  return id;
};
const COLORES_AREA = ['#9333EA', '#2563EB', '#DB2777', '#CA8A04', '#0891B2', '#16A34A', '#DC2626', '#4F46E5'];

function areaForm(cat, a = null) {
  const color0 = a?.color || COLORES_AREA[cat.areas.length % COLORES_AREA.length];
  return openModal({
    title: a ? `Editar área ${a.nombre}` : 'Nueva área de análisis',
    subtitle: 'Agrupa métodos que captura un mismo equipo; un lote se libera cuando todas sus áreas activas cumplen.',
    submitText: a ? 'Guardar cambios' : 'Registrar área',
    body: `<div class="rf-preview area-pv" data-preview style="--rc:${esc(color0)}">
        <span class="rfp-ico">${icon('layers')}</span>
        <div class="rfp-main"><b data-pv-nom>${esc(a?.nombre || 'Nombre del área')}</b><span data-pv-desc>${esc(a?.descripcion || 'Descripción breve')}</span></div>
        <span class="rfp-chip">Vista previa</span></div>
      <section class="form-sec"><h4>${icon('info')} Datos del área</h4>
        <div class="form-grid">
          <div class="field"><label for="af-nom">Nombre <span class="req">*</span></label><input id="af-nom" name="nombre" required maxlength="60" value="${esc(a?.nombre || '')}" placeholder="Por ejemplo: Nutricional"></div>
          <div class="field"><label for="af-act">Estado</label><select id="af-act" name="activa"><option value="true">Activa (se exige para liberar)</option><option value="false" ${a && !a.activa ? 'selected' : ''}>Inactiva</option></select></div>
          <div class="field full"><label for="af-desc">Descripción</label><textarea id="af-desc" name="descripcion" maxlength="300" rows="2" placeholder="Qué se evalúa en esta área">${esc(a?.descripcion || '')}</textarea></div>
          <div class="field full"><label>Color</label>
            <div class="area-colores">${COLORES_AREA.map((c) => `<button type="button" data-color="${c}" style="--rc:${c}" class="${c.toLowerCase() === String(color0).toLowerCase() ? 'on' : ''}" aria-label="Color ${c}"></button>`).join('')}
              <label class="area-color-libre" title="Otro color"><input type="color" name="color" value="${esc(color0)}">${icon('pipette')}</label></div></div>
        </div></section>
      <section class="form-sec"><h4>${icon('users')} ¿Qué puestos capturan esta área?</h4>
        <div class="puesto-pick-grid">${cat.puestos.filter((p) => p.activo).map((p) => `<label class="puesto-pick"><input type="checkbox" name="puestos" value="${esc(p.id)}" ${a && (p.areas_captura || []).includes(a.id) ? 'checked' : ''}>
          <span class="pp-ico">${icon('id-card')}</span><span class="pp-nom">${esc(p.nombre)}</span><span class="rp-check">${icon('check')}</span></label>`).join('')}</div>
        <small class="hint">Los administradores siempre pueden capturar. También se configura en Usuarios → Puestos y permisos.</small></section>`,
    onOpen: ({ form }) => {
      const pv = form.querySelector('[data-preview]');
      const ponerColor = (c) => {
        form.color.value = c; pv.style.setProperty('--rc', c);
        form.querySelectorAll('.area-colores [data-color]').forEach((b) => b.classList.toggle('on', b.dataset.color.toLowerCase() === c.toLowerCase()));
      };
      form.querySelector('.area-colores').addEventListener('click', (e) => { const b = e.target.closest('[data-color]'); if (b) { ponerColor(b.dataset.color); form.dispatchEvent(new Event('input')); } });
      form.color.addEventListener('input', () => ponerColor(form.color.value));
      form.nombre.addEventListener('input', () => { form.querySelector('[data-pv-nom]').textContent = form.nombre.value.trim() || 'Nombre del área'; });
      form.descripcion.addEventListener('input', () => { form.querySelector('[data-pv-desc]').textContent = form.descripcion.value.trim() || 'Descripción breve'; });
    },
    onSubmit: async ({ form }) => {
      if (!checkForm(form)) return false;
      const fila = { nombre: form.nombre.value.trim(), descripcion: form.descripcion.value.trim() || null, color: form.color.value.toUpperCase(), activa: form.activa.value === 'true' };
      const areaId = a ? a.id : claveArea(cat, fila.nombre);
      // Orden automático: las áreas nuevas van al final
      const { error } = a ? await sb.from('brom_areas_analisis').update(fila).eq('id', a.id)
        : await sb.from('brom_areas_analisis').insert({ ...fila, id: areaId, orden: Math.max(0, ...cat.areas.map((x) => Number(x.orden) || 0)) + 1 });
      if (error) throw error;
      // Puestos que capturan el área (se guarda en cada puesto)
      const marcados = new Set([...form.querySelectorAll('[name="puestos"]:checked')].map((x) => x.value));
      for (const p of cat.puestos.filter((x) => x.activo)) {
        const tiene = (p.areas_captura || []).includes(areaId);
        if (tiene === marcados.has(p.id)) continue;
        const areas = tiene ? p.areas_captura.filter((x) => x !== areaId) : [...(p.areas_captura || []), areaId];
        const q = await sb.from('brom_puestos').update({ areas_captura: areas }).eq('id', p.id);
        if (q.error) throw q.error;
      }
      toast(a ? 'Área actualizada.' : 'Área registrada.', 'success');
    },
  });
}
