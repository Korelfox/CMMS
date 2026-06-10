-- Modo de horómetro por equipo:
--   'propio'  = punto de horómetro (se ingresan lecturas aquí)
--   'hereda'  = usa las horas del ancestro con horómetro propio (componentes)
--   'no'      = no se lleva horómetro (estructura: mamparos, casco, etc.)
alter table public.equipos
  add column if not exists horometro text not null default 'hereda';

-- Semilla: los motores diésel son puntos de horómetro propios; lo que ya tenía
-- horas registradas también. La estructura (casco/mamparos/cubierta/ánodos) no
-- aplica. El resto queda 'hereda' (lo ajusta el usuario desde la pantalla).
update public.equipos
  set horometro = 'propio'
  where id_visible ~ '-(PROP-MTR|GEN-MTR|GEN-EMG|HPU-MTR)$'
     or coalesce(horas_actual, 0) > 0;

update public.equipos
  set horometro = 'no'
  where horometro <> 'propio'
    and ( id_visible ~ '-STR($|-)'
       or sistema ~* '(casco|mampar|cubierta|[áa]nodo|bita|ancla|estructura)' );
