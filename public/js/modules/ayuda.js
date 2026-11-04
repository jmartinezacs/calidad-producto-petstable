// =====================================================================
// Centro de ayuda: preguntas frecuentes para todos los perfiles, buscador,
// tutorial ilustrado de instalación (Android, iPhone o iPad y computadora)
// y descarga de la guía de usuario completa en PDF tamaño carta.
// Las ilustraciones son SVG propios; el PDF las convierte a PNG.
// Si cambia un flujo de la aplicación, actualiza aquí la respuesta.
// =====================================================================
import { esc, icon, refreshIcons, toast, errMsg, APP_VERSION } from '../core.js';
import { LOGO, cargarJsPDF, pdfTxt, RGB } from './pdf.js';

// ---------------- Contenido ----------------
// Formato de las respuestas: párrafos separados por \n, viñetas con «- » y **negritas**.
const TEMAS = [
  { id: 'inicio', ico: 'rocket', titulo: 'Primeros pasos', preguntas: [
    ['¿Qué es Liberación de producto?', 'Es el sistema de **Calidad de producto** de Pet\'s Table para decidir si un lote de producto terminado puede liberarse. Reúne en un solo lugar:\n- El registro de cada lote con su receta.\n- Los análisis **bromatológicos**, **fisicoquímicos**, **microbiológicos** y **sensoriales**.\n- El dictamen automático contra la especificación.\n- La **liberación** del lote y su **certificado de calidad** en PDF.\n- Las tendencias históricas por receta y método.'],
    ['¿Cómo entro al sistema?', 'Abre la dirección del sistema en tu navegador (o el ícono de la aplicación instalada) y escribe:\n- Tu **correo corporativo** @petstable.mx.\n- Tu **contraseña**, que es la misma de las demás aplicaciones de Pet\'s Table.\nPulsa **Entrar**. Si tu cuenta no tiene acceso, solicítalo a un administrador del sistema.'],
    ['¿Qué hace la opción «Mantener sesión»?', 'Si la dejas marcada, el sistema recuerda tu sesión en ese dispositivo y no tendrás que escribir tu contraseña cada vez. Desmárcala en equipos compartidos: la sesión se cerrará al cerrar el navegador.'],
    ['Olvidé mi contraseña', 'En la pantalla de inicio pulsa **¿Olvidaste tu contraseña?**, escribe tu correo corporativo y pulsa **Enviar enlace**. Recibirás un correo con un enlace para definir una nueva contraseña de al menos 8 caracteres. La nueva contraseña aplica en todas las aplicaciones de Pet\'s Table.'],
    ['¿Cómo me muevo por el sistema?', 'Usa el botón de **menú** (tres líneas) del encabezado para abrir las secciones: Panel, Lotes y liberación, Resultados, Recetas y métodos, Usuarios y Bitácora (solo administradores), Mi perfil y Preguntas frecuentes. En el celular también tienes una barra inferior con las secciones principales.\nLos botones flotantes de la esquina inferior derecha registran un **nuevo lote** o te regresan al **Panel**.'],
    ['¿Qué significa «En vivo»?', 'Indica que hay conexión con el servidor. Si cambia a **Sin conexión**, revisa tu red: mientras tanto los cambios no se guardan.'],
    ['¿Cómo cambio entre modo claro y modo oscuro?', 'Con el selector de **sol y luna** del encabezado, o en **Mi perfil → Apariencia** (claro, oscuro o el del sistema). Solo cambia la presentación; los datos son los mismos.'],
    ['¿Cómo cierro sesión?', 'Pulsa **Salir** en el encabezado o **Cerrar sesión** al final del menú. Solo se cierra este sistema; tus otras aplicaciones de Pet\'s Table siguen abiertas.'],
  ] },
  { id: 'roles', ico: 'shield-check', titulo: 'Roles y permisos', preguntas: [
    ['¿Qué roles existen?', 'Solo hay dos roles, que definen qué puedes **administrar**:\n- **Usuario:** registra lotes y captura los análisis que permite su puesto.\n- **Administrador:** además administra recetas, métodos, especificaciones, áreas, usuarios y puestos; consulta la bitácora, revierte liberaciones y borra lotes. Puede capturar cualquier área.\nLo que cada persona **captura**, si **libera** lotes y si **firma** el certificado depende de su **puesto**.'],
    ['¿Qué permite cada puesto?', 'En **Usuarios → Puestos y permisos** cada puesto indica:\n- Las **áreas de análisis que captura** (por ejemplo, el Inspector de calidad captura bromatológicos y el Jefe de calidad todas las áreas).\n- Si **libera lotes** y emite certificados.\n- Si **firma el certificado** como Jefe de calidad o como Inspector de calidad.\nSi agregas a una persona con un puesto nuevo, el puesto se crea sin permisos; configúralo ahí.'],
    ['¿Por qué no puedo capturar un área?', 'Cada área la capturan ciertos puestos. Si un área no te corresponde, en el formulario aparece en modo de consulta con la etiqueta **Lo captura:** y los puestos responsables. Un administrador puede cambiarlo en **Usuarios → Puestos y permisos** o en **Recetas y métodos → Áreas de análisis**.'],
    ['¿Quién puede liberar un lote?', 'Las personas cuyo puesto tiene el permiso **Libera lotes** (por ejemplo, el Jefe de calidad) y los **administradores**. El sistema solo permite liberar cuando todos los análisis requeridos están capturados y cumplen.'],
  ] },
  { id: 'lotes', ico: 'flask-conical', titulo: 'Registro de lotes', preguntas: [
    ['¿Cómo registro un lote nuevo?', 'En **Lotes y liberación** pulsa **Nuevo lote** (o usa el botón flotante del matraz):\n- Elige la **fecha del lote** en el calendario.\n- Selecciona la **receta** (cada receta es para perro o para gato).\n- Marca los análisis que ya se realizaron y captura su resultado.\n- Pulsa **Registrar lote**.\nNo es necesario capturar todas las áreas a la vez: el lote queda **En proceso** hasta completar sus análisis.'],
    ['¿Cómo se genera el número de lote?', 'Con la fecha del lote en formato día, mes y año a dos dígitos. Por ejemplo, 27/09/2026 genera **270926**. Al editar un lote se conserva su número mientras no cambies la fecha.'],
    ['¿Qué pasa si registro un lote que ya existe?', 'El sistema te avisa si ya hay un lote con el mismo número y la misma receta, y te pregunta si deseas continuar.'],
    ['¿Quién puede cambiar la fecha o la receta de un lote?', 'Quien registró el lote o un administrador. Las demás personas solo capturan los análisis de sus áreas.'],
    ['¿Cómo encuentro un lote?', 'Usa el buscador (número de lote o folio del certificado) y los filtros por **receta**, **estado** y **periodo**. Los indicadores de colores de la parte superior también filtran por estado al pulsarlos.'],
    ['¿Qué significan los estados de un lote?', '- **En proceso:** faltan análisis por capturar o evaluar.\n- **Listo para liberar:** todos los análisis requeridos cumplen.\n- **No conforme:** al menos un análisis no cumple la especificación.\n- **Liberado:** se liberó y tiene folio de certificado con sus firmas.'],
    ['¿Puedo borrar un lote?', 'Solo un administrador. Se eliminan el lote, todos sus resultados y el registro de su liberación; la acción no se puede deshacer.'],
    ['¿Puedo exportar los lotes?', 'Sí. **Exportar** genera un archivo CSV compatible con Excel con los lotes y resultados que coinciden con los filtros.'],
  ] },
  { id: 'analisis', ico: 'list-checks', titulo: 'Captura de análisis', preguntas: [
    ['¿Qué áreas de análisis existen?', '- **Bromatológico:** proteínas, grasas y cenizas.\n- **Fisicoquímico:** pH y humedad.\n- **Microbiológico:** coliformes totales, Salmonella, hongos y levaduras, mesófilos aerobios.\n- **Sensorial:** olor, color, sabor y textura.\nLos administradores pueden agregar métodos o áreas nuevas.'],
    ['¿Cómo capturo los análisis de mi área?', 'Abre el lote con **Capturar análisis** (o **Editar y capturar**). En tu área:\n- Marca la casilla del método y escribe el resultado numérico, o\n- En los métodos de verificación pulsa **Cumple** o **No cumple**.\nCon **Marcar todo como cumple** registras de una vez todos los métodos de verificación del área. Pulsa **Guardar análisis**.'],
    ['¿Cómo se calcula Cumple o No cumple?', 'Cada resultado se compara con el criterio aplicable:\n- **Mínimo:** el resultado debe ser mayor o igual al límite.\n- **Máximo:** el resultado debe ser menor o igual al límite.\n- **Valor exacto:** el resultado debe ser igual.\n- **Rango:** el resultado debe estar dentro del intervalo.\n- **Verificación:** cumple si se marca «Cumple».\nMientras capturas ves una vista previa; el dictamen definitivo lo calcula la base de datos al guardar.'],
    ['¿Cómo se define el criterio de cada análisis?', 'Cada **método** tiene su criterio (por ejemplo, humedad máxima de 10 %) y las recetas a las que aplica. Si una receta necesita otro criterio, se **duplica el método** con el nuevo criterio y se asigna solo a esa receta.'],
    ['¿Puedo corregir un resultado?', 'Sí, mientras el lote no esté liberado. Si ya se liberó, un administrador debe **revertir la liberación** primero; la reversión queda registrada con su motivo.'],
    ['¿Puedo quitar un análisis ya capturado?', 'Solo un administrador puede quitar análisis ya capturados, para no perder información registrada.'],
  ] },
  { id: 'liberacion', ico: 'badge-check', titulo: 'Liberación y certificado', preguntas: [
    ['¿Cuándo se puede liberar un lote?', 'Cuando su estado es **Listo para liberar**: todos los métodos activos de las áreas activas que aplican a su receta están capturados y cumplen. Si algo falta o no cumple, el sistema lo indica y no permite liberar.'],
    ['¿Cómo libero un lote?', 'En la tarjeta del lote pulsa **Liberar lote**, revisa el resumen por área, elige quién **firma** el certificado (un Jefe de calidad y un Inspector de calidad), agrega observaciones si lo necesitas y pulsa **Liberar y emitir certificado**. El sistema asigna un **folio** (por ejemplo, CC-2026-0001) y descarga el certificado.'],
    ['¿Qué contiene el certificado de calidad?', 'Folio, producto, código de receta, especie, número y fecha del lote, fecha de liberación, los resultados de cada área con su especificación y dictamen, el dictamen final **Producto liberado**, las observaciones, las **firmas del Jefe de calidad y del Inspector de calidad** y quién liberó el lote.'],
    ['¿Quién elige las firmas del certificado?', 'El **Jefe de calidad** o un **administrador**, la primera vez que se emite el certificado (normalmente al liberar el lote). La elección queda guardada y ya no se vuelve a pedir; solo un administrador puede cambiarla con el botón **Firmas** del lote.'],
    ['¿Cómo vuelvo a descargar un certificado?', 'En la tarjeta del lote liberado pulsa **Certificado de calidad**. Puedes descargarlo las veces que lo necesites; el folio no cambia.'],
    ['¿Qué pasa si hay que corregir un lote liberado?', 'Un administrador pulsa **Revertir liberación** y escribe el motivo. El certificado anterior deja de ser válido, el lote vuelve a abrirse y, al liberarse de nuevo, recibe un folio nuevo. Todo queda en la bitácora de liberación.'],
  ] },
  { id: 'resultados', ico: 'line-chart', titulo: 'Resultados y gráficas', preguntas: [
    ['¿Cómo funcionan los filtros?', 'Periodo, receta, área y método se aplican al instante. Las gráficas, los indicadores, las medias y la tabla usan exactamente el mismo conjunto filtrado, y la tabla regresa a la primera página.'],
    ['¿Cómo se calcula la media?', 'Es la suma de los resultados dividida entre el número de resultados, solo con los registros que cumplen los filtros activos. Aparece como indicador y como línea punteada.'],
    ['¿Qué muestran las gráficas?', '- Métodos numéricos: la tendencia por fecha del lote con el color de la receta, la línea del límite (o los dos límites del rango) y la media. Los puntos rojos están fuera de especificación.\n- Métodos de verificación o cualitativos: el porcentaje de lotes que cumplen.'],
    ['¿Por qué no aparecen todas las etiquetas?', 'Con muchos puntos se etiquetan solo los representativos (además del mínimo, el máximo y los que están fuera de especificación) para que no se encimen. Todos los puntos permanecen en la gráfica.'],
    ['¿Cómo amplío o guardo una gráfica?', 'Toca o haz clic en la gráfica para verla en grande. Desde ahí puedes **guardarla como imagen**. Para cerrar, pulsa la X o la tecla Esc.'],
    ['¿Qué colores tienen las recetas?', '**Meat Festival** en naranja, **Chicken Chase** en turquesa y **Tasty Piggy** en verde. Las recetas nuevas toman el color que elija el administrador.'],
  ] },
  { id: 'catalogos', ico: 'book-open-check', titulo: 'Recetas y métodos', preguntas: [
    ['¿Cómo agrego una receta?', 'En **Recetas y métodos → Recetas** pulsa **Nueva receta**. El código se propone en formato **REC-04**; indica el nombre, la especie y el color característico.'],
    ['¿Cómo uso la misma receta para otra especie?', 'Pulsa el botón **Duplicar para otra especie** en la receta (por ejemplo, Meat Festival para gato). Se crea una receta nueva con su propio código, al que también se asignan los métodos de la receta original.'],
    ['¿Cómo uso un criterio distinto para una receta?', 'Duplica el método (botón **Duplicar** en **Métodos**), cambia el criterio y elige **Solo a las recetas que elija** con esa receta. Deja marcada **Quitar las recetas elegidas del método original** para que la receta solo se evalúe con el nuevo criterio.'],
    ['¿Si cambio un criterio se recalculan los dictámenes anteriores?', 'No. El nuevo criterio aplica a los resultados que se registren o editen después. Los dictámenes ya calculados se conservan.'],
    ['¿Cómo agrego un método?', 'En **Métodos** pulsa **Nuevo método** y elige su área, tipo de resultado (cuantitativo, verificación o cualitativo), criterio, unidad, referencia normativa y **a qué recetas aplica** (a todas o solo a las que elijas).'],
    ['¿Cómo hago que un método aplique solo a algunas recetas?', 'Edita el método y en **¿A qué recetas aplica?** elige **Solo a las recetas que elija** y marca las recetas. En las demás recetas el método no se exige para liberar.'],
    ['¿Cómo duplico un método?', 'Pulsa el botón **Duplicar** del método (por ejemplo, Humedad). Se abre con todos sus datos: cambia solo lo necesario, como el criterio o las recetas. Si dejas marcada la opción **Quitar las recetas elegidas del método original**, esas recetas dejan de exigir el método original para que no se evalúe dos veces.'],
  ] },
  { id: 'cuenta', ico: 'user', titulo: 'Usuarios y cuenta', preguntas: [
    ['¿Cómo doy acceso a una persona?', 'Un administrador entra a **Usuarios**, pulsa **Nuevo usuario**, busca a la persona por nombre o correo, la selecciona, indica su **puesto** y su **área** (elige uno de la lista o escribe uno nuevo), asigna su **rol** y pulsa **Dar acceso**. La persona debe tener una cuenta de Pet\'s Table; su fotografía se toma de las demás aplicaciones.'],
    ['¿Cómo cambio mi fotografía?', 'En **Mi perfil → Cambiar fotografía**. Un administrador también puede cambiarla desde **Usuarios → Editar**.'],
    ['¿Qué es la bitácora?', 'Es el registro automático de todos los cambios: lotes registrados, análisis capturados o corregidos, liberaciones y reversiones, firmas, recetas, métodos, especificaciones, usuarios y puestos. Muestra quién hizo cada acción, con su foto, y la fecha y hora. Pulsa un registro para ver el detalle de antes y después. Solo la consultan los administradores y no se puede modificar.'],
    ['¿Qué notificaciones recibo?', 'Según tu puesto, recibes un aviso cuando:\n- Se registra un lote y **te toca capturar** un área.\n- Otra persona **completa la captura** de un área que tú también capturas, o de un lote que registraste.\n- Un lote queda **listo para liberar** (si tu puesto libera lotes) o **no conforme**.\n- Se **libera** un lote que registraste o capturaste.\nLos avisos aparecen en la **campana** del encabezado, como notificación en tu celular o computadora y por **correo**.'],
    ['¿Cómo activo las notificaciones y los correos?', 'En **Mi perfil → Notificaciones y correos**:\n- Pulsa **Activar notificaciones** en cada dispositivo donde quieras recibirlas (en iPhone, primero instala la aplicación).\n- Activa o desactiva **Recibir los avisos por correo**.\n- Usa **Enviar notificación de prueba**, **Vista previa del correo** y **Enviarme un correo de prueba** para comprobar que te llegan.'],
    ['¿Cómo cambio mi contraseña?', 'En **Mi perfil → Cambiar contraseña**. El cambio aplica a todas las aplicaciones de Pet\'s Table que usan tu cuenta.'],
    ['¿Cómo desactivo a una persona?', 'En **Usuarios** pulsa el botón **Desactivar** de la persona (o cambia su estado en **Editar**). Su cuenta sigue funcionando en otras aplicaciones, pero ya no entra a este sistema. Siempre debe quedar al menos un administrador activo.'],
  ] },
  { id: 'problemas', ico: 'life-buoy', titulo: 'Solución de problemas', preguntas: [
    ['Aparece «Tu cuenta no tiene acceso»', 'Tu cuenta existe, pero no está dada de alta en este sistema o está inactiva. Pide a un administrador que te agregue en **Usuarios**.'],
    ['Aparece «Su sesión expiró»', 'Vuelve a iniciar sesión. Ocurre cuando el sistema estuvo abierto mucho tiempo sin uso.'],
    ['Aparece «Hay una nueva versión disponible»', 'Pulsa **Actualizar** para cargar la versión más reciente del sistema. No se pierde información guardada.'],
    ['No puedo liberar un lote', 'El mensaje indica qué análisis faltan o cuáles no cumplen. Completa la captura en las áreas pendientes; si un análisis no cumple, el lote no puede liberarse.'],
    ['¿Qué hago si aparece otro error?', 'Revisa tu conexión y que tu sesión siga activa. Si continúa, toma una captura del mensaje y repórtalo a un administrador del sistema.'],
  ] },
];

// ---------------- Instalación ----------------
const C = { navy: '#0B1E2D', navy2: '#1D4260', orange: '#F58020', orangeSoft: '#FFE7D1', turq: '#0FA3A6', bg: '#F4F7FA', line: '#D5DEE6', muted: '#8A99A8', txt: '#1F2D3A', white: '#FFFFFF' };
const URL_APP = location.host || 'liberacion-de-producto';
const appIcon = () => document.querySelector('img.app-icon')?.src || '';

const T = (x, y, s, size = 9, fill = C.txt, weight = 400, anchor = 'start') =>
  `<text x="${x}" y="${y}" font-family="Arial, Helvetica, sans-serif" font-size="${size}" font-weight="${weight}" fill="${fill}" text-anchor="${anchor}">${esc(s)}</text>`;
const anillo = (cx, cy, r = 13) => `<circle cx="${cx}" cy="${cy}" r="${r + 7}" fill="${C.orange}" opacity=".16"/><circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="${C.orange}" stroke-width="3"/>`;
const svg = (body) => `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="0 0 240 300" width="240" height="300">${body}</svg>`;
// Teléfono con pantalla (x 51–189, y 16–284)
const telefono = (pantalla) => svg(`<rect x="44" y="6" width="152" height="288" rx="26" fill="${C.navy}"/><rect x="51" y="16" width="138" height="268" rx="18" fill="${C.bg}"/>
  <rect x="100" y="21" width="40" height="7" rx="3.5" fill="${C.navy}"/>${pantalla}`);
// Página de Liberación simulada dentro de la pantalla
const paginaApp = (y0 = 50, y1 = 244) => `<rect x="58" y="${y0}" width="124" height="22" rx="6" fill="${C.white}"/>
  <rect x="64" y="${y0 + 5}" width="12" height="12" rx="3" fill="${C.orange}"/>${T(81, y0 + 14.5, 'Liberación', 8, C.navy, 700)}
  ${[0, 1, 2].map((i) => `<rect x="58" y="${y0 + 30 + i * 34}" width="124" height="27" rx="6" fill="${C.white}"/><rect x="64" y="${y0 + 37 + i * 34}" width="13" height="13" rx="4" fill="${[C.turq, C.orange, '#15985C'][i]}" opacity=".85"/>
    <rect x="82" y="${y0 + 38 + i * 34}" width="${70 - i * 12}" height="4" rx="2" fill="${C.line}"/><rect x="82" y="${y0 + 46 + i * 34}" width="${44 + i * 8}" height="4" rx="2" fill="${C.line}"/>`).join('')}
  <rect x="58" y="${y0 + 134}" width="124" height="${Math.max(0, y1 - y0 - 140)}" rx="6" fill="${C.white}"/>`;
const pantallaInicio = (resaltar = true) => `${[0, 1, 2, 3].map((r) => [0, 1, 2, 3].map((c) => (r === 1 && c === 2 ? '' : `<rect x="${62 + c * 31}" y="${46 + r * 42}" width="22" height="22" rx="6" fill="${['#C9D6E2', '#B9E5E5', '#F8D8BC', '#D4D1F0'][(r + c) % 4]}"/>`)).join('')).join('')}
  <image x="124" y="88" width="22" height="22" href="${appIcon()}" xlink:href="${appIcon()}" preserveAspectRatio="xMidYMid slice"/>
  ${T(135, 119, 'Liberación', 6.5, C.txt, 700, 'middle')}${resaltar ? anillo(135, 99, 16) : ''}
  <rect x="64" y="252" width="112" height="22" rx="11" fill="${C.white}" opacity=".85"/>`;
const hojaMenu = (y, filas, marcada, titulo = '') => `<rect x="51" y="16" width="138" height="268" rx="18" fill="${C.navy}" opacity=".35"/>
  <rect x="55" y="${y}" width="130" height="${284 - y - 6}" rx="12" fill="${C.white}"/>${titulo ? T(120, y + 16, titulo, 8, C.muted, 700, 'middle') : ''}
  ${filas.map((f, i) => {
    const yy = y + (titulo ? 26 : 10) + i * 24, on = i === marcada;
    return `${on ? `<rect x="59" y="${yy - 2}" width="122" height="22" rx="6" fill="${C.orangeSoft}" stroke="${C.orange}" stroke-width="1.6"/>` : `<line x1="63" y1="${yy + 21}" x2="177" y2="${yy + 21}" stroke="${C.line}"/>`}
      ${T(66, yy + 13, f, 7.4, on ? C.navy : C.txt, on ? 700 : 400)}<rect x="164" y="${yy + 4}" width="11" height="11" rx="3" fill="none" stroke="${on ? C.orange : C.muted}" stroke-width="1.4"/>`;
  }).join('')}`;
// Monitor con navegador (pantalla x 16–224, y 56–192)
const monitor = (contenido) => svg(`<rect x="10" y="48" width="220" height="152" rx="9" fill="${C.navy}"/><rect x="16" y="54" width="208" height="138" rx="4" fill="${C.bg}"/>
  <rect x="106" y="200" width="28" height="26" fill="${C.navy2}"/><rect x="78" y="226" width="84" height="7" rx="3.5" fill="${C.navy}"/>${contenido}`);
const barraNavegador = (instalar = false) => `<rect x="16" y="54" width="208" height="13" fill="#E3E9EF"/><rect x="22" y="57" width="46" height="10" rx="3" fill="${C.white}"/>${T(27, 64.5, 'Liberación', 5.5, C.txt, 700)}
  <rect x="16" y="67" width="208" height="15" fill="${C.white}"/><rect x="40" y="70" width="160" height="10" rx="5" fill="${C.bg}"/>${T(48, 77.4, URL_APP, 5.6, C.muted)}
  <g transform="translate(184 70.5)"><rect x="0" y="0" width="11" height="8" rx="1.5" fill="none" stroke="${C.navy}" stroke-width="1.1"/><path d="M5.5 1.6v4M3.7 4l1.8 1.8L7.3 4" stroke="${C.navy}" stroke-width="1.1" fill="none"/></g>
  ${T(208, 77.6, '⋮', 8, C.txt, 700)}${instalar ? anillo(189.5, 74.5, 9) : ''}`;
const paginaPC = (y0 = 86) => `<rect x="22" y="${y0}" width="38" height="${188 - y0}" rx="3" fill="${C.navy}"/><rect x="27" y="${y0 + 6}" width="10" height="10" rx="2.5" fill="${C.orange}"/>
  ${[0, 1, 2, 3].map((i) => `<rect x="27" y="${y0 + 24 + i * 11}" width="26" height="4" rx="2" fill="#2E4A63"/>`).join('')}
  ${[0, 1, 2, 3].map((i) => `<rect x="${66 + i * 38}" y="${y0 + 4}" width="34" height="22" rx="3" fill="${C.white}"/><rect x="${70 + i * 38}" y="${y0 + 9}" width="9" height="9" rx="2.5" fill="${[C.turq, C.orange, '#15985C', '#C42F37'][i]}" opacity=".85"/>`).join('')}
  <rect x="66" y="${y0 + 32}" width="148" height="${188 - y0 - 36}" rx="3" fill="${C.white}"/>`;

const INSTALAR = [
  { id: 'android', ico: 'smartphone', titulo: 'Celular Android', sub: 'Google Chrome', pasos: [
    ['Abre el menú', 'Entra a la aplicación desde **Chrome** y toca el botón de menú **⋮** en la esquina superior derecha.',
      () => telefono(`<rect x="51" y="30" width="138" height="16" fill="${C.white}"/><rect x="58" y="33" width="104" height="10" rx="5" fill="${C.bg}"/>${T(64, 40.5, URL_APP, 5.4, C.muted)}${T(176, 41.5, '⋮', 11, C.txt, 700, 'middle')}${anillo(176, 38, 9)}${paginaApp(52)}`)],
    ['Elige «Instalar aplicación»', 'En el menú toca **Instalar aplicación** (en algunos teléfonos dice **Agregar a pantalla principal**).',
      () => telefono(`${paginaApp(52)}<rect x="96" y="30" width="90" height="150" rx="8" fill="${C.white}" stroke="${C.line}"/>
        ${['Nueva pestaña', 'Historial', 'Descargas', 'Instalar aplicación', 'Compartir…', 'Configuración'].map((f, i) => (i === 3
          ? `<rect x="99" y="${36 + i * 23}" width="84" height="19" rx="5" fill="${C.orangeSoft}" stroke="${C.orange}" stroke-width="1.5"/>${T(104, 49 + i * 23, f, 7.4, C.navy, 700)}`
          : T(104, 49 + i * 23, f, 7.4))).join('')}`)],
    ['Confirma', 'Toca **Instalar** en la ventana de confirmación. El teléfono crea el ícono de **Liberación**.',
      () => telefono(`${paginaApp(52)}<rect x="51" y="16" width="138" height="268" rx="18" fill="${C.navy}" opacity=".45"/>
        <rect x="60" y="104" width="120" height="92" rx="12" fill="${C.white}"/>${T(70, 122, '¿Instalar la app?', 9, C.navy, 700)}
        <image x="70" y="132" width="22" height="22" href="${appIcon()}" xlink:href="${appIcon()}"/>${T(98, 141, 'Liberación', 8, C.txt, 700)}${T(98, 151, URL_APP.slice(0, 22) + '…', 5.4, C.muted)}
        ${T(110, 184, 'Cancelar', 8, C.turq, 700, 'middle')}<rect x="132" y="173" width="40" height="17" rx="8.5" fill="${C.turq}"/>${T(152, 184.5, 'Instalar', 8, C.white, 700, 'middle')}${anillo(152, 181.5, 12)}`)],
    ['¡Listo!', 'Abre **Liberación** desde el ícono de tu pantalla de inicio, como cualquier otra aplicación.',
      () => telefono(pantallaInicio())],
  ] },
  { id: 'ios', ico: 'tablet-smartphone', titulo: 'iPhone o iPad', sub: 'Safari', pasos: [
    ['Toca «Compartir»', 'Abre la aplicación en **Safari** y toca el botón **Compartir** (el cuadro con la flecha hacia arriba) en la barra inferior.',
      () => telefono(`${paginaApp(36, 238)}<rect x="51" y="244" width="138" height="40" rx="0" fill="${C.white}"/><rect x="62" y="248" width="116" height="10" rx="5" fill="${C.bg}"/>${T(120, 255.5, URL_APP, 5.2, C.muted, 400, 'middle')}
        ${[72, 96, 144, 168].map((x) => `<rect x="${x - 4}" y="265" width="8" height="8" rx="2" fill="none" stroke="${C.turq}" stroke-width="1.3"/>`).join('')}
        <g transform="translate(114 262)"><rect x="0" y="4" width="12" height="11" rx="2" fill="none" stroke="#1A73E8" stroke-width="1.5"/><path d="M6 0v9M3 3l3-3 3 3" fill="none" stroke="#1A73E8" stroke-width="1.5"/></g>${anillo(120, 270, 11)}`)],
    ['«Agregar a pantalla de inicio»', 'Desliza las opciones hacia arriba y toca **Agregar a pantalla de inicio**.',
      () => telefono(`${paginaApp(36)}${hojaMenu(110, ['Copiar', 'Agregar a favoritos', 'Agregar a pantalla de inicio', 'Buscar en la página', 'Imprimir'], 2, URL_APP.slice(0, 24))}`)],
    ['Toca «Agregar»', 'Confirma el nombre **Liberación** y toca **Agregar** en la esquina superior derecha.',
      () => telefono(`<rect x="51" y="30" width="138" height="22" fill="${C.white}"/>${T(60, 44.5, 'Cancelar', 7.5, '#1A73E8')}${T(120, 44.5, 'Agregar a inicio', 7.5, C.navy, 700, 'middle')}${T(181, 44.5, 'Agregar', 7.5, '#1A73E8', 700, 'end')}${anillo(168, 41.5, 11)}
        <rect x="58" y="62" width="124" height="44" rx="8" fill="${C.white}"/><image x="66" y="70" width="28" height="28" href="${appIcon()}" xlink:href="${appIcon()}"/>
        ${T(102, 82, 'Liberación', 9, C.txt, 700)}<line x1="102" y1="86" x2="174" y2="86" stroke="${C.line}"/>${T(102, 97, URL_APP.slice(0, 21) + '…', 5.4, C.muted)}
        ${T(60, 122, 'Se agregará un ícono a tu pantalla de inicio', 6.4, C.muted)}${T(60, 131, 'para abrir rápidamente este sitio.', 6.4, C.muted)}`)],
    ['¡Listo!', 'Abre **Liberación** desde el nuevo ícono. Se abre en pantalla completa, como una aplicación.',
      () => telefono(pantallaInicio())],
  ] },
  { id: 'pc', ico: 'monitor', titulo: 'Computadora', sub: 'Chrome o Microsoft Edge', pasos: [
    ['Busca el ícono de instalar', 'Abre la aplicación en **Chrome** o **Edge** y haz clic en el ícono de **Instalar** de la barra de direcciones (una pantalla con una flecha).',
      () => monitor(`${barraNavegador(true)}${paginaPC()}`)],
    ['Confirma la instalación', 'Haz clic en **Instalar**. En Edge también puedes usar el menú **⋯ → Aplicaciones → Instalar este sitio como aplicación**.',
      () => monitor(`${barraNavegador()}${paginaPC()}<rect x="112" y="84" width="104" height="58" rx="7" fill="${C.white}" stroke="${C.line}"/>
        ${T(120, 98, '¿Instalar la aplicación?', 7, C.navy, 700)}<image x="120" y="104" width="14" height="14" href="${appIcon()}" xlink:href="${appIcon()}"/>${T(139, 114, 'Liberación', 6.5, C.txt, 700)}
        <rect x="146" y="124" width="30" height="12" rx="6" fill="${C.white}" stroke="${C.line}"/>${T(161, 132.4, 'Cancelar', 5.5, C.txt, 400, 'middle')}
        <rect x="180" y="124" width="30" height="12" rx="6" fill="#1A73E8"/>${T(195, 132.4, 'Instalar', 5.5, C.white, 700, 'middle')}${anillo(195, 130, 10)}`)],
    ['Se abre en su propia ventana', 'Liberación se abre como aplicación, sin barra de direcciones. Usa el botón de **pantalla completa** si lo prefieres.',
      () => monitor(`<rect x="16" y="54" width="208" height="14" fill="${C.navy}"/><image x="20" y="56" width="10" height="10" href="${appIcon()}" xlink:href="${appIcon()}"/>${T(34, 63.8, 'Liberación', 6, C.white, 700)}
        ${T(214, 64, '— ▢ ✕', 6, C.white, 400, 'end')}${paginaPC(72)}`)],
    ['Ánclala para tenerla a la mano', 'Haz clic derecho en el ícono de la barra de tareas y elige **Anclar a la barra de tareas**. También aparece en el menú Inicio.',
      () => monitor(`${paginaPC(60)}<rect x="16" y="178" width="208" height="14" fill="${C.navy2}"/>
        ${[0, 1, 2, 4].map((i) => `<rect x="${78 + i * 18}" y="181" width="9" height="9" rx="2" fill="#7F96AA"/>`).join('')}
        <image x="148" y="180" width="11" height="11" href="${appIcon()}" xlink:href="${appIcon()}"/>${anillo(153.5, 185.5, 9)}
        <rect x="120" y="140" width="96" height="34" rx="5" fill="${C.white}" stroke="${C.line}"/>${T(127, 153, 'Liberación', 6.5, C.txt, 700)}
        <rect x="123" y="157" width="90" height="13" rx="3" fill="${C.orangeSoft}"/>${T(127, 166, 'Anclar a la barra de tareas', 6, C.navy, 700)}`)],
  ] },
];

// ---------------- Vista ----------------
let root;
const norm = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
const plano = (s) => s.replace(/\*\*/g, '');
function htmlRespuesta(txt) {
  const fmt = (s) => esc(s).replace(/\*\*(.+?)\*\*/g, '<b>$1</b>');
  let html = '', lista = [];
  const cerrar = () => { if (lista.length) { html += `<ul>${lista.map((l) => `<li>${fmt(l)}</li>`).join('')}</ul>`; lista = []; } };
  txt.split('\n').forEach((l) => { if (l.startsWith('- ')) lista.push(l.slice(2)); else { cerrar(); html += `<p>${fmt(l)}</p>`; } });
  cerrar();
  return html;
}
const totalPreguntas = TEMAS.reduce((s, t) => s + t.preguntas.length, 0);

export default {
  async render(el) {
    root = el;
    el.innerHTML = `
      <section class="faq-hero">
        <div class="faq-hero-txt">
          <span class="eyebrow">Centro de ayuda</span>
          <h1>Preguntas frecuentes</h1>
          <p>Todo lo que necesitas para registrar lotes, capturar análisis, liberar producto, emitir certificados e instalar la aplicación.</p>
          <div class="faq-search">${icon('search')}<input type="search" id="faq-q" placeholder="Escribe tu duda, por ejemplo: «no cumple» o «instalar»" aria-label="Buscar en preguntas frecuentes" autocomplete="off"></div>
          <div class="faq-meta"><span>${icon('message-circle-question')} ${totalPreguntas} respuestas</span><span>${icon('layers')} ${TEMAS.length + 1} temas</span><span>${icon('info')} Versión ${esc(APP_VERSION)}</span></div>
        </div>
        <div class="faq-guia">
          <span class="faq-guia-ico">${icon('book-open-text')}</span>
          <b>Guía de usuario en PDF</b>
          <span>Cómo operar todo el sistema, desde la instalación y el inicio de sesión hasta la liberación y el certificado. Lista para imprimir o compartir.</span>
          <button class="btn c-red" id="faq-pdf">${icon('download')} Descargar guía</button>
        </div>
      </section>
      <nav class="faq-chips" aria-label="Temas">
        ${TEMAS.map((t) => `<a href="#faq-${t.id}" class="faq-chip" data-sec="${t.id}">${icon(t.ico)} ${esc(t.titulo)}</a>`).join('')}
        <a href="#faq-instalar" class="faq-chip" data-sec="instalar">${icon('download')} Instalar la aplicación</a>
      </nav>
      <div class="faq-body">
        ${TEMAS.map((t) => `<section class="faq-sec" id="faq-${t.id}">
          <h2><span class="faq-sec-ico">${icon(t.ico)}</span>${esc(t.titulo)}<small>${t.preguntas.length} preguntas</small></h2>
          <div class="faq-list">${t.preguntas.map(([q, a]) => `<details class="faq-item" data-texto="${esc(norm(`${q} ${plano(a)}`))}">
            <summary><span>${esc(q)}</span>${icon('chevron-down')}</summary><div class="faq-a">${htmlRespuesta(a)}</div></details>`).join('')}</div>
        </section>`).join('')}
        <p class="faq-vacio hidden" id="faq-vacio">${icon('search-x')} No encontramos preguntas con esa búsqueda. Prueba con otras palabras o consulta a un administrador.</p>
        <section class="faq-sec faq-instalar" id="faq-instalar" data-texto="${esc(norm('instalar aplicacion celular android iphone ipad computadora chrome safari edge pantalla de inicio'))}">
          <h2><span class="faq-sec-ico">${icon('download')}</span>Instalar la aplicación<small>Paso a paso</small></h2>
          <p class="faq-intro">Instalada, Liberación se abre desde su propio ícono, y en pantalla completa. No ocupa espacio como una app de tienda y se actualiza sola.</p>
          <div class="faq-tabs" role="tablist">${INSTALAR.map((p, i) => `<button role="tab" class="faq-tab ${i === 0 ? 'on' : ''}" data-plat="${p.id}" aria-selected="${i === 0}">${icon(p.ico)}<span><b>${esc(p.titulo)}</b><small>${esc(p.sub)}</small></span></button>`).join('')}</div>
          ${INSTALAR.map((p, i) => `<div class="faq-pasos ${i === 0 ? '' : 'hidden'}" data-pasos="${p.id}">${p.pasos.map(([tit, txt, dib], k) => `
            <article class="faq-paso"><div class="faq-ilus">${dib()}</div>
              <div class="faq-paso-txt"><span class="faq-num">${k + 1}</span><b>${esc(tit)}</b>${htmlRespuesta(txt)}</div></article>`).join('')}</div>`).join('')}
        </section>
        <section class="faq-ayuda">${icon('life-buoy')}<div><b>¿No encontraste tu respuesta?</b><span>Comunícate con un administrador del sistema en Calidad de producto. Si tu duda es sobre un análisis o un lote, consulta al Jefe de calidad.</span></div></section>
      </div>`;
    refreshIcons();
    const q = el.querySelector('#faq-q');
    q.addEventListener('input', () => filtrar(q.value));
    el.querySelectorAll('.faq-tab').forEach((b) => b.addEventListener('click', () => {
      el.querySelectorAll('.faq-tab').forEach((x) => { x.classList.toggle('on', x === b); x.setAttribute('aria-selected', String(x === b)); });
      el.querySelectorAll('[data-pasos]').forEach((x) => x.classList.toggle('hidden', x.dataset.pasos !== b.dataset.plat));
    }));
    el.querySelectorAll('.faq-chip').forEach((a) => a.addEventListener('click', (e) => {
      e.preventDefault();
      el.querySelector(`#faq-${a.dataset.sec}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }));
    // Pestaña según el dispositivo actual
    const ua = navigator.userAgent;
    const plat = /iphone|ipad|ipod/i.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1) ? 'ios' : /android/i.test(ua) ? 'android' : 'pc';
    el.querySelector(`.faq-tab[data-plat="${plat}"]`)?.click();
    el.querySelector('#faq-pdf').addEventListener('click', async (e) => {
      const b = e.currentTarget;
      b.disabled = true; b.innerHTML = `${icon('loader')} Generando…`; refreshIcons();
      try { await generarGuia(); } catch (err) { console.error(err); toast(errMsg(err), 'error'); }
      if (root) { b.disabled = false; b.innerHTML = `${icon('download')} Descargar guía`; refreshIcons(); }
    });
  },
  destroy() { root = null; },
};

function filtrar(texto) {
  const t = norm(texto.trim());
  let visibles = 0;
  root.querySelectorAll('.faq-sec').forEach((sec) => {
    if (sec.classList.contains('faq-instalar')) { const ok = !t || sec.dataset.texto.includes(t); sec.classList.toggle('hidden', !ok); visibles += ok; return; }
    let n = 0;
    sec.querySelectorAll('.faq-item').forEach((it) => {
      const ok = !t || it.dataset.texto.includes(t);
      it.classList.toggle('hidden', !ok);
      it.open = !!t && ok;
      n += ok;
    });
    sec.classList.toggle('hidden', !n);
    visibles += n;
  });
  root.querySelector('#faq-vacio').classList.toggle('hidden', visibles > 0);
}

// ---------------- Guía en PDF ----------------
async function svgAPng(svgTxt, escala = 3) {
  const img = new Image();
  img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svgTxt)}`;
  await img.decode();
  const c = document.createElement('canvas');
  c.width = 240 * escala; c.height = 300 * escala;
  const g = c.getContext('2d');
  g.drawImage(img, 0, 0, c.width, c.height);
  return c.toDataURL('image/png');
}
async function imagenAPng(src) {
  if (!src) return null;
  const img = new Image(); img.src = src; await img.decode();
  const c = document.createElement('canvas'); c.width = img.naturalWidth; c.height = img.naturalHeight;
  c.getContext('2d').drawImage(img, 0, 0);
  return c.toDataURL('image/png');
}

// Las fuentes estándar del PDF solo tienen Latin-1: se sustituyen los símbolos que no existen

async function generarGuia() {
  const jsPDF = await cargarJsPDF();
  const doc = new jsPDF({ unit: 'mm', format: 'letter', orientation: 'portrait' });
  const W = 215.9, H = 279.4, M = 20, CW = W - 2 * M;
  const icono = await imagenAPng(appIcon()).catch(() => null);
  const ilus = await Promise.all(INSTALAR.map((p) => Promise.all(p.pasos.map(([, , dib]) => svgAPng(dib())))));
  const hoy = new Date().toLocaleDateString('es-MX', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'America/Mexico_City' });
  const color = (k, tipo = 'text') => { const c = RGB[k]; if (tipo === 'text') doc.setTextColor(...c); else if (tipo === 'fill') doc.setFillColor(...c); else doc.setDrawColor(...c); };
  const fuente = (estilo, size) => { doc.setFont('helvetica', estilo); doc.setFontSize(size); };

  // ---- Portada ----
  color('navy', 'fill'); doc.rect(0, 0, W, H, 'F');
  color('navy2', 'fill'); doc.circle(W + 10, -10, 95, 'F');
  color('orange', 'fill'); doc.rect(0, H - 14, W, 14, 'F'); doc.rect(M, 112, 34, 2.2, 'F');
  doc.addImage(LOGO, 'PNG', M, 26, 34, 27, 'logo', 'FAST');
  if (icono) doc.addImage(icono, 'PNG', W - M - 26, 27, 26, 26, 'icono', 'FAST');
  fuente('bold', 11); doc.setTextColor(255, 186, 120); doc.text('CALIDAD DE PRODUCTO', M, 96, { charSpace: 0.8 });
  fuente('bold', 34); doc.setTextColor(255, 255, 255); doc.text('Liberación de producto', M, 108);
  fuente('bold', 20); doc.text('Guía de usuario', M, 128);
  fuente('normal', 12); doc.setTextColor(200, 214, 226);
  doc.text(doc.splitTextToSize('Cómo operar todo el sistema: instalación, inicio de sesión, registro de lotes, captura de análisis, liberación, certificados de calidad, gráficas y administración.', 120), M, 140);
  const resumen = [['Temas', String(TEMAS.length + 1)], ['Preguntas', String(totalPreguntas)], ['Plataformas', '3']];
  resumen.forEach(([k, v], i) => {
    const x = M + i * 44;
    doc.setDrawColor(60, 90, 115); doc.setLineWidth(0.3); doc.roundedRect(x, 168, 38, 24, 3, 3, 'S');
    fuente('bold', 18); doc.setTextColor(255, 255, 255); doc.text(v, x + 5, 181);
    fuente('normal', 8.5); doc.setTextColor(170, 190, 206); doc.text(k, x + 5, 188);
  });
  fuente('normal', 9); doc.setTextColor(170, 190, 206);
  doc.text([`Versión de la aplicación ${APP_VERSION}`, `Actualizada el ${hoy}`, URL_APP], M, 236);
  fuente('bold', 9); doc.setTextColor(255, 255, 255); doc.text("Pet's Table S.A. de C.V.", M, H - 5.5);
  fuente('normal', 9); doc.text('Uso interno', W - M, H - 5.5, { align: 'right' });

  // ---- Índice (se llena al final) ----
  doc.addPage(); const pagIndice = 2;
  const indice = [];

  // ---- Utilidades de página ----
  let y = 0;
  const nuevaPagina = () => { doc.addPage(); y = 30; };
  const espacio = (h) => { if (y + h > H - 22) nuevaPagina(); };
  const encabezadoSeccion = (titulo, sub) => {
    espacio(30);
    if (y > 40) y += 4;
    indice.push([titulo, doc.getNumberOfPages()]);
    color('orange', 'fill'); doc.roundedRect(M, y, 3, 13, 1, 1, 'F');
    fuente('bold', 17); color('navy'); doc.text(titulo, M + 7, y + 6.5);
    fuente('normal', 9); color('muted'); doc.text(sub, M + 7, y + 12.2);
    y += 20;
  };
  // Párrafo con **negritas** en línea
  const parrafo = (txt, x, ancho, size = 9.6, sangria = 0) => {
    fuente('normal', size);
    const piezas = pdfTxt(txt).split(/(\*\*.+?\*\*)/).filter(Boolean).flatMap((p) => {
      const b = p.startsWith('**'); return (b ? p.slice(2, -2) : p).split(/(\s+)/).filter((w) => w !== '').map((w) => ({ w, b }));
    });
    const lh = size * 0.47;
    let cx = x + sangria;
    const lineas = [[]];
    piezas.forEach((p) => {
      fuente(p.b ? 'bold' : 'normal', size);
      const w = doc.getTextWidth(p.w);
      if (cx + w > x + ancho && p.w.trim() && lineas[lineas.length - 1].length) { lineas.push([]); cx = x + sangria; }
      if (!lineas[lineas.length - 1].length && !p.w.trim()) return;
      lineas[lineas.length - 1].push({ ...p, x: cx }); cx += w;
    });
    lineas.forEach((l) => {
      espacio(lh + 1);
      l.forEach((p) => { fuente(p.b ? 'bold' : 'normal', size); color(p.b ? 'navy' : 'txt'); doc.text(p.w, p.x, y); });
      y += lh;
    });
  };
  const respuesta = (txt, x, ancho) => {
    txt.split('\n').forEach((l) => {
      if (l.startsWith('- ')) {
        espacio(6);
        color('orange', 'fill'); doc.circle(x + 1.6, y - 1.15, 0.85, 'F');
        parrafo(l.slice(2), x + 5, ancho - 5);
      } else parrafo(l, x, ancho);
      y += 1.6;
    });
  };

  // ---- Preguntas frecuentes ----
  nuevaPagina();
  let n = 0;
  TEMAS.forEach((t) => {
    encabezadoSeccion(t.titulo, `${t.preguntas.length} preguntas frecuentes`);
    t.preguntas.forEach(([q, a]) => {
      n++;
      fuente('bold', 10.8);
      const lq = doc.splitTextToSize(pdfTxt(q), CW - 12);
      espacio(lq.length * 5.2 + 14);
      color('orangeSoft', 'fill'); doc.roundedRect(M, y - 4.6, 9, 6.6, 1.4, 1.4, 'F');
      fuente('bold', 8); color('orange'); doc.text(String(n).padStart(2, '0'), M + 4.5, y - 0.15, { align: 'center' });
      fuente('bold', 10.8); color('navy'); doc.text(lq, M + 12, y);
      y += lq.length * 5.2 + 0.8;
      respuesta(a, M + 12, CW - 12);
      y += 2.5;
      color('line', 'draw'); doc.setLineWidth(0.2); doc.line(M + 12, y - 1.5, W - M, y - 1.5);
      y += 3.5;
    });
  });

  // ---- Tutorial de instalación ----
  INSTALAR.forEach((p, ip) => {
    nuevaPagina();
    encabezadoSeccion({ android: 'Instalar en celular Android', ios: 'Instalar en iPhone o iPad', pc: 'Instalar en computadora' }[p.id],
      `Paso a paso con ${p.sub} · se abre desde su propio ícono`);
    const colW = (CW - 8) / 2, imgH = 66, imgW = imgH * 0.8;
    p.pasos.forEach(([tit, txt], k) => {
      const col = k % 2, fila = Math.floor(k / 2);
      const x = M + col * (colW + 8), y0 = y + fila * 104;
      color('bg', 'fill'); color('line', 'draw'); doc.setLineWidth(0.25); doc.roundedRect(x, y0, colW, 100, 3, 3, 'FD');
      doc.addImage(ilus[ip][k], 'PNG', x + (colW - imgW) / 2, y0 + 4, imgW, imgH, `ilus-${ip}-${k}`, 'FAST');
      color('orange', 'fill'); doc.circle(x + 8, y0 + imgH + 11, 4, 'F');
      fuente('bold', 9.5); doc.setTextColor(255, 255, 255); doc.text(String(k + 1), x + 8, y0 + imgH + 12.4, { align: 'center' });
      fuente('bold', 10.5); color('navy'); doc.text(pdfTxt(tit), x + 15, y0 + imgH + 12.4);
      const yy = y; y = y0 + imgH + 19;
      parrafo(txt, x + 5, colW - 10, 8.6);
      y = yy;
    });
  });

  // ---- Índice ----
  doc.setPage(pagIndice);
  y = 30;
  fuente('bold', 22); color('navy'); doc.text('Contenido', M, y + 4);
  color('orange', 'fill'); doc.rect(M, y + 8, 22, 1.6, 'F');
  y += 22;
  indice.forEach(([titulo, pag], i) => {
    color(i % 2 ? 'bg' : 'turqSoft', 'fill'); doc.roundedRect(M, y - 5.5, CW, 10, 2, 2, 'F');
    fuente('bold', 10.5); color('navy'); doc.text(`${String(i + 1).padStart(2, '0')}   ${titulo}`, M + 4, y + 1);
    fuente('bold', 10.5); color('orange'); doc.text(String(pag), W - M - 4, y + 1, { align: 'right' });
    y += 12.5;
  });
  y += 6;
  color('orangeSoft', 'fill'); doc.roundedRect(M, y, CW, 30, 3, 3, 'F');
  y += 8; fuente('bold', 10.5); color('navy'); doc.text('Cómo usar esta guía', M + 6, y); y += 6;
  parrafo('Consulta el tema que necesites en el índice. Las preguntas están numeradas para ubicarlas rápido y las palabras en **negritas** corresponden a botones o secciones de la aplicación. También puedes consultar estas respuestas en la aplicación, en **Preguntas frecuentes**.', M + 6, CW - 12, 9.2);

  // ---- Encabezado y pie en cada página (excepto la portada) ----
  const total = doc.getNumberOfPages();
  for (let i = 2; i <= total; i++) {
    doc.setPage(i);
    color('navy', 'fill'); doc.rect(0, 0, W, 12, 'F');
    color('orange', 'fill'); doc.rect(0, 12, W, 0.9, 'F');
    doc.addImage(LOGO, 'PNG', M, 2.4, 9, 7.2, 'logo', 'FAST');
    fuente('bold', 9); doc.setTextColor(255, 255, 255); doc.text('Liberación de producto · Guía de usuario', M + 12, 7.8);
    fuente('normal', 8); doc.setTextColor(170, 190, 206); doc.text('Calidad de producto', W - M, 7.8, { align: 'right' });
    color('line', 'draw'); doc.setLineWidth(0.2); doc.line(M, H - 14, W - M, H - 14);
    fuente('normal', 8); color('muted'); doc.text(`Pet's Table S.A. de C.V. · Versión ${APP_VERSION}`, M, H - 9);
    doc.text(`Página ${i} de ${total}`, W - M, H - 9, { align: 'right' });
  }
  doc.setProperties({ title: 'Liberación de producto · Guía de usuario', subject: 'Preguntas frecuentes e instalación', author: "Pet's Table S.A. de C.V.", creator: 'Liberación' });
  doc.save(`Guia-Liberacion-de-producto-v${APP_VERSION}.pdf`);
  toast('Guía descargada.', 'success');
}
