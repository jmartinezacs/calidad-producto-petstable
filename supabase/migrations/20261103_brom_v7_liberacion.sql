-- =====================================================================
-- Liberación de producto v7.0 — solo objetos brom_ (proyecto compartido)
-- 1. Áreas de análisis (bromatológico, fisicoquímico, microbiológico, sensorial)
--    con los roles que capturan cada una.
-- 2. Métodos: área, orden y tipo «verificacion» (Cumple / No cumple).
-- 3. Recetas: especie y color; códigos REC-01…; Tasty Piggy.
-- 4. Especificaciones por receta: «aplica» (métodos que no se evalúan en la receta).
-- 5. Liberación del lote con folio de certificado y bitácora.
-- 6. Validación por área y bloqueo de lotes liberados (trigger).
-- 7. RPC de registro, edición, liberación y reversión.
-- 8. Alta de cuentas existentes de Supabase Auth.
-- Reversión: rollback/20261103_brom_v7_liberacion_rollback.sql
-- =====================================================================

-- 1 ---------------------------------------------------------------
create table public.brom_areas_analisis (
  id text primary key check (id ~ '^[a-z_]+$'),
  nombre text not null unique,
  descripcion text,
  color text not null default '#F58020' check (color ~ '^#[0-9A-Fa-f]{6}$'),
  orden integer not null default 0,
  roles_captura text[] not null default array['calidad']::text[]
    check (roles_captura <@ array['admin','analista','calidad']::text[]),
  activa boolean not null default true
);
alter table public.brom_areas_analisis enable row level security;
create policy "brom areas select authenticated" on public.brom_areas_analisis for select to authenticated using (true);
create policy "brom areas admin manage" on public.brom_areas_analisis for all to authenticated
  using ((select public.brom_usuario_actual_rol()) = 'admin') with check ((select public.brom_usuario_actual_rol()) = 'admin');

insert into public.brom_areas_analisis (id, nombre, descripcion, color, orden, roles_captura) values
  ('bromatologico', 'Bromatológico', 'Composición proximal del producto: proteínas, grasas y cenizas.', '#7C3AED', 1, array['analista','calidad']),
  ('fisicoquimico', 'Fisicoquímico', 'Propiedades fisicoquímicas: pH y humedad.', '#2563EB', 2, array['calidad']),
  ('microbiologico', 'Microbiológico', 'Inocuidad microbiológica: coliformes totales, Salmonella, hongos y levaduras, mesófilos aerobios.', '#DB2777', 3, array['calidad']),
  ('sensorial', 'Sensorial', 'Evaluación sensorial: olor, color, sabor y textura.', '#CA8A04', 4, array['calidad']);

-- 2 ---------------------------------------------------------------
alter table public.brom_catalogo_metodos
  add column area text not null default 'bromatologico' references public.brom_areas_analisis(id) on update cascade,
  add column orden integer not null default 0;
alter table public.brom_catalogo_metodos drop constraint brom_catalogo_metodos_tipo_resultado_check;
alter table public.brom_catalogo_metodos add constraint brom_catalogo_metodos_tipo_resultado_check
  check (tipo_resultado = any (array['numerico','positivo_negativo','texto','verificacion']));

update public.brom_catalogo_metodos set area = 'fisicoquimico', orden = 2 where metodo = 'Humedad';
update public.brom_catalogo_metodos set orden = case metodo when 'Proteínas' then 1 when 'Grasas' then 2 when 'Cenizas' then 3 else 9 end where area = 'bromatologico';

insert into public.brom_catalogo_metodos (metodo, referencia_normativa, unidades, activo, tipo_resultado, parametro_referencia, valor_referencia_texto, area, orden) values
  ('pH', 'Criterio interno de calidad', null, true, 'verificacion', 'exacto', 'Cumple', 'fisicoquimico', 1),
  ('Coliformes totales', 'Criterio interno de calidad', null, true, 'verificacion', 'exacto', 'Cumple', 'microbiologico', 1),
  ('Salmonella', 'Criterio interno de calidad', null, true, 'verificacion', 'exacto', 'Cumple', 'microbiologico', 2),
  ('Hongos y levaduras', 'Criterio interno de calidad', null, true, 'verificacion', 'exacto', 'Cumple', 'microbiologico', 3),
  ('Mesófilos aerobios', 'Criterio interno de calidad', null, true, 'verificacion', 'exacto', 'Cumple', 'microbiologico', 4),
  ('Olor', 'Criterio interno de calidad', null, true, 'verificacion', 'exacto', 'Cumple', 'sensorial', 1),
  ('Color', 'Criterio interno de calidad', null, true, 'verificacion', 'exacto', 'Cumple', 'sensorial', 2),
  ('Sabor', 'Criterio interno de calidad', null, true, 'verificacion', 'exacto', 'Cumple', 'sensorial', 3),
  ('Textura', 'Criterio interno de calidad', null, true, 'verificacion', 'exacto', 'Cumple', 'sensorial', 4)
on conflict (metodo) do nothing;

-- 3 ---------------------------------------------------------------
alter table public.brom_recetas
  add column especie text not null default 'Canino' check (char_length(btrim(especie)) between 2 and 40),
  add column color text not null default '#F58020' check (color ~ '^#[0-9A-Fa-f]{6}$');
update public.brom_recetas set codigo = 'REC-01', nombre_receta = 'Meat Festival', color = '#F58020' where codigo = 'Receta-01';
update public.brom_recetas set codigo = 'REC-02', nombre_receta = 'Chicken Chase', color = '#1BC7C7' where codigo = 'Receta-02';
update public.brom_recetas set codigo = 'REC-03', nombre_receta = 'Tasty Piggy', color = '#16A34A' where codigo = 'Receta-03';
alter table public.brom_recetas add constraint brom_recetas_nombre_especie_key unique (nombre_receta, especie);

-- 4 ---------------------------------------------------------------
alter table public.brom_especificaciones_receta add column aplica boolean not null default true;

-- 5 ---------------------------------------------------------------
create sequence public.brom_folio_certificado_seq;
alter table public.brom_muestras
  add column folio_certificado text unique,
  add column liberado_en timestamptz,
  add column liberado_por uuid references public.brom_usuarios(id) on delete set null,
  add column liberado_por_nombre text,
  add column liberado_por_puesto text,
  add column observaciones_liberacion text;

create table public.brom_bitacora_liberacion (
  id uuid primary key default gen_random_uuid(),
  muestra_id uuid not null references public.brom_muestras(id) on delete cascade,
  accion text not null check (accion in ('liberado','revertido')),
  folio text,
  motivo text,
  usuario_id uuid,
  usuario_nombre text,
  created_at timestamptz not null default now()
);
create index brom_bitacora_liberacion_muestra_idx on public.brom_bitacora_liberacion (muestra_id, created_at desc);
alter table public.brom_bitacora_liberacion enable row level security;
create policy "brom bitacora select authenticated" on public.brom_bitacora_liberacion for select to authenticated using (true);
-- Sin políticas de escritura: solo las RPC brom_liberar_lote / brom_revertir_liberacion escriben aquí.

-- 6 ---------------------------------------------------------------
create or replace function public.brom_validar_resultado()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_muestra uuid := coalesce(new.muestra_id, old.muestra_id);
  v_liberado timestamptz;
  v_rol text;
  v_area record;
begin
  select liberado_en into v_liberado from public.brom_muestras where id = v_muestra;
  if v_liberado is not null then
    raise exception 'El lote ya fue liberado. Un administrador debe revertir la liberación para modificar sus análisis';
  end if;
  if tg_op = 'DELETE' then return old; end if;
  -- Reevaluación sin cambiar el valor (p. ej., al cambiar la receta del lote): no exige el área
  if tg_op = 'UPDATE' and new.metodo_id = old.metodo_id and new.resultado is not distinct from old.resultado
     and new.resultado_texto is not distinct from old.resultado_texto then
    return new;
  end if;
  -- Sin usuario (procesos internos o SQL del administrador del proyecto) no se valida el área
  if auth.uid() is null then return new; end if;
  v_rol := public.brom_usuario_actual_rol();
  if v_rol = 'admin' then return new; end if;
  select a.nombre, a.roles_captura into v_area
    from public.brom_catalogo_metodos m join public.brom_areas_analisis a on a.id = m.area
   where m.id = new.metodo_id;
  if v_rol is null or not (v_rol = any (coalesce(v_area.roles_captura, array[]::text[]))) then
    raise exception 'Tu rol no captura el área %', coalesce(v_area.nombre, 'del método');
  end if;
  return new;
end;
$function$;
create trigger trg_brom_validar_resultado before insert or update or delete on public.brom_resultados_analisis
  for each row execute function public.brom_validar_resultado();

-- 7 ---------------------------------------------------------------
-- Registro: el tipo de resultado se toma del catálogo (incluye «verificacion»)
create or replace function public.brom_registrar_muestra_con_resultados(p_lote text, p_receta_id uuid, p_usuario_id uuid, p_resultados jsonb, p_fecha_lote date)
returns uuid
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  sample_id uuid;
  item jsonb;
  role_name text;
  v_tipo text;
  v_nombre text;
begin
  if auth.uid() is null or auth.uid() <> p_usuario_id then raise exception 'Usuario no autenticado'; end if;
  select rol, nombre_completo into role_name, v_nombre from public.brom_usuarios where id = auth.uid() and activo = true;
  if role_name is null or role_name not in ('admin','analista','calidad') then raise exception 'Usuario sin permisos para registrar lotes'; end if;
  if nullif(trim(p_lote), '') is null or p_receta_id is null or p_fecha_lote is null then raise exception 'Fecha del lote, lote y receta son obligatorios'; end if;
  insert into public.brom_muestras (lote, receta_id, usuario_id, fecha_analisis)
  values (trim(p_lote), p_receta_id, p_usuario_id, p_fecha_lote::timestamp at time zone 'America/Mexico_City')
  returning id into sample_id;
  for item in select * from jsonb_array_elements(coalesce(p_resultados, '[]'::jsonb)) loop
    select tipo_resultado into v_tipo from public.brom_catalogo_metodos where id = (item->>'metodo_id')::uuid;
    if v_tipo is null then raise exception 'Método no encontrado'; end if;
    insert into public.brom_resultados_analisis (muestra_id, metodo_id, analista_texto, resultado, resultado_texto)
    values (sample_id, (item->>'metodo_id')::uuid, v_nombre,
      case when v_tipo = 'numerico' then nullif(item->>'resultado', '')::numeric end,
      case when v_tipo <> 'numerico' then nullif(trim(item->>'resultado_texto'), '') end);
  end loop;
  return sample_id;
end;
$function$;

-- Edición: quien registró el lote o un administrador cambian fecha, lote y receta;
-- cada rol modifica solo los resultados de las áreas que captura.
create or replace function public.brom_actualizar_muestra_con_resultados(
  p_muestra_id uuid, p_lote text, p_receta_id uuid, p_fecha_lote date, p_resultados jsonb)
returns uuid
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_rol text;
  v_nombre text;
  v_m record;
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
  select * into v_m from public.brom_muestras where id = p_muestra_id for update;
  if not found then raise exception 'El lote ya no existe'; end if;
  if v_m.liberado_en is not null then
    raise exception 'El lote ya fue liberado. Un administrador debe revertir la liberación para modificarlo';
  end if;
  if nullif(trim(p_lote), '') is null or p_receta_id is null or p_fecha_lote is null then
    raise exception 'Fecha del lote, lote y receta son obligatorios';
  end if;
  if jsonb_typeof(p_resultados) <> 'array' then raise exception 'Resultados no válidos'; end if;

  if (trim(p_lote) <> v_m.lote or p_receta_id <> v_m.receta_id
      or (p_fecha_lote::timestamp at time zone 'America/Mexico_City') <> v_m.fecha_analisis) then
    if v_m.usuario_id <> auth.uid() and v_rol <> 'admin' then
      raise exception 'Solo quien registró el lote o un administrador puede cambiar la fecha, el número de lote o la receta';
    end if;
    update public.brom_muestras
       set lote = trim(p_lote), receta_id = p_receta_id,
           fecha_analisis = p_fecha_lote::timestamp at time zone 'America/Mexico_City'
     where id = p_muestra_id;
    -- Con otra receta cambian las especificaciones: se reevalúan todos los resultados
    if p_receta_id <> v_m.receta_id then
      update public.brom_resultados_analisis set resultado = resultado where muestra_id = p_muestra_id;
    end if;
  end if;

  -- Métodos quitados (solo dentro de las áreas que el usuario captura)
  v_ids := array(select (e->>'metodo_id')::uuid from jsonb_array_elements(p_resultados) e);
  if exists (select 1 from public.brom_resultados_analisis r join public.brom_catalogo_metodos m on m.id = r.metodo_id
              join public.brom_areas_analisis a on a.id = m.area
             where r.muestra_id = p_muestra_id and r.metodo_id <> all (v_ids)
               and (v_rol = 'admin' or v_rol = any (a.roles_captura))) then
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
    -- Solo se escribe si cambió (así no se exige permiso sobre áreas que no se tocaron)
    if not exists (select 1 from public.brom_resultados_analisis r where r.muestra_id = p_muestra_id
                    and r.metodo_id = (item->>'metodo_id')::uuid
                    and r.resultado is not distinct from v_num and r.resultado_texto is not distinct from v_txt) then
      insert into public.brom_resultados_analisis (muestra_id, metodo_id, analista_texto, resultado, resultado_texto)
      values (p_muestra_id, (item->>'metodo_id')::uuid, v_nombre, v_num, v_txt)
      on conflict (muestra_id, metodo_id) do update
        set resultado = excluded.resultado, resultado_texto = excluded.resultado_texto, analista_texto = excluded.analista_texto;
    end if;
  end loop;
  return p_muestra_id;
end;
$function$;

-- Métodos que se exigen para liberar un lote: activos, de áreas activas y que aplican a la receta
create or replace function public.brom_metodos_requeridos(p_receta_id uuid)
returns table (metodo_id uuid)
language sql
stable
security definer
set search_path to 'public'
as $function$
  select m.id
    from public.brom_catalogo_metodos m
    join public.brom_areas_analisis a on a.id = m.area and a.activa
   where m.activo
     and not exists (select 1 from public.brom_especificaciones_receta e
                      where e.receta_id = p_receta_id and e.metodo_id = m.id and not e.aplica);
$function$;

create or replace function public.brom_liberar_lote(p_muestra_id uuid, p_observaciones text default null)
returns text
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_u record;
  v_m record;
  v_faltan text;
  v_fallan text;
  v_folio text;
begin
  select id, rol, nombre_completo, puesto into v_u from public.brom_usuarios where id = auth.uid() and activo = true;
  if v_u.rol is null or v_u.rol not in ('admin','calidad') then
    raise exception 'Solo la Jefatura de calidad o un administrador pueden liberar lotes';
  end if;
  select * into v_m from public.brom_muestras where id = p_muestra_id for update;
  if not found then raise exception 'El lote ya no existe'; end if;
  if v_m.liberado_en is not null then raise exception 'El lote ya fue liberado con el folio %', v_m.folio_certificado; end if;

  select string_agg(m.metodo, ', ' order by a.orden, m.orden, m.metodo) into v_faltan
    from public.brom_metodos_requeridos(v_m.receta_id) q
    join public.brom_catalogo_metodos m on m.id = q.metodo_id
    join public.brom_areas_analisis a on a.id = m.area
   where not exists (select 1 from public.brom_resultados_analisis r
                      where r.muestra_id = p_muestra_id and r.metodo_id = q.metodo_id and r.cumple is not null);
  if v_faltan is not null then raise exception 'Faltan análisis por capturar: %', v_faltan; end if;

  select string_agg(m.metodo, ', ' order by m.metodo) into v_fallan
    from public.brom_resultados_analisis r join public.brom_catalogo_metodos m on m.id = r.metodo_id
   where r.muestra_id = p_muestra_id and r.cumple = false;
  if v_fallan is not null then raise exception 'El lote no cumple en: %. No puede liberarse', v_fallan; end if;

  v_folio := 'CC-' || to_char(now() at time zone 'America/Mexico_City', 'YYYY') || '-' || lpad(nextval('public.brom_folio_certificado_seq')::text, 4, '0');
  update public.brom_muestras
     set folio_certificado = v_folio, liberado_en = now(), liberado_por = v_u.id,
         liberado_por_nombre = v_u.nombre_completo, liberado_por_puesto = v_u.puesto,
         observaciones_liberacion = nullif(btrim(coalesce(p_observaciones, '')), '')
   where id = p_muestra_id;
  insert into public.brom_bitacora_liberacion (muestra_id, accion, folio, motivo, usuario_id, usuario_nombre)
  values (p_muestra_id, 'liberado', v_folio, nullif(btrim(coalesce(p_observaciones, '')), ''), v_u.id, v_u.nombre_completo);
  return v_folio;
end;
$function$;

create or replace function public.brom_revertir_liberacion(p_muestra_id uuid, p_motivo text)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_u record;
  v_m record;
begin
  select id, rol, nombre_completo into v_u from public.brom_usuarios where id = auth.uid() and activo = true;
  if v_u.rol is distinct from 'admin' then raise exception 'Solo un administrador puede revertir una liberación'; end if;
  if char_length(btrim(coalesce(p_motivo, ''))) < 5 then raise exception 'Escribe el motivo de la reversión'; end if;
  select * into v_m from public.brom_muestras where id = p_muestra_id for update;
  if not found then raise exception 'El lote ya no existe'; end if;
  if v_m.liberado_en is null then raise exception 'El lote no está liberado'; end if;
  insert into public.brom_bitacora_liberacion (muestra_id, accion, folio, motivo, usuario_id, usuario_nombre)
  values (p_muestra_id, 'revertido', v_m.folio_certificado, btrim(p_motivo), v_u.id, v_u.nombre_completo);
  update public.brom_muestras
     set folio_certificado = null, liberado_en = null, liberado_por = null,
         liberado_por_nombre = null, liberado_por_puesto = null, observaciones_liberacion = null
   where id = p_muestra_id;
end;
$function$;

-- 8 ---------------------------------------------------------------
create or replace function public.brom_buscar_cuentas(p_q text)
returns table (id uuid, email text, nombre text, ultimo_acceso timestamptz, ya_registrado boolean, foto_sugerida text)
language plpgsql
stable
security definer
set search_path to ''
as $function$
declare v_q text := lower(btrim(coalesce(p_q, '')));
begin
  if public.brom_usuario_actual_rol() is distinct from 'admin' then
    raise exception 'Solo administradores.' using errcode = '42501';
  end if;
  if char_length(v_q) < 2 then return; end if;
  return query
  with cuentas as (
    select au.id, lower(au.email)::text as email,
           coalesce(nullif(btrim(au.raw_user_meta_data ->> 'full_name'), ''), nullif(btrim(au.raw_user_meta_data ->> 'nombre'), ''),
                    nullif(btrim(au.raw_user_meta_data ->> 'name'), ''),
                    initcap(replace(split_part(split_part(au.email, '@', 1), '.', 1), '_', ' ')) || ' ' ||
                    initcap(replace(split_part(split_part(au.email, '@', 1), '.', 2), '_', ' '))) as nombre,
           au.last_sign_in_at
      from auth.users au
     where au.email ilike '%@petstable.mx'
       and (au.email ilike '%' || v_q || '%' or coalesce(au.raw_user_meta_data ->> 'full_name', '') ilike '%' || v_q || '%')
     order by au.email
     limit 12
  )
  select c.id, c.email, btrim(c.nombre), c.last_sign_in_at,
         exists (select 1 from public.brom_usuarios u where u.id = c.id),
         coalesce(
           (select u.foto_url from public.usuarios_med u where lower(u.email) = c.email and u.foto_url ~ '^https://domumnsezocubigfqwry\.supabase\.co/storage/v1/object/public/' limit 1),
           (select 'https://domumnsezocubigfqwry.supabase.co/storage/v1/object/public/avatares/' || o.name
              from storage.objects o
             where o.bucket_id = 'avatares'
               and translate(lower(split_part(split_part(o.name, '.', 1), ' ', 1)), 'áéíóúñ', 'aeioun')
                   = translate(lower(split_part(split_part(c.email, '@', 1), '.', 1)), 'áéíóúñ', 'aeioun')
             order by char_length(o.name), o.name limit 1))
    from cuentas c;
end;
$function$;

create or replace function public.brom_agregar_cuenta(p_id uuid, p_nombre text, p_puesto text, p_rol text, p_foto text default null)
returns uuid
language plpgsql
security definer
set search_path to ''
as $function$
declare v_email text;
begin
  if public.brom_usuario_actual_rol() is distinct from 'admin' then
    raise exception 'Solo administradores.' using errcode = '42501';
  end if;
  select lower(email) into v_email from auth.users where id = p_id;
  if v_email is null then raise exception 'La cuenta no existe en Supabase Authentication.'; end if;
  if v_email not ilike '%@petstable.mx' then raise exception 'Solo se admiten cuentas @petstable.mx.'; end if;
  if exists (select 1 from public.brom_usuarios where id = p_id) then raise exception 'Esta persona ya tiene acceso a Liberación de producto.'; end if;
  if coalesce(btrim(p_nombre), '') = '' then raise exception 'El nombre es obligatorio.'; end if;
  if p_rol not in ('admin', 'analista', 'calidad') then raise exception 'Rol no válido.'; end if;
  if p_foto is not null and p_foto !~ '^https://domumnsezocubigfqwry\.supabase\.co/storage/v1/object/public/' then
    raise exception 'La foto debe estar en el Storage del proyecto.';
  end if;
  insert into public.brom_usuarios (id, correo, nombre_completo, rol, activo, foto_url, puesto)
  values (p_id, v_email, btrim(p_nombre), p_rol, true, p_foto, nullif(btrim(coalesce(p_puesto, '')), ''));
  return p_id;
end;
$function$;

-- Permisos: ninguna función brom_ se ejecuta sin sesión
revoke all on function public.brom_validar_resultado() from public, anon;
revoke all on function public.brom_registrar_muestra_con_resultados(text, uuid, uuid, jsonb, date) from public, anon;
revoke all on function public.brom_actualizar_muestra_con_resultados(uuid, text, uuid, date, jsonb) from public, anon;
revoke all on function public.brom_metodos_requeridos(uuid) from public, anon;
revoke all on function public.brom_liberar_lote(uuid, text) from public, anon;
revoke all on function public.brom_revertir_liberacion(uuid, text) from public, anon;
revoke all on function public.brom_buscar_cuentas(text) from public, anon;
revoke all on function public.brom_agregar_cuenta(uuid, text, text, text, text) from public, anon;
grant execute on function public.brom_validar_resultado() to authenticated;
grant execute on function public.brom_registrar_muestra_con_resultados(text, uuid, uuid, jsonb, date) to authenticated;
grant execute on function public.brom_actualizar_muestra_con_resultados(uuid, text, uuid, date, jsonb) to authenticated;
grant execute on function public.brom_metodos_requeridos(uuid) to authenticated;
grant execute on function public.brom_liberar_lote(uuid, text) to authenticated;
grant execute on function public.brom_revertir_liberacion(uuid, text) to authenticated;
grant execute on function public.brom_buscar_cuentas(text) to authenticated;
grant execute on function public.brom_agregar_cuenta(uuid, text, text, text, text) to authenticated;
