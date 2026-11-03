// =====================================================================
// Preguntas frecuentes (ruta #/ayuda, para todos los roles).
// Si cambia un flujo de la app, actualiza aquí la respuesta.
// =====================================================================
import { esc, icon, refreshIcons, debounce } from '../core.js';

const TEMAS = [
  { ico: 'info', titulo: 'Generales', preguntas: [
    ['¿Qué es este portal?', 'Es el sistema de control de análisis bromatológicos de Pet\'s Table: registra lotes de producto, los asocia a una receta, captura los resultados de cada método, calcula automáticamente si cumplen la especificación y muestra la tendencia histórica.'],
    ['¿Cómo inicio sesión?', 'Con tu correo corporativo @petstable.mx y la misma contraseña de las demás aplicaciones de Pet\'s Table. Además, tu perfil debe estar activo en este portal con un rol autorizado.'],
    ['¿Qué roles existen?', '- **Administrador:** gestiona recetas, métodos, especificaciones y usuarios; puede editar y borrar cualquier lote.\n- **Analista** y **Calidad:** registran lotes con sus resultados y editan los lotes que ellos registraron.'],
    ['¿Qué significa «En vivo»?', 'Indica que hay conexión con el servidor. Si se pierde, cambia a «Sin conexión» y los cambios no se guardan hasta recuperar la red.'],
    ['¿El modo oscuro cambia los datos?', 'No. Solo cambia la presentación. Puedes elegir claro, oscuro o el del sistema en **Mi perfil**.'],
  ] },
  { ico: 'flask-conical', titulo: 'Lotes analizados', preguntas: [
    ['¿Cómo registro un lote?', 'En **Lotes analizados** (o con el botón flotante) elige **Nuevo lote**:\n- Selecciona la fecha del lote en el calendario.\n- Elige la receta.\n- Marca los métodos realizados y captura su resultado.\n- Pulsa **Registrar lote**.'],
    ['¿Cómo se genera el número de lote?', 'Con la fecha del lote en formato DDMMAA. Por ejemplo, 27/09/2026 genera **270926**. Al editar un lote se conserva su número mientras no cambies la fecha.'],
    ['¿Puedo editar un lote?', 'Sí. Quien lo registró o un administrador pueden cambiar la fecha, la receta y los resultados. La edición actualiza el mismo lote: no crea uno nuevo ni duplica resultados. Solo un administrador puede quitar un método ya capturado.'],
    ['¿Quién puede borrar un lote?', 'Solo un administrador. Al borrar un lote se eliminan también todos sus resultados; la acción no se puede deshacer.'],
    ['¿Qué pasa si falta un resultado?', 'No se puede guardar un lote con métodos marcados sin resultado. Así se evitan registros incompletos.'],
    ['¿Qué es la vista previa «Cumple / No cumple» del formulario?', 'Es una evaluación orientativa mientras capturas. El dictamen definitivo lo calcula la base de datos al guardar, con la misma regla.'],
  ] },
  { ico: 'badge-check', titulo: 'Dictamen y especificaciones', preguntas: [
    ['¿Cómo se calcula Cumple / No cumple?', 'Cada resultado se compara con el criterio aplicable:\n- **Mínimo:** resultado ≥ límite.\n- **Máximo:** resultado ≤ límite.\n- **Valor exacto:** resultado = valor.\n- **Rango:** resultado dentro del intervalo.\n- **Sin parámetro:** cumple si hay resultado.\nEl lote **no cumple** si algún método no cumple, queda **pendiente** si falta evaluar alguno y **cumple** si todos cumplen.'],
    ['¿Qué es una especificación por receta?', 'Un criterio particular de un método para una receta concreta (por ejemplo, un límite de grasa distinto para otra fórmula). Cuando existe, tiene prioridad sobre el criterio general del método. Se administra en **Recetas y métodos → Especificaciones por receta**.'],
    ['Si cambio un criterio, ¿cambian los dictámenes anteriores?', 'No. El nuevo criterio aplica a los resultados que se registren o editen después del cambio. Los dictámenes ya calculados se conservan.'],
    ['¿Qué tipos de resultado existen?', '**Cuantitativo** para valores numéricos y **Cualitativo** para Positivo / Negativo.'],
  ] },
  { ico: 'line-chart', titulo: 'Resultados y gráficas', preguntas: [
    ['¿Cómo funcionan los filtros?', 'Periodo, receta y método se aplican al instante, sin botón de actualizar. Las gráficas, los conteos, las medias y la tabla usan exactamente el mismo conjunto filtrado, y la tabla regresa a la primera página.'],
    ['¿Cómo se calcula la media?', 'x̄ = (Σ xᵢ) / n, solo con los resultados que cumplen los filtros activos. Se muestra como indicador y como línea punteada turquesa.'],
    ['¿Por qué no aparecen todas las etiquetas?', 'Con muchos puntos se etiquetan solo los representativos (además del mínimo, el máximo y los que están fuera de especificación) para que no se encimen. Todos los puntos permanecen en la gráfica.'],
    ['¿Qué significan las líneas punteadas?', '- **Roja:** límite de especificación (mínimo, máximo o los dos extremos del rango).\n- **Turquesa:** media del periodo filtrado.\nLos puntos rojos son resultados fuera de especificación.'],
    ['¿Cómo amplío o guardo una gráfica?', 'Toca la gráfica para verla en grande; desde ahí puedes guardarla como imagen.'],
    ['¿Puedo exportar la información?', 'Sí. **Exportar** genera un archivo CSV compatible con Excel con los registros filtrados, tanto en Lotes analizados como en Resultados.'],
    ['¿Qué fecha usan las tendencias?', 'La fecha del lote, no la fecha de captura.'],
  ] },
  { ico: 'user', titulo: 'Cuenta', preguntas: [
    ['¿Cómo cambio mi fotografía?', 'En **Mi perfil → Cambiar fotografía**. Un administrador también puede cambiarla desde **Usuarios**.'],
    ['Olvidé mi contraseña', 'En la pantalla de inicio pulsa **¿Olvidaste tu contraseña?** y sigue el enlace que llegará a tu correo. La contraseña es la misma en todas las aplicaciones de Pet\'s Table.'],
    ['¿Cómo instalo el portal en mi celular?', 'En **Mi perfil** encontrarás los pasos para iPhone y Android.'],
    ['¿Qué hago si aparece un error?', 'Revisa tu conexión y que tu sesión siga activa. Si continúa, conserva el mensaje y repórtalo al responsable del sistema.'],
  ] },
];

// Respuestas con **negritas** y viñetas "- "
function formato(t) {
  const bloques = esc(t).replace(/\*\*(.+?)\*\*/g, '<b>$1</b>').split('\n');
  let html = '', lista = false;
  for (const l of bloques) {
    if (l.startsWith('- ')) { if (!lista) { html += '<ul>'; lista = true; } html += `<li>${l.slice(2)}</li>`; }
    else { if (lista) { html += '</ul>'; lista = false; } html += `<p>${l}</p>`; }
  }
  return html + (lista ? '</ul>' : '');
}
const sinAcentos = (s) => String(s).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

export default {
  render(el) {
    el.innerHTML = `
      <section class="page-intro"><div><span class="eyebrow">Ayuda</span><h1>Preguntas frecuentes</h1>
        <p>Respuestas a las dudas más comunes sobre Análisis Bromatológicos.</p></div></section>
      <div class="toolbar"><div class="search">${icon('search')}<input id="faq-q" type="search" placeholder="Buscar en las preguntas…" aria-label="Buscar en las preguntas" autocomplete="off"></div></div>
      <div id="faq">${TEMAS.map((t) => `<section class="faq-tema"><div class="section-label">${icon(t.ico)} ${esc(t.titulo)}</div>
        ${t.preguntas.map(([q, a]) => `<details class="faq-item" data-txt="${esc(sinAcentos(q + ' ' + a))}"><summary>${esc(q)}${icon('chevron-down')}</summary><div class="faq-a">${formato(a)}</div></details>`).join('')}
      </section>`).join('')}<div class="faq-vacio hidden">Sin coincidencias.</div></div>`;
    refreshIcons();
    el.querySelector('#faq-q').addEventListener('input', debounce((e) => {
      const q = sinAcentos(e.target.value.trim());
      let n = 0;
      el.querySelectorAll('.faq-item').forEach((d) => { const ok = !q || d.dataset.txt.includes(q); d.classList.toggle('hidden', !ok); if (ok) n++; if (q && ok) d.open = true; });
      el.querySelectorAll('.faq-tema').forEach((s) => s.classList.toggle('hidden', !s.querySelector('.faq-item:not(.hidden)')));
      el.querySelector('.faq-vacio').classList.toggle('hidden', n > 0);
    }, 200));
  },
};
