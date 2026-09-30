-- =====================================================================
-- 004 — O painel virou "Gestão de clientes" em /gestao/.
-- Atualiza o e-mail do lembrete de CSAT para o novo nome e endereço.
-- =====================================================================

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

revoke all on function public.enviar_lembrete_csat(boolean, boolean) from public, anon, authenticated;
