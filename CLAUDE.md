# CLAUDE.md

Guía para Claude Code al trabajar en este repositorio.

## Proyecto

«Análisis Bromatológicos · Calidad de producto – Pet's Table S.A. de C.V.»: registro de lotes de producto terminado, captura de resultados por método, dictamen automático contra especificación y tendencias históricas por receta y método.

- **Idioma:** la interfaz está en español y el usuario se comunica en español; responde en español. Zona horaria: `America/Mexico_City`.
- **Arquitectura:** la misma de `serviciomedico-petstable`, `pruebasindustriales-petstable` y `metrologia-petstable`: módulos ES en vanilla JS, sin npm ni framework, con supabase-js 2.45.4, lucide 0.453.0 y chart.js 4.4.4 desde jsdelivr a versiones fijas. Íconos (favicon, apple-touch-icon) y sistema visual tomados de Servicio médico.
- **Repositorio:** https://github.com/jmartinezacs/bromatologicos-petstable. Vercel publica `main`. Los cambios se suben directo a `main` subiendo `APP_VERSION`.
- **Documento de referencia:** `Documento_maestro_Analisis_Bromatologicos_Pets_Table.docx` (contexto funcional v5.5). Sus reglas siguen vigentes: no renombrar tablas, no quitar puntos de las gráficas, medias solo con datos filtrados, paginación de 20 solo en la tabla, selectores personalizados, modo oscuro legible.

## Publicación

- La raíz contiene los archivos **generados** que publica Vercel: `index.html`, `sw.js`, `manifest.webmanifest`, `apple-touch-icon.png` y `version.json`. Nunca edites `index.html` a mano.
- Flujo: edita `public/` → sube `APP_VERSION` en `public/js/config.js` → `powershell -ExecutionPolicy Bypass -File tools\build-single.ps1` → commit y push.
- Build de pruebas (expone `window.__bromModules`), fuera del repo: `tools\build-single.ps1 -Prueba -Out <carpeta temporal>`; se sirve con `tools\serve.ps1 -Root <carpeta>`.
- `tools/*.ps1` deben ser **UTF-8 con BOM** (PowerShell 5.1 rompe los acentos sin él).
- Bundler: el orden de módulos está fijo en `$order` de `build-single.ps1`. Solo admite `import {a} from './x.js'`, `import X from` y `export function/const/class`. Para llamar a un módulo posterior, publica la función en `ganchos` (core.js); p. ej. `lotes.js` publica `ganchos.openLoteForm` (botón flotante y Panel).
- `legacy/index-v5.5.html` es la versión anterior (un solo HTML con imágenes incrustadas), como respaldo; no se publica.

## Frontend (`public/js`)

- `core.js`: cliente `sb`, `state`, formato, modales, toasts, gráficas (`makeChart`, ampliación al tocar `.chart-box`), selectores personalizados (`mejorarSelect`), CSV y fotos. Reglas de negocio de presentación: `criterio(metodo, spec)` (la especificación por receta tiene prioridad, igual que el trigger), `refLabel`, `dictamenPill`, `fechaLote` (fecha del lote en hora de CDMX), `loteDesdeFecha` (DDMMAA), `getCatalogos` y `getResultados`.
- Módulos: `dashboard` (Panel), `lotes`, `resultados`, `catalogos` (recetas, métodos, especificaciones por receta), `usuarios` (solo admin), `perfil`, `ayuda` (preguntas frecuentes; actualízala si cambia un flujo).
- `resultados.js`: filtro → conjunto filtrado → resumen → gráficas → medias → tabla. No limites los datos de las gráficas con la paginación.
- Cerrar sesión usa `signOut({ scope: 'local' })`: Auth se comparte con otras apps.

## Base de datos (Supabase `domumnsezocubigfqwry`, compartida)

- **Solo toca objetos `brom_`** (tablas `brom_usuarios`, `brom_recetas`, `brom_catalogo_metodos`, `brom_especificaciones_receta`, `brom_muestras`, `brom_resultados_analisis`) y el bucket `avatares_brom`. Otros sistemas usan `_med`, `_prubind`, `_calbas`, etc.
- Dictamen: `trg_brom_evaluar_resultado` (BEFORE INSERT/UPDATE en resultados) y `trg_brom_actualizar_dictamen_muestra` (AFTER). Un cambio de criterio no recalcula resultados ya guardados.
- Registro: RPC `brom_registrar_muestra_con_resultados(p_lote, p_receta_id, p_usuario_id, p_resultados, p_fecha_lote)`. Edición: RPC `brom_actualizar_muestra_con_resultados` (migración v6); si no existe, el frontend usa el procedimiento anterior por pasos.
- RLS: lectura para autenticados; catálogos, usuarios y borrado solo admin; un lote lo edita quien lo registró o un admin. `brom_usuarios` solo es visible para uno mismo o un admin.
- Migraciones en `supabase/migrations/` con su reversión en `rollback/`. Se aplican con `apply_migration` solo con autorización del usuario.
- Fotos: `fotoDe()` usa `foto_url` o, si está vacío, la foto histórica del bucket público `avatares` (solo lectura) para los 5 usuarios iniciales.

## Pruebas de interfaz sin credenciales

Sirve una build `-Prueba`, inyecta un `<script src>` del mismo origen (la CSP bloquea `eval`) que sustituya `sb.from`/`sb.rpc` por datos simulados y dispara `sb.auth._notifyAllSubscribers('SIGNED_IN', session)`. No escribas contraseñas reales.
