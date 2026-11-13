-- 009 · Aviso dos briefings (RASCUNHO, NÃO APLICAR AINDA)
-- Separado da 008 em 12/11/2026: o WhatsApp do CallMeBot está lotado; o canal será
-- a API oficial da Meta (ou outro) e esta função muda antes de ser aplicada.

-- ---------- Aviso no WhatsApp (CallMeBot) ----------
-- Segredos no Vault: callmebot_phone (ex.: 5598999999999) e callmebot_apikey.
-- Sem os dois, a função não faz nada (o resto continua funcionando).
create or replace function public.cfg_secreto(p_nome text) returns text
language sql stable security definer set search_path = public, vault as $$
  select decrypted_secret from vault.decrypted_secrets where name = p_nome limit 1
$$;
revoke all on function public.cfg_secreto(text) from public, anon, authenticated;

create or replace function public.aviso_whatsapp(p_texto text) returns void
language plpgsql security definer set search_path = public, extensions as $$
declare fone text := public.cfg_secreto('callmebot_phone'); chave text := public.cfg_secreto('callmebot_apikey');
begin
  if fone is null or chave is null or coalesce(p_texto, '') = '' then return; end if;
  perform net.http_get(
    url := 'https://api.callmebot.com/whatsapp.php',
    params := jsonb_build_object('phone', fone, 'text', left(p_texto, 900), 'apikey', chave)
  );
end $$;
revoke all on function public.aviso_whatsapp(text) from public, anon, authenticated;

-- Aviso quando muda de etapa do fluxo (não a cada pergunta)
create or replace function public.briefings_aviso() returns trigger
language plpgsql security definer set search_path = public as $$
declare rotulo text := case new.tipo when 'marca' then 'Marca' when 'site' then 'Site' when 'marca-site' then 'Marca e site'
                                      when 'links' then 'Página de links' else 'Marca e página de links' end;
begin
  if new.status = coalesce(case when tg_op = 'UPDATE' then old.status end, '') then return new; end if;
  if new.status = 'iniciado' then
    perform public.aviso_whatsapp('📝 ' || new.cliente || ' começou o briefing (' || rotulo || ').');
  elsif new.status = 'enviado' then
    perform public.aviso_whatsapp('✅ ' || new.cliente || ' enviou o briefing (' || rotulo || '). Respostas no /gestao, aba Briefings: https://orafaelgarces.com.br/gestao/');
  end if;
  return new;
end $$;
drop trigger if exists briefings_aviso on public.briefings;
create trigger briefings_aviso after insert or update of status on public.briefings
  for each row execute function public.briefings_aviso();
