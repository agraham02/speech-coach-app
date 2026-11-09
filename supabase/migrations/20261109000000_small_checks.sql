-- Small content checks (docs/overhaul/PLAN.md, section 6.6, level 2; DECISIONS D23).
-- - A new count kind, 'check': "is this about the prompt", "do these words link".
--   Free accounts get a monthly count of them (60), so this is the first
--   Tono AI feature a free, signed-in adult can use beyond the one judged take.
-- - usage_snapshot counts them in the same window as the other kinds.
-- No config row change is needed: the new limits have defaults in
-- supabase/functions/_shared/config.ts (freeMonthlyChecks 60, betaMonthlyChecks
-- 100, trialChecks 60, plusMonthlyChecks 200), and a row that names them wins.
-- Apply in the SQL editor after 20261025000000_dev_override.sql, before
-- deploying the updated ai-generate and me.

------------------------------------------------------------------ AI call ledger
alter table public.ai_calls drop constraint if exists ai_calls_kind_check;
alter table public.ai_calls add constraint ai_calls_kind_check check (kind in ('take', 'text', 'insight', 'conversation', 'check'));

------------------------------------------------------------------ usage snapshot
-- As before, plus the small checks in the window.
drop function if exists public.usage_snapshot(uuid, timestamptz, timestamptz);
create function public.usage_snapshot(p_user uuid, p_month_start timestamptz, p_day_start timestamptz)
returns table (
  plan text,
  trial_ends_at timestamptz,
  takes int,
  text_calls int,
  insights int,
  check_calls int,
  conversation_seconds numeric,
  cost_usd numeric,
  day_takes int,
  free_spend_month_usd numeric
)
language sql stable security definer set search_path = public as $$
  with ent as (
    select e.plan, e.expires_at, e.period_started_at
    from public.entitlements e
    where e.user_id = p_user and e.expires_at > now()
  ),
  win as (
    select case
      when (select ent.plan from ent) = 'trial' then coalesce((select ent.period_started_at from ent), p_month_start)
      else p_month_start
    end as start
  ),
  live as (
    select c.user_id, c.kind, c.tier, c.created_at, c.units_seconds, coalesce(c.cost_usd, c.est_cost_usd) as cost
    from public.ai_calls c
    where c.status = 'done' or (c.status = 'reserved' and c.created_at > now() - interval '15 minutes')
  )
  select
    coalesce((select ent.plan from ent), 'free'),
    (select ent.expires_at from ent where ent.plan = 'trial'),
    (select count(*) from live, win where live.user_id = p_user and live.kind = 'take' and live.created_at >= win.start)::int,
    (select count(*) from live, win where live.user_id = p_user and live.kind = 'text' and live.created_at >= win.start)::int,
    (select count(*) from live, win where live.user_id = p_user and live.kind = 'insight' and live.created_at >= win.start)::int,
    (select count(*) from live, win where live.user_id = p_user and live.kind = 'check' and live.created_at >= win.start)::int,
    coalesce((select sum(live.units_seconds) from live, win where live.user_id = p_user and live.kind = 'conversation' and live.created_at >= win.start), 0),
    coalesce((select sum(live.cost) from live, win where live.user_id = p_user and live.created_at >= win.start), 0),
    (select count(*) from live where live.user_id = p_user and live.kind = 'take' and live.created_at >= p_day_start)::int,
    coalesce((select sum(live.cost) from live where live.tier in ('free', 'beta') and live.created_at >= p_month_start), 0)
  from public.accounts a
  where a.user_id = p_user;
$$;

revoke all on function public.usage_snapshot(uuid, timestamptz, timestamptz) from public, anon, authenticated;
