-- ============================================================
--  Función de mantenimiento: limpiar los datos operativos de UNA flota.
--  Usada por el botón "Limpiar CMMS" en Empresas & Flotas (super admin).
--
--  Solo super_admin. Conserva: empresa, usuarios, embarcaciones, bodegas,
--  especies, tipos de documento y las trazas (bitácora, audit_log).
--  Borra todo el dominio operativo de mantención.
--
--  SECURITY DEFINER: corre como owner (bypassa RLS) para poder borrar; la
--  autorización la impone el chequeo de rol interno (no se confía en la UI).
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
  -- Orden seguro hijos → padres (respeta RESTRICT compras_items→inventario_items
  -- y NO ACTION prezarpes→mareas / marea_*→mareas).
  v_tablas text[] := array[
    'historial_pm','compras_items','movimientos','stock','inventario_item_destinos',
    'compras','cgm','criticidad','weibull','planes_pm','marea_captura','marea_economia',
    'prezarpes','solicitudes','programacion','fallas','adjuntos','auditoria_mes',
    'mgm_fases','documentos','ordenes_trabajo','mareas','equipos','inventario_items'
  ];
  v_t text;
begin
  -- Autorización: solo super_admin
  select rol into v_rol from profiles where id = auth.uid();
  if v_rol is distinct from 'super_admin' then
    raise exception 'No autorizado: se requiere rol super_admin (rol actual: %)', coalesce(v_rol, 'sin sesión');
  end if;

  select nombre into v_nombre from empresas where id = p_empresa;
  if v_nombre is null then
    raise exception 'La empresa % no existe', p_empresa;
  end if;

  -- Borrado en orden, acumulando conteos por tabla
  foreach v_t in array v_tablas loop
    execute format('delete from public.%I where empresa_id = $1', v_t) using p_empresa;
    get diagnostics v_n = row_count;
    if v_n > 0 then
      v_counts := v_counts || jsonb_build_object(v_t, v_n);
    end if;
  end loop;

  -- Traza del propio borrado (bitácora se conserva)
  insert into bitacora (empresa_id, usuario_id, usuario_nombre, rol, accion, detalle)
  select p_empresa, auth.uid(), coalesce(pr.nombre, ''), 'super_admin',
         'Limpiar CMMS (flota)',
         v_nombre || ' · datos operativos de mantención borrados'
  from profiles pr where pr.id = auth.uid();

  return jsonb_build_object('empresa', v_nombre, 'borrados', v_counts);
end;
$$;

-- Solo usuarios autenticados pueden invocarla; la función filtra por rol.
revoke all on function public.app_limpiar_flota(uuid) from public, anon;
grant execute on function public.app_limpiar_flota(uuid) to authenticated;
