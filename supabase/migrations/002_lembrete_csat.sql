-- =====================================================================
-- 002 — Lembrete automático de CSAT pendente
-- Todo dia às 09:00 (São Paulo) o banco confere os clientes com fee mensal
-- ativos que passaram do dia de envio do CSAT sem responder no mês.
-- No dia do vencimento, 3 e 7 dias depois, manda um e-mail para o Rafael
-- com um link por cliente que abre o WhatsApp com a mensagem pronta.
-- =====================================================================

create extension if not exists pg_net with schema extensions;
create extension if not exists pg_cron;

-- Histórico dos lembretes enviados (o painel mostra o último)
create table if not exists public.lembretes_log (
  id          bigserial primary key,
  enviado_em  timestamptz not null default now(),
  mes         text not null,
  clientes    text[] not null,
  request_id  bigint
);
alter table public.lembretes_log enable row level security;
drop policy if exists lembretes_owner on public.lembretes_log;
create policy lembretes_owner on public.lembretes_log for select to authenticated using (public.is_owner());
grant select on public.lembretes_log to authenticated;

-- Codificação de URL (para os links do WhatsApp e do formulário)
create or replace function public.url_encode(t text) returns text
language sql immutable as $$
  select coalesce(string_agg(
    case when ch ~ '^[A-Za-z0-9_.~-]$' then ch
         else upper(regexp_replace(encode(convert_to(ch, 'UTF8'), 'hex'), '(..)', '%\1', 'g')) end,
    '' order by n), '')
  from regexp_split_to_table(coalesce(t, ''), '') with ordinality as x(ch, n)
$$;

-- Quem está com CSAT pendente numa data de referência.
-- Dia de envio vazio = 25; dia maior que o mês (ex.: 31 em setembro) = último dia do mês.
-- "Respondeu" = alguma resposta com o mesmo nome de cliente dentro do mês.
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
    case when 'design' = any(b.servicos) then 'design' else coalesce(b.servicos[1], 'design') end,
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

-- Monta e envia o e-mail. forcar = envia mesmo fora dos dias 0/3/7;
-- previa = só devolve o conteúdo, sem enviar nem registrar.
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
         || case when r.servico = 'design' then '&mes=' || mes else '' end;
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
    'from_name',  'Painel CSAT',
    'subject',    'CSAT pendente: ' || total || case when total = 1 then ' cliente' else ' clientes' end || ' (' || mes_nome || ')',
    'Resumo',     total || case when total = 1 then ' cliente está' else ' clientes estão' end
                  || ' com o CSAT de ' || mes_nome || ' pendente. Toque no link de cada um para abrir o WhatsApp com a mensagem pronta.',
    'Abrir o painel CSAT', 'https://orafaelgarces.com.br/feedback/painel/');

  if previa then return jsonb_build_object('previa', true, 'pendentes', total, 'corpo', corpo); end if;

  select net.http_post(
    url     := 'https://api.web3forms.com/submit',
    body    := corpo,
    headers := '{"Content-Type":"application/json","Accept":"application/json"}'::jsonb
  ) into req;
  insert into public.lembretes_log (mes, clientes, request_id) values (mes, nomes, req);
  return jsonb_build_object('enviado', true, 'pendentes', total, 'request_id', req);
end $$;

-- Ninguém de fora chama essas funções: só o agendador (roda como postgres)
revoke all on function public.csat_pendentes(date) from public, anon, authenticated;
revoke all on function public.enviar_lembrete_csat(boolean, boolean) from public, anon, authenticated;

-- 09:00 em São Paulo = 12:00 UTC
select cron.unschedule(jobid) from cron.job where jobname = 'csat-lembrete-diario';
select cron.schedule('csat-lembrete-diario', '0 12 * * *', $$select public.enviar_lembrete_csat()$$);
