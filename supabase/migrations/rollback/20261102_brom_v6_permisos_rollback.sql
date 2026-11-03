-- Reversión de 20261102_brom_v6_permisos.sql: devuelve la ejecución a anon
grant execute on function public.brom_actualizar_dictamen_muestra() to public, anon;
grant execute on function public.brom_evaluar_resultado() to public, anon;
grant execute on function public.brom_registrar_muestra_con_resultados(text, uuid, uuid, jsonb) to public, anon;
grant execute on function public.brom_registrar_muestra_con_resultados(text, uuid, uuid, jsonb, date) to public, anon;
grant execute on function public.brom_usuario_actual_perfil() to public, anon;
grant execute on function public.brom_usuario_actual_rol() to public, anon;
