-- =====================================================================
-- Análisis Bromatológicos v6.0 — permisos de funciones brom_
-- Quita la ejecución sin sesión (anon/PUBLIC) a las funciones anteriores.
-- authenticated conserva el permiso: brom_usuario_actual_rol() se usa en
-- las políticas RLS y las RPC las llama el portal con sesión iniciada.
-- Los triggers no dependen del permiso EXECUTE para dispararse.
-- Reversión: rollback/20261102_brom_v6_permisos_rollback.sql
-- =====================================================================
revoke execute on function public.brom_actualizar_dictamen_muestra() from public, anon;
revoke execute on function public.brom_evaluar_resultado() from public, anon;
revoke execute on function public.brom_registrar_muestra_con_resultados(text, uuid, uuid, jsonb) from public, anon;
revoke execute on function public.brom_registrar_muestra_con_resultados(text, uuid, uuid, jsonb, date) from public, anon;
revoke execute on function public.brom_usuario_actual_perfil() from public, anon;
revoke execute on function public.brom_usuario_actual_rol() from public, anon;

grant execute on function public.brom_actualizar_dictamen_muestra() to authenticated;
grant execute on function public.brom_evaluar_resultado() to authenticated;
grant execute on function public.brom_registrar_muestra_con_resultados(text, uuid, uuid, jsonb) to authenticated;
grant execute on function public.brom_registrar_muestra_con_resultados(text, uuid, uuid, jsonb, date) to authenticated;
grant execute on function public.brom_usuario_actual_perfil() to authenticated;
grant execute on function public.brom_usuario_actual_rol() to authenticated;
