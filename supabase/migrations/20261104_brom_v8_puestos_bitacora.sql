-- =====================================================================
-- Liberación de producto v8.0 — solo objetos brom_ (proyecto compartido)
-- 1. Puestos: catálogo con lo que cada puesto captura, si libera lotes y
--    si firma el certificado (Jefe de calidad / Inspector de calidad).
-- 2. Usuarios: área de cada persona; roles solo «admin» y «usuario».
--    Lo que se captura depende del puesto; el rol define qué se administra.
-- 3. Métodos: recetas a las que aplican (null = todas); nombres repetibles
--    para duplicar un método con otro criterio.
-- 4. Recetas: especie Perro / Gato.
-- 5. Certificado: firmas del Jefe de calidad y de un Inspector de calidad.
-- 6. Directorio de usuarios (nombre, puesto y foto) para todos.
-- 7. Funciones de captura, liberación y alta de cuentas por puesto.
-- 8. Bitácora de cambios (triggers) visible para administradores.
-- Reversión: rollback/20261104_brom_v8_puestos_bitacora_rollback.sql
-- =====================================================================

-- 1 ---------------------------------------------------------------
create table public.brom_puestos (
  id uuid primary key default gen_random_uuid(),
  nombre text not null unique check (char_length(btrim(nombre)) between 2 and 80),
  areas_captura text[] not null default '{}'::text[],
  puede_liberar boolean not null default false,
  firma_certificado text check (firma_certificado in ('jefe_calidad', 'inspector')),
  activo boolean not null default true,
  created_at timestamptz not null default now()
);
alter table public.brom_puestos enable row level security;
create policy "brom puestos select authenticated" on public.brom_puestos for select to authenticated using (true);
create policy "brom puestos admin manage" on public.brom_puestos for all to authenticated
  using ((select public.brom_usuario_actual_rol()) = 'admin') with check ((select public.brom_usuario_actual_rol()) = 'admin');

insert into public.brom_puestos (nombre)
select distinct btrim(puesto) from public.brom_usuarios where nullif(btrim(puesto), '') is not null
on conflict (nombre) do nothing;
insert into public.brom_puestos (nombre) values ('Jefe de calidad'), ('Inspector de calidad') on conflict (nombre) do nothing;
update public.brom_puestos set areas_captura = array['bromatologico','fisicoquimico','microbiologico','sensorial'],
       puede_liberar = true, firma_certificado = 'jefe_calidad' where nombre = 'Jefe de calidad';
update public.brom_puestos set areas_captura = array['bromatologico'], firma_certificado = 'inspector' where nombre = 'Inspector de calidad';

-- 2 ---------------------------------------------------------------
update public.brom_usuarios set puesto = btrim(puesto) where puesto is distinct from btrim(puesto);
update public.brom_usuarios set puesto = null where btrim(coalesce(puesto, '')) = '';
alter table public.brom_usuarios
  add column area text check (area is null or char_length(btrim(area)) between 2 and 80),
  add constraint brom_usuarios_puesto_fkey foreign key (puesto) references public.brom_puestos(nombre) on update cascade on delete restrict;
-- Área de cada persona tomada de Servicio médico (mismo correo)
update public.brom_usuarios b set area = a.nombre
  from public.usuarios_med u join public.areas_med a on a.id = u.area_id
 where lower(u.email) = b.correo;

alter table public.brom_usuarios drop constraint brom_usuarios_rol_check;
update public.brom_usuarios set rol = 'usuario' where rol in ('analista', 'calidad');
alter table public.brom_usuarios add constraint brom_usuarios_rol_check check (rol in ('admin', 'usuario'));
alter table public.brom_usuarios alter column rol set default 'usuario';

alter table public.brom_areas_analisis drop column roles_captura;

-- Políticas que mencionaban los roles anteriores
drop policy "brom muestras insert analista calidad admin" on public.brom_muestras;
create policy "brom muestras insert usuarios" on public.brom_muestras for insert to authenticated
  with check ((select public.brom_usuario_actual_rol()) in ('admin', 'usuario') and usuario_id = (select auth.uid()));
drop policy "brom resultados insert analista calidad admin" on public.brom_resultados_analisis;
create policy "brom resultados insert usuarios" on public.brom_resultados_analisis for insert to authenticated
  with check ((select public.brom_usuario_actual_rol()) in ('admin', 'usuario'));
drop policy "brom resultados update analista calidad admin" on public.brom_resultados_analisis;
create policy "brom resultados update usuarios" on public.brom_resultados_analisis for update to authenticated
  using ((select public.brom_usuario_actual_rol()) in ('admin', 'usuario'))
  with check ((select public.brom_usuario_actual_rol()) in ('admin', 'usuario'));

-- 3 ---------------------------------------------------------------
alter table public.brom_catalogo_metodos drop constraint brom_catalogo_metodos_metodo_key;
alter table public.brom_catalogo_metodos add column recetas_aplica uuid[];
comment on column public.brom_catalogo_metodos.recetas_aplica is 'Recetas en las que se evalúa el método; null = todas.';

-- 4 ---------------------------------------------------------------
update public.brom_recetas set especie = 'Perro' where especie in ('Canino', 'Perros');
update public.brom_recetas set especie = 'Gato' where especie in ('Felino', 'Gatos');
alter table public.brom_recetas alter column especie set default 'Perro';

-- 5 ---------------------------------------------------------------
alter table public.brom_muestras
  add column firma_jefe_id uuid references public.brom_usuarios(id) on delete set null,
  add column firma_jefe_nombre text,
  add column firma_jefe_puesto text,
  add column firma_inspector_id uuid references public.brom_usuarios(id) on delete set null,
  add column firma_inspector_nombre text,
  add column firma_inspector_puesto text,
  add column firmas_asignadas_por text,
  add column firmas_asignadas_en timestamptz;
create index brom_muestras_firma_jefe_idx on public.brom_muestras (firma_jefe_id);
create index brom_muestras_firma_inspector_idx on public.brom_muestras (firma_inspector_id);
create index brom_muestras_liberado_por_idx on public.brom_muestras (liberado_por);

-- 6 ---------------------------------------------------------------
create or replace function public.brom_directorio()
returns table (id uuid, nombre_completo text, correo text, puesto text, area text, foto_url text, activo boolean, firma_certificado text)
language sql
stable
security definer
set search_path to 'public'
as $function$
  select u.id, u.nombre_completo, u.correo, u.puesto, u.area, u.foto_url, u.activo, p.firma_certificado
    from public.brom_usuarios u left join public.brom_puestos p on p.nombre = u.puesto
   where public.brom_usuario_actual_rol() is not null
   order by u.nombre_completo;
$function$;

drop function public.brom_usuario_actual_perfil();
create function public.brom_usuario_actual_perfil()
returns table (id uuid, correo text, nombre_completo text, puesto text, rol text, activo boolean, foto_url text, area text,
               areas_captura text[], puede_liberar boolean, firma_certificado text)
language sql
stable
security definer
set search_path to 'public', 'auth'
as $function$
  select u.id, u.correo, u.nombre_completo, u.puesto, u.rol, u.activo, u.foto_url, u.area,
         coalesce(p.areas_captura, '{}'::text[]), coalesce(p.puede_liberar, false), p.firma_certificado
    from public.brom_usuarios u left join public.brom_puestos p on p.nombre = u.puesto and p.activo
   where u.id = auth.uid()
   limit 1;
$function$;

-- Último acceso de cada usuario (solo administradores)
create or replace function public.brom_estado_cuentas()
returns table (id uuid, ultimo_acceso timestamptz)
language plpgsql
stable
security definer
set search_path to ''
as $function$
begin
  if public.brom_usuario_actual_rol() is distinct from 'admin' then
    raise exception 'Solo administradores.' using errcode = '42501';
  end if;
  return query select u.id, au.last_sign_in_at from public.brom_usuarios u left join auth.users au on au.id = u.id;
end;
$function$;

-- 7 ---------------------------------------------------------------
create or replace function public.brom_puede_capturar(p_area text)
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $function$
  select exists (
    select 1 from public.brom_usuarios u left join public.brom_puestos p on p.nombre = u.puesto and p.activo
     where u.id = auth.uid() and u.activo
       and (u.rol = 'admin' or p_area = any (coalesce(p.areas_captura, '{}'::text[]))));
$function$;

create or replace function public.brom_puede_liberar()
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $function$
  select exists (
    select 1 from public.brom_usuarios u left join public.brom_puestos p on p.nombre = u.puesto and p.activo
     where u.id = auth.uid() and u.activo and (u.rol = 'admin' or coalesce(p.puede_liberar, false)));
$function$;

create or replace function public.brom_validar_resultado()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_muestra uuid := coalesce(new.muestra_id, old.muestra_id);
  v_liberado timestamptz;
  v_area record;
begin
  select liberado_en into v_liberado from public.brom_muestras where id = v_muestra;
  if v_liberado is not null then
    raise exception 'El lote ya fue liberado. Un administrador debe revertir la liberación para modificar sus análisis';
  end if;
  if tg_op = 'DELETE' then return old; end if;
  if tg_op = 'UPDATE' and new.metodo_id = old.metodo_id and new.resultado is not distinct from old.resultado
     and new.resultado_texto is not distinct from old.resultado_texto then
    return new;
  end if;
  if auth.uid() is null then return new; end if;
  select a.id, a.nombre into v_area
    from public.brom_catalogo_metodos m join public.brom_areas_analisis a on a.id = m.area
   where m.id = new.metodo_id;
  if not public.brom_puede_capturar(v_area.id) then
    raise exception 'Tu puesto no captura el área %', coalesce(v_area.nombre, 'del método');
  end if;
  return new;
end;
$function$;

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
  if role_name is null or role_name not in ('admin','usuario') then raise exception 'Usuario sin permisos para registrar lotes'; end if;
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
  if v_rol is null or v_rol not in ('admin','usuario') then
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
    if p_receta_id <> v_m.receta_id then
      update public.brom_resultados_analisis set resultado = resultado where muestra_id = p_muestra_id;
    end if;
  end if;

  v_ids := array(select (e->>'metodo_id')::uuid from jsonb_array_elements(p_resultados) e);
  if exists (select 1 from public.brom_resultados_analisis r join public.brom_catalogo_metodos m on m.id = r.metodo_id
             where r.muestra_id = p_muestra_id and r.metodo_id <> all (v_ids)
               and public.brom_puede_capturar(m.area)) then
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

-- Métodos exigidos: activos, de áreas activas, que aplican a la receta (lista del método
-- y especificación «No aplica»)
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
     and (m.recetas_aplica is null or p_receta_id = any (m.recetas_aplica))
     and not exists (select 1 from public.brom_especificaciones_receta e
                      where e.receta_id = p_receta_id and e.metodo_id = m.id and not e.aplica);
$function$;

-- Valida a quién firma (activo y con el puesto que corresponde)
create or replace function public.brom_firmante(p_id uuid, p_tipo text)
returns table (id uuid, nombre text, puesto text)
language plpgsql
stable
security definer
set search_path to 'public'
as $function$
begin
  return query select u.id, u.nombre_completo, u.puesto
    from public.brom_usuarios u join public.brom_puestos p on p.nombre = u.puesto
   where u.id = p_id and u.activo and p.firma_certificado = p_tipo;
  if not found then
    raise exception '%', case when p_tipo = 'jefe_calidad' then 'Selecciona a un Jefe de calidad activo para firmar el certificado'
                              else 'Selecciona a un Inspector de calidad activo para firmar el certificado' end;
  end if;
  return;
end;
$function$;

drop function public.brom_liberar_lote(uuid, text);
create function public.brom_liberar_lote(p_muestra_id uuid, p_observaciones text default null,
                                         p_firma_jefe uuid default null, p_firma_inspector uuid default null)
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
  v_j_id uuid; v_j_nom text; v_j_pue text;
  v_i_id uuid; v_i_nom text; v_i_pue text;
begin
  select id, rol, nombre_completo, puesto into v_u from public.brom_usuarios where id = auth.uid() and activo = true;
  if v_u.id is null or not public.brom_puede_liberar() then
    raise exception 'Tu puesto no tiene permiso para liberar lotes';
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

  if p_firma_jefe is not null or p_firma_inspector is not null then
    if p_firma_jefe is null or p_firma_inspector is null then
      raise exception 'Selecciona al Jefe de calidad y al Inspector de calidad que firman el certificado';
    end if;
    select f.id, f.nombre, f.puesto into v_j_id, v_j_nom, v_j_pue from public.brom_firmante(p_firma_jefe, 'jefe_calidad') f;
    select f.id, f.nombre, f.puesto into v_i_id, v_i_nom, v_i_pue from public.brom_firmante(p_firma_inspector, 'inspector') f;
  end if;

  v_folio := 'CC-' || to_char(now() at time zone 'America/Mexico_City', 'YYYY') || '-' || lpad(nextval('public.brom_folio_certificado_seq')::text, 4, '0');
  update public.brom_muestras
     set folio_certificado = v_folio, liberado_en = now(), liberado_por = v_u.id,
         liberado_por_nombre = v_u.nombre_completo, liberado_por_puesto = v_u.puesto,
         observaciones_liberacion = nullif(btrim(coalesce(p_observaciones, '')), ''),
         firma_jefe_id = v_j_id, firma_jefe_nombre = v_j_nom, firma_jefe_puesto = v_j_pue,
         firma_inspector_id = v_i_id, firma_inspector_nombre = v_i_nom, firma_inspector_puesto = v_i_pue,
         firmas_asignadas_por = case when v_j_id is not null then v_u.nombre_completo end,
         firmas_asignadas_en = case when v_j_id is not null then now() end
   where id = p_muestra_id;
  insert into public.brom_bitacora_liberacion (muestra_id, accion, folio, motivo, usuario_id, usuario_nombre)
  values (p_muestra_id, 'liberado', v_folio, nullif(btrim(coalesce(p_observaciones, '')), ''), v_u.id, v_u.nombre_completo);
  return v_folio;
end;
$function$;

-- Firmas del certificado: las elige el Jefe de calidad o un administrador la primera vez;
-- después quedan guardadas (solo un administrador puede cambiarlas).
create or replace function public.brom_asignar_firmas(p_muestra_id uuid, p_firma_jefe uuid, p_firma_inspector uuid)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_u record;
  v_m record;
  v_j_id uuid; v_j_nom text; v_j_pue text;
  v_i_id uuid; v_i_nom text; v_i_pue text;
begin
  select u.id, u.rol, u.nombre_completo, p.firma_certificado into v_u
    from public.brom_usuarios u left join public.brom_puestos p on p.nombre = u.puesto and p.activo
   where u.id = auth.uid() and u.activo;
  if v_u.id is null or (v_u.rol <> 'admin' and v_u.firma_certificado is distinct from 'jefe_calidad') then
    raise exception 'Solo el Jefe de calidad o un administrador eligen las firmas del certificado';
  end if;
  select * into v_m from public.brom_muestras where id = p_muestra_id for update;
  if not found then raise exception 'El lote ya no existe'; end if;
  if v_m.liberado_en is null then raise exception 'El lote todavía no está liberado'; end if;
  if v_m.firma_jefe_id is not null and v_u.rol <> 'admin' then
    raise exception 'Las firmas de este certificado ya fueron asignadas; solo un administrador puede cambiarlas';
  end if;
  select f.id, f.nombre, f.puesto into v_j_id, v_j_nom, v_j_pue from public.brom_firmante(p_firma_jefe, 'jefe_calidad') f;
  select f.id, f.nombre, f.puesto into v_i_id, v_i_nom, v_i_pue from public.brom_firmante(p_firma_inspector, 'inspector') f;
  update public.brom_muestras
     set firma_jefe_id = v_j_id, firma_jefe_nombre = v_j_nom, firma_jefe_puesto = v_j_pue,
         firma_inspector_id = v_i_id, firma_inspector_nombre = v_i_nom, firma_inspector_puesto = v_i_pue,
         firmas_asignadas_por = v_u.nombre_completo, firmas_asignadas_en = now()
   where id = p_muestra_id;
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
         liberado_por_nombre = null, liberado_por_puesto = null, observaciones_liberacion = null,
         firma_jefe_id = null, firma_jefe_nombre = null, firma_jefe_puesto = null,
         firma_inspector_id = null, firma_inspector_nombre = null, firma_inspector_puesto = null,
         firmas_asignadas_por = null, firmas_asignadas_en = null
   where id = p_muestra_id;
end;
$function$;

drop function public.brom_agregar_cuenta(uuid, text, text, text, text);
create function public.brom_agregar_cuenta(p_id uuid, p_nombre text, p_puesto text, p_rol text, p_foto text default null, p_area text default null)
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
  if p_rol not in ('admin', 'usuario') then raise exception 'Rol no válido.'; end if;
  if p_foto is not null and p_foto !~ '^https://domumnsezocubigfqwry\.supabase\.co/storage/v1/object/public/' then
    raise exception 'La foto debe estar en el Storage del proyecto.';
  end if;
  if nullif(btrim(coalesce(p_puesto, '')), '') is not null then
    insert into public.brom_puestos (nombre) values (btrim(p_puesto)) on conflict (nombre) do nothing;
  end if;
  insert into public.brom_usuarios (id, correo, nombre_completo, rol, activo, foto_url, puesto, area)
  values (p_id, v_email, btrim(p_nombre), p_rol, true, p_foto, nullif(btrim(coalesce(p_puesto, '')), ''), nullif(btrim(coalesce(p_area, '')), ''));
  return p_id;
end;
$function$;

-- 8 ---------------------------------------------------------------
create table public.brom_bitacora (
  id bigint generated always as identity primary key,
  tabla text not null,
  registro_id text not null,
  accion text not null check (accion in ('INSERT','UPDATE','DELETE')),
  cambios jsonb,
  objeto text,
  referencia text,
  usuario_id uuid,
  usuario_email text,
  usuario_nombre text,
  created_at timestamptz not null default now()
);
create index brom_bitacora_fecha_idx on public.brom_bitacora (created_at desc);
create index brom_bitacora_tabla_idx on public.brom_bitacora (tabla, registro_id);
alter table public.brom_bitacora enable row level security;
create policy "brom bitacora cambios select admin" on public.brom_bitacora for select to authenticated
  using ((select public.brom_usuario_actual_rol()) = 'admin');
-- Sin políticas de escritura: solo el trigger brom_auditar escribe aquí.

create or replace function public.brom_auditar()
returns trigger
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_row jsonb := case when tg_op = 'DELETE' then to_jsonb(old) else to_jsonb(new) end;
  v_cambios jsonb;
  v_obj text;
  v_ref text;
  v_muestra record;
  v_ignorar text[] := array['created_at', 'dictamen_global', 'cumple', 'analista_texto'];
begin
  if tg_op = 'UPDATE' then
    select jsonb_object_agg(n.key, jsonb_build_array(o.value, n.value)) into v_cambios
      from jsonb_each(to_jsonb(new)) n join jsonb_each(to_jsonb(old)) o using (key)
     where n.value is distinct from o.value and n.key <> all (v_ignorar);
    if v_cambios is null then return new; end if;
  else
    v_cambios := v_row - v_ignorar;
  end if;

  case tg_table_name
    when 'brom_resultados_analisis' then
      select m.lote, m.created_at into v_muestra from public.brom_muestras m where m.id = (v_row ->> 'muestra_id')::uuid;
      -- Los análisis capturados al registrar el lote y los que se borran con el lote
      -- quedan cubiertos por el registro del lote
      if v_muestra.lote is null then return coalesce(new, old); end if;
      if tg_op = 'INSERT' and v_muestra.created_at = now() then return new; end if;
      v_obj := (select metodo from public.brom_catalogo_metodos where id = (v_row ->> 'metodo_id')::uuid);
      v_ref := 'Lote ' || v_muestra.lote;
      v_cambios := coalesce(v_cambios, '{}'::jsonb) || jsonb_build_object('_cumple', v_row -> 'cumple');
    when 'brom_muestras' then
      v_obj := 'Lote ' || (v_row ->> 'lote');
      v_ref := (select nombre_receta from public.brom_recetas where id = (v_row ->> 'receta_id')::uuid);
    when 'brom_recetas' then v_obj := v_row ->> 'nombre_receta'; v_ref := v_row ->> 'codigo';
    when 'brom_catalogo_metodos' then
      v_obj := v_row ->> 'metodo';
      v_ref := (select nombre from public.brom_areas_analisis where id = v_row ->> 'area');
    when 'brom_especificaciones_receta' then
      v_obj := (select metodo from public.brom_catalogo_metodos where id = (v_row ->> 'metodo_id')::uuid);
      v_ref := (select nombre_receta from public.brom_recetas where id = (v_row ->> 'receta_id')::uuid);
    when 'brom_areas_analisis' then v_obj := v_row ->> 'nombre';
    when 'brom_usuarios' then v_obj := v_row ->> 'nombre_completo'; v_ref := v_row ->> 'correo';
    when 'brom_puestos' then v_obj := v_row ->> 'nombre';
    else v_obj := null;
  end case;

  insert into public.brom_bitacora (tabla, registro_id, accion, cambios, objeto, referencia, usuario_id, usuario_email, usuario_nombre)
  values (tg_table_name, coalesce(v_row ->> 'id', '—'), tg_op, v_cambios, v_obj, v_ref, auth.uid(), auth.jwt() ->> 'email',
          (select nombre_completo from public.brom_usuarios where id = auth.uid()));
  return coalesce(new, old);
end;
$function$;

do $$
declare t text;
begin
  foreach t in array array['brom_recetas','brom_catalogo_metodos','brom_especificaciones_receta','brom_areas_analisis',
                           'brom_muestras','brom_resultados_analisis','brom_usuarios','brom_puestos'] loop
    execute format('create trigger %I after insert or update or delete on public.%I for each row execute function public.brom_auditar()', 'trg_' || t || '_auditar', t);
  end loop;
end $$;

-- Permisos: ninguna función brom_ se ejecuta sin sesión
revoke all on function public.brom_directorio() from public, anon;
revoke all on function public.brom_estado_cuentas() from public, anon;
revoke all on function public.brom_usuario_actual_perfil() from public, anon;
revoke all on function public.brom_puede_capturar(text) from public, anon;
revoke all on function public.brom_puede_liberar() from public, anon;
revoke all on function public.brom_firmante(uuid, text) from public, anon;
revoke all on function public.brom_liberar_lote(uuid, text, uuid, uuid) from public, anon;
revoke all on function public.brom_asignar_firmas(uuid, uuid, uuid) from public, anon;
revoke all on function public.brom_agregar_cuenta(uuid, text, text, text, text, text) from public, anon;
revoke all on function public.brom_auditar() from public, anon;
grant execute on function public.brom_directorio() to authenticated;
grant execute on function public.brom_estado_cuentas() to authenticated;
grant execute on function public.brom_usuario_actual_perfil() to authenticated;
grant execute on function public.brom_puede_capturar(text) to authenticated;
grant execute on function public.brom_puede_liberar() to authenticated;
grant execute on function public.brom_firmante(uuid, text) to authenticated;
grant execute on function public.brom_liberar_lote(uuid, text, uuid, uuid) to authenticated;
grant execute on function public.brom_asignar_firmas(uuid, uuid, uuid) to authenticated;
grant execute on function public.brom_agregar_cuenta(uuid, text, text, text, text, text) to authenticated;
grant execute on function public.brom_auditar() to authenticated;
