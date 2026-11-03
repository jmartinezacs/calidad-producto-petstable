# Análisis Bromatológicos · Pet's Table

Portal de calidad de producto de Pet's Table S.A. de C.V.: lotes analizados, resultados bromatológicos con dictamen automático y tendencias por receta y método.

## Novedades de la versión 6.0

- Diseño unificado con Servicio médico, Pruebas industriales y Metrología (mismo encabezado, menú, tarjetas, modo claro/oscuro, ícono y favicon).
- **Panel:** indicadores de lotes, resultados, % de cumplimiento y fuera de especificación; lotes por mes, dictamen, cumplimiento por receta y no conformidades por método; filtro por periodo.
- **Lotes analizados:** búsqueda y filtros (receta, dictamen, periodo), tarjetas con dictamen, vista previa de Cumple / No cumple al capturar, aviso de lote duplicado, exportación a CSV. La edición se hace en una sola transacción (con la migración v6; sin ella se usa el procedimiento anterior).
- **Resultados:** filtros reactivos; gráficas grandes por receta (dos por fila) con límites (incluido rango), media, puntos fuera de especificación en rojo y etiquetas sin encimarse; indicadores por método (n, media, desviación estándar, mín.–máx.); tabla de 20 registros con el mismo conjunto filtrado; exportación a CSV; gráficas ampliables y descargables como imagen.
- **Recetas y métodos:** nueva pestaña de **especificaciones por receta**; referencia normativa editable; parámetro **Rango** (requiere la migración v6).
- **Usuarios:** edición de nombre, puesto, rol, estado y fotografía. **Mi perfil:** foto propia, contraseña, tema e instalación como app.
- Preguntas frecuentes actualizadas y con buscador.
- Correcciones respecto a v5.5: la tabla de detalle ahora respeta los filtros; cerrar sesión ya no cierra las demás apps de Pet's Table; el formulario de métodos ofrecía «Rango» aunque la base no lo aceptaba; las fotos ya no van incrustadas en el HTML (de 7.2 MB a ~0.5 MB).

## Desarrollo

Ver `CLAUDE.md`. Las fuentes están en `public/`; `index.html` de la raíz se genera con `tools\build-single.ps1`.
