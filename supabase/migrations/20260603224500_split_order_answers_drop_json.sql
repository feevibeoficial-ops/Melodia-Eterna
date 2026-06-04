create table if not exists public.pedido_respostas (
  pedido_id text not null references public.pedidos(id) on delete cascade,
  question_id text not null,
  answer_text text not null default '',
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  primary key (pedido_id, question_id)
);

alter table public.pedido_respostas enable row level security;

drop policy if exists "pedido_respostas_service_role_all" on public.pedido_respostas;
create policy "pedido_respostas_service_role_all"
on public.pedido_respostas
for all
to service_role
using (true)
with check (true);

insert into public.pedido_respostas (pedido_id, question_id, answer_text)
select
  p.id,
  r.key,
  coalesce(r.value, '')
from public.pedidos p
cross join lateral jsonb_each_text(
  coalesce(
    p.respostas,
    p.data->'respostas'->'respostas',
    '{}'::jsonb
  )
) as r(key, value)
on conflict (pedido_id, question_id) do update
set
  answer_text = excluded.answer_text,
  updated_at = timezone('utc', now());

alter table public.pedidos
  drop column if exists respostas,
  drop column if exists data;
