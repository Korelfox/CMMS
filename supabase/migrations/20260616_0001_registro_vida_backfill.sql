-- Backfill registro de vida (plantilla pesquera): horómetro, ficha._registro y
-- horas_fuente_id en equipos precargados antes de REGISTRO_POR_PREFIJO.
--
-- Idempotente y conservador:
--   • horometro: solo ajusta filas que siguen en default 'hereda'
--   • ficha._registro: solo si falta la clave
--   • horas_fuente_id: solo si es null
--   • consume_aceite: solo activa en motores propio que aún no lo tienen
--
-- Código de plantilla = id_visible sin prefijo de embarcación (primer '-').

-- ── 1. Puntos de horómetro propio (motores / compresores) ─────────────────
update public.equipos e
set horometro = 'propio'
where e.horometro = 'hereda'
  and regexp_replace(e.id_visible, '^[^-]+-', '') ~ '^(PROP-MTR|GEN-MTR|GEN-EMG|HPU-MTR|AIR-ARR-CMP|AIR-SRV-CMP|RSW-CMP-CMP)$';

-- ── 2. Equipos por fecha / instalación → sin horómetro ─────────────────────
update public.equipos e
set horometro = 'no'
where e.horometro = 'hereda'
  and regexp_replace(e.id_visible, '^[^-]+-', '') ~ '^(STR-|NAV-|COMM-|SAF-|FISH-TRA|FISH-LIN|ANCH-ANC|ANCH-BIT|FUEL-TNK|WAT-LST|WAT-TND|ELEC-ALU-NAV|FIRE-EXT)';

-- ── 3. ficha._registro (fecha) ─────────────────────────────────────────────
update public.equipos e
set ficha = coalesce(e.ficha, '{}'::jsonb) || jsonb_build_object('_registro', 'fecha')
where (e.ficha ->> '_registro' is null or e.ficha ->> '_registro' = '')
  and regexp_replace(e.id_visible, '^[^-]+-', '') ~ '^(STR-|NAV-|COMM-|SAF-|FISH-TRA|FISH-LIN|ANCH-ANC|ANCH-BIT|FUEL-TNK|WAT-LST|WAT-TND|ELEC-ALU-NAV|FIRE-EXT)';

-- ── 4. ficha._registro (mixto: gobierno, virador, grúa) ────────────────────
update public.equipos e
set ficha = coalesce(e.ficha, '{}'::jsonb) || jsonb_build_object('_registro', 'mixto')
where (e.ficha ->> '_registro' is null or e.ficha ->> '_registro' = '')
  and regexp_replace(e.id_visible, '^[^-]+-', '') ~ '^(STEER-|FISH-VIR|FISH-GRU)';

-- ── 5. consume_aceite en motores diésel propio ─────────────────────────────
update public.equipos e
set consume_aceite = true
where e.horometro = 'propio'
  and coalesce(e.consume_aceite, false) = false
  and regexp_replace(e.id_visible, '^[^-]+-', '') ~ '^(PROP-MTR|GEN-MTR|GEN-EMG|HPU-MTR)$';

-- ── 6. horas_fuente_id — transmisión ← motor principal (misma embarcación) ─
update public.equipos e
set horas_fuente_id = mtr.id
from public.equipos mtr
where e.horas_fuente_id is null
  and e.horometro = 'hereda'
  and e.embarcacion_id = mtr.embarcacion_id
  and regexp_replace(mtr.id_visible, '^[^-]+-', '') = 'PROP-MTR'
  and mtr.horometro = 'propio'
  and regexp_replace(e.id_visible, '^[^-]+-', '') ~ '^PROP-(RED|EJE|HEL)';

-- ── 7. horas_fuente_id — gobierno / virador ← HPU-MTR ──────────────────────
update public.equipos e
set horas_fuente_id = mtr.id
from public.equipos mtr
where e.horas_fuente_id is null
  and e.horometro = 'hereda'
  and e.embarcacion_id = mtr.embarcacion_id
  and regexp_replace(mtr.id_visible, '^[^-]+-', '') = 'HPU-MTR'
  and mtr.horometro = 'propio'
  and regexp_replace(e.id_visible, '^[^-]+-', '') ~ '^(STEER-|FISH-VIR)';

-- ── 8. Resincronizar horas_actual vía horas_fuente_id (nodos ya enlazados) ─
with fuentes as (
  select e.id as nodo_id, f.horas_actual as horas_fuente
  from public.equipos e
  join public.equipos f on f.id = e.horas_fuente_id
  where e.horometro = 'hereda'
    and f.horometro = 'propio'
    and e.horas_actual is distinct from f.horas_actual
)
update public.equipos t
set horas_actual = fuentes.horas_fuente
from fuentes
where t.id = fuentes.nodo_id;
