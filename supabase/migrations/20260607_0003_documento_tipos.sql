-- Catálogo editable de tipos de documentación por empresa (Cumplimiento)
create table if not exists public.documento_tipos (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresas(id) on delete cascade,
  nombre text not null,
  orden numeric default 0,
  created_at timestamptz default now()
);
alter table public.documento_tipos enable row level security;
drop policy if exists empresa_aislamiento on public.documento_tipos;
create policy empresa_aislamiento on public.documento_tipos for all to public
  using (empresa_id = (select profiles.empresa_id from public.profiles where profiles.id = (select auth.uid())))
  with check (empresa_id = (select profiles.empresa_id from public.profiles where profiles.id = (select auth.uid())));
create index if not exists idx_documento_tipos_empresa on public.documento_tipos (empresa_id);

-- Semilla: los 8 tipos estándar para cada empresa que aún no tenga ninguno
insert into public.documento_tipos (empresa_id, nombre, orden)
select e.id, t.nombre, t.orden
from public.empresas e
cross join (values
  ('Certificado de Navegabilidad', 1), ('Matrícula de la nave', 2), ('Certificado de Seguridad', 3),
  ('Seguro (póliza)', 4), ('Inscripción RPA', 5), ('Revisión técnica casco/máquinas', 6),
  ('Balsa salvavidas', 7), ('Extintores', 8)
) as t(nombre, orden)
where not exists (select 1 from public.documento_tipos dt where dt.empresa_id = e.id);
