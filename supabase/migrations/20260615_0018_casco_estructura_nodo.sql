-- ============================================================
--  Vincular trabajos de varada al árbol de equipos (incluye Casco).
--
--  El sistema "Casco y Estructura" (STR) ya existe en la plantilla con el
--  subsistema STR-CAS (Casco). Faltaba conectar ahí los trabajos/OT de varada
--  con sistema = 'Casco' (obra viva / carena), y los que nombran un equipo
--  directamente (ej. "Motor principal"). Así toda OT de varada alimenta
--  confiabilidad y el supervisor de conectores OT queda en verde.
--
--  fn_demo_vincular_varada_equipos:
--    1) mapa de categorías: Propulsión/Gobierno/Eléctrico/Seguridad/Casco → patrón.
--    2) fallback: el texto del sistema coincide con el NOMBRE de un equipo.
-- ============================================================

create or replace function public.fn_demo_vincular_varada_equipos(p_empresa uuid default null)
returns void language plpgsql security definer set search_path = public as $$
begin
  -- 1) Mapa de categorías (texto del trabajo de varada → patrón de id_visible)
  with sysmap(sis, pat) as (values
    ('Propulsión','%-PROP-EJE%'), ('Gobierno','%-STEER%'),
    ('Eléctrico','%-ELEC%'),      ('Seguridad','%-SAF%'), ('Casco','%-STR-CAS%'))
  update public.ordenes_trabajo o
  set equipo_id = (
    select e.id from public.equipos e
    where e.embarcacion_id = o.embarcacion_id and e.id_visible like sm.pat and e.tipo_nodo <> 'sistema'
    order by e.id_visible limit 1)
  from sysmap sm
  where o.varada_id is not null and o.equipo_id is null and o.sistema = sm.sis
    and (p_empresa is null or o.empresa_id = p_empresa);

  with sysmap(sis, pat) as (values
    ('Propulsión','%-PROP-EJE%'), ('Gobierno','%-STEER%'),
    ('Eléctrico','%-ELEC%'),      ('Seguridad','%-SAF%'), ('Casco','%-STR-CAS%'))
  update public.varada_trabajos t
  set equipo_id = (
    select e.id from public.equipos e join public.varadas v on v.id = t.varada_id
    where e.embarcacion_id = v.embarcacion_id and e.id_visible like sm.pat and e.tipo_nodo <> 'sistema'
    order by e.id_visible limit 1)
  from sysmap sm
  where t.equipo_id is null and t.sistema = sm.sis
    and (p_empresa is null or t.empresa_id = p_empresa);

  -- 2) Fallback: el texto del sistema coincide con el NOMBRE de un equipo de la nave.
  update public.ordenes_trabajo o
  set equipo_id = (
    select e.id from public.equipos e
    where e.embarcacion_id = o.embarcacion_id and lower(e.sistema) = lower(o.sistema) and e.tipo_nodo <> 'sistema'
    order by e.id_visible limit 1)
  where o.varada_id is not null and o.equipo_id is null and o.sistema is not null
    and (p_empresa is null or o.empresa_id = p_empresa)
    and exists (select 1 from public.equipos e
                where e.embarcacion_id = o.embarcacion_id and lower(e.sistema) = lower(o.sistema) and e.tipo_nodo <> 'sistema');

  update public.varada_trabajos t
  set equipo_id = (
    select e.id from public.equipos e join public.varadas v on v.id = t.varada_id
    where e.embarcacion_id = v.embarcacion_id and lower(e.sistema) = lower(t.sistema) and e.tipo_nodo <> 'sistema'
    order by e.id_visible limit 1)
  where t.equipo_id is null and t.sistema is not null
    and (p_empresa is null or t.empresa_id = p_empresa)
    and exists (select 1 from public.equipos e join public.varadas v on v.id = t.varada_id
                where e.embarcacion_id = v.embarcacion_id and lower(e.sistema) = lower(t.sistema) and e.tipo_nodo <> 'sistema');
end;
$$;
revoke all on function public.fn_demo_vincular_varada_equipos(uuid) from public, anon, authenticated;
grant  execute on function public.fn_demo_vincular_varada_equipos(uuid) to service_role;

select public.fn_demo_vincular_varada_equipos(null);
