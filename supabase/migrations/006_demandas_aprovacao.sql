-- =====================================================================
-- 006 — Central de demandas no formato do NaUTI Social
-- • Etapas: A fazer · Em andamento · Aprovado · Publicado
-- • Cada cliente tem uma cor (quadro por cliente / etiqueta na visão geral)
-- • Peças anexadas em versões (v1, v2…) guardadas no Cloudflare R2
-- • Link público de aprovação por demanda (token), com aprovação/ajuste
--   do cliente registrada por versão
-- As chaves do R2 ficam no Vault do Supabase (criptografadas), com os nomes:
--   r2_account_id, r2_access_key_id, r2_secret_access_key, r2_bucket, r2_public_url
-- =====================================================================

-- ---------- Demandas: etapas e link de aprovação ----------
alter table public.demandas drop constraint if exists demandas_status_check;
update public.demandas set status = case status when 'aprovacao' then 'producao' when 'concluido' then 'publicado' else status end;
alter table public.demandas add constraint demandas_status_check
  check (status in ('backlog','producao','aprovado','publicado'));
alter table public.demandas add column if not exists review_token uuid not null default gen_random_uuid();
create unique index if not exists demandas_review_token_idx on public.demandas(review_token);
alter table public.demandas add column if not exists publicado_em timestamptz;

-- ---------- Cor do cliente ----------
alter table public.clientes add column if not exists cor text;
alter table public.clientes drop constraint if exists clientes_cor_check;
alter table public.clientes add constraint clientes_cor_check check (cor is null or cor ~ '^#[0-9a-fA-F]{6}$');

-- ---------- Versões das peças e avaliações ----------
create table if not exists public.demanda_versoes (
  id                     uuid primary key default gen_random_uuid(),
  demanda_id             uuid not null references public.demandas(id) on delete cascade,
  versao                 int  not null,
  tipo                   text not null check (tipo in ('image','carousel','video','file')),
  arquivos               jsonb not null default '[]',   -- [{key, url, nome, tamanho, mime}]
  created_at             timestamptz not null default now(),
  arquivos_removidos_em  timestamptz,
  unique (demanda_id, versao)
);
create table if not exists public.demanda_avaliacoes (
  id          uuid primary key default gen_random_uuid(),
  versao_id   uuid not null references public.demanda_versoes(id) on delete cascade,
  nome        text not null check (char_length(nome) between 1 and 80),
  status      text not null check (status in ('aprovado','reprovado')),
  nota        text check (nota is null or char_length(nota) <= 2000),
  created_at  timestamptz not null default now()
);
create index if not exists demanda_versoes_demanda_idx on public.demanda_versoes(demanda_id);
create index if not exists demanda_avaliacoes_versao_idx on public.demanda_avaliacoes(versao_id);

alter table public.demanda_versoes    enable row level security;
alter table public.demanda_avaliacoes enable row level security;
drop policy if exists demanda_versoes_owner on public.demanda_versoes;
create policy demanda_versoes_owner on public.demanda_versoes for all to authenticated
  using (public.is_owner()) with check (public.is_owner());
drop policy if exists demanda_avaliacoes_owner on public.demanda_avaliacoes;
create policy demanda_avaliacoes_owner on public.demanda_avaliacoes for all to authenticated
  using (public.is_owner()) with check (public.is_owner());
grant all on public.demanda_versoes, public.demanda_avaliacoes to authenticated;

-- Assinatura S3 (SigV4) por query string — usada para o R2 (compatível com S3).
create or replace function public.sigv4_presign(
  p_method text, p_host text, p_path text, p_region text,
  p_access_key text, p_secret text, p_amz_date text, p_expires int)
returns text
language plpgsql immutable set search_path = public, extensions as $$
declare
  dia        text := left(p_amz_date, 8);
  escopo     text := dia || '/' || p_region || '/s3/aws4_request';
  consulta   text;
  canonico   text;
  para_assinar text;
  k          bytea;
begin
  consulta := 'X-Amz-Algorithm=AWS4-HMAC-SHA256'
           || '&X-Amz-Credential=' || public.url_encode(p_access_key || '/' || escopo)
           || '&X-Amz-Date=' || p_amz_date
           || '&X-Amz-Expires=' || p_expires
           || '&X-Amz-SignedHeaders=host';
  canonico := p_method || E'\n' || p_path || E'\n' || consulta || E'\n'
           || 'host:' || p_host || E'\n' || E'\n' || 'host' || E'\n' || 'UNSIGNED-PAYLOAD';
  para_assinar := 'AWS4-HMAC-SHA256' || E'\n' || p_amz_date || E'\n' || escopo || E'\n'
               || encode(digest(convert_to(canonico, 'UTF8'), 'sha256'), 'hex');
  k := hmac(convert_to(dia, 'UTF8'), convert_to('AWS4' || p_secret, 'UTF8'), 'sha256');
  k := hmac(convert_to(p_region, 'UTF8'), k, 'sha256');
  k := hmac(convert_to('s3', 'UTF8'), k, 'sha256');
  k := hmac(convert_to('aws4_request', 'UTF8'), k, 'sha256');
  return consulta || '&X-Amz-Signature=' || encode(hmac(convert_to(para_assinar, 'UTF8'), k, 'sha256'), 'hex');
end $$;
revoke all on function public.sigv4_presign(text, text, text, text, text, text, text, int) from public, anon, authenticated;

-- ---------- Cloudflare R2 ----------
create or replace function public.r2_cfg(p_nome text) returns text
language sql stable security definer set search_path = public, vault as $$
  select decrypted_secret from vault.decrypted_secrets where name = p_nome limit 1
$$;
revoke all on function public.r2_cfg(text) from public, anon, authenticated;

create or replace function public.r2_url(p_method text, p_key text, p_expires int default 900) returns text
language plpgsql stable security definer set search_path = public as $$
declare conta text := public.r2_cfg('r2_account_id'); bucket text := public.r2_cfg('r2_bucket');
        host text; caminho text;
begin
  if conta is null or bucket is null or public.r2_cfg('r2_secret_access_key') is null then return null; end if;
  host := conta || '.r2.cloudflarestorage.com';
  caminho := '/' || bucket || '/' || p_key;
  return 'https://' || host || caminho || '?' || public.sigv4_presign(p_method, host, caminho, 'auto',
    public.r2_cfg('r2_access_key_id'), public.r2_cfg('r2_secret_access_key'),
    to_char(now() at time zone 'UTC', 'YYYYMMDD"T"HH24MISS"Z"'), p_expires);
end $$;
revoke all on function public.r2_url(text, text, int) from public, anon, authenticated;

-- O painel pede um endereço de upload para cada arquivo (só o dono, só para demanda existente)
create or replace function public.r2_url_upload(p_demanda uuid, p_nome text, p_mime text)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare ext text; chave text; url text; publico text := public.r2_cfg('r2_public_url');
begin
  if not public.is_owner() then raise exception 'acesso negado'; end if;
  if not exists (select 1 from public.demandas where id = p_demanda) then raise exception 'demanda não encontrada'; end if;
  ext := lower(substring(coalesce(p_nome, '') from '\.([A-Za-z0-9]{1,5})$'));
  chave := 'demandas/' || p_demanda || '/' || replace(gen_random_uuid()::text, '-', '') || coalesce('.' || ext, '');
  url := public.r2_url('PUT', chave, 900);
  if url is null or publico is null then raise exception 'R2 ainda não configurado'; end if;
  return jsonb_build_object('upload_url', url, 'key', chave, 'url', rtrim(publico, '/') || '/' || chave);
end $$;
revoke all on function public.r2_url_upload(uuid, text, text) from public, anon;
grant execute on function public.r2_url_upload(uuid, text, text) to authenticated;

-- Apagar a versão (ou a demanda inteira) apaga os arquivos no R2
create or replace function public.r2_apagar_versao() returns trigger
language plpgsql security definer set search_path = public, extensions as $$
declare a jsonb; url text;
begin
  if old.arquivos_removidos_em is null then
    for a in select * from jsonb_array_elements(old.arquivos) loop
      url := public.r2_url('DELETE', a->>'key', 300);
      if url is not null and a->>'key' is not null then perform net.http_delete(url := url); end if;
    end loop;
  end if;
  return old;
end $$;
drop trigger if exists demanda_versoes_r2_apagar on public.demanda_versoes;
create trigger demanda_versoes_r2_apagar after delete on public.demanda_versoes
  for each row execute function public.r2_apagar_versao();

-- ---------- Link de aprovação (público, por token) ----------
create or replace function public.aprovacao_ver(p_token uuid) returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'titulo', d.titulo, 'tipo', d.tipo, 'prazo', d.prazo, 'status', d.status,
    'cliente', c.nome,
    'versoes', coalesce((
      select jsonb_agg(jsonb_build_object(
        'versao', v.versao, 'tipo', v.tipo, 'criada_em', v.created_at,
        'arquivos', case when v.arquivos_removidos_em is null then
                      (select coalesce(jsonb_agg(x - 'key'), '[]') from jsonb_array_elements(v.arquivos) x)
                    else '[]'::jsonb end,
        'avaliacoes', (select coalesce(jsonb_agg(jsonb_build_object('nome', a.nome, 'status', a.status, 'nota', a.nota, 'em', a.created_at) order by a.created_at), '[]')
                       from public.demanda_avaliacoes a where a.versao_id = v.id)
      ) order by v.versao)
      from public.demanda_versoes v where v.demanda_id = d.id), '[]'))
  from public.demandas d left join public.clientes c on c.id = d.cliente_id
  where d.review_token = p_token
$$;

create or replace function public.aprovacao_avaliar(p_token uuid, p_nome text, p_status text, p_nota text default null)
returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare d record; v record; v_nome text := trim(coalesce(p_nome, '')); v_nota text := nullif(trim(coalesce(p_nota, '')), '');
begin
  select * into d from public.demandas where review_token = p_token;
  if not found then raise exception 'link inválido'; end if;
  select * into v from public.demanda_versoes where demanda_id = d.id order by versao desc limit 1;
  if not found then raise exception 'ainda não há peça para avaliar'; end if;
  if p_status not in ('aprovado', 'reprovado') then raise exception 'avaliação inválida'; end if;
  if char_length(v_nome) < 1 or char_length(v_nome) > 80 then raise exception 'informe seu nome'; end if;
  if p_status = 'reprovado' and v_nota is null then raise exception 'conte o que precisa ajustar'; end if;
  if (select count(*) from public.demanda_avaliacoes where versao_id = v.id) >= 30 then raise exception 'limite de avaliações desta versão'; end if;

  -- Uma avaliação por pessoa em cada versão: avaliar de novo substitui a anterior
  delete from public.demanda_avaliacoes a where a.versao_id = v.id and lower(trim(a.nome)) = lower(v_nome);
  insert into public.demanda_avaliacoes (versao_id, nome, status, nota) values (v.id, v_nome, p_status, v_nota);

  -- Etapa acompanha: tudo aprovado → "Aprovado"; pedido de ajuste → volta para "Em andamento"
  if p_status = 'aprovado' and d.status in ('backlog', 'producao')
     and not exists (select 1 from public.demanda_avaliacoes where versao_id = v.id and status = 'reprovado') then
    update public.demandas set status = 'aprovado', concluido_em = now() where id = d.id;
  elsif p_status = 'reprovado' and d.status in ('backlog', 'aprovado') then
    update public.demandas set status = 'producao', concluido_em = null where id = d.id;
  end if;

  -- Aviso por e-mail para o Rafael
  perform net.http_post(
    url := 'https://api.web3forms.com/submit',
    body := jsonb_build_object(
      'access_key', 'f8afe617-8023-42e8-89e6-3f7f21cd5118',
      'from_name', 'Gestão de clientes',
      'subject', case when p_status = 'aprovado' then 'Aprovado: ' else 'Ajuste pedido: ' end || d.titulo || ' (v' || v.versao || ')',
      'Demanda', d.titulo || ' · v' || v.versao,
      'Cliente', coalesce((select c.nome from public.clientes c where c.id = d.cliente_id), '—'),
      'Quem avaliou', v_nome,
      'Avaliação', case when p_status = 'aprovado' then 'Aprovou' else 'Pediu ajuste' end,
      'Comentário', coalesce(v_nota, '—'),
      'Abrir a gestão', 'https://orafaelgarces.com.br/gestao/'),
    headers := '{"Content-Type":"application/json","Accept":"application/json"}'::jsonb);

  return public.aprovacao_ver(p_token);
end $$;

revoke all on function public.aprovacao_ver(uuid) from public;
revoke all on function public.aprovacao_avaliar(uuid, text, text, text) from public;
grant execute on function public.aprovacao_ver(uuid) to anon, authenticated;
grant execute on function public.aprovacao_avaliar(uuid, text, text, text) to anon, authenticated;
