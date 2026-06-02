create table if not exists public.pedidos (
  id text primary key,
  created_at timestamptz not null,
  updated_at timestamptz not null,
  data jsonb not null
);

create index if not exists pedidos_created_at_idx on public.pedidos (created_at desc);
create index if not exists pedidos_cliente_email_idx on public.pedidos ((lower(data->>'cliente_email')));
create index if not exists pedidos_cliente_whatsapp_idx on public.pedidos ((data->>'cliente_whatsapp'));

alter table public.pedidos enable row level security;

drop policy if exists "pedidos_service_role_all" on public.pedidos;
create policy "pedidos_service_role_all"
on public.pedidos
for all
to service_role
using (true)
with check (true);

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('audios', 'audios', false, 314572800, array['audio/mpeg', 'audio/wav', 'audio/x-wav', 'application/octet-stream']),
  ('comprovantes', 'comprovantes', false, 52428800, array['image/png', 'image/jpeg', 'application/pdf', 'application/octet-stream'])
on conflict (id) do update
set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "audios_service_role_all" on storage.objects;
create policy "audios_service_role_all"
on storage.objects
for all
to service_role
using (bucket_id = 'audios')
with check (bucket_id = 'audios');

drop policy if exists "comprovantes_service_role_all" on storage.objects;
create policy "comprovantes_service_role_all"
on storage.objects
for all
to service_role
using (bucket_id = 'comprovantes')
with check (bucket_id = 'comprovantes');

