-- =====================================================================
-- Liberación de producto · v10
--  - brom_usuarios.correos_admin: el administrador puede impedir que una
--    persona reciba correos de avisos, sin importar su preferencia personal
--    (recibe_correos). La campana y las notificaciones push no cambian.
--  - brom_recetas.proteina: proteína base de la receta (res, pollo, cerdo…),
--    se muestra con su ícono.
-- =====================================================================
alter table public.brom_usuarios add column if not exists correos_admin boolean not null default true;

alter table public.brom_recetas add column if not exists proteina text;
alter table public.brom_recetas drop constraint if exists brom_recetas_proteina_check;
alter table public.brom_recetas add constraint brom_recetas_proteina_check
  check (proteina is null or proteina in ('res', 'pollo', 'cerdo', 'pescado', 'cordero', 'otra'));

update public.brom_recetas set proteina = 'res' where proteina is null and nombre_receta ilike 'Meat Festival%';
update public.brom_recetas set proteina = 'pollo' where proteina is null and nombre_receta ilike 'Chicken Chase%';
update public.brom_recetas set proteina = 'cerdo' where proteina is null and nombre_receta ilike 'Tasty Piggy%';
