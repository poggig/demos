-- Starfall — Supabase schema. Paste this whole file into the Supabase SQL editor and run it once.
-- Also enable: Authentication → Sign In / Providers → "Allow anonymous sign-ins".

create table if not exists public.games (
  id uuid primary key default gen_random_uuid(),
  code text unique not null,
  name text not null,
  host uuid not null,
  status text not null default 'lobby',          -- lobby | running
  settings jsonb not null default '{}'::jsonb,
  seed bigint not null,
  turn int not null default 0,
  state jsonb,
  deadline timestamptz,
  updated_at timestamptz not null default now()
);

create table if not exists public.members (
  game_id uuid not null references public.games(id) on delete cascade,
  user_id uuid not null,
  player_id text not null,
  name text not null,
  joined_at timestamptz not null default now(),
  primary key (game_id, user_id),
  unique (game_id, player_id)
);

create table if not exists public.orders (
  game_id uuid not null references public.games(id) on delete cascade,
  turn int not null,
  player_id text not null,
  user_id uuid not null default auth.uid(),
  orders jsonb not null default '[]'::jsonb,
  submitted boolean not null default false,
  updated_at timestamptz not null default now(),
  primary key (game_id, turn, player_id)
);

alter table public.games enable row level security;
alter table public.members enable row level security;
alter table public.orders enable row level security;

create or replace function public.is_member(g uuid) returns boolean
language sql security definer set search_path = public stable as $$
  select exists (select 1 from members where game_id = g and user_id = auth.uid());
$$;

-- A turn is locked once every member has submitted, or the deadline has passed.
create or replace function public.turn_locked(g uuid) returns boolean
language sql security definer set search_path = public stable as $$
  select gm.status = 'running' and (
    (gm.deadline is not null and now() > gm.deadline)
    or (select count(*) from members m where m.game_id = g) =
       (select count(*) from orders o where o.game_id = g and o.turn = gm.turn and o.submitted)
  ) from games gm where gm.id = g;
$$;

drop policy if exists games_read on public.games;
create policy games_read on public.games for select using (public.is_member(id));

drop policy if exists members_read on public.members;
create policy members_read on public.members for select using (public.is_member(game_id));

-- Orders: you see and write only your own, and only for the current, unlocked turn.
drop policy if exists orders_read on public.orders;
create policy orders_read on public.orders for select using (user_id = auth.uid());
drop policy if exists orders_insert on public.orders;
create policy orders_insert on public.orders for insert with check (
  user_id = auth.uid()
  and exists (select 1 from members m where m.game_id = orders.game_id and m.user_id = auth.uid() and m.player_id = orders.player_id)
  and turn = (select turn from games where id = orders.game_id)
  and not public.turn_locked(game_id)
);
drop policy if exists orders_update on public.orders;
create policy orders_update on public.orders for update using (user_id = auth.uid()) with check (
  user_id = auth.uid()
  and turn = (select turn from games where id = orders.game_id)
  and not public.turn_locked(game_id)
);

create or replace function public.create_game(p_name text, p_settings jsonb, p_player text)
returns uuid language plpgsql security definer set search_path = public as $$
declare g uuid; c text;
begin
  if auth.uid() is null then raise exception 'not signed in'; end if;
  loop
    c := upper(substr(md5(random()::text || clock_timestamp()::text), 1, 6));
    exit when not exists (select 1 from games where code = c);
  end loop;
  insert into games (code, name, host, settings, seed)
  values (c, left(p_name, 40), auth.uid(), coalesce(p_settings, '{}'::jsonb), floor(random() * 2147483647)::bigint)
  returning id into g;
  insert into members (game_id, user_id, player_id, name) values (g, auth.uid(), 'p1', left(p_player, 20));
  return g;
end $$;

create or replace function public.join_game(p_code text, p_player text)
returns uuid language plpgsql security definer set search_path = public as $$
declare g games; n int;
begin
  if auth.uid() is null then raise exception 'not signed in'; end if;
  select * into g from games where code = upper(trim(p_code));
  if g.id is null then raise exception 'game not found'; end if;
  if exists (select 1 from members where game_id = g.id and user_id = auth.uid()) then return g.id; end if;
  if g.status <> 'lobby' then raise exception 'game already started'; end if;
  select count(*) into n from members where game_id = g.id;
  if n >= 8 then raise exception 'game is full'; end if;
  insert into members (game_id, user_id, player_id, name) values (g.id, auth.uid(), 'p' || (n + 1), left(p_player, 20));
  return g.id;
end $$;

-- Host starts the game with the initial engine state built on their client.
create or replace function public.start_game(p_game uuid, p_state jsonb)
returns void language plpgsql security definer set search_path = public as $$
declare g games;
begin
  select * into g from games where id = p_game for update;
  if g.host <> auth.uid() then raise exception 'only the host can start'; end if;
  if g.status <> 'lobby' then raise exception 'already started'; end if;
  update games set status = 'running', state = p_state, turn = (p_state->>'turn')::int,
    deadline = case when coalesce((g.settings->>'deadlineHours')::numeric, 0) > 0
                    then now() + make_interval(secs => (g.settings->>'deadlineHours')::numeric * 3600) end,
    updated_at = now()
  where id = p_game;
end $$;

create or replace function public.turn_status(p_game uuid)
returns json language plpgsql security definer set search_path = public stable as $$
begin
  if not public.is_member(p_game) then raise exception 'not a member'; end if;
  return json_build_object(
    'turn', (select turn from games where id = p_game),
    'submitted', coalesce((select json_agg(o.player_id) from orders o join games g on g.id = o.game_id
                            where o.game_id = p_game and o.turn = g.turn and o.submitted), '[]'::json),
    'locked', public.turn_locked(p_game),
    'deadline', (select deadline from games where id = p_game));
end $$;

-- Everyone's orders, revealed only once the turn is locked (nobody can change them any more).
create or replace function public.locked_orders(p_game uuid, p_turn int)
returns table (player_id text, orders jsonb) language plpgsql security definer set search_path = public stable as $$
begin
  if not public.is_member(p_game) then raise exception 'not a member'; end if;
  if not public.turn_locked(p_game) then raise exception 'turn not locked'; end if;
  if (select turn from games where id = p_game) <> p_turn then raise exception 'stale turn'; end if;
  return query select o.player_id, o.orders from orders o where o.game_id = p_game and o.turn = p_turn;
end $$;

-- Any member commits the resolved state; only the first commit for a turn wins.
create or replace function public.commit_turn(p_game uuid, p_turn int, p_state jsonb)
returns boolean language plpgsql security definer set search_path = public as $$
declare g games;
begin
  if not public.is_member(p_game) then raise exception 'not a member'; end if;
  if not public.turn_locked(p_game) then raise exception 'turn not locked'; end if;
  select * into g from games where id = p_game for update;
  if g.turn <> p_turn then return false; end if;
  if (p_state->>'turn')::int <> p_turn + 1 then raise exception 'bad state'; end if;
  update games set state = p_state, turn = p_turn + 1,
    deadline = case when coalesce((g.settings->>'deadlineHours')::numeric, 0) > 0
                    then now() + make_interval(secs => (g.settings->>'deadlineHours')::numeric * 3600) end,
    updated_at = now()
  where id = p_game;
  return true;
end $$;

grant execute on function public.create_game, public.join_game, public.start_game, public.turn_status,
  public.locked_orders, public.commit_turn, public.is_member, public.turn_locked to authenticated;
