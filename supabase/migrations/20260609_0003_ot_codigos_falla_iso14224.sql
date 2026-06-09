-- Códigos de falla ISO 14224 (cap. 8 / anexo B) en órdenes de trabajo.
-- Al cerrar una OT correctiva se codifica modo / causa / mecanismo desde un
-- catálogo estándar → Pareto y Weibull analizan datos codificados, no texto libre.
alter table public.ordenes_trabajo
  add column if not exists modo_falla      text,
  add column if not exists causa_falla     text,
  add column if not exists mecanismo_falla text;
