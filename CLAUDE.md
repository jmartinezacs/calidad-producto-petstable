# CLAUDE.md

Guía para Claude Code al trabajar en este repositorio.

## Proyecto

«Liberación de producto · Calidad de producto – Pet's Table S.A. de C.V.» (antes «Análisis Bromatológicos»): un lote de producto terminado se libera cuando cumple sus análisis **bromatológicos, fisicoquímicos, microbiológicos y sensoriales**. Lo operan el laboratorio (rol `analista`, captura bromatológicos) y la **Jefatura de calidad** (rol `calidad`, captura las demás áreas, libera lotes y emite el certificado de calidad en PDF).

- **Idioma:** la interfaz está en español y el usuario se comunica en español; responde en español. Zona horaria: `America/Mexico_City`.
- **Sin abreviaturas** en la interfaz, gráficas y PDF (meses completos, «Desviación estándar», «Página», etc.), por indicación del usuario.
- **Arquitectura:** la misma de `serviciomedico-petstable`, `pruebasindustriales-petstable` y `metrologia-petstable`: módulos ES en vanilla JS, sin npm ni framework, con supabase-js 2.45.4, lucide 0.453.0 y chart.js 4.4.4 desde jsdelivr a versiones fijas; jsPDF 2.5.1 se carga bajo demanda (`modules/pdf.js`). Íconos (favicon, apple-touch-icon) y sistema visual de Servicio médico.
- **Repositorio:** https://github.com/jmartinezacs/bromatologicos-petstable (el nombre del repositorio y el prefijo `brom_` de las tablas se conservan). Vercel publica `main`. Los cambios se suben directo a `main` subiendo `APP_VERSION`.
- **Documento de referencia:** `Documento_maestro_Analisis_Bromatologicos_Pets_Table.docx` (contexto v5.5). Sus reglas siguen vigentes: no renombrar tablas, no quitar puntos de las gráficas, medias solo con datos filtrados, paginación de 20 solo en la tabla, selectores personalizados, modo oscuro legible.
- **Recetas y colores:** Meat Festival naranja `#F58020`, Chicken Chase turquesa `#1BC7C7`, Tasty Piggy verde `#16A34A`. Códigos `REC-01`… Una receta existe por especie (`brom_recetas.especie`, único con el nombre): para otra especie se duplica (botón en Recetas) y se ajustan sus especificaciones.

## Publicación

- La raíz contiene los archivos **generados** que publica Vercel: `index.html`, `sw.js`, `manifest.webmanifest`, `apple-touch-icon.png` y `version.json`. Nunca edites `index.html` a mano.
- Flujo: edita `public/` → sube `APP_VERSION` en `public/js/config.js` → `powershell -ExecutionPolicy Bypass -File tools\build-single.ps1` → commit y push.
- Build de pruebas (expone `window.__bromModules`), fuera del repo: `tools\build-single.ps1 -Prueba -Out <carpeta temporal>`; se sirve con `tools\serve.ps1 -Root <carpeta>`.
- `tools/*.ps1` deben ser **UTF-8 con BOM** (PowerShell 5.1 rompe los acentos sin él).
- Bundler: el orden de módulos está fijo en `$order` de `build-single.ps1` (`core, modules/pdf, modules/certificado, modules/lotes, …, app`). Solo admite `import {a} from './x.js'`, `import X from` y `export function/const/class`. Para llamar a un módulo posterior, publica la función en `ganchos` (core.js); p. ej. `lotes.js` publica `ganchos.openLoteForm`.
- `legacy/index-v5.5.html` es la versión anterior, como respaldo; no se publica.

## Frontend (`public/js`)

- `core.js`: cliente `sb`, `state`, formato, modales, toasts, gráficas (`makeChart` con colores `PALETTE`/`colorN`, etiquetas `_porcentaje`/`_sufijo`, recuadro que se oculta al salir; ampliación al tocar `.chart-box`), selectores personalizados, CSV y fotos. Negocio: `getCatalogos()` (áreas, recetas, métodos, especificaciones, `requeridos(receta)`), `criterio`, `refLabel`, `estadoLote` (liberado · listo · en_proceso · no_conforme), `puedeCapturar(area)`, `puedeLiberar()`, `mesLargo`.
- Módulos: `dashboard`, `lotes` (captura por área, liberación, reversión), `certificado` (PDF de una hoja), `resultados`, `catalogos` (recetas, métodos, especificaciones, áreas), `usuarios` (solo admin; «Agregar usuario» busca cuentas existentes), `perfil`, `ayuda` (centro de ayuda y guía PDF; actualízala si cambia un flujo).
- En `resultados.js`, los datos por punto de una gráfica deben ser JSON (arreglos, no `Set`): la gráfica ampliada los copia con `JSON.parse(JSON.stringify(...))`.
- Cerrar sesión usa `signOut({ scope: 'local' })`: Auth se comparte con otras apps.

## Base de datos (Supabase `domumnsezocubigfqwry`, compartida)

- **Solo toca objetos `brom_`** y el bucket `avatares_brom`. Otros sistemas usan `_med`, `_prubind`, `_calbas`, etc.
- Tablas: `brom_areas_analisis` (id texto, color, orden, `roles_captura`), `brom_recetas` (+especie, color), `brom_catalogo_metodos` (+area, orden; tipo `numerico`, `positivo_negativo`, `verificacion`, `texto`), `brom_especificaciones_receta` (+aplica), `brom_muestras` (+folio_certificado, liberado_en/por/nombre/puesto, observaciones_liberacion), `brom_resultados_analisis`, `brom_bitacora_liberacion`, `brom_usuarios`.
- Triggers en resultados: `trg_brom_evaluar_resultado` (dictamen), `trg_brom_validar_resultado` (rol por área; bloquea lotes liberados) y `trg_brom_actualizar_dictamen_muestra`. Un cambio de criterio no recalcula resultados ya guardados.
- RPC: `brom_registrar_muestra_con_resultados(…, p_fecha_lote)`, `brom_actualizar_muestra_con_resultados`, `brom_metodos_requeridos`, `brom_liberar_lote` (folio `CC-AAAA-0001`, secuencia `brom_folio_certificado_seq`), `brom_revertir_liberacion` (admin, con motivo), `brom_buscar_cuentas` / `brom_agregar_cuenta` (admin), `brom_actualizar_mi_foto`.
- Migraciones en `supabase/migrations/` con su reversión en `rollback/`. Se aplican con `apply_migration` **solo con autorización explícita del usuario**. Aplicadas: `brom_v6`, `brom_v6_permisos` y `brom_v7_liberacion` (3 de noviembre de 2026). Si pruebas `brom_liberar_lote` en un bloque que se revierte, reinicia después `brom_folio_certificado_seq` (las secuencias no se revierten). Las funciones `brom_` no son ejecutables por `anon`.
- Fotos: `fotoDe()` usa `foto_url` o la foto histórica del bucket público `avatares` para los usuarios iniciales.

## Pruebas de interfaz sin credenciales

Sirve una build `-Prueba`, inyecta un `<script src>` del mismo origen (la CSP bloquea `eval`) que sustituya `sb.from`/`sb.rpc` por datos simulados y dispara `sb.auth._notifyAllSubscribers('SIGNED_IN', session)`. No escribas contraseñas reales.
