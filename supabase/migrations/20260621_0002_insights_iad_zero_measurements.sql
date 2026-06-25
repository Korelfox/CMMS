-- IA-D mejorado: detecta tanto series PdM desactualizadas (>30 días)
-- como equipos con parametros_criticos configurados pero CERO mediciones.
-- La versión original solo cubría el caso stale; este parche cubre el caso zero.

create or replace function public._gen_insights(p_empresa uuid)
returns integer
language plpgsql
security definer
set search_path = public
as $vig$
declare
  emp          record;
  v_a          integer;
  v_corr       integer;
  v_sinmodo    integer;
  v_pct        integer;
  v_c          integer;
  v_d_stale    integer;
  v_d_zero     integer;
  v_d          integer;
  v_n          integer := 0;
begin
  for emp in select id from public.empresas where (p_empresa is null or id = p_empresa)
  loop
    -- IA-A · equipos sin criticidad (degrada scoring de riesgo / IA)
    select count(*) into v_a from public.equipos
      where empresa_id = emp.id and criticidad is null and tipo_nodo <> 'sistema';
    insert into public.insights (empresa_id, agente, severidad, titulo, detalle, valor)
    values (emp.id, 'IA-A',
      case when v_a > 20 then 'red' when v_a > 5 then 'amber' else 'ok' end,
      'Datos de criticidad',
      v_a || ' equipos sin criticidad asignada — InformeEjecutivo y Copiloto no priorizan bien sin A/B/C',
      v_a)
    on conflict (empresa_id, agente, corrida)
      do update set severidad = excluded.severidad, detalle = excluded.detalle, valor = excluded.valor, generado_en = now();

    -- IA-B · % OTs correctivas cerradas sin modo_falla ISO 14224
    select count(*) filter (where estado = 'cerrada' and tipo = 'correctivo'),
           count(*) filter (where estado = 'cerrada' and tipo = 'correctivo' and modo_falla is null)
      into v_corr, v_sinmodo
      from public.ordenes_trabajo where empresa_id = emp.id;
    v_pct := case when v_corr = 0 then 0 else round(v_sinmodo * 100.0 / v_corr) end;
    insert into public.insights (empresa_id, agente, severidad, titulo, detalle, valor)
    values (emp.id, 'IA-B',
      case when v_corr < 5 then 'ok' when v_pct > 60 then 'red' when v_pct > 30 then 'amber' else 'ok' end,
      'Codificación ISO de fallas',
      case when v_corr < 5 then 'Pocas correctivas cerradas para evaluar (' || v_corr || ')'
           else v_sinmodo || ' de ' || v_corr || ' correctivas cerradas sin modo_falla (' || v_pct || '%) — DiagnósticoFallas trabaja incompleto' end,
      v_pct)
    on conflict (empresa_id, agente, corrida)
      do update set severidad = excluded.severidad, detalle = excluded.detalle, valor = excluded.valor, generado_en = now();

    -- IA-C · equipos críticos A con <4 correctivas cerradas (Weibull no ajusta)
    select count(*) into v_c from public.equipos e
      where e.empresa_id = emp.id and e.criticidad = 'A'
        and (select count(*) from public.ordenes_trabajo o
             where o.equipo_id = e.id and o.tipo = 'correctivo' and o.estado = 'cerrada') < 4;
    insert into public.insights (empresa_id, agente, severidad, titulo, detalle, valor)
    values (emp.id, 'IA-C',
      case when v_c > 0 then 'amber' else 'ok' end,
      'Historial de críticos A',
      v_c || ' equipos críticos A con <4 correctivas cerradas — ConfiabilidadML no puede ajustar Weibull',
      v_c)
    on conflict (empresa_id, agente, corrida)
      do update set severidad = excluded.severidad, detalle = excluded.detalle, valor = excluded.valor, generado_en = now();

    -- IA-D · series PdM desactualizadas (>30 días) O equipos sin ninguna medición
    -- Series con alguna medición pero desactualizadas
    select count(*) into v_d_stale from (
      select distinct on (equipo_id, tipo, parametro) fecha
      from public.mediciones_pdm where empresa_id = emp.id
      order by equipo_id, tipo, parametro, fecha desc, created_at desc
    ) s where s.fecha < current_date - 30;

    -- Equipos con parametros_criticos configurados pero cero mediciones registradas
    select count(*) into v_d_zero
      from public.equipos
      where empresa_id = emp.id
        and parametros_criticos is not null
        and jsonb_array_length(parametros_criticos) > 0
        and not exists (
          select 1 from public.mediciones_pdm m
          where m.equipo_id = equipos.id and m.empresa_id = emp.id
        );

    v_d := v_d_stale + v_d_zero;

    insert into public.insights (empresa_id, agente, severidad, titulo, detalle, valor)
    values (emp.id, 'IA-D',
      case when v_d > 0 then 'amber' else 'ok' end,
      'Señales PdM activas',
      case
        when v_d = 0 then 'Todas las series PdM están al día'
        when v_d_zero > 0 and v_d_stale > 0 then
          v_d_zero || ' equipos sin ninguna medición PdM · ' || v_d_stale || ' series desactualizadas (>30 días) — DiagnósticoFallas pierde contexto'
        when v_d_zero > 0 then
          v_d_zero || ' equipos con parámetros PdM configurados pero sin mediciones — comenzar monitoreo'
        else
          v_d_stale || ' series PdM sin medición en >30 días — DiagnósticoFallas pierde contexto de condición'
      end,
      v_d)
    on conflict (empresa_id, agente, corrida)
      do update set severidad = excluded.severidad, detalle = excluded.detalle, valor = excluded.valor, generado_en = now();

    v_n := v_n + 4;
  end loop;
  return v_n;
end;
$vig$;

revoke execute on function public._gen_insights(uuid) from public, anon, authenticated;
