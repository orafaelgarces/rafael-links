-- 008 · Briefings (/briefing/ e aba Briefings do /gestao) + aviso no WhatsApp
-- (Reescrita em 12/11/2026 antes de ser aplicada pela primeira vez.)
--
-- Fluxo: convidado (o Rafael gerou o link logado) → iniciado (cliente passou da 1ª etapa)
--        → enviado (cliente terminou). A cada passagem, aviso no WhatsApp do Rafael.
-- O visitante não lê nem escreve na tabela direto: só pela função briefing_salvar,
-- que nunca mexe num briefing já enviado. Só o dono lê.
-- "dados" = { id_pergunta: { s: etapa, t: texto, v: valor } }.

create table if not exists public.briefings (
  id            uuid primary key default gen_random_uuid(),
  created_at    timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  status        text not null default 'iniciado' check (status in ('convidado','iniciado','enviado')),
  tipo          text not null check (tipo in ('marca','site','marca-site','links','marca-links')),
  perfil        text,                 -- medico, fisio, … | pessoal | negocio
  cliente       text not null,
  nome          text,
  contato       text,
  etapa         int not null default 0,
  dados         jsonb not null default '{}'::jsonb,
  link          text,                 -- o link enviado (quando gerado no /briefing/novo logado)
  iniciado_em   timestamptz,
  enviado_em    timestamptz,
  lido          boolean not null default false,
  cliente_id    uuid references public.clientes(id) on delete set null
);
create index if not exists briefings_created_idx on public.briefings(created_at desc);
create index if not exists briefings_status_idx on public.briefings(status);

alter table public.briefings enable row level security;
drop policy if exists briefings_insert on public.briefings;
drop policy if exists briefings_owner on public.briefings;
create policy briefings_owner on public.briefings for all to authenticated
  using (public.is_owner()) with check (public.is_owner());
grant all on public.briefings to authenticated;

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

-- ---------- Gravação pelo formulário ----------
create or replace function public.briefing_salvar(
  p_id uuid, p_tipo text, p_perfil text, p_cliente text, p_nome text, p_contato text,
  p_dados jsonb, p_etapa int, p_enviar boolean
) returns text
language plpgsql security definer set search_path = public as $$
declare atual public.briefings; novo_status text := case when p_enviar then 'enviado' else 'iniciado' end;
begin
  if p_id is null or p_tipo not in ('marca','site','marca-site','links','marca-links')
     or char_length(coalesce(p_cliente, '')) not between 1 and 200
     or char_length(coalesce(p_nome, '')) > 200 or char_length(coalesce(p_contato, '')) > 300
     or char_length(coalesce(p_perfil, '')) > 30
     or pg_column_size(coalesce(p_dados, '{}'::jsonb)) > 60000 then
    raise exception 'briefing inválido';
  end if;
  select * into atual from public.briefings where id = p_id for update;
  if found and atual.status = 'enviado' then return 'ja_enviado'; end if;
  if found then
    update public.briefings set
      tipo = p_tipo, perfil = p_perfil, cliente = p_cliente, nome = nullif(p_nome, ''), contato = nullif(p_contato, ''),
      dados = coalesce(p_dados, '{}'::jsonb), etapa = greatest(etapa, coalesce(p_etapa, 0)), status = novo_status,
      atualizado_em = now(), iniciado_em = coalesce(iniciado_em, now()),
      enviado_em = case when p_enviar then now() else enviado_em end
    where id = p_id;
  else
    insert into public.briefings (id, status, tipo, perfil, cliente, nome, contato, dados, etapa, iniciado_em, enviado_em)
    values (p_id, novo_status, p_tipo, p_perfil, p_cliente, nullif(p_nome, ''), nullif(p_contato, ''),
            coalesce(p_dados, '{}'::jsonb), coalesce(p_etapa, 0), now(), case when p_enviar then now() end);
  end if;
  return novo_status;
end $$;
revoke all on function public.briefing_salvar(uuid, text, text, text, text, text, jsonb, int, boolean) from public;
grant execute on function public.briefing_salvar(uuid, text, text, text, text, text, jsonb, int, boolean) to anon, authenticated;

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
