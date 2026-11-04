-- Reversión de brom_v10_correos_proteina
alter table public.brom_recetas drop constraint if exists brom_recetas_proteina_check;
alter table public.brom_recetas drop column if exists proteina;
alter table public.brom_usuarios drop column if exists correos_admin;
