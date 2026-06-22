-- Alinea el agente IA-A del Vigilante con el motor de brechas del Copiloto.
--
-- IA-A contaba nodos sin criticidad con `tipo_nodo <> 'sistema'`, lo que incluye
-- subsistemas PADRE (con hijos) que son agrupación y no se clasifican. El motor
-- de brechas del app (analizarBrechas → esHojaEvaluable, que alimenta
-- saludRegistro del Copiloto) solo exige criticidad a nodos HOJA EVALUABLES:
-- componente/instrumento/equipo + subsistemas SIN hijos. Aquí IA-A pasa a esa
-- misma población, para un único criterio de "falta criticidad" en toda la app.
--
-- Nota: IA-A usa esHojaEvaluable (incluye subsistemas hoja, que son unidades
-- mantenibles a clasificar), distinto de IA-C que usa esComponenteNodo (solo
-- operativos con historial de fallas). Son gaps distintos sobre poblaciones
-- distintas; ambos excluyen agrupación (sistema / subsistema padre).
--
-- Resto de la función idéntico a 20260622_0001 (IA-C ya leaf).

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
    -- IA-A · nodos hoja evaluables sin criticidad (componente/instrumento/equipo
    -- + subsistemas SIN hijos). Igual que esHojaEvaluable del motor de brechas.
    select count(*) into v_a from public.equipos e
      where e.empresa_id = emp.id and e.criticidad is null
        and ( e.tipo_nodo in ('componente','instrumento','equipo')
              or (e.tipo_nodo = 'subsistema'
                  and not exists (select 1 from public.equipos c where c.parent_id = e.id)) );
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

    -- IA-C · componentes críticos A con <4 correctivas cerradas (Weibull no ajusta).
    -- Solo nodos hoja: sistema/subsistema son agrupación, no acumulan correctivas.
    select count(*) into v_c from public.equipos e
      where e.empresa_id = emp.id and e.criticidad = 'A'
        and e.tipo_nodo in ('componente','instrumento','equipo')
        and (select count(*) from public.ordenes_trabajo o
             where o.equipo_id = e.id and o.tipo = 'correctivo' and o.estado = 'cerrada') < 4;
    insert into public.insights (empresa_id, agente, severidad, titulo, detalle, valor)
    values (emp.id, 'IA-C',
      case when v_c > 0 then 'amber' else 'ok' end,
      'Historial de críticos A',
      v_c || ' componentes críticos A con <4 correctivas cerradas — ConfiabilidadML no puede ajustar Weibull',
      v_c)
    on conflict (empresa_id, agente, corrida)
      do update set severidad = excluded.severidad, detalle = excluded.detalle, valor = excluded.valor, generado_en = now();

    -- IA-D · series PdM desactualizadas (>30 días) O equipos sin ninguna medición
    select count(*) into v_d_stale from (
      select distinct on (equipo_id, tipo, parametro) fecha
      from public.mediciones_pdm where empresa_id = emp.id
      order by equipo_id, tipo, parametro, fecha desc, created_at desc
    ) s where s.fecha < current_date - 30;

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
