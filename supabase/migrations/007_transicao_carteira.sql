-- =====================================================================
-- 007 — Transição da carteira (/carteira/)
-- Projetos de design passando para a carteira do Rafael: etapa + histórico.
-- Leitura pública (a página é compartilhada por link); só o dono altera.
-- =====================================================================

create table if not exists public.transicao_projetos (
  id            text primary key,
  nome          text not null,
  ordem         int  not null default 0,
  etapa         text not null default 'a_iniciar'
                check (etapa in ('a_iniciar','em_andamento','pausado','concluido')),
  historico     jsonb not null default '[]'::jsonb,
  updated_at    timestamptz not null default now()
);

drop trigger if exists transicao_projetos_touch on public.transicao_projetos;
create trigger transicao_projetos_touch before update on public.transicao_projetos
  for each row execute function public.touch_updated_at();

alter table public.transicao_projetos enable row level security;

drop policy if exists transicao_ler on public.transicao_projetos;
create policy transicao_ler on public.transicao_projetos for select to anon, authenticated using (true);

drop policy if exists transicao_dono on public.transicao_projetos;
create policy transicao_dono on public.transicao_projetos for all to authenticated
  using (public.is_owner()) with check (public.is_owner());

insert into public.transicao_projetos (id, nome, ordem) values
  ('vellora','Vellora',1),
  ('prime-brindes','PRIME Brindes',2),
  ('acrilux','Acrilux',3),
  ('frotix','Frotix Tecnologia',4),
  ('bbg','BBG Securitizadora S/A',5),
  ('mundo-telecom','Mundo Telecom',6),
  ('cedro','Cedro',7),
  ('o-liberal','O Liberal',8),
  ('shangrila','Shangrila',9),
  ('neutral-care','Neutral Care (SM)',10),
  ('colegio-objetivo','Colégio Objetivo*',11),
  ('serv7','Serv7',12),
  ('complexo-salvatore','Complexo Salvatore',13),
  ('ouroplast','Ouroplast',14),
  ('max','Max',15)
on conflict (id) do nothing;

-- Permissões de tabela (as regras RLS acima decidem o que cada um vê/altera)
grant select on public.transicao_projetos to anon;
grant select, insert, update, delete on public.transicao_projetos to authenticated;
