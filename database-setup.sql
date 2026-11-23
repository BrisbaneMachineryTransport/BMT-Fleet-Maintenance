-- BMT Fleet Maintenance: database schema for Supabase (Postgres)
-- Run this once in Supabase: Dashboard > SQL Editor > New query > paste > Run.
-- Safe to re-run: it only creates things that don't exist yet.
--
-- Every record belongs to a company, and people only see companies they are members of.
-- That keeps BMT's data private now, and lets the same system serve other companies later.

create extension if not exists pgcrypto;

-- ---------- companies & people ----------
create table if not exists public.companies (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  settings    jsonb not null default '{}'::jsonb,
  created_at  timestamptz not null default now()
);

create table if not exists public.company_members (
  company_id  uuid not null references public.companies(id) on delete cascade,
  user_id     uuid not null references auth.users(id) on delete cascade,
  role        text not null default 'staff' check (role in ('owner','staff','viewer')),
  email       text,
  created_at  timestamptz not null default now(),
  primary key (company_id, user_id)
);

-- ---------- fleet ----------
create table if not exists public.trucks (
  id             uuid primary key default gen_random_uuid(),
  company_id     uuid not null references public.companies(id) on delete cascade,
  name           text not null,
  rego           text,
  fleet_no       text,            -- name used in MyTrucking, for matching imported km
  type           text,
  make           text,
  model          text,
  year           int,
  vin            text,
  layout         text not null default '4x2d',
  spares         int not null default 1,
  towed_by       uuid references public.trucks(id) on delete set null,  -- trailers: prime mover whose km they share
  base_odo       numeric,         -- last actual odometer reading
  base_odo_date  date,            -- ...taken at end of this day
  notes          text,
  sample         boolean not null default false,
  created_at     timestamptz not null default now()
);

create table if not exists public.schedules (
  id               uuid primary key default gen_random_uuid(),
  company_id       uuid not null references public.companies(id) on delete cascade,
  truck_id         uuid not null references public.trucks(id) on delete cascade,
  name             text not null,
  interval_km      numeric,
  interval_months  numeric,
  last_km          numeric,
  last_date        date,
  notes            text,
  sample           boolean not null default false,
  created_at       timestamptz not null default now()
);

create table if not exists public.services (
  id          uuid primary key default gen_random_uuid(),
  company_id  uuid not null references public.companies(id) on delete cascade,
  truck_id    uuid not null references public.trucks(id) on delete cascade,
  date        date not null,
  odo         numeric,
  title       text,
  tasks       jsonb not null default '[]'::jsonb,
  task_ids    jsonb not null default '[]'::jsonb,
  workshop    text,
  cost        numeric,
  invoice     text,
  notes       text,
  sample      boolean not null default false,
  created_at  timestamptz not null default now()
);

create table if not exists public.tyres (
  id              uuid primary key default gen_random_uuid(),
  company_id      uuid not null references public.companies(id) on delete cascade,
  truck_id        uuid not null references public.trucks(id) on delete cascade,
  pos             text not null,      -- e.g. 'Drive 1|LO' or 'Spare'
  status          text not null default 'fitted' check (status in ('fitted','removed')),
  brand           text,
  model           text,
  size            text,
  serial          text,
  condition       text,
  tread           numeric,
  tread_date      date,
  checks          jsonb not null default '[]'::jsonb,
  fitted_date     date,
  fitted_odo      numeric,
  removed_date    date,
  removed_odo     numeric,
  removed_reason  text,
  cost            numeric,
  supplier        text,
  notes           text,
  sample          boolean not null default false,
  created_at      timestamptz not null default now()
);

create table if not exists public.compliance (
  id            uuid primary key default gen_random_uuid(),
  company_id    uuid not null references public.companies(id) on delete cascade,
  truck_id      uuid not null references public.trucks(id) on delete cascade,
  name          text not null,
  expiry        date,
  renew_months  numeric,
  remind_days   numeric,
  ref           text,
  notes         text,
  history       jsonb not null default '[]'::jsonb,
  sample        boolean not null default false,
  created_at    timestamptz not null default now()
);

create table if not exists public.km_daily (
  company_id  uuid not null references public.companies(id) on delete cascade,
  truck_id    uuid not null references public.trucks(id) on delete cascade,
  day         date not null,
  km          numeric not null check (km >= 0),
  source      text not null default 'manual',   -- manual | import | sync
  updated_at  timestamptz not null default now(),
  primary key (truck_id, day)
);

-- columns added after the first version (harmless if they already exist)
alter table public.trucks add column if not exists spares int not null default 1;
alter table public.trucks add column if not exists towed_by uuid references public.trucks(id) on delete set null;

create index if not exists trucks_company_idx     on public.trucks(company_id);
create index if not exists schedules_truck_idx    on public.schedules(truck_id);
create index if not exists services_truck_idx     on public.services(truck_id);
create index if not exists tyres_truck_idx        on public.tyres(truck_id);
create index if not exists compliance_truck_idx   on public.compliance(truck_id);
create index if not exists km_company_day_idx     on public.km_daily(company_id, day);

-- ---------- membership helpers ----------
create or replace function public.is_member(cid uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from company_members m where m.company_id = cid and m.user_id = auth.uid());
$$;

create or replace function public.can_edit(cid uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from company_members m where m.company_id = cid and m.user_id = auth.uid() and m.role in ('owner','staff'));
$$;

create or replace function public.is_owner(cid uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from company_members m where m.company_id = cid and m.user_id = auth.uid() and m.role = 'owner');
$$;

-- First person to sign in creates their company and becomes its owner.
create or replace function public.create_company(company_name text)
returns uuid language plpgsql security definer set search_path = public as $$
declare cid uuid;
begin
  if auth.uid() is null then raise exception 'Not signed in'; end if;
  insert into companies(name) values (coalesce(nullif(trim(company_name),''),'My company')) returning id into cid;
  insert into company_members(company_id, user_id, role, email)
    values (cid, auth.uid(), 'owner', (select email from auth.users where id = auth.uid()));
  return cid;
end $$;

-- Owner adds a staff member who already has a login (invite them first from Supabase > Authentication).
create or replace function public.add_member(cid uuid, member_email text, member_role text default 'staff')
returns void language plpgsql security definer set search_path = public as $$
declare uid uuid;
begin
  if not is_owner(cid) then raise exception 'Only the owner can add people'; end if;
  if member_role not in ('owner','staff','viewer') then raise exception 'Unknown role %', member_role; end if;
  select id into uid from auth.users where lower(email) = lower(trim(member_email));
  if uid is null then raise exception 'No login exists for %. Invite them in Supabase first (Authentication > Users > Invite).', member_email; end if;
  insert into company_members(company_id, user_id, role, email) values (cid, uid, member_role, lower(trim(member_email)))
    on conflict (company_id, user_id) do update set role = excluded.role;
end $$;

create or replace function public.remove_member(cid uuid, member_user uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not is_owner(cid) then raise exception 'Only the owner can remove people'; end if;
  if member_user = auth.uid() then raise exception 'You cannot remove yourself'; end if;
  delete from company_members where company_id = cid and user_id = member_user;
end $$;

-- ---------- row level security ----------
alter table public.companies       enable row level security;
alter table public.company_members enable row level security;
alter table public.trucks          enable row level security;
alter table public.schedules       enable row level security;
alter table public.services        enable row level security;
alter table public.tyres           enable row level security;
alter table public.compliance      enable row level security;
alter table public.km_daily        enable row level security;

drop policy if exists companies_read   on public.companies;
drop policy if exists companies_update on public.companies;
create policy companies_read   on public.companies for select using (is_member(id));
create policy companies_update on public.companies for update using (is_owner(id)) with check (is_owner(id));

drop policy if exists members_read on public.company_members;
create policy members_read on public.company_members for select using (is_member(company_id));

do $$
declare t text;
begin
  foreach t in array array['trucks','schedules','services','tyres','compliance','km_daily'] loop
    execute format('drop policy if exists %I_read on public.%I', t, t);
    execute format('drop policy if exists %I_write on public.%I', t, t);
    execute format('create policy %I_read on public.%I for select using (is_member(company_id))', t, t);
    execute format('create policy %I_write on public.%I for all using (can_edit(company_id)) with check (can_edit(company_id))', t, t);
  end loop;
end $$;

grant execute on function public.create_company(text) to authenticated;
grant execute on function public.add_member(uuid, text, text) to authenticated;
grant execute on function public.remove_member(uuid, uuid) to authenticated;

-- ---------- safeguard: child records must belong to the same company as their truck ----------
create or replace function public.check_truck_company()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from trucks t where t.id = new.truck_id and t.company_id = new.company_id) then
    raise exception 'Truck does not belong to this company';
  end if;
  return new;
end $$;

do $$
declare t text;
begin
  foreach t in array array['schedules','services','tyres','compliance','km_daily'] loop
    execute format('drop trigger if exists %I_truck_company on public.%I', t, t);
    execute format('create trigger %I_truck_company before insert or update on public.%I for each row execute function check_truck_company()', t, t);
  end loop;
end $$;
