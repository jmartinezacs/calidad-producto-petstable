# Liberación de producto · Pet's Table

Sistema de Calidad de producto de Pet's Table S.A. de C.V. (antes «Análisis Bromatológicos»): un lote se libera cuando cumple sus análisis bromatológicos, fisicoquímicos, microbiológicos y sensoriales, y se emite su certificado de calidad.

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
