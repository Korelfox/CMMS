-- Historial de informes ejecutivos generados por IA.
-- Permite consultar y reimprimir cualquier informe generado anteriormente.
create table if not exists informes_ejecutivos (
  id            uuid primary key default gen_random_uuid(),
  empresa_id    uuid not null references empresas(id) on delete cascade,
  fecha         date not null,
  periodo_meses int not null,
  periodo_label text not null,
  texto_md      text not null,
  contexto_json jsonb,
  created_by    uuid references auth.users(id),
  created_at    timestamptz not null default now()
);

alter table informes_ejecutivos enable row level security;

create policy "empresa_informes_rls" on informes_ejecutivos
  for all
  using (empresa_id = (select empresa_id from profiles where id = auth.uid()))
  with check (empresa_id = (select empresa_id from profiles where id = auth.uid()));
