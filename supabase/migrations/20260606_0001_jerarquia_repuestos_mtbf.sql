-- Jerarquía mundial CMMS: intercambiabilidad de repuestos, MTBF y stock por bodega

-- Intercambiabilidad de repuestos (OEM / Alternativo / Genérico)
alter table public.inventario_items
  add column if not exists tipo_repuesto text not null default 'oem',
  add column if not exists grupo_intercambio text;
comment on column public.inventario_items.tipo_repuesto is 'oem | alternativo | generico';
comment on column public.inventario_items.grupo_intercambio is 'Mismo valor = repuestos equivalentes/intercambiables del mismo componente';

-- MTBF objetivo por nodo funcional (horas)
alter table public.equipos
  add column if not exists mtbf_objetivo numeric;
comment on column public.equipos.mtbf_objetivo is 'MTBF objetivo en horas para el componente/sistema';

-- Stock mínimo crítico por bodega (barco vs tierra), no solo global
alter table public.stock
  add column if not exists stock_min numeric not null default 0;
comment on column public.stock.stock_min is 'Stock crítico mínimo en esta bodega (ej. 2-3 abordo, 1-2 en tierra)';
