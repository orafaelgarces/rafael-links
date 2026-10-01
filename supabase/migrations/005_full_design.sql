-- =====================================================================
-- 005 — Dois tipos de design recorrente
-- 'design' passa a se chamar Design Social Media (só o rótulo muda no site;
-- dados existentes continuam válidos). Novo serviço 'full' = Full Design:
-- contrato recorrente que cobre tudo, sem quantidade fixa de entregas.
-- =====================================================================

alter table public.perguntas drop constraint if exists perguntas_servico_check;
alter table public.perguntas add constraint perguntas_servico_check
  check (servico in ('site','marca','design','full'));
alter table public.respostas drop constraint if exists respostas_servico_check;
alter table public.respostas add constraint respostas_servico_check
  check (servico in ('site','marca','design','full'));

drop policy if exists respostas_insert on public.respostas;
create policy respostas_insert on public.respostas for insert to anon, authenticated
  with check (
    servico in ('site','marca','design','full')
    and char_length(cliente) between 1 and 200
    and char_length(nome) between 1 and 200
    and pg_column_size(dados) < 20000
  );

-- Perguntas iniciais do Full Design (sem pergunta de volume: não há quantidade fixa)
insert into public.perguntas (servico, id, tipo, texto, opcoes, ordem) values
  ('full', 'mes', 'mes', 'Mês de referência', null, 1),
  ('full', 'qualidade', 'csat', 'Qualidade das entregas do mês.', null, 2),
  ('full', 'identidade', 'csat', 'Alinhamento das peças com a identidade visual da marca.', null, 3),
  ('full', 'demandas', 'csat', 'Capacidade de atender às demandas que surgiram no mês, nas prioridades certas.', null, 4),
  ('full', 'agilidade', 'csat', 'Agilidade nas entregas e nos ajustes.', null, 5),
  ('full', 'comunicacao', 'csat', 'Comunicação e fluxo de aprovação.', null, 6),
  ('full', 'visao', 'csat', 'Visão estratégica e sugestões além do que foi pedido.', null, 7),
  ('full', 'destaque', 'texto', 'Qual entrega se destacou neste mês?', null, 8),
  ('full', 'ajustar', 'texto', 'O que ajustar para o próximo mês?', null, 9),
  ('full', 'nps', 'nps', 'De 0 a 10, quanto você indicaria meu trabalho para alguém?', null, 10)
on conflict (servico, id) do nothing;

-- Lembrete: Full Design tem prioridade no link e também leva o mês de referência
create or replace function public.csat_pendentes(ref date default (now() at time zone 'America/Sao_Paulo')::date)
returns table (cliente_id uuid, nome text, stakeholder text, whatsapp text, servico text, dia_envio int, dias_atraso int)
language sql stable security definer set search_path = public as $$
  with base as (
    select c.*,
      least(coalesce(c.dia_csat, 25),
            extract(day from (date_trunc('month', ref) + interval '1 month - 1 day'))::int) as d
    from public.clientes c
    where c.status = 'ativo' and c.cobranca = 'mensal'
  )
  select b.id, b.nome, b.stakeholder, b.whatsapp,
    case when 'full' = any(b.servicos) then 'full' when 'design' = any(b.servicos) then 'design' else coalesce(b.servicos[1], 'design') end,
    b.d,
    ref - (date_trunc('month', ref)::date + b.d - 1)
  from base b
  where extract(day from ref)::int >= b.d
    and not exists (
      select 1 from public.respostas r
      where lower(trim(r.cliente)) = lower(trim(b.nome))
        and (r.created_at at time zone 'America/Sao_Paulo')::date >= date_trunc('month', ref)::date
    )
  order by b.nome
$$;

create or replace function public.enviar_lembrete_csat(forcar boolean default false, previa boolean default false)
returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare
  hoje      date := (now() at time zone 'America/Sao_Paulo')::date;
  mes       text := to_char(hoje, 'YYYY-MM');
  mes_nome  text := (array['janeiro','fevereiro','março','abril','maio','junho','julho',
                           'agosto','setembro','outubro','novembro','dezembro'])[extract(month from hoje)::int];
  corpo     jsonb := '{}'::jsonb;
  total     int := 0;
  gatilho   boolean := false;
  nomes     text[] := '{}';
  r record; primeiro text; link text; msg text; fone text; situacao text; req bigint;
begin
  for r in select * from public.csat_pendentes(hoje) loop
    total := total + 1;
    if r.dias_atraso in (0, 3, 7) then gatilho := true; end if;
    primeiro := split_part(coalesce(trim(r.stakeholder), ''), ' ', 1);
    link := 'https://orafaelgarces.com.br/feedback/?servico=' || r.servico
         || '&cliente=' || public.url_encode(r.nome)
         || case when primeiro <> '' then '&nome=' || public.url_encode(primeiro) else '' end
         || case when r.servico in ('design', 'full') then '&mes=' || mes else '' end;
    msg := 'Oi' || case when primeiro <> '' then ', ' || primeiro else '' end
         || '! Pode me dar um feedback rápido sobre as entregas do mês? Leva uns 3 minutos: ' || link;
    fone := regexp_replace(coalesce(r.whatsapp, ''), '\D', '', 'g');
    if fone <> '' and length(fone) <= 11 then fone := '55' || fone; end if;
    situacao := case when r.dias_atraso = 0 then 'vence hoje'
                     when r.dias_atraso = 1 then '1 dia de atraso'
                     else r.dias_atraso || ' dias de atraso' end;
    -- Chaves "Cliente N": o JSON do banco ordena chaves por tamanho,
    -- então nomes do mesmo tamanho mantêm a ordem 1, 2, 3… no e-mail.
    corpo := corpo || jsonb_build_object('Cliente ' || total,
      r.nome || ' — ' || situacao || '. ' ||
      case when fone <> '' then 'Toque para enviar no WhatsApp'
                                || case when primeiro <> '' then ' de ' || primeiro else '' end
                                || ': https://wa.me/' || fone || '?text=' || public.url_encode(msg)
           else 'Sem WhatsApp no cadastro. Link do formulário: ' || link end);
    nomes := nomes || r.nome;
  end loop;

  if total = 0 or (not gatilho and not forcar) then
    return jsonb_build_object('enviado', false, 'pendentes', total);
  end if;

  corpo := corpo || jsonb_build_object(
    'access_key', 'f8afe617-8023-42e8-89e6-3f7f21cd5118',
    'from_name',  'Gestão de clientes',
    'subject',    'CSAT pendente: ' || total || case when total = 1 then ' cliente' else ' clientes' end || ' (' || mes_nome || ')',
    'Resumo',     total || case when total = 1 then ' cliente está' else ' clientes estão' end
                  || ' com o CSAT de ' || mes_nome || ' pendente. Toque no link de cada um para abrir o WhatsApp com a mensagem pronta.',
    'Abrir a gestão de clientes', 'https://orafaelgarces.com.br/gestao/');

  if previa then return jsonb_build_object('previa', true, 'pendentes', total, 'corpo', corpo); end if;

  select net.http_post(
    url     := 'https://api.web3forms.com/submit',
    body    := corpo,
    headers := '{"Content-Type":"application/json","Accept":"application/json"}'::jsonb
  ) into req;
  insert into public.lembretes_log (mes, clientes, request_id) values (mes, nomes, req);
  return jsonb_build_object('enviado', true, 'pendentes', total, 'request_id', req);
end $$;

revoke all on function public.csat_pendentes(date) from public, anon, authenticated;
revoke all on function public.enviar_lembrete_csat(boolean, boolean) from public, anon, authenticated;
