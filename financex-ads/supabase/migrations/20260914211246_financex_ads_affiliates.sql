-- FinanceX ADS — afiliados, atribuição de vendas e agendamento recorrente

create type affiliate_status as enum ('pending', 'active', 'past_due', 'canceled');
create type conversion_status as enum ('pending', 'approved', 'refunded', 'rejected');
create type commission_status as enum ('accruing', 'payable', 'paid', 'canceled');

-- ---------------------------------------------------------------
-- affiliates
-- ---------------------------------------------------------------
create table affiliates (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null unique references auth.users(id) on delete cascade,
  ref_code        text not null unique,
  display_name    text not null,
  email           text not null,
  status          affiliate_status not null default 'pending',
  plan            text,
  commission_rate numeric(5,4) not null default 0.3000,
  max_accounts    int not null default 10,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index affiliates_refcode_idx on affiliates (ref_code);
create trigger affiliates_touch before update on affiliates
  for each row execute function touch_updated_at();

-- Código curto, sem vogais nem caracteres ambíguos (0/O, 1/l).
create or replace function gen_ref_code() returns text as $$
declare
  alphabet text := '23456789bcdfghjkmnpqrstvwxyz';
  out text := '';
  i int;
begin
  for i in 1..7 loop
    out := out || substr(alphabet, 1 + floor(random() * length(alphabet))::int, 1);
  end loop;
  return out;
end;
$$ language plpgsql;

alter table affiliates alter column ref_code set default gen_ref_code();

-- Assinatura do plano
create table affiliate_subscriptions (
  id                 uuid primary key default gen_random_uuid(),
  affiliate_id       uuid not null references affiliates(id) on delete cascade,
  provider           text not null,
  external_id        text not null,
  status             text not null,
  amount             numeric(12,2),
  current_period_end timestamptz,
  created_at         timestamptz not null default now(),
  unique (provider, external_id)
);

-- O afiliado é dono das próprias contas conectadas
alter table accounts add column affiliate_id uuid references affiliates(id) on delete cascade;
create index accounts_affiliate_idx on accounts (affiliate_id, platform);

-- ---------------------------------------------------------------
-- Biblioteca de criativos
-- ---------------------------------------------------------------
create table creatives (
  id         uuid primary key default gen_random_uuid(),
  title      text not null,
  kind       text not null default 'video',
  url        text not null,
  thumb_url  text,
  duration_s int,
  aspect     text,
  tags       text[] not null default '{}',
  captions   text[] not null default '{}',
  active     boolean not null default true,
  created_at timestamptz not null default now()
);

create table creative_downloads (
  id           uuid primary key default gen_random_uuid(),
  creative_id  uuid not null references creatives(id) on delete cascade,
  affiliate_id uuid not null references affiliates(id) on delete cascade,
  at           timestamptz not null default now()
);

create index creative_downloads_aff_idx on creative_downloads (affiliate_id, at desc);

-- ---------------------------------------------------------------
-- Atribuição
-- ---------------------------------------------------------------
create table ref_links (
  id           uuid primary key default gen_random_uuid(),
  affiliate_id uuid not null references affiliates(id) on delete cascade,
  slug         text not null unique,
  destination  text not null,
  creative_id  uuid references creatives(id) on delete set null,
  label        text,
  created_at   timestamptz not null default now()
);

create table clicks (
  id           uuid primary key default gen_random_uuid(),
  ref_link_id  uuid references ref_links(id) on delete set null,
  affiliate_id uuid not null references affiliates(id) on delete cascade,
  visitor_id   text not null,
  ip_hash      text,
  user_agent   text,
  country      text,
  utm          jsonb not null default '{}'::jsonb,
  at           timestamptz not null default now()
);

create index clicks_visitor_idx on clicks (visitor_id, at desc);
create index clicks_affiliate_idx on clicks (affiliate_id, at desc);

create table conversions (
  id           uuid primary key default gen_random_uuid(),
  affiliate_id uuid not null references affiliates(id) on delete cascade,
  click_id     uuid references clicks(id) on delete set null,
  order_id     text not null unique,
  buyer_email  text,
  amount       numeric(12,2) not null,
  currency     text not null default 'BRL',
  status       conversion_status not null default 'pending',
  at           timestamptz not null default now()
);

create index conversions_aff_idx on conversions (affiliate_id, at desc);

create table commissions (
  id            uuid primary key default gen_random_uuid(),
  conversion_id uuid not null unique references conversions(id) on delete cascade,
  affiliate_id  uuid not null references affiliates(id) on delete cascade,
  rate          numeric(5,4) not null,
  amount        numeric(12,2) not null,
  status        commission_status not null default 'accruing',
  paid_at       timestamptz,
  created_at    timestamptz not null default now()
);

create index commissions_aff_idx on commissions (affiliate_id, status);

-- Atribuição last-click com janela de 30 dias.
-- order_id é unique, então reenvio de webhook não duplica comissão.
create or replace function attribute_sale(
  p_visitor_id text,
  p_order_id   text,
  p_amount     numeric,
  p_email      text default null,
  p_window     interval default '30 days'
) returns uuid as $$
declare
  v_click    clicks%rowtype;
  v_conv_id  uuid;
  v_rate     numeric;
begin
  select * into v_click from clicks
  where visitor_id = p_visitor_id and at > now() - p_window
  order by at desc limit 1;

  if not found then
    return null;  -- venda orgânica, sem afiliado
  end if;

  select commission_rate into v_rate from affiliates where id = v_click.affiliate_id;

  insert into conversions (affiliate_id, click_id, order_id, buyer_email, amount)
  values (v_click.affiliate_id, v_click.id, p_order_id, p_email, p_amount)
  on conflict (order_id) do nothing
  returning id into v_conv_id;

  if v_conv_id is null then
    return null;  -- webhook repetido
  end if;

  insert into commissions (conversion_id, affiliate_id, rate, amount)
  values (v_conv_id, v_click.affiliate_id, v_rate, round(p_amount * v_rate, 2));

  return v_conv_id;
end;
$$ language plpgsql set search_path = public;

-- ---------------------------------------------------------------
-- Agendamento recorrente
-- ---------------------------------------------------------------
create table content_plans (
  id               uuid primary key default gen_random_uuid(),
  affiliate_id     uuid not null references affiliates(id) on delete cascade,
  name             text not null,
  timezone         text not null default 'America/Sao_Paulo',
  posts_per_day    int not null default 8,
  first_hour       int not null default 8,
  last_hour        int not null default 22,
  stagger_minutes  int not null default 17,
  rotate_creatives boolean not null default true,
  active           boolean not null default true,
  created_at       timestamptz not null default now(),
  constraint sane_window check (first_hour between 0 and 23 and last_hour between 0 and 23)
);

create table plan_accounts (
  plan_id    uuid not null references content_plans(id) on delete cascade,
  account_id uuid not null references accounts(id) on delete cascade,
  position   int not null default 0,
  primary key (plan_id, account_id)
);

create table plan_items (
  id          uuid primary key default gen_random_uuid(),
  plan_id     uuid not null references content_plans(id) on delete cascade,
  creative_id uuid not null references creatives(id) on delete cascade,
  position    int not null,
  unique (plan_id, position)
);

-- ---------------------------------------------------------------
-- RLS: o afiliado só enxerga o que é dele
-- ---------------------------------------------------------------
alter table affiliates             enable row level security;
alter table affiliate_subscriptions enable row level security;
alter table creatives              enable row level security;
alter table creative_downloads     enable row level security;
alter table ref_links              enable row level security;
alter table clicks                 enable row level security;
alter table conversions            enable row level security;
alter table commissions            enable row level security;
alter table content_plans          enable row level security;
alter table plan_accounts          enable row level security;
alter table plan_items             enable row level security;

create or replace function my_affiliate_id() returns uuid as $$
  select id from affiliates where user_id = auth.uid();
$$ language sql stable set search_path = public;

create policy self on affiliates
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy self on affiliate_subscriptions
  for select using (affiliate_id = my_affiliate_id());

-- Criativos ativos: todo afiliado ativo lê, ninguém escreve (só service_role)
create policy read_active on creatives
  for select using (active and exists (
    select 1 from affiliates a where a.user_id = auth.uid() and a.status = 'active'
  ));

create policy self on creative_downloads
  for all using (affiliate_id = my_affiliate_id()) with check (affiliate_id = my_affiliate_id());

create policy self on ref_links
  for all using (affiliate_id = my_affiliate_id()) with check (affiliate_id = my_affiliate_id());

create policy self on clicks       for select using (affiliate_id = my_affiliate_id());
create policy self on conversions  for select using (affiliate_id = my_affiliate_id());
create policy self on commissions  for select using (affiliate_id = my_affiliate_id());

create policy self on content_plans
  for all using (affiliate_id = my_affiliate_id()) with check (affiliate_id = my_affiliate_id());

create policy self on plan_accounts for all using (
  exists (select 1 from content_plans p where p.id = plan_accounts.plan_id and p.affiliate_id = my_affiliate_id())
) with check (
  exists (select 1 from content_plans p where p.id = plan_accounts.plan_id and p.affiliate_id = my_affiliate_id())
);

create policy self on plan_items for all using (
  exists (select 1 from content_plans p where p.id = plan_items.plan_id and p.affiliate_id = my_affiliate_id())
) with check (
  exists (select 1 from content_plans p where p.id = plan_items.plan_id and p.affiliate_id = my_affiliate_id())
);
