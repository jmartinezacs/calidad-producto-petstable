-- Reversión de brom_v9_notificaciones
drop trigger if exists trg_brom_avisos_resultado on public.brom_resultados_analisis;
drop trigger if exists trg_brom_avisos_muestra on public.brom_muestras;
drop function if exists public.brom_trg_avisos();
drop function if exists public.brom_generar_avisos(uuid);
drop function if exists public.brom_mis_avisos(boolean);
drop function if exists public.brom_vapid_guardar(text, text);
drop function if exists public.brom_vapid_claves();
drop function if exists public.brom_vapid_publica();
drop function if exists public.brom_vincular_push(text, text, text, text);
drop table if exists public.brom_config_push;
drop table if exists public.brom_push_subs;
drop table if exists public.brom_notificaciones;
alter table public.brom_usuarios drop column if exists recibe_correos;
