-- ============================================================
--  Supervisor de conectores de Órdenes de Trabajo.
--
--  Verifica que cada OT y sus relaciones (equipo, nave, varada,
--  solicitud) sean válidas y consistentes, de modo que la OT fluya
--  correctamente hasta los análisis de confiabilidad, costos y el
--  Informe Ejecutivo de IA. Análogo a fn_audit_horometro.
--
--  Severidad:
--    critico — relación rota (apunta a algo inexistente / inconsistente)
--    aviso   — la OT funciona a nivel nave pero queda fuera de un análisis
--              (típicamente sin equipo → invisible a confiabilidad por equipo)
--
--  Además: varada_trabajos.equipo_id — permite vincular un trabajo de
--  varada a un equipo del árbol, para que la OT generada herede el
--  equipo y conecte con confiabilidad/MTBF/Pareto. Opcional: los
--  trabajos de casco/estructura legítimamente no tienen equipo.
-- ============================================================

alter table public.varada_trabajos
  add column if not exists equipo_id uuid references public.equipos(id) on delete set null;

comment on column public.varada_trabajos.equipo_id is
  'Equipo del árbol al que aplica el trabajo de varada (opcional). La OT '
  'generada desde el trabajo hereda este equipo para conectar con confiabilidad.';

create or replace function public.fn_audit_ot(p_empresa uuid default null)
returns table (
  ot_id          uuid,
  folio          text,
  embarcacion    text,
  equipo         text,
  tipo_violacion text,
  severidad      text,
  detalle        text
)
language sql
stable
security definer
set search_path = public
as $$
  with base as (
    select o.*, em.nombre as nave, eq.id_visible as eq_vis, eq.embarcacion_id as eq_emb,
           v.nombre as varada_nom
    from ordenes_trabajo o
    left join embarcaciones em on em.id = o.embarcacion_id
    left join equipos eq       on eq.id = o.equipo_id
    left join varadas v        on v.id  = o.varada_id
    where (p_empresa is null or o.empresa_id = p_empresa)
  )
  -- OT sin equipo: funciona a nivel nave, pero invisible a confiabilidad por equipo
  select id, folio, nave, null::text, 'equipo_sin_vinculo', 'aviso',
    case when varada_id is not null
      then 'Planificada desde varada «' || coalesce(varada_nom, '?') || '» sin equipo — no alimenta confiabilidad/MTBF/Pareto por equipo'
      else 'OT sin equipo vinculado — no aparece en el análisis por equipo' end
  from base where equipo_id is null

  union all
  -- equipo_id apunta a un equipo inexistente
  select id, folio, nave, null, 'equipo_huerfano', 'critico',
    'equipo_id apunta a un equipo inexistente (borrado)'
  from base where equipo_id is not null and eq_vis is null

  union all
  -- la OT y su equipo pertenecen a naves distintas
  select id, folio, nave, eq_vis, 'nave_inconsistente', 'critico',
    'La OT (' || coalesce(nave, '?') || ') y su equipo pertenecen a naves distintas'
  from base
  where equipo_id is not null and eq_vis is not null
    and embarcacion_id is not null and eq_emb is distinct from embarcacion_id

  union all
  -- varada_id apunta a una varada inexistente
  select id, folio, nave, eq_vis, 'varada_huerfana', 'critico',
    'varada_id apunta a una varada inexistente'
  from base where varada_id is not null and varada_nom is null

  union all
  -- origen_solicitud_id apunta a una solicitud inexistente
  select id, folio, nave, eq_vis, 'solicitud_huerfana', 'aviso',
    'origen_solicitud_id apunta a una solicitud inexistente'
  from base
  where origen_solicitud_id is not null
    and not exists (select 1 from solicitudes s where s.id = base.origen_solicitud_id)

  union all
  -- correctiva cerrada sin MTTR: no alimenta MTBF/Weibull/lucro cesante
  select id, folio, nave, eq_vis, 'correctiva_sin_mttr', 'aviso',
    'Correctiva cerrada sin MTTR — no alimenta MTBF/Weibull/lucro cesante'
  from base where tipo = 'correctivo' and estado = 'cerrada' and coalesce(mttr_horas, 0) = 0

  union all
  -- OT automática sin huella de idempotencia (riesgo de duplicación)
  select id, folio, nave, eq_vis, 'auto_sin_huella', 'aviso',
    'OT automática sin huella de idempotencia — riesgo de duplicación'
  from base where origen = 'auto' and (huella is null or huella = '')

  union all
  -- trabajo de varada que referencia una OT inexistente (dirección inversa)
  select t.ot_id, null::text, em.nombre, null::text, 'trabajo_varada_huerfano', 'aviso',
    'Trabajo de varada «' || coalesce(t.descripcion, '?') || '» referencia una OT inexistente'
  from varada_trabajos t
  left join varadas v        on v.id  = t.varada_id
  left join embarcaciones em on em.id = v.embarcacion_id
  where t.ot_id is not null
    and not exists (select 1 from ordenes_trabajo o where o.id = t.ot_id)
    and (p_empresa is null or t.empresa_id = p_empresa);
$$;

grant execute on function public.fn_audit_ot(uuid) to authenticated;
