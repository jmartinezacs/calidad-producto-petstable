-- =====================================================================
-- Liberación de producto · v9: notificaciones (en el sistema, push y correo)
--
-- Los avisos se generan en la base de datos al confirmar la transacción que
-- registra un lote, captura análisis o libera un lote (triggers diferidos), así
-- quedan en la campana del sistema aunque falle el envío. La Edge Function
-- notificar_brom envía después, por push y por correo, los avisos que generó
-- quien guardó.
--
-- Avisos (clave única por persona, no se repiten):
--   captura_pendiente  → a quienes capturan un área con análisis pendientes
--   area_capturada     → a quien registró el lote y a los demás que capturan
--                        esa área, cuando el área queda completa
--   listo_liberar      → a quienes liberan lotes, cuando todo cumple
--   no_conforme        → a quienes liberan y a quien registró, si algo no cumple
--   liberado           → a quien registró y a quienes capturaron
--   prueba             → aviso de prueba desde Mi perfil
-- =====================================================================

-- ---------- Preferencia de correo ----------
alter table public.brom_usuarios add column if not exists recibe_correos boolean not null default true;

-- ---------- Notificaciones ----------
create table if not exists public.brom_notificaciones (
  id uuid primary key default gen_random_uuid(),
  usuario_id uuid not null references public.brom_usuarios(id) on delete cascade,
  tipo text not null check (tipo in ('captura_pendiente', 'area_capturada', 'listo_liberar', 'no_conforme', 'liberado', 'prueba')),
  titulo text not null,
  mensaje text not null,
  muestra_id uuid references public.brom_muestras(id) on delete cascade,
  area text,
  clave text not null,
  actor_id uuid,
  actor_nombre text,
  leida boolean not null default false,
  enviada boolean not null default false,
  created_at timestamptz not null default now(),
  unique (usuario_id, clave)
);
create index if not exists brom_notificaciones_usuario_idx on public.brom_notificaciones (usuario_id, created_at desc);
create index if not exists brom_notificaciones_envio_idx on public.brom_notificaciones (actor_id, enviada) where not enviada;
create index if not exists brom_notificaciones_muestra_idx on public.brom_notificaciones (muestra_id);

alter table public.brom_notificaciones enable row level security;
drop policy if exists "brom notificaciones propias" on public.brom_notificaciones;
create policy "brom notificaciones propias" on public.brom_notificaciones for select to authenticated
  using (usuario_id = (select auth.uid()));
drop policy if exists "brom notificaciones marcar" on public.brom_notificaciones;
create policy "brom notificaciones marcar" on public.brom_notificaciones for update to authenticated
  using (usuario_id = (select auth.uid())) with check (usuario_id = (select auth.uid()));
drop policy if exists "brom notificaciones borrar" on public.brom_notificaciones;
create policy "brom notificaciones borrar" on public.brom_notificaciones for delete to authenticated
  using (usuario_id = (select auth.uid()));
revoke all on public.brom_notificaciones from anon, authenticated;
grant select, delete on public.brom_notificaciones to authenticated;
grant update (leida) on public.brom_notificaciones to authenticated;

-- ---------- Suscripciones push (una por dispositivo) ----------
create table if not exists public.brom_push_subs (
  id uuid primary key default gen_random_uuid(),
  usuario_id uuid not null references public.brom_usuarios(id) on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  dispositivo text,
  created_at timestamptz not null default now()
);
alter table public.brom_push_subs enable row level security;
drop policy if exists "brom push propias" on public.brom_push_subs;
create policy "brom push propias" on public.brom_push_subs for select to authenticated using (usuario_id = (select auth.uid()));
drop policy if exists "brom push borrar" on public.brom_push_subs;
create policy "brom push borrar" on public.brom_push_subs for delete to authenticated using (usuario_id = (select auth.uid()));
revoke all on public.brom_push_subs from anon, authenticated;
grant select, delete on public.brom_push_subs to authenticated;

-- Vincula el dispositivo a la cuenta actual (el dispositivo puede venir de otra cuenta)
create or replace function public.brom_vincular_push(p_endpoint text, p_p256dh text, p_auth text, p_dispositivo text default null)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not exists (select 1 from public.brom_usuarios where id = auth.uid() and activo) then
    raise exception 'Usuario no autorizado.' using errcode = '42501';
  end if;
  if p_endpoint is null or p_endpoint !~ '^https://' or char_length(p_endpoint) > 1000
     or coalesce(p_p256dh, '') = '' or char_length(p_p256dh) > 200
     or coalesce(p_auth, '') = '' or char_length(p_auth) > 100 then
    raise exception 'Suscripción no válida.' using errcode = 'P0001';
  end if;
  insert into public.brom_push_subs (usuario_id, endpoint, p256dh, auth, dispositivo)
  values (auth.uid(), p_endpoint, p_p256dh, p_auth, left(p_dispositivo, 200))
  on conflict (endpoint) do update
     set usuario_id = excluded.usuario_id, p256dh = excluded.p256dh, auth = excluded.auth, dispositivo = excluded.dispositivo;
end $$;
revoke all on function public.brom_vincular_push(text, text, text, text) from public, anon;
grant execute on function public.brom_vincular_push(text, text, text, text) to authenticated;

-- ---------- Claves VAPID (las genera la Edge Function la primera vez) ----------
create table if not exists public.brom_config_push (
  id int primary key default 1 check (id = 1),
  vapid_publica text not null,
  vapid_privada text not null,
  contacto text not null default 'mailto:javier.martinez@petstable.mx',
  created_at timestamptz not null default now()
);
alter table public.brom_config_push enable row level security;
revoke all on public.brom_config_push from anon, authenticated;

create or replace function public.brom_vapid_publica()
returns text language sql stable security definer set search_path = '' as $$
  select vapid_publica from public.brom_config_push where id = 1
$$;
revoke all on function public.brom_vapid_publica() from public, anon;
grant execute on function public.brom_vapid_publica() to authenticated;

create or replace function public.brom_vapid_claves()
returns table (vapid_publica text, vapid_privada text, contacto text) language sql stable security definer set search_path = '' as $$
  select vapid_publica, vapid_privada, contacto from public.brom_config_push where id = 1
$$;
revoke all on function public.brom_vapid_claves() from public, anon, authenticated;
grant execute on function public.brom_vapid_claves() to service_role;

create or replace function public.brom_vapid_guardar(p_publica text, p_privada text)
returns void language sql security definer set search_path = '' as $$
  insert into public.brom_config_push (id, vapid_publica, vapid_privada) values (1, p_publica, p_privada)
  on conflict (id) do nothing
$$;
revoke all on function public.brom_vapid_guardar(text, text) from public, anon, authenticated;
grant execute on function public.brom_vapid_guardar(text, text) to service_role;

-- ---------- Preferencia de correo (cada quien la suya) ----------
create or replace function public.brom_mis_avisos(p_correos boolean)
returns void language sql security definer set search_path = '' as $$
  update public.brom_usuarios set recibe_correos = coalesce(p_correos, true) where id = auth.uid()
$$;
revoke all on function public.brom_mis_avisos(boolean) from public, anon;
grant execute on function public.brom_mis_avisos(boolean) to authenticated;

-- ---------- Generación de avisos de un lote ----------
create or replace function public.brom_generar_avisos(p_muestra_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare
  m record;
  v_receta text;
  v_actor uuid := auth.uid();
  v_actor_nombre text;
  a record;
  v_total int; v_hechos int; v_no int;
  v_pend_total int := 0; v_no_total int := 0; v_req_total int := 0;
begin
  select * into m from public.brom_muestras where id = p_muestra_id;
  if not found then return; end if;
  select nombre_receta into v_receta from public.brom_recetas where id = m.receta_id;
  select nombre_completo into v_actor_nombre from public.brom_usuarios where id = v_actor;

  -- Lote liberado: avisa a quien lo registró y a quienes capturaron
  if m.liberado_en is not null then
    insert into public.brom_notificaciones (usuario_id, tipo, titulo, mensaje, muestra_id, clave, actor_id, actor_nombre)
    select u.id, 'liberado', format('Lote %s liberado', m.lote),
           format('%s liberó el lote %s de %s con el folio %s. El certificado de calidad ya está disponible.',
                  coalesce(m.liberado_por_nombre, 'Calidad'), m.lote, coalesce(v_receta, 'la receta'), m.folio_certificado),
           m.id, format('liberado:%s:%s', m.id, m.folio_certificado), v_actor, v_actor_nombre
      from public.brom_usuarios u
     where u.activo and u.id is distinct from v_actor
       and (u.id = m.usuario_id or u.nombre_completo in (select r.analista_texto from public.brom_resultados_analisis r where r.muestra_id = m.id))
    on conflict (usuario_id, clave) do nothing;
    -- Los avisos pendientes de ese lote ya no aplican
    update public.brom_notificaciones set leida = true
     where muestra_id = m.id and tipo in ('captura_pendiente', 'listo_liberar') and not leida;
    return;
  end if;

  for a in
    select ar.id, ar.nombre
      from public.brom_areas_analisis ar
     where ar.activa
       and exists (select 1 from public.brom_metodos_requeridos(m.receta_id) q
                     join public.brom_catalogo_metodos cm on cm.id = q.metodo_id where cm.area = ar.id)
     order by ar.orden nulls last, ar.nombre
  loop
    select count(*),
           count(*) filter (where r.id is not null and (r.resultado is not null or r.resultado_texto is not null or r.cumple is not null)),
           count(*) filter (where r.cumple = false)
      into v_total, v_hechos, v_no
      from public.brom_metodos_requeridos(m.receta_id) q
      join public.brom_catalogo_metodos cm on cm.id = q.metodo_id and cm.area = a.id
      left join public.brom_resultados_analisis r on r.muestra_id = m.id and r.metodo_id = q.metodo_id;
    v_req_total := v_req_total + v_total;
    v_no_total := v_no_total + v_no;

    if v_hechos < v_total then
      v_pend_total := v_pend_total + (v_total - v_hechos);
      -- Captura pendiente: a quienes capturan el área por su puesto
      insert into public.brom_notificaciones (usuario_id, tipo, titulo, mensaje, muestra_id, area, clave, actor_id, actor_nombre)
      select u.id, 'captura_pendiente', format('Lote %s: captura %s', m.lote, lower(a.nombre)),
             format('%s registró el lote %s de %s. Te toca capturar %s análisis del área %s.',
                    coalesce((select nombre_completo from public.brom_usuarios where id = m.usuario_id), 'Alguien'),
                    m.lote, coalesce(v_receta, 'una receta'), v_total - v_hechos, a.nombre),
             m.id, a.id, format('pend:%s:%s', m.id, a.id), v_actor, v_actor_nombre
        from public.brom_usuarios u
        join public.brom_puestos p on p.nombre = u.puesto and p.activo
       where u.activo and a.id = any (p.areas_captura) and u.id is distinct from v_actor
      on conflict (usuario_id, clave) do nothing;
    else
      -- Área completa: a quien registró y a los demás que capturan el área
      insert into public.brom_notificaciones (usuario_id, tipo, titulo, mensaje, muestra_id, area, clave, actor_id, actor_nombre)
      select u.id, 'area_capturada', format('Lote %s: %s capturado', m.lote, a.nombre),
             format('%s completó la captura %s del lote %s de %s%s.',
                    coalesce(v_actor_nombre, 'Alguien'), lower(a.nombre), m.lote, coalesce(v_receta, 'la receta'),
                    case when v_no > 0 then format(' (%s fuera de especificación)', v_no) else '; todo cumple' end),
             m.id, a.id, format('hecho:%s:%s', m.id, a.id), v_actor, v_actor_nombre
        from public.brom_usuarios u
        left join public.brom_puestos p on p.nombre = u.puesto and p.activo
       where u.activo and u.id is distinct from v_actor
         and (u.id = m.usuario_id or a.id = any (coalesce(p.areas_captura, '{}')))
      on conflict (usuario_id, clave) do nothing;
      -- Su aviso de captura pendiente ya se atendió
      update public.brom_notificaciones set leida = true
       where muestra_id = m.id and clave = format('pend:%s:%s', m.id, a.id) and not leida;
    end if;
  end loop;

  if v_req_total > 0 and v_pend_total = 0 then
    if v_no_total = 0 then
      insert into public.brom_notificaciones (usuario_id, tipo, titulo, mensaje, muestra_id, clave, actor_id, actor_nombre)
      select u.id, 'listo_liberar', format('Lote %s listo para liberar', m.lote),
             format('Todos los análisis del lote %s de %s cumplen. Ya puedes liberarlo y emitir su certificado.', m.lote, coalesce(v_receta, 'la receta')),
             m.id, format('listo:%s', m.id), v_actor, v_actor_nombre
        from public.brom_usuarios u
        join public.brom_puestos p on p.nombre = u.puesto and p.activo and p.puede_liberar
       where u.activo and u.id is distinct from v_actor
      on conflict (usuario_id, clave) do nothing;
    else
      insert into public.brom_notificaciones (usuario_id, tipo, titulo, mensaje, muestra_id, clave, actor_id, actor_nombre)
      select u.id, 'no_conforme', format('Lote %s no conforme', m.lote),
             format('El lote %s de %s tiene %s análisis fuera de especificación. Revisa sus resultados.', m.lote, coalesce(v_receta, 'la receta'),
                    v_no_total),
             m.id, format('noconf:%s', m.id), v_actor, v_actor_nombre
        from public.brom_usuarios u
        left join public.brom_puestos p on p.nombre = u.puesto and p.activo
       where u.activo and u.id is distinct from v_actor
         and (u.id = m.usuario_id or coalesce(p.puede_liberar, false))
      on conflict (usuario_id, clave) do nothing;
    end if;
  end if;
exception when others then
  -- Un aviso nunca debe impedir guardar un lote
  raise warning 'brom_generar_avisos: %', sqlerrm;
end $$;
revoke all on function public.brom_generar_avisos(uuid) from public, anon, authenticated;

-- Triggers diferidos: se ejecutan al confirmar, con todos los resultados ya guardados
create or replace function public.brom_trg_avisos()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if tg_table_name = 'brom_muestras' then
    perform public.brom_generar_avisos(new.id);
  else
    perform public.brom_generar_avisos(new.muestra_id);
  end if;
  return null;
end $$;
revoke all on function public.brom_trg_avisos() from public, anon, authenticated;

drop trigger if exists trg_brom_avisos_muestra on public.brom_muestras;
create constraint trigger trg_brom_avisos_muestra
  after insert or update of liberado_en on public.brom_muestras
  deferrable initially deferred for each row execute function public.brom_trg_avisos();

drop trigger if exists trg_brom_avisos_resultado on public.brom_resultados_analisis;
create constraint trigger trg_brom_avisos_resultado
  after insert or update on public.brom_resultados_analisis
  deferrable initially deferred for each row execute function public.brom_trg_avisos();
