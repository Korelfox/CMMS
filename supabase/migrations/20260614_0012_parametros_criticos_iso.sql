-- Umbrales de condición PdM por instrumento/componente (ISO 13374 / ISO 10816 / ISO 4413).
-- JSONB flexible: array de objetos con la forma
--   { tipo, parametro, unidad, min_alerta?, min_critico?, max_alerta?, max_critico?, norma }
-- La plantilla pesquera siembra valores de referencia; el usuario puede ajustarlos
-- en Equipos → Ficha técnica. La columna es NULL si no aplica (nodos agrupadores).

alter table public.equipos
  add column if not exists parametros_criticos jsonb;

comment on column public.equipos.parametros_criticos is
  'Umbrales PdM ISO 13374/10816/4413: [{tipo,parametro,unidad,min_alerta?,min_critico?,max_alerta?,max_critico?,norma}]';

-- Sembrar umbrales en sensores ya instalados por la plantilla pesquera ISO 14224.
-- La condición "parametros_criticos is null" protege ajustes previos del usuario.
with updates (pat, param) as (values
  ('%-PROP-MTR-LUB-SEN',
    '[{"tipo":"presion","parametro":"Presión de Aceite","unidad":"bar","min_alerta":2.0,"min_critico":1.5,"norma":"ISO 13374"},{"tipo":"temperatura","parametro":"Temperatura de Aceite","unidad":"°C","max_alerta":105,"max_critico":110,"norma":"ISO 13374"}]'::jsonb),

  ('%-GEN-MTR-LUB-SEN',
    '[{"tipo":"presion","parametro":"Presión de Aceite","unidad":"bar","min_alerta":2.0,"min_critico":1.5,"norma":"ISO 13374"}]'::jsonb),

  ('%-PROP-MTR-FW-SEN',
    '[{"tipo":"temperatura","parametro":"Temperatura Refrigerante","unidad":"°C","max_alerta":90,"max_critico":95,"norma":"ISO 13374"}]'::jsonb),

  ('%-GEN-MTR-FW-SEN',
    '[{"tipo":"temperatura","parametro":"Temperatura Refrigerante","unidad":"°C","max_alerta":90,"max_critico":95,"norma":"ISO 13374"}]'::jsonb),

  ('%-PROP-MTR-EXH-EGT',
    '[{"tipo":"temperatura","parametro":"Temperatura Escape (EGT)","unidad":"°C","max_alerta":520,"max_critico":550,"norma":"ISO 13374"}]'::jsonb),

  ('%-PROP-MTR-AIR-SEN',
    '[{"tipo":"presion","parametro":"Presión Sobrealimentación","unidad":"bar","min_alerta":1.2,"min_critico":1.0,"max_alerta":2.2,"max_critico":2.5,"norma":"ISO 13374"}]'::jsonb),

  ('%-PROP-MTR-CTRL-RPM',
    '[{"tipo":"velocidad","parametro":"RPM Motor","unidad":"rpm","max_alerta":2000,"max_critico":2200,"norma":"ISO 3046"},{"tipo":"vibracion","parametro":"Vibración Carcasa RMS","unidad":"mm/s","max_alerta":4.5,"max_critico":7.1,"norma":"ISO 10816"}]'::jsonb),

  ('%-PROP-MTR-FUEL-SEN',
    '[{"tipo":"presion","parametro":"Presión Suministro Combustible","unidad":"bar","min_alerta":2.0,"min_critico":1.5,"norma":"ISO 13374"}]'::jsonb),

  ('%-PROP-RED-SEN',
    '[{"tipo":"presion","parametro":"Presión Aceite Reductora","unidad":"bar","min_alerta":4.0,"min_critico":3.0,"norma":"ISO 13374"},{"tipo":"temperatura","parametro":"Temperatura Aceite Reductora","unidad":"°C","max_alerta":85,"max_critico":95,"norma":"ISO 13374"}]'::jsonb),

  ('%-GEN-MTR-ALT-VOL',
    '[{"tipo":"voltaje","parametro":"Voltaje Alternador","unidad":"V","min_alerta":210,"min_critico":200,"max_alerta":235,"max_critico":245,"norma":"IEC 60092"},{"tipo":"frecuencia","parametro":"Frecuencia","unidad":"Hz","min_alerta":49,"min_critico":48,"max_alerta":51,"max_critico":52,"norma":"IEC 60092"}]'::jsonb),

  ('%-HPU-MTR-SEN',
    '[{"tipo":"presion","parametro":"Presión Aceite Motor HPU","unidad":"bar","min_alerta":2.0,"min_critico":1.5,"norma":"ISO 13374"},{"tipo":"temperatura","parametro":"Temperatura Motor HPU","unidad":"°C","max_alerta":105,"max_critico":110,"norma":"ISO 13374"}]'::jsonb),

  ('%-HPU-SEN-P',
    '[{"tipo":"presion","parametro":"Presión Sistema Hidráulico","unidad":"bar","min_alerta":160,"min_critico":140,"max_alerta":210,"max_critico":230,"norma":"ISO 4413"}]'::jsonb),

  ('%-RSW-SEN-T',
    '[{"tipo":"temperatura","parametro":"Temperatura Bodega RSW","unidad":"°C","max_alerta":2,"max_critico":4,"norma":"ISO 5552"}]'::jsonb),

  ('%-CATCH-SEN',
    '[{"tipo":"oxigeno","parametro":"Oxígeno Disuelto","unidad":"mg/L","min_alerta":5.0,"min_critico":3.0,"norma":"FAO"},{"tipo":"temperatura","parametro":"Temperatura Agua Vivero","unidad":"°C","max_alerta":12,"max_critico":15,"norma":"FAO"}]'::jsonb),

  ('%-ELEC-MON-SEN',
    '[{"tipo":"vibracion","parametro":"Vibración Carcasa RMS","unidad":"mm/s","max_alerta":4.5,"max_critico":7.1,"norma":"ISO 10816"}]'::jsonb)
)
update equipos e
set parametros_criticos = u.param
from updates u
where e.id_visible like u.pat
  and e.parametros_criticos is null;
