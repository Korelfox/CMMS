-- E3a: fn_ot_add_costo_mat sin SET search_path (función SQL expuesta a
-- search_path injection si un rol puede alterar el search_path de sesión).
-- Agrega SET search_path = public para fijar el contexto de resolución de nombres.

CREATE OR REPLACE FUNCTION public.fn_ot_add_costo_mat(
  p_ot   uuid,
  p_delta numeric,
  p_por  text
)
RETURNS void
LANGUAGE sql
SET search_path = public
AS $$
  UPDATE public.ordenes_trabajo
     SET costo_mat    = COALESCE(costo_mat, 0) + p_delta,
         costos_por   = p_por,
         costos_fecha = now()
   WHERE id = p_ot;
$$;
