-- Propulsión: Reductora, Eje y Bocina, Hélice pasan a ser hijos directos
-- del sistema PROP (en lugar de hijos de PROP-MTR), para que aparezcan
-- visibles al desplegar "Propulsión Principal" en Equipos.
--
-- La propagación de horas (trigger trg_propagar_horas) se extiende con
-- horas_fuente_id: una referencia explícita al nodo propio del que heredan
-- horas aunque no sean sus descendientes directos por parent_id.
--
-- Resultado visual (EquipoWindow.hijos = parent_id === PROP.id):
--   ▸ Motor Principal   (propio, horas_fuente_id = null)
--   ▸ Reductora         (hereda, horas_fuente_id = PROP-MTR)
--   ▸ Eje y Bocina      (hereda, horas_fuente_id = PROP-MTR)
--   ▸ Hélice            (hereda, horas_fuente_id = PROP-MTR)
--
-- La invariante "un solo propio por cadena ascendente" se conserva:
-- PROP-RED/EJE/HEL tienen horometro='hereda' sin propio en su cadena;
-- el trigger los actualiza vía horas_fuente_id al recibir una lectura de MTR.

-- ── 1. Columna para referencia explícita de fuente de horas ──────────────
alter table public.equipos
  add column if not exists horas_fuente_id uuid
  references public.equipos(id) on delete set null;

comment on column public.equipos.horas_fuente_id is
  'Fuente explícita de horas: nodo ''propio'' que alimenta este nodo aunque '
  'no sea su ancestro por parent_id. Usado por el trigger trg_propagar_horas.';

-- ── 2. Reasignar parent_id + fijar fuente de horas (DM = embarcación demo) ──
-- Aplica solo si los nodos existen con el id_visible esperado.
with
  prop as (select id from public.equipos where id_visible = 'DM-PROP'),
  mtr  as (select id from public.equipos where id_visible = 'DM-PROP-MTR')
update public.equipos
set
  parent_id       = (select id from prop),
  horas_fuente_id = (select id from mtr)
where id_visible in ('DM-PROP-RED', 'DM-PROP-EJE', 'DM-PROP-HEL')
  and (select id from prop) is not null
  and (select id from mtr)  is not null;

-- ── 3. Re-sincronizar horas_actual en RED/EJE/HEL y sus descendientes ────
-- El trigger lo hace en la próxima lectura; este UPDATE hace la sync inicial.
with
  mtr_horas as (
    select horas_actual from public.equipos where id_visible = 'DM-PROP-MTR'
  ),
  raices as (
    select id from public.equipos where id_visible in ('DM-PROP-RED', 'DM-PROP-EJE', 'DM-PROP-HEL')
  ),
  descendientes as (
    select e.id
    from public.equipos e
    join raices r on e.parent_id = r.id
    where e.horometro = 'hereda'
  )
update public.equipos
set horas_actual = (select horas_actual from mtr_horas)
where (id in (select id from raices) and horometro = 'hereda')
   or id in (select id from descendientes);

-- ── 4. Actualizar función del trigger para propagar vía horas_fuente_id ──
create or replace function public.fn_propagar_horas_horometro()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  tiene_posterior boolean;
begin
  -- Lectura retroactiva: si ya existe una lectura posterior para este equipo
  -- no sobrescribimos horas_actual (permite correcciones sin retroceder).
  select exists(
    select 1 from lecturas_horometro
    where equipo_id = NEW.equipo_id
      and id <> NEW.id
      and fecha > NEW.fecha
  ) into tiene_posterior;

  if tiene_posterior then
    return NEW;
  end if;

  with recursive
  -- (a) Árbol estándar: el nodo propio + todos sus descendientes 'hereda'
  --     (propagación hacia abajo por parent_id).
  arbol_propio as (
    select id, horometro, parent_id
    from equipos
    where id = NEW.equipo_id
    union all
    select e.id, e.horometro, e.parent_id
    from equipos e
    join arbol_propio a on e.parent_id = a.id
    where e.horometro = 'hereda'
  ),
  -- (b) Nodos con referencia explícita (horas_fuente_id = propio) +
  --     sus propios descendientes 'hereda'.
  --     Cubre Reductora/Eje/Hélice que son hermanos del motor pero
  --     dependen de sus horas (tren propulsor).
  arbol_fuente as (
    select id, horometro, parent_id
    from equipos
    where horas_fuente_id = NEW.equipo_id
    union all
    select e.id, e.horometro, e.parent_id
    from equipos e
    join arbol_fuente af on e.parent_id = af.id
    where e.horometro = 'hereda'
  )
  update equipos
  set horas_actual = NEW.horas
  where id in (select id from arbol_propio)
     or id in (select id from arbol_fuente);

  return NEW;
end;
$$;
