-- Multi-tenant: uma agência (você) atendendo N clientes.
-- Rodar depois de 20260914011322_init_hub_schema.sql

-- ---------------------------------------------------------------
-- clients — cada empresa que você atende
-- ---------------------------------------------------------------
create table clients (
  id         uuid primary key default gen_random_uuid(),
  owner_id   uuid not null references auth.users(id) on delete cascade,
  name       text not null,
  slug       text not null,
  segment    text,                    -- 'clínica', 'restaurante'...
  active     boolean not null default true,
  notes      text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (owner_id, slug)
);

create index clients_owner_idx on clients (owner_id) where active;

create trigger clients_touch before update on clients
  for each row execute function touch_updated_at();

-- ---------------------------------------------------------------
-- Amarrar tudo ao cliente
-- ---------------------------------------------------------------
alter table accounts  add column client_id uuid references clients(id) on delete cascade;
alter table posts     add column client_id uuid references clients(id) on delete cascade;
alter table campaigns add column client_id uuid references clients(id) on delete cascade;

create index accounts_client_idx  on accounts  (client_id, platform);
create index posts_client_idx     on posts     (client_id, status);
create index campaigns_client_idx on campaigns (client_id);

-- A mesma conta de IG não pode ser reivindicada por dois clientes seus.
drop index if exists accounts_owner_platform_external_key;
alter table accounts drop constraint if exists accounts_owner_id_platform_external_id_key;
alter table accounts add constraint accounts_client_platform_external_key
  unique (client_id, platform, external_id);

-- ---------------------------------------------------------------
-- connect_invites — o link que você manda pra clínica.
-- Ela clica, autoriza no Instagram, e a conta cai no cliente certo.
-- O cliente NÃO precisa ter login no seu sistema.
-- ---------------------------------------------------------------
create table connect_invites (
  id         uuid primary key default gen_random_uuid(),
  client_id  uuid not null references clients(id) on delete cascade,
  token      text not null unique,          -- 32 bytes aleatórios, vai na URL
  platforms  platform[] not null,           -- o que esse link pode conectar
  expires_at timestamptz not null default (now() + interval '14 days'),
  used_at    timestamptz,                   -- null = ainda vale
  max_uses   int not null default 5,
  uses       int not null default 0,
  created_at timestamptz not null default now()
);

create index invites_token_idx on connect_invites (token);

-- ---------------------------------------------------------------
-- Visão de carteira: quantas contas e posts por cliente
-- ---------------------------------------------------------------
-- security_invoker: a view respeita o RLS de quem consulta, nao o do dono.
create view client_overview
  with (security_invoker = true) as
select
  c.id,
  c.owner_id,
  c.name,
  c.slug,
  c.active,
  count(distinct a.id) filter (where a.kind = 'organic')  as organic_accounts,
  count(distinct a.id) filter (where a.kind = 'ads')      as ad_accounts,
  count(distinct a.id) filter (where a.status <> 'connected') as broken_accounts,
  count(distinct p.id) filter (where p.status = 'scheduled')  as scheduled_posts
from clients c
left join accounts a on a.client_id = c.id
left join posts    p on p.client_id = c.id
group by c.id;

-- ---------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------
alter table clients         enable row level security;
alter table connect_invites enable row level security;

create policy own_clients on clients
  for all using (owner_id = auth.uid()) with check (owner_id = auth.uid());

create policy own_invites on connect_invites
  for all using (
    exists (select 1 from clients c where c.id = connect_invites.client_id and c.owner_id = auth.uid())
  ) with check (
    exists (select 1 from clients c where c.id = connect_invites.client_id and c.owner_id = auth.uid())
  );

-- As policies antigas continuam valendo por owner_id, então você enxerga
-- tudo dos seus clientes e nada dos clientes de outra conta.

-- ---------------------------------------------------------------
-- redeem_invite — valida e consome um uso do link, de forma atômica
-- ---------------------------------------------------------------
create or replace function redeem_invite(invite_token text)
returns table (client_id uuid, owner_id uuid, platforms platform[]) as $$
  update connect_invites i
  set uses = i.uses + 1,
      used_at = case when i.uses + 1 >= i.max_uses then now() else i.used_at end
  where i.token = invite_token
    and i.expires_at > now()
    and i.uses < i.max_uses
  returning
    i.client_id,
    (select c.owner_id from clients c where c.id = i.client_id),
    i.platforms;
$$ language sql;
