-- 008 · Briefings de marca e site (/briefing/)
-- Mesmo desenho das respostas do CSAT: visitante só ENVIA, só o dono lê.
-- "dados" guarda { id_pergunta: { s: seção, t: texto, v: valor } }, então mudar
-- perguntas no formulário nunca exige mexer na estrutura.

create table if not exists public.briefings (
  id          uuid primary key default gen_random_uuid(),
  created_at  timestamptz not null default now(),
  tipo        text not null check (tipo in ('marca','site','marca-site','links','marca-links')),
  cliente     text not null,
  nome        text not null,
  contato     text,
  dados       jsonb not null default '{}'::jsonb,
  lido        boolean not null default false
);
create index if not exists briefings_created_idx on public.briefings(created_at desc);
create index if not exists briefings_cliente_idx on public.briefings(cliente);

alter table public.briefings enable row level security;

drop policy if exists briefings_insert on public.briefings;
create policy briefings_insert on public.briefings for insert to anon, authenticated
  with check (
    tipo in ('marca','site','marca-site','links','marca-links')
    and char_length(cliente) between 1 and 200
    and char_length(nome) between 1 and 200
    and pg_column_size(dados) < 60000
    and lido = false
  );
drop policy if exists briefings_owner on public.briefings;
create policy briefings_owner on public.briefings for select to authenticated using (public.is_owner());
drop policy if exists briefings_owner_upd on public.briefings;
create policy briefings_owner_upd on public.briefings for update to authenticated
  using (public.is_owner()) with check (public.is_owner());
drop policy if exists briefings_owner_del on public.briefings;
create policy briefings_owner_del on public.briefings for delete to authenticated using (public.is_owner());

grant insert on public.briefings to anon;
grant all on public.briefings to authenticated;
