-- CMMS autónomo · Informe Ejecutivo quincenal — contexto server-side.
--
-- El armador del contexto del frontend (src/lib/informe.js) no corre en un cron,
-- así que aquí se replica en SQL un contexto de alta señal por empresa: lo que la
-- gerencia necesita ver. La Edge Function informe-ejecutivo-cron lo pasa a Claude.
-- SECURITY INVOKER: la llama el service role (Edge Function), que ya lee todo.

create or replace function public.informe_contexto(p_empresa uuid, p_meses integer default 1)
returns jsonb
language sql
stable
set search_path = public
as $$
  with win as (
    select (current_date - (p_meses || ' months')::interval)::date as desde, current_date as hasta
  )
  select jsonb_build_object(
    'periodo', jsonb_build_object('meses', p_meses, 'desde', (select desde from win), 'hasta', (select hasta from win)),

    'flota', jsonb_build_object(
      'embarcaciones_activas', (select count(*) from embarcaciones where empresa_id = p_empresa and activa),
      'equipos',        (select count(*) from equipos where empresa_id = p_empresa and tipo_nodo <> 'sistema'),
      'criticos_A',     (select count(*) from equipos where empresa_id = p_empresa and criticidad = 'A'),
      'criticos_B',     (select count(*) from equipos where empresa_id = p_empresa and criticidad = 'B'),
      'criticos_C',     (select count(*) from equipos where empresa_id = p_empresa and criticidad = 'C'),
      'sin_criticidad', (select count(*) from equipos where empresa_id = p_empresa and criticidad is null and tipo_nodo <> 'sistema')
    ),

    'cumplimiento_pm', jsonb_build_object(
      'planes_activos', (select count(*) from planes_pm where empresa_id = p_empresa and activo),
      'vencidos', (
        select count(*) from planes_pm p join equipos eq on eq.id = p.equipo_id
        where p.empresa_id = p_empresa and p.activo and (
          (p.tipo_disparador <> 'calendario' and p.intervalo_horas > 0 and (eq.horas_actual - p.horas_ult_pm) >= p.intervalo_horas)
          or (p.tipo_disparador = 'calendario' and p.fecha_ult_pm is null)
          or (p.tipo_disparador = 'calendario' and p.fecha_ult_pm is not null
              and (current_date - p.fecha_ult_pm) >= coalesce(p.intervalo_calendario, 1) * case p.unidad_calendario
                when 'diario' then 1 when 'semanal' then 7 when 'mensual' then 30
                when 'trimestral' then 90 when 'semestral' then 182 when 'anual' then 365 else 30 end)
        )
      ),
      'proactividad_pct', (
        select case when count(*) = 0 then null else round(count(*) filter (where tipo = 'preventivo') * 100.0 / count(*)) end
        from ordenes_trabajo where empresa_id = p_empresa and fecha >= (select desde from win)
      )
    ),

    'ots_periodo', (
      select jsonb_build_object(
        'total', count(*),
        'cerradas', count(*) filter (where estado = 'cerrada'),
        'correctivas', count(*) filter (where tipo = 'correctivo'),
        'preventivas', count(*) filter (where tipo = 'preventivo'),
        'costo_total_clp', coalesce(sum(coalesce(costo_mo, 0) + coalesce(costo_mat, 0)) filter (where estado = 'cerrada'), 0)
      ) from ordenes_trabajo where empresa_id = p_empresa and fecha >= (select desde from win)
    ),

    'costos', jsonb_build_object(
      'gasto_periodo_clp', (select coalesce(sum(coalesce(costo_mo, 0) + coalesce(costo_mat, 0)), 0)
        from ordenes_trabajo where empresa_id = p_empresa and estado = 'cerrada' and fecha >= (select desde from win)),
      'presupuesto_anual_clp', (select coalesce(sum(monto), 0) from presupuestos
        where empresa_id = p_empresa and anio = extract(year from current_date)::int),
      'anio', extract(year from current_date)::int
    ),

    'inventario_critico', (
      with crit as (
        select distinct i.id, i.descripcion
        from inventario_items i
        join inventario_item_destinos d on d.item_id = i.id
        join equipos eq on eq.id = d.equipo_id and eq.criticidad = 'A'
        where i.empresa_id = p_empresa
          and (coalesce(i.stock_min, 0) > 0 or coalesce(i.stock_max, 0) > 0)
          and coalesce((select sum(s.cantidad) from stock s where s.item_id = i.id), 0) = 0
      )
      select jsonb_build_object(
        'items_sin_stock', (select count(*) from crit),
        'ejemplos', coalesce((select jsonb_agg(descripcion) from (select descripcion from crit limit 5) x), '[]'::jsonb)
      )
    ),

    'backlog', (
      select jsonb_build_object(
        'abiertas', count(*) filter (where estado <> 'cerrada'),
        'alta_critica', count(*) filter (where estado <> 'cerrada' and prioridad in ('alta', 'critica'))
      ) from ordenes_trabajo where empresa_id = p_empresa
    ),

    'calidad_datos', coalesce((
      select jsonb_agg(jsonb_build_object('agente', agente, 'severidad', severidad, 'valor', valor, 'titulo', titulo) order by agente)
      from insights where empresa_id = p_empresa and corrida = (select max(corrida) from insights where empresa_id = p_empresa)
    ), '[]'::jsonb),

    'autonomia', jsonb_build_object(
      'sugerencias_pendientes', (select count(*) from ot_sugerencias where empresa_id = p_empresa and estado = 'sugerida')
    )
  );
$$;

revoke execute on function public.informe_contexto(uuid, integer) from public, anon, authenticated;
grant  execute on function public.informe_contexto(uuid, integer) to service_role;
