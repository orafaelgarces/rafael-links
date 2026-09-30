-- =====================================================================
-- CRM + CSAT do Rafael Garcês — esquema do Supabase
-- Cole este arquivo inteiro em: Supabase → SQL Editor → New query → Run.
-- Pode rodar de novo sem medo: usa "if not exists" / "or replace".
-- =====================================================================

-- ---------- Dono do painel ----------
-- Só este e-mail lê e altera dados. (Cadastro público de usuários fica desligado.)
create or replace function public.is_owner() returns boolean
language sql stable as $$
  select coalesce(auth.jwt() ->> 'email', '') = 'rafaelgarces.adm@gmail.com'
$$;

create or replace function public.touch_updated_at() returns trigger
language plpgsql as $$
begin new.updated_at = now(); return new; end $$;

-- ---------- Clientes ----------
create table if not exists public.clientes (
  id              uuid primary key default gen_random_uuid(),
  nome            text not null,
  servicos        text[] not null default '{}',
  cobranca        text not null default 'mensal' check (cobranca in ('mensal','projeto')),
  fee             numeric(12,2),
  inicio          date,
  renovacao_meses int,
  status          text not null default 'ativo' check (status in ('ativo','pausado','encerrado')),
  encerramento    date,
  stakeholder     text,
  whatsapp        text,
  email           text,
  dia_csat        int check (dia_csat between 1 and 31),
  quota_mensal    int,
  origem          text,
  segmento        text,
  obs             text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
drop trigger if exists clientes_touch on public.clientes;
create trigger clientes_touch before update on public.clientes
  for each row execute function public.touch_updated_at();

-- ---------- Demandas ----------
create table if not exists public.demandas (
  id            uuid primary key default gen_random_uuid(),
  cliente_id    uuid references public.clientes(id) on delete set null,
  titulo        text not null,
  tipo          text,
  status        text not null default 'backlog' check (status in ('backlog','producao','aprovacao','concluido')),
  prioridade    text not null default 'normal' check (prioridade in ('alta','normal','baixa')),
  prazo         date,
  mes_ref       text,
  obs           text,
  concluido_em  timestamptz,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index if not exists demandas_cliente_idx on public.demandas(cliente_id);
drop trigger if exists demandas_touch on public.demandas;
create trigger demandas_touch before update on public.demandas
  for each row execute function public.touch_updated_at();

-- ---------- Perguntas do CSAT (editáveis no painel) ----------
create table if not exists public.perguntas (
  servico  text not null check (servico in ('site','marca','design')),
  id       text not null,
  tipo     text not null check (tipo in ('csat','nps','texto','escolha','mes')),
  texto    text not null,
  opcoes   text[],
  ordem    int  not null default 0,
  ativo    boolean not null default true,
  primary key (servico, id)
);

-- ---------- Respostas do CSAT ----------
-- "dados" guarda { "texto da pergunta": resposta }, então trocar perguntas
-- nunca exige mexer na estrutura do banco.
create table if not exists public.respostas (
  id          uuid primary key default gen_random_uuid(),
  created_at  timestamptz not null default now(),
  servico     text not null check (servico in ('site','marca','design')),
  cliente     text not null,
  nome        text not null,
  mes_ref     text,
  media_csat  numeric(3,1),
  nps         int check (nps between 0 and 10),
  dados       jsonb not null default '{}'
);
create index if not exists respostas_cliente_idx on public.respostas(cliente);
create index if not exists respostas_created_idx on public.respostas(created_at desc);

-- ---------- Segurança (RLS) ----------
alter table public.clientes  enable row level security;
alter table public.demandas  enable row level security;
alter table public.perguntas enable row level security;
alter table public.respostas enable row level security;

-- Clientes e demandas: só o dono.
drop policy if exists clientes_owner on public.clientes;
create policy clientes_owner on public.clientes for all to authenticated
  using (public.is_owner()) with check (public.is_owner());

drop policy if exists demandas_owner on public.demandas;
create policy demandas_owner on public.demandas for all to authenticated
  using (public.is_owner()) with check (public.is_owner());

-- Perguntas: qualquer visitante lê (o formulário precisa); só o dono altera.
drop policy if exists perguntas_read on public.perguntas;
create policy perguntas_read on public.perguntas for select to anon, authenticated using (true);
drop policy if exists perguntas_owner on public.perguntas;
create policy perguntas_owner on public.perguntas for all to authenticated
  using (public.is_owner()) with check (public.is_owner());

-- Respostas: qualquer visitante ENVIA (insert), ninguém de fora LÊ. Dono vê e gerencia.
drop policy if exists respostas_insert on public.respostas;
create policy respostas_insert on public.respostas for insert to anon, authenticated
  with check (
    servico in ('site','marca','design')
    and char_length(cliente) between 1 and 200
    and char_length(nome) between 1 and 200
    and pg_column_size(dados) < 20000
  );
drop policy if exists respostas_owner on public.respostas;
create policy respostas_owner on public.respostas for select to authenticated using (public.is_owner());
drop policy if exists respostas_owner_upd on public.respostas;
create policy respostas_owner_upd on public.respostas for update to authenticated
  using (public.is_owner()) with check (public.is_owner());
drop policy if exists respostas_owner_del on public.respostas;
create policy respostas_owner_del on public.respostas for delete to authenticated using (public.is_owner());

-- Permissões de tabela (RLS acima é o que realmente filtra)
grant usage on schema public to anon, authenticated;
grant select on public.perguntas to anon;
grant insert on public.respostas to anon;
grant all on public.clientes, public.demandas, public.perguntas, public.respostas to authenticated;

-- ---------- Perguntas iniciais ----------
insert into public.perguntas (servico, id, tipo, texto, opcoes, ordem) values
  ('site', 'resultado', 'csat', 'Como você avalia o resultado final do site?', null, 1),
  ('site', 'marca', 'csat', 'O site representa bem a sua marca e o seu negócio?', null, 2),
  ('site', 'objetivo', 'csat', 'O site atende ao objetivo que motivou o projeto (vender, captar contatos, apresentar)?', null, 3),
  ('site', 'uso', 'csat', 'Facilidade de navegação e clareza das informações para quem visita.', null, 4),
  ('site', 'comunicacao', 'csat', 'Comunicação e alinhamento durante o projeto.', null, 5),
  ('site', 'prazo', 'csat', 'Cumprimento de prazos e organização das etapas.', null, 6),
  ('site', 'gostou', 'texto', 'O que você mais gostou no projeto?', null, 7),
  ('site', 'melhorar', 'texto', 'O que poderia ter sido melhor?', null, 8),
  ('site', 'nps', 'nps', 'De 0 a 10, quanto você indicaria meu trabalho para alguém?', null, 9),
  ('site', 'depoimento', 'escolha', 'Posso usar parte das suas respostas como depoimento no site?', array['Sim, pode usar','Prefiro que não'], 10),
  ('marca', 'resultado', 'csat', 'Como você avalia o resultado final da identidade visual?', null, 1),
  ('marca', 'essencia', 'csat', 'A marca traduz a essência e o posicionamento do seu negócio?', null, 2),
  ('marca', 'processo', 'csat', 'Clareza do processo: imersão, direção criativa e apresentação.', null, 3),
  ('marca', 'aplicacao', 'csat', 'Facilidade de aplicar a identidade no dia a dia (arquivos, manual, orientações).', null, 4),
  ('marca', 'comunicacao', 'csat', 'Comunicação e escuta durante o projeto.', null, 5),
  ('marca', 'prazo', 'csat', 'Cumprimento de prazos e organização das etapas.', null, 6),
  ('marca', 'gostou', 'texto', 'O que você mais gostou no projeto?', null, 7),
  ('marca', 'melhorar', 'texto', 'O que poderia ter sido melhor?', null, 8),
  ('marca', 'nps', 'nps', 'De 0 a 10, quanto você indicaria meu trabalho para alguém?', null, 9),
  ('marca', 'depoimento', 'escolha', 'Posso usar parte das suas respostas como depoimento no site?', array['Sim, pode usar','Prefiro que não'], 10),
  ('design', 'mes', 'mes', 'Mês de referência', null, 1),
  ('design', 'qualidade', 'csat', 'Qualidade das peças entregues no mês (estáticos, carrosséis, edições).', null, 2),
  ('design', 'identidade', 'csat', 'Alinhamento das peças com a identidade visual da marca.', null, 3),
  ('design', 'agilidade', 'csat', 'Agilidade nas entregas e nos ajustes.', null, 4),
  ('design', 'comunicacao', 'csat', 'Comunicação e fluxo de aprovação.', null, 5),
  ('design', 'proatividade', 'csat', 'Proatividade e sugestões criativas além do pedido.', null, 6),
  ('design', 'destaque', 'texto', 'Qual entrega se destacou neste mês?', null, 7),
  ('design', 'ajustar', 'texto', 'O que ajustar para o próximo mês?', null, 8),
  ('design', 'nps', 'nps', 'De 0 a 10, quanto você indicaria meu trabalho para alguém?', null, 9)
on conflict (servico, id) do nothing;
