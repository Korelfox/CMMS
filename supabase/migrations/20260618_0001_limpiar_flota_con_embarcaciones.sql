-- ============================================================
--  Actualización: limpiar_flota ahora borra también embarcaciones y bodegas.
--  Antes se conservaban; ahora la limpieza es completa.
--  Orden de borrado respeta FKs: bodegas antes de embarcaciones.
-- ============================================================
create or replace function public.app_limpiar_flota(p_empresa uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_rol    text;
  v_nombre text;
  v_counts jsonb := '{}'::jsonb;
  v_n      bigint;
  v_tablas text[] := array[
    'historial_pm','compras_items','movimientos','stock','inventario_item_destinos',
    'compras','cgm','criticidad','weibull','planes_pm','marea_captura','marea_economia',
    'prezarpes','solicitudes','programacion','fallas','adjuntos','auditoria_mes',
    'mgm_fases','documentos','ordenes_trabajo','mareas','equipos','inventario_items',
    'bodegas','embarcaciones'
  ];
  v_t text;
begin
  select rol into v_rol from profiles where id = auth.uid();
  if v_rol is distinct from 'super_admin' then
    raise exception 'No autorizado: se requiere rol super_admin (rol actual: %)', coalesce(v_rol, 'sin sesión');
  end if;

  select nombre into v_nombre from empresas where id = p_empresa;
  if v_nombre is null then
    raise exception 'La empresa % no existe', p_empresa;
  end if;

  foreach v_t in array v_tablas loop
    execute format('delete from public.%I where empresa_id = $1', v_t) using p_empresa;
    get diagnostics v_n = row_count;
    if v_n > 0 then
      v_counts := v_counts || jsonb_build_object(v_t, v_n);
    end if;
  end loop;

  insert into bitacora (empresa_id, usuario_id, usuario_nombre, rol, accion, detalle)
  select p_empresa, auth.uid(), coalesce(pr.nombre, ''), 'super_admin',
         'Limpiar CMMS (completo)',
         v_nombre || ' · todos los datos borrados (incluidas embarcaciones y bodegas)'
  from profiles pr where pr.id = auth.uid();

  return jsonb_build_object('empresa', v_nombre, 'borrados', v_counts);
end;
$$;

revoke all on function public.app_limpiar_flota(uuid) from public, anon;
grant execute on function public.app_limpiar_flota(uuid) to authenticated;
