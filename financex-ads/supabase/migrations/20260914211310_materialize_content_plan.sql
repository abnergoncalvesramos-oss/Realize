-- Gera os posts do dia para um plano.
-- Roda uma vez por dia, por plano. Idempotente: não duplica se rodar de novo.

alter table posts add column if not exists plan_id uuid references content_plans(id) on delete set null;
alter table posts add column if not exists slot_index int;
create unique index if not exists posts_plan_slot_idx
  on posts (plan_id, slot_index, scheduled_for) where plan_id is not null;

create or replace function materialize_plan(p_plan_id uuid, p_day date default null)
returns int as $$
declare
  pl        content_plans%rowtype;
  aff       affiliates%rowtype;
  day       date;
  n_items   int;
  n_accts   int;
  step_min  int;
  acct      record;
  slot      int;
  cre       creatives%rowtype;
  cap       text;
  when_ts   timestamptz;
  new_post  uuid;
  made      int := 0;
begin
  select * into pl from content_plans where id = p_plan_id and active;
  if not found then return 0; end if;

  select * into aff from affiliates where id = pl.affiliate_id;
  if aff.status <> 'active' then return 0; end if;   -- assinatura em dia é pré-requisito

  day := coalesce(p_day, (now() at time zone pl.timezone)::date);

  select count(*) into n_items from plan_items where plan_id = pl.id;
  select count(*) into n_accts from plan_accounts where plan_id = pl.id;
  if n_items = 0 or n_accts = 0 then return 0; end if;

  -- espaçamento entre as publicações dentro da janela do dia
  step_min := greatest(1, ((pl.last_hour - pl.first_hour) * 60) / greatest(1, pl.posts_per_day - 1));

  for acct in
    select account_id, position from plan_accounts where plan_id = pl.id order by position
  loop
    for slot in 0 .. pl.posts_per_day - 1 loop

      -- Rotação: no mesmo horário, cada conta pega um criativo diferente.
      select c.* into cre
      from plan_items pi
      join creatives c on c.id = pi.creative_id
      where pi.plan_id = pl.id
        and pi.position = (slot + acct.position * case when pl.rotate_creatives then 1 else 0 end) % n_items
        and c.active;
      if not found then continue; end if;

      -- Stagger: desloca a conta no tempo para não sair tudo junto.
      when_ts := ((day + make_interval(hours => pl.first_hour, mins => slot * step_min))
                  at time zone pl.timezone)
                 + make_interval(mins => acct.position * pl.stagger_minutes);

      if when_ts < now() then continue; end if;

      -- Legenda variada, quando o criativo tiver alternativas
      cap := case
        when array_length(cre.captions, 1) is null then ''
        else cre.captions[1 + (slot + acct.position) % array_length(cre.captions, 1)]
      end;

      insert into posts (owner_id, affiliate_ref, caption, media, status, scheduled_for, plan_id, slot_index)
      values (
        aff.user_id,
        aff.id,
        cap,
        jsonb_build_array(jsonb_build_object('type', cre.kind, 'url', cre.url)),
        'scheduled',
        when_ts,
        pl.id,
        slot
      )
      on conflict do nothing
      returning id into new_post;

      if new_post is null then continue; end if;

      insert into post_targets (post_id, account_id)
      values (new_post, acct.account_id)
      on conflict do nothing;

      made := made + 1;
    end loop;
  end loop;

  return made;
end;
$$ language plpgsql set search_path = public;
