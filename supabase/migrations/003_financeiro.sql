-- =====================================================================
-- 003 — Parceiros, repasse e controle financeiro mensal
-- Cada cliente pode ter um parceiro com repasse fixo mensal.
-- Cada mês gera um lançamento por contrato mensal ativo, com o valor, o
-- repasse e o parceiro daquele momento. Depois que o mês tem pagamento
-- registrado, os valores ficam congelados (mudar o fee não reescreve o passado).
-- =====================================================================

create table if not exists public.parceiros (
  id          uuid primary key default gen_random_uuid(),
  nome        text not null,
  servico     text,
  whatsapp    text,
  pix         text,
  obs         text,
  ativo       boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
drop trigger if exists parceiros_touch on public.parceiros;
create trigger parceiros_touch before update on public.parceiros
  for each row execute function public.touch_updated_at();

alter table public.clientes add column if not exists parceiro_id uuid references public.parceiros(id) on delete set null;
alter table public.clientes add column if not exists repasse numeric(12,2);

create table if not exists public.lancamentos (
  id            uuid primary key default gen_random_uuid(),
  cliente_id    uuid not null references public.clientes(id) on delete restrict,
  mes           text not null check (mes ~ '^\d{4}-\d{2}$'),
  valor         numeric(12,2) not null default 0,
  repasse       numeric(12,2) not null default 0,
  parceiro_id   uuid references public.parceiros(id) on delete set null,
  recebido_em   date,
  repassado_em  date,
  cancelado     boolean not null default false,
  obs           text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (cliente_id, mes)
);
create index if not exists lancamentos_mes_idx on public.lancamentos(mes);
drop trigger if exists lancamentos_touch on public.lancamentos;
create trigger lancamentos_touch before update on public.lancamentos
  for each row execute function public.touch_updated_at();

alter table public.parceiros   enable row level security;
alter table public.lancamentos enable row level security;
drop policy if exists parceiros_owner on public.parceiros;
create policy parceiros_owner on public.parceiros for all to authenticated
  using (public.is_owner()) with check (public.is_owner());
drop policy if exists lancamentos_owner on public.lancamentos;
create policy lancamentos_owner on public.lancamentos for all to authenticated
  using (public.is_owner()) with check (public.is_owner());
grant all on public.parceiros, public.lancamentos to authenticated;

-- Cria os lançamentos do mês para os contratos mensais ativos e mantém
-- sincronizados com o cadastro os que ainda não têm pagamento registrado.
-- Roda com as permissões de quem chama (RLS vale: só o dono consegue).
create or replace function public.gerar_lancamentos(
  p_mes text default to_char((now() at time zone 'America/Sao_Paulo')::date, 'YYYY-MM'))
returns int
language plpgsql set search_path = public as $$
declare
  fim date;
  n   int;
begin
  if p_mes !~ '^\d{4}-\d{2}$' then raise exception 'mês inválido: %', p_mes; end if;
  fim := (to_date(p_mes || '-01', 'YYYY-MM-DD') + interval '1 month - 1 day')::date;

  update public.lancamentos l
     set valor = coalesce(c.fee, 0), repasse = coalesce(c.repasse, 0), parceiro_id = c.parceiro_id
    from public.clientes c
   where l.cliente_id = c.id and l.mes = p_mes
     and l.recebido_em is null and l.repassado_em is null and not l.cancelado
     and (l.valor, l.repasse, l.parceiro_id) is distinct from (coalesce(c.fee, 0), coalesce(c.repasse, 0), c.parceiro_id);

  insert into public.lancamentos (cliente_id, mes, valor, repasse, parceiro_id)
  select c.id, p_mes, coalesce(c.fee, 0), coalesce(c.repasse, 0), c.parceiro_id
    from public.clientes c
   where c.status = 'ativo' and c.cobranca = 'mensal'
     and (c.inicio is null or c.inicio <= fim)
  on conflict (cliente_id, mes) do nothing;
  get diagnostics n = row_count;
  return n;
end $$;
revoke all on function public.gerar_lancamentos(text) from public, anon;
grant execute on function public.gerar_lancamentos(text) to authenticated;

-- Dia 1 de cada mês, 09:00 em São Paulo
select cron.unschedule(jobid) from cron.job where jobname = 'lancamentos-mensais';
select cron.schedule('lancamentos-mensais', '0 12 1 * *', $$select public.gerar_lancamentos()$$);
