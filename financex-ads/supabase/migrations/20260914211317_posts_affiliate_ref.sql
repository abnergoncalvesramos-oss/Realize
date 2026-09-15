alter table posts add column if not exists affiliate_ref uuid references affiliates(id) on delete cascade;
create index if not exists posts_affiliate_idx on posts (affiliate_ref, status, scheduled_for);
