-- Reversión de 20261104_brom_v8_puestos_bitacora.sql (regresa a v7).
-- Los puestos se pierden; los usuarios con rol «usuario» vuelven a «analista»,
-- salvo el Jefe de calidad, que vuelve a «calidad».
do $$
declare t text;
begin
  foreach t in array array['brom_recetas','brom_catalogo_metodos','brom_especificaciones_receta','brom_areas_analisis',
                           'brom_muestras','brom_resultados_analisis','brom_usuarios','brom_puestos'] loop
    execute format('drop trigger if exists %I on public.%I', 'trg_' || t || '_auditar', t);
  end loop;
end $$;
drop function if exists public.brom_auditar();
drop table if exists public.brom_bitacora;

alter table public.brom_areas_analisis add column roles_captura text[] not null default array['calidad']::text[]
  check (roles_captura <@ array['admin','analista','calidad']::text[]);
update public.brom_areas_analisis set roles_captura = array['analista','calidad'] where id = 'bromatologico';

alter table public.brom_usuarios drop constraint brom_usuarios_rol_check;
update public.brom_usuarios u set rol = case when p.puede_liberar then 'calidad' else 'analista' end
  from public.brom_puestos p where u.rol = 'usuario' and p.nombre = u.puesto;
update public.brom_usuarios set rol = 'analista' where rol = 'usuario';
alter table public.brom_usuarios add constraint brom_usuarios_rol_check check (rol in ('admin', 'analista', 'calidad'));
alter table public.brom_usuarios alter column rol drop default;
alter table public.brom_usuarios drop constraint brom_usuarios_puesto_fkey, drop column area;

drop policy if exists "brom muestras insert usuarios" on public.brom_muestras;
create policy "brom muestras insert analista calidad admin" on public.brom_muestras for insert to authenticated
  with check ((select public.brom_usuario_actual_rol()) = any (array['admin','analista','calidad']) and usuario_id = (select auth.uid()));
drop policy if exists "brom resultados insert usuarios" on public.brom_resultados_analisis;
create policy "brom resultados insert analista calidad admin" on public.brom_resultados_analisis for insert to authenticated
  with check ((select public.brom_usuario_actual_rol()) = any (array['admin','analista','calidad']));
drop policy if exists "brom resultados update usuarios" on public.brom_resultados_analisis;
create policy "brom resultados update analista calidad admin" on public.brom_resultados_analisis for update to authenticated
  using ((select public.brom_usuario_actual_rol()) = any (array['admin','analista','calidad']))
  with check ((select public.brom_usuario_actual_rol()) = any (array['admin','analista','calidad']));

alter table public.brom_catalogo_metodos drop column recetas_aplica;
-- (la restricción única del nombre del método se restaura solo si no hay nombres repetidos)
do $$ begin
  if not exists (select metodo from public.brom_catalogo_metodos group by metodo having count(*) > 1) then
    alter table public.brom_catalogo_metodos add constraint brom_catalogo_metodos_metodo_key unique (metodo);
  end if;
end $$;

update public.brom_recetas set especie = 'Canino' where especie = 'Perro';
update public.brom_recetas set especie = 'Felino' where especie = 'Gato';
alter table public.brom_recetas alter column especie set default 'Canino';

drop function if exists public.brom_asignar_firmas(uuid, uuid, uuid);
drop function if exists public.brom_liberar_lote(uuid, text, uuid, uuid);
drop function if exists public.brom_firmante(uuid, text);
drop function if exists public.brom_directorio();
drop function if exists public.brom_agregar_cuenta(uuid, text, text, text, text, text);
alter table public.brom_muestras
  drop column firma_jefe_id, drop column firma_jefe_nombre, drop column firma_jefe_puesto,
  drop column firma_inspector_id, drop column firma_inspector_nombre, drop column firma_inspector_puesto,
  drop column firmas_asignadas_por, drop column firmas_asignadas_en;
drop table if exists public.brom_puestos;

-- Después de esto, vuelve a ejecutar de 20261103_brom_v7_liberacion.sql las funciones
-- brom_validar_resultado, brom_registrar_muestra_con_resultados, brom_actualizar_muestra_con_resultados,
-- brom_metodos_requeridos, brom_liberar_lote, brom_revertir_liberacion y brom_agregar_cuenta, y
-- recrea brom_usuario_actual_perfil con sus 7 columnas originales; luego borra
-- brom_puede_capturar(text) y brom_puede_liberar().
drop function if exists public.brom_estado_cuentas();
