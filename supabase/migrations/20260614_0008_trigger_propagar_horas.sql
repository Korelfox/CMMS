-- Propagación automática de horas_actual al insertar en lecturas_horometro.
--
-- Antes: el frontend (Horometros.jsx, Prezarpe.jsx) y la Edge Function
-- ingest-horometro propagaban manualmente vía UPDATE client-side, sin
-- verificar errores y sin atomicidad. Si fallaba en silencio o si una
-- lectura llegaba por otra vía (import, SQL), horas_actual quedaba desfasado.
--
-- Ahora: el trigger ocurre AFTER INSERT en la misma transacción, cualquiera
-- sea la fuente (manual, prezarpe, recalada, telemetria, import, cron).
-- El cliente puede actualizar estado local para la UX pero ya no es
-- el responsable de la persistencia.

create or replace function public.fn_propagar_horas_horometro()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  tiene_posterior boolean;
begin
  -- Lectura retroactiva: si ya existe una lectura con fecha posterior para
  -- este equipo no sobrescribimos horas_actual (audit trail, no retraso).
  select exists(
    select 1 from lecturas_horometro
    where equipo_id = NEW.equipo_id
      and id <> NEW.id
      and fecha > NEW.fecha
  ) into tiene_posterior;

  if tiene_posterior then
    return NEW;
  end if;

  -- Propaga a todos los equipos cuyo punto horómetro es NEW.equipo_id:
  -- el propio + todos los descendientes con horometro = 'hereda'
  -- (búsqueda recursiva por parent_id).
  with recursive arbol as (
    -- Raíz: el equipo donde se registró la lectura
    select id, horometro, parent_id
    from equipos
    where id = NEW.equipo_id
    union all
    -- Descendientes que heredan horas del nodo padre
    select e.id, e.horometro, e.parent_id
    from equipos e
    join arbol a on e.parent_id = a.id
    where e.horometro = 'hereda'
  )
  update equipos
  set horas_actual = NEW.horas
  where id in (select id from arbol);

  return NEW;
end;
$$;

-- El trigger solo se dispara en INSERT, no en UPDATE de lecturas existentes.
drop trigger if exists trg_propagar_horas on public.lecturas_horometro;
create trigger trg_propagar_horas
  after insert on public.lecturas_horometro
  for each row execute function public.fn_propagar_horas_horometro();

comment on function public.fn_propagar_horas_horometro() is
  'Propaga horas_actual al árbol de equipos que heredan de un punto propio, '
  'para cualquier fuente de lectura (manual, prezarpe, recalada, telemetria).';
