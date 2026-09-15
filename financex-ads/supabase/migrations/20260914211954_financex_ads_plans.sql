create table plans (
  code           text primary key,
  name           text not null,
  price_usd      numeric(10,2) not null,
  max_accounts   int,                        -- null = sem teto
  posts_per_day  int not null,
  paid_traffic   boolean not null default false,
  sort           int not null default 0,
  active         boolean not null default true
);

insert into plans (code, name, price_usd, max_accounts, posts_per_day, paid_traffic, sort) values
  ('starter', 'Starter',   30.00,   10,  8, false, 1),
  ('pro',     'Pro',      100.00, null, 24, true,  2);

alter table affiliates
  add column plan_code text references plans(code),
  add column trial_ends_at timestamptz;

update affiliates set plan_code = 'starter' where plan_code is null;

alter table plans enable row level security;
create policy read_plans on plans for select using (active);

-- Teto de contas conforme o plano. Bloqueia no banco, não só na tela.
create or replace function enforce_account_limit() returns trigger as $$
declare
  lim  int;
  used int;
begin
  if new.affiliate_id is null then return new; end if;

  select p.max_accounts into lim
  from affiliates a join plans p on p.code = a.plan_code
  where a.id = new.affiliate_id;

  if lim is null then return new; end if;   -- Pro: sem teto

  select count(*) into used from accounts
  where affiliate_id = new.affiliate_id and id <> new.id;

  if used >= lim then
    raise exception 'Limite de % contas do plano atingido. Faça upgrade para o Pro.', lim
      using errcode = 'check_violation';
  end if;

  return new;
end;
$$ language plpgsql set search_path = public;

create trigger accounts_limit before insert on accounts
  for each row execute function enforce_account_limit();

-- Posts por dia também conforme o plano
create or replace function clamp_plan_posts() returns trigger as $$
declare
  cap int;
begin
  select p.posts_per_day into cap
  from affiliates a join plans p on p.code = a.plan_code
  where a.id = new.affiliate_id;

  if cap is not null and new.posts_per_day > cap then
    new.posts_per_day := cap;
  end if;
  return new;
end;
$$ language plpgsql set search_path = public;

create trigger content_plans_clamp before insert or update on content_plans
  for each row execute function clamp_plan_posts();
