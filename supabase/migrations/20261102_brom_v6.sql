-- =====================================================================
-- Análisis Bromatológicos v6.0 — solo objetos brom_ (proyecto compartido)
-- 1. Métodos: el parámetro "rango" (el trigger ya lo evalúa; la tabla no lo admitía)
-- 2. Edición transaccional de un lote con sus resultados (RPC)
-- 3. Fotografía de perfil: bucket avatares_brom y RPC para la foto propia
-- 4. Fotos existentes del bucket público "avatares" para los 5 usuarios
-- Reversión: rollback/20261102_brom_v6_rollback.sql
-- =====================================================================

-- 1 ---------------------------------------------------------------
alter table public.brom_catalogo_metodos drop constraint brom_catalogo_metodos_parametro_referencia_check;
alter table public.brom_catalogo_metodos add constraint brom_catalogo_metodos_parametro_referencia_check
  check (parametro_referencia = any (array['ninguno','minimo','maximo','exacto','rango']));
alter table public.brom_catalogo_metodos add constraint brom_catalogo_metodos_rango_check
  check (parametro_referencia <> 'rango' or tipo_resultado <> 'numerico'
         or (valor_referencia is not null and valor_referencia_max is not null and valor_referencia <= valor_referencia_max));

-- 2 ---------------------------------------------------------------
-- Actualiza lote, receta, fecha y resultados en una sola transacción.
-- Quien registró el lote o un administrador puede editarlo; solo un
-- administrador puede quitar métodos ya capturados (borra resultados).
create or replace function public.brom_actualizar_muestra_con_resultados(
  p_muestra_id uuid, p_lote text, p_receta_id uuid, p_fecha_lote date, p_resultados jsonb)
returns uuid
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_rol text;
  v_owner uuid;
  v_nombre text;
  v_ids uuid[];
  item jsonb;
  v_tipo text;
  v_num numeric;
  v_txt text;
begin
  select rol, nombre_completo into v_rol, v_nombre from public.brom_usuarios where id = auth.uid() and activo = true;
  if v_rol is null or v_rol not in ('admin','analista','calidad') then
    raise exception 'Usuario sin permisos para editar lotes';
  end if;
  select usuario_id into v_owner from public.brom_muestras where id = p_muestra_id for update;
  if not found then raise exception 'El lote ya no existe'; end if;
  if v_owner <> auth.uid() and v_rol <> 'admin' then
    raise exception 'Solo quien registró el lote o un administrador puede editarlo';
  end if;
  if nullif(trim(p_lote), '') is null or p_receta_id is null or p_fecha_lote is null then
    raise exception 'Fecha del lote, lote y receta son obligatorios';
  end if;
  if jsonb_typeof(p_resultados) <> 'array' or jsonb_array_length(p_resultados) = 0 then
    raise exception 'Selecciona al menos un método';
  end if;

  update public.brom_muestras
     set lote = trim(p_lote), receta_id = p_receta_id,
         fecha_analisis = p_fecha_lote::timestamp at time zone 'America/Mexico_City'
   where id = p_muestra_id;

  v_ids := array(select (e->>'metodo_id')::uuid from jsonb_array_elements(p_resultados) e);
  if exists (select 1 from public.brom_resultados_analisis where muestra_id = p_muestra_id and metodo_id <> all (v_ids)) then
    if v_rol <> 'admin' then
      raise exception 'Solo un administrador puede quitar métodos ya capturados';
    end if;
    delete from public.brom_resultados_analisis where muestra_id = p_muestra_id and metodo_id <> all (v_ids);
  end if;

  for item in select * from jsonb_array_elements(p_resultados) loop
    select tipo_resultado into v_tipo from public.brom_catalogo_metodos where id = (item->>'metodo_id')::uuid;
    if v_tipo is null then raise exception 'Método no encontrado'; end if;
    v_num := case when v_tipo = 'numerico' then nullif(item->>'resultado', '')::numeric end;
    v_txt := case when v_tipo <> 'numerico' then nullif(trim(item->>'resultado_texto'), '') end;
    if v_num is null and v_txt is null then
      raise exception 'Captura el resultado de todos los métodos seleccionados';
    end if;
    -- El UPDATE del conflicto vuelve a disparar trg_brom_evaluar_resultado (dictamen con la receta nueva)
    insert into public.brom_resultados_analisis (muestra_id, metodo_id, analista_texto, resultado, resultado_texto)
    values (p_muestra_id, (item->>'metodo_id')::uuid, v_nombre, v_num, v_txt)
    on conflict (muestra_id, metodo_id) do update
      set resultado = excluded.resultado, resultado_texto = excluded.resultado_texto, analista_texto = excluded.analista_texto;
  end loop;
  return p_muestra_id;
end;
$function$;
revoke all on function public.brom_actualizar_muestra_con_resultados(uuid, text, uuid, date, jsonb) from public, anon;
grant execute on function public.brom_actualizar_muestra_con_resultados(uuid, text, uuid, date, jsonb) to authenticated;

-- 3 ---------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('avatares_brom', 'avatares_brom', true, 2097152, array['image/jpeg','image/png','image/webp'])
on conflict (id) do nothing;

-- Cada usuario activo sube su foto en <uid>/…; los administradores, en cualquier carpeta
create policy avatares_brom_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'avatares_brom' and (
    (select public.brom_usuario_actual_rol()) = 'admin'
    or ((select public.brom_usuario_actual_rol()) is not null and (storage.foldername(name))[1] = (select auth.uid())::text)));
create policy avatares_brom_delete on storage.objects for delete to authenticated
  using (bucket_id = 'avatares_brom' and (
    (select public.brom_usuario_actual_rol()) = 'admin'
    or ((select public.brom_usuario_actual_rol()) is not null and (storage.foldername(name))[1] = (select auth.uid())::text)));

-- La foto propia: solo URLs públicas del proyecto (avatares_brom o avatares)
create or replace function public.brom_actualizar_mi_foto(p_url text)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  if public.brom_usuario_actual_rol() is null then raise exception 'Usuario sin acceso'; end if;
  if p_url is not null and p_url !~ '^https://domumnsezocubigfqwry\.supabase\.co/storage/v1/object/public/(avatares_brom|avatares)/' then
    raise exception 'La dirección de la foto no es válida';
  end if;
  update public.brom_usuarios set foto_url = p_url where id = auth.uid();
end;
$function$;
revoke all on function public.brom_actualizar_mi_foto(text) from public, anon;
grant execute on function public.brom_actualizar_mi_foto(text) to authenticated;

-- 4 ---------------------------------------------------------------
update public.brom_usuarios u set foto_url = 'https://domumnsezocubigfqwry.supabase.co/storage/v1/object/public/avatares/' || f.archivo
from (values ('javier.martinez@petstable.mx', 'Javier.png'), ('nelisa.ramirez@petstable.mx', 'Nelisa.png'),
             ('camila@petstable.mx', 'Camila.png'), ('rafa@petstable.mx', 'Rafael.png'), ('eduardo@petstable.mx', 'Eduardo.png')) f(correo, archivo)
where u.correo = f.correo and u.foto_url is null;
