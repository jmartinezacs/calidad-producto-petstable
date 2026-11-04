# Liberación de producto · Pet's Table

Sistema de Calidad de producto de Pet's Table S.A. de C.V. (antes «Análisis Bromatológicos»): un lote se libera cuando cumple sus análisis bromatológicos, fisicoquímicos, microbiológicos y sensoriales, y se emite su certificado de calidad.

## Versión 9.1

- **Campana dorada** como botón flotante sobre «Nuevo lote» (ya no en el encabezado), con el panel de avisos a su lado.
- **Nuevo lote** rediseñado: pasos numerados, tarjeta de la receta elegida con sus análisis por área, barra de avance de la captura, áreas con encabezado de color y campos con su unidad.
- **Lotes:** resumen en recuadros centrados por estado (filtran al tocarlos), búsqueda más ancha, áreas del lote en cuadrícula simétrica de dos columnas, perro (círculo azul) y gato (gato negro, círculo rosa) con colores distintos, botón Exportar verde de Google Sheets.
- **Métodos:** tipos «Cuantitativo», «Verificación» y «Cualitativo»; «A todas las recetas»; selector de recetas en tarjetas, sin la especie.
- **Áreas de análisis:** puestos en etiquetas de color fuerte con letra blanca.

## Versión 9.0

- **Notificaciones y correos:** campana en el encabezado, notificaciones push en celular y computadora, y correos (misma cuenta de Gmail que Servicio médico). Avisan cuando te toca capturar un área de un lote nuevo, cuando alguien más completa un área que también capturas, cuando un lote queda listo para liberar o no conforme y cuando se libera. En Mi perfil: activar en el dispositivo, recibir o no correos, y botones de notificación de prueba, vista previa del correo y correo de prueba.
- **Gráficas** con un diseño más cuidado: degradados, tarjetas con ícono de color, recuadro de información y etiquetas renovados; el porcentaje de cumplimiento ahora es una **dona** con la cifra al centro.
- **Perro y gato** con imágenes 3D realistas en lugar del ícono naranja.
- **Botones de colores** según su acción (certificado, liberar, capturar, firmas, revertir, exportar…).
- **Bitácora** con tabla, encabezados y texto centrados. **Mi perfil** con seis recuadros (se agregan área y correo).
- **Recetas y métodos:** se quitó «Especificaciones por receta» (un criterio distinto se logra duplicando el método); en Áreas de análisis cada puesto tiene su propio color.
- Se borraron los lotes de prueba; el siguiente certificado es CC-2026-0001.

Base de datos: migración `supabase/migrations/20261104_brom_v9_notificaciones.sql` y Edge Function `supabase/functions/notificar_brom`.

## Versión 8.0

- **Puestos y permisos:** lo que cada persona captura, si libera lotes y si firma el certificado depende de su puesto. Roles: solo Usuario y Administrador.
- **Usuarios** con el diseño de Servicio médico: foto, correo, puesto y área, rol, último acceso, estado; puesto y área se eligen de la lista o se escriben nuevos.
- **Bitácora de cambios** (administradores): quién registró, capturó, liberó, firmó o modificó qué, con su foto y el detalle de antes y después.
- **Certificado de calidad** ejecutivo: encabezado verde azulado con el logotipo naranja, tablas centradas y firmas del Jefe de calidad y de un Inspector de calidad (se eligen una vez y quedan guardadas).
- **Métodos** que aplican a todas las recetas o solo a algunas, y botón para duplicar un método.
- **Recetas** para perro o gato (con ícono), vista más sobria; en las gráficas solo el nombre de la receta.
- Panel: KPIs con ícono y barra del mismo color, pastel sin bordes blancos en modo oscuro, meses «Nov 2026». Resultados: recuadros de estadística centrados y tabla de detalle en una sola línea con la foto de quien registró. Lotes con la foto de quien registró y capturó.
- Corrección: las ventanas de edición ya se cierran al guardar (se abrían duplicadas).

Base de datos: migración `supabase/migrations/20261104_brom_v8_puestos_bitacora.sql`.

## Versión 7.0

- **Nuevo nombre:** Liberación de producto.
- **Cuatro áreas de análisis** con su responsable: Bromatológico (laboratorio y Jefatura de calidad), Fisicoquímico (pH, humedad), Microbiológico (coliformes totales, Salmonella, hongos y levaduras, mesófilos aerobios) y Sensorial (olor, color, sabor, textura). Los métodos de verificación se marcan «Cumple» o «No cumple», con «Marcar todo como cumple» por área.
- **Liberación del lote** por la Jefatura de calidad cuando todos los análisis requeridos cumplen; folio `CC-AAAA-0001`, bitácora y reversión por un administrador con motivo.
- **Certificado de calidad en PDF** (una hoja carta) con producto, especie, lote, resultados por área, dictamen y firma de quien liberó.
- **Recetas por especie** (canino, felino…) con color característico y códigos `REC-01`; duplicar una receta para otra especie copia sus especificaciones. Meat Festival naranja, Chicken Chase turquesa y Tasty Piggy verde.
- **Especificaciones por receta** con opción «No aplica» y **áreas configurables** (quién captura cada una).
- **Usuarios:** agregar personas que ya tienen cuenta de Pet's Table (búsqueda con su foto); fotos alineadas.
- **Gráficas:** porcentaje de cumplimiento en pastel, cumplimiento por receta y por área, colores distintos por barra, meses y textos sin abreviaturas; la gráfica ampliada ya se visualiza y el recuadro de información ya no se queda fijo.
- **Centro de ayuda** con 50 respuestas en 10 temas, tutorial de instalación y **guía de usuario descargable en PDF**.

Base de datos: migración `supabase/migrations/20261103_brom_v7_liberacion.sql` (aplicada).

## Desarrollo

Ver `CLAUDE.md`. Las fuentes están en `public/`; `index.html` de la raíz se genera con `tools\build-single.ps1`.
