-- Reversión de 20261102_brom_v6.sql
-- Antes de ejecutarla, cambia a otro parámetro los métodos que usen "rango".
alter table public.brom_catalogo_metodos drop constraint if exists brom_catalogo_metodos_rango_check;
alter table public.brom_catalogo_metodos drop constraint brom_catalogo_metodos_parametro_referencia_check;
alter table public.brom_catalogo_metodos add constraint brom_catalogo_metodos_parametro_referencia_check
  check (parametro_referencia = any (array['ninguno','minimo','maximo','exacto']));

drop function if exists public.brom_actualizar_muestra_con_resultados(uuid, text, uuid, date, jsonb);
drop function if exists public.brom_actualizar_mi_foto(text);

drop policy if exists avatares_brom_insert on storage.objects;
drop policy if exists avatares_brom_delete on storage.objects;
-- El bucket avatares_brom se vacía y elimina desde el panel de Storage.

update public.brom_usuarios set foto_url = null
where foto_url like 'https://domumnsezocubigfqwry.supabase.co/storage/v1/object/public/avatares/%';
