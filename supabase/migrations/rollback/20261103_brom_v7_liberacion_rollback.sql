-- Reversión de 20261103_brom_v7_liberacion.sql
-- Antes de ejecutarla: respalda los resultados de las áreas nuevas; se eliminan con sus métodos.
drop function if exists public.brom_agregar_cuenta(uuid, text, text, text, text);
drop function if exists public.brom_buscar_cuentas(text);
drop function if exists public.brom_revertir_liberacion(uuid, text);
drop function if exists public.brom_liberar_lote(uuid, text);
drop function if exists public.brom_metodos_requeridos(uuid);
drop trigger if exists trg_brom_validar_resultado on public.brom_resultados_analisis;
drop function if exists public.brom_validar_resultado();
-- brom_registrar_muestra_con_resultados (5 argumentos) y brom_actualizar_muestra_con_resultados:
-- vuelve a ejecutar sus definiciones de 20261102_brom_v6.sql y de la versión v5.5.

drop table if exists public.brom_bitacora_liberacion;
alter table public.brom_muestras
  drop column if exists observaciones_liberacion, drop column if exists liberado_por_puesto,
  drop column if exists liberado_por_nombre, drop column if exists liberado_por,
  drop column if exists liberado_en, drop column if exists folio_certificado;
drop sequence if exists public.brom_folio_certificado_seq;

alter table public.brom_especificaciones_receta drop column if exists aplica;

alter table public.brom_recetas drop constraint if exists brom_recetas_nombre_especie_key;
update public.brom_recetas set codigo = 'Receta-01' where codigo = 'REC-01';
update public.brom_recetas set codigo = 'Receta-02' where codigo = 'REC-02';
update public.brom_recetas set codigo = 'Receta-03', nombre_receta = 'Tasty Pig' where codigo = 'REC-03';
alter table public.brom_recetas drop column if exists color, drop column if exists especie;

delete from public.brom_resultados_analisis where metodo_id in (select id from public.brom_catalogo_metodos where tipo_resultado = 'verificacion');
delete from public.brom_catalogo_metodos where tipo_resultado = 'verificacion';
alter table public.brom_catalogo_metodos drop constraint brom_catalogo_metodos_tipo_resultado_check;
alter table public.brom_catalogo_metodos add constraint brom_catalogo_metodos_tipo_resultado_check
  check (tipo_resultado = any (array['numerico','positivo_negativo','texto']));
alter table public.brom_catalogo_metodos drop column if exists orden, drop column if exists area;
drop table if exists public.brom_areas_analisis;
