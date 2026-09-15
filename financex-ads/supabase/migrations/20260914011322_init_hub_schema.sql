-- Hub de tráfego orgânico e pago — schema inicial
-- Rodar no SQL Editor do Supabase ou via `supabase db push`

create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------
create type platform as enum (
  'instagram', 'facebook', 'tiktok', 'youtube', 'linkedin', 'x', 'threads', 'pinterest',
  'meta_ads', 'google_ads', 'tiktok_ads', 'openai_ads'
);

create type account_kind as enum ('organic', 'ads');

create type account_status as enum ('connected', 'expired', 'revoked', 'error');

create type post_status as enum ('draft', 'scheduled', 'processing', 'done', 'partial', 'failed');

create type target_status as enum ('pending', 'processing', 'done', 'failed', 'skipped');

-- ---------------------------------------------------------------
-- accounts — uma linha por conta conectada
-- ---------------------------------------------------------------
create table accounts (
  id             uuid primary key default gen_random_uuid(),
  owner_id       uuid not null references auth.users(id) on delete cascade,
  platform       platform not null,
  kind           account_kind not null,
  external_id    text not null,                  -- IG user id, ad account id, channel id...
  handle         text,                           -- @nome, para exibir no painel
  avatar_url     text,
  status         account_status not null default 'connected',
  last_error     text,
  meta           jsonb not null default '{}'::jsonb,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  unique (owner_id, platform, external_id)
);

create index accounts_owner_idx on accounts (owner_id, platform);

-- ---------------------------------------------------------------
-- credentials — tokens cifrados. NUNCA exposto ao front.
-- O ciphertext é gerado na aplicação (AES-256-GCM), não no banco.
-- ---------------------------------------------------------------
create table credentials (
  account_id        uuid primary key references accounts(id) on delete cascade,
  access_token_enc  text not null,
  refresh_token_enc text,
  expires_at        timestamptz,
  scopes            text[],
  updated_at        timestamptz not null default now()
);

-- índice para o job de renovação varrer o que está perto de vencer
create index credentials_expiring_idx on credentials (expires_at)
  where expires_at is not null;

-- ---------------------------------------------------------------
-- posts — o conteúdo, uma vez só
-- ---------------------------------------------------------------
create table posts (
  id            uuid primary key default gen_random_uuid(),
  owner_id      uuid not null references auth.users(id) on delete cascade,
  caption       text not null default '',
  media         jsonb not null default '[]'::jsonb,  -- [{type:'image'|'video', url:'https://...'}]
  status        post_status not null default 'draft',
  scheduled_for timestamptz,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index posts_due_idx on posts (status, scheduled_for);

-- ---------------------------------------------------------------
-- post_targets — 1 post x N contas. Cada alvo falha e reprocessa sozinho.
-- ---------------------------------------------------------------
create table post_targets (
  id            uuid primary key default gen_random_uuid(),
  post_id       uuid not null references posts(id) on delete cascade,
  account_id    uuid not null references accounts(id) on delete cascade,
  status        target_status not null default 'pending',
  attempts      int not null default 0,
  next_retry_at timestamptz,
  external_id   text,          -- id do post publicado na plataforma
  permalink     text,
  last_error    text,
  published_at  timestamptz,
  created_at    timestamptz not null default now(),
  unique (post_id, account_id)
);

-- fila: o worker lê por aqui
create index post_targets_queue_idx on post_targets (status, next_retry_at);

-- ---------------------------------------------------------------
-- campaigns — espelho das campanhas de ads
-- ---------------------------------------------------------------
create table campaigns (
  id            uuid primary key default gen_random_uuid(),
  owner_id      uuid not null references auth.users(id) on delete cascade,
  account_id    uuid not null references accounts(id) on delete cascade,
  external_id   text not null,
  name          text not null,
  objective     text,
  status        text,
  daily_budget  numeric(12,2),
  spend         numeric(12,2) default 0,
  impressions   bigint default 0,
  clicks        bigint default 0,
  conversions   bigint default 0,
  synced_at     timestamptz,
  created_at    timestamptz not null default now(),
  unique (account_id, external_id)
);

create index campaigns_owner_idx on campaigns (owner_id, account_id);

-- ---------------------------------------------------------------
-- updated_at automático
-- ---------------------------------------------------------------
create or replace function touch_updated_at() returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger accounts_touch    before update on accounts    for each row execute function touch_updated_at();
create trigger posts_touch       before update on posts       for each row execute function touch_updated_at();
create trigger credentials_touch before update on credentials for each row execute function touch_updated_at();

-- ---------------------------------------------------------------
-- RLS — o dono só enxerga o que é dele.
-- credentials fica SEM policy: só a service_role (worker) acessa.
-- ---------------------------------------------------------------
alter table accounts     enable row level security;
alter table credentials  enable row level security;
alter table posts        enable row level security;
alter table post_targets enable row level security;
alter table campaigns    enable row level security;

create policy own_accounts on accounts
  for all using (owner_id = auth.uid()) with check (owner_id = auth.uid());

create policy own_posts on posts
  for all using (owner_id = auth.uid()) with check (owner_id = auth.uid());

create policy own_campaigns on campaigns
  for all using (owner_id = auth.uid()) with check (owner_id = auth.uid());

create policy own_targets on post_targets
  for all using (
    exists (select 1 from posts p where p.id = post_targets.post_id and p.owner_id = auth.uid())
  ) with check (
    exists (select 1 from posts p where p.id = post_targets.post_id and p.owner_id = auth.uid())
  );

-- ---------------------------------------------------------------
-- claim_targets — pega N alvos da fila e marca como 'processing'
-- de forma atômica. SKIP LOCKED evita dois workers pegarem o mesmo.
-- ---------------------------------------------------------------
create or replace function claim_targets(batch_size int default 10)
returns setof post_targets as $$
  update post_targets t
  set status = 'processing', attempts = t.attempts + 1
  where t.id in (
    select t2.id from post_targets t2
    join posts p on p.id = t2.post_id
    where t2.status = 'pending'
      and (t2.next_retry_at is null or t2.next_retry_at <= now())
      and (p.scheduled_for is null or p.scheduled_for <= now())
      and p.status in ('scheduled', 'processing')
    order by t2.next_retry_at nulls first
    limit batch_size
    for update skip locked
  )
  returning t.*;
$$ language sql;
