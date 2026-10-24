-- Tiers and the trial (docs/decisions/tiers-and-trial.md).
-- - A judged take is one "take" whatever the judge was sent (one take, one
--   count); exercise notes and mark-ups are "text"; insights stay "insight".
-- - Plans are free, trial (the 14-day App Store introductory offer) and plus.
--   The trial's counts run from the day it started.
-- - The starter pack (5 free reviews once) and its tombstones are gone: free
--   users get a monthly taste instead (freeMonthlyJudgedTakes), so there is
--   nothing lifetime to remember about a deleted account.
-- Apply in the SQL editor after 20261020000000_plus_sync.sql, before deploying
-- the functions from this branch.

------------------------------------------------------------------ AI call ledger
alter table public.ai_calls drop constraint if exists ai_calls_kind_check;
alter table public.ai_calls drop constraint if exists ai_calls_tier_check;
-- Rows from before this change, so the new checks hold (test data only).
update public.ai_calls set kind = 'take' where kind = 'review';
update public.ai_calls set tier = 'free' where tier = 'starter';
alter table public.ai_calls add constraint ai_calls_kind_check check (kind in ('take', 'text', 'insight'));
alter table public.ai_calls add constraint ai_calls_tier_check check (tier in ('free', 'beta', 'trial', 'plus'));

------------------------------------------------------------------ entitlements
-- Written only from RevenueCat's answer. plan 'trial' while the introductory
-- offer runs, 'plus' after; period_started_at is when the current period began.
alter table public.entitlements drop constraint if exists entitlements_plan_check;
alter table public.entitlements add constraint entitlements_plan_check check (plan in ('plus', 'trial'));
alter table public.entitlements add column if not exists period_started_at timestamptz;

------------------------------------------------------------------ starter pack, retired
drop function if exists public.claim_starter_tombstone(uuid, text);
drop table if exists public.starter_tombstones;
alter table public.accounts drop column if exists starter_reviews_used;
alter table public.accounts drop column if exists starter_text_used;

------------------------------------------------------------------ usage snapshot
-- Everything the allowance rules (supabase/functions/_shared/allowance.ts) read,
-- in one query, inside the transaction that holds the account row lock.
-- Counts cover the trial so far for a trial, else this UTC month. Reserved
-- calls count while in flight, but only for 15 minutes.
drop function if exists public.usage_snapshot(uuid, timestamptz, timestamptz);
create function public.usage_snapshot(p_user uuid, p_month_start timestamptz, p_day_start timestamptz)
returns table (
  plan text,
  trial_ends_at timestamptz,
  takes int,
  text_calls int,
  insights int,
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
    select c.user_id, c.kind, c.tier, c.created_at, coalesce(c.cost_usd, c.est_cost_usd) as cost
    from public.ai_calls c
    where c.status = 'done' or (c.status = 'reserved' and c.created_at > now() - interval '15 minutes')
  )
  select
    coalesce((select ent.plan from ent), 'free'),
    (select ent.expires_at from ent where ent.plan = 'trial'),
    (select count(*) from live, win where live.user_id = p_user and live.kind = 'take' and live.created_at >= win.start)::int,
    (select count(*) from live, win where live.user_id = p_user and live.kind = 'text' and live.created_at >= win.start)::int,
    (select count(*) from live, win where live.user_id = p_user and live.kind = 'insight' and live.created_at >= win.start)::int,
    coalesce((select sum(live.cost) from live, win where live.user_id = p_user and live.created_at >= win.start), 0),
    (select count(*) from live where live.user_id = p_user and live.kind = 'take' and live.created_at >= p_day_start)::int,
    coalesce((select sum(live.cost) from live where live.tier in ('free', 'beta') and live.created_at >= p_month_start), 0)
  from public.accounts a
  where a.user_id = p_user;
$$;

revoke all on function public.usage_snapshot(uuid, timestamptz, timestamptz) from public, anon, authenticated;

------------------------------------------------------------------ config
-- The new limits. This replaces the whole row: check mode and plusPurchasable
-- afterwards if they had been changed on the live project.
-- config-seed-begin
update public.config set updated_at = now(), value = $json$
{
  "mode": "beta",
  "killSwitch": false,
  "plusPurchasable": false,
  "minorsMayUseAi": false,
  "freeBudgetUsd": 50,
  "limits": {
    "freeMonthlyJudgedTakes": 1,
    "betaMonthlyJudgedTakes": 15,
    "betaMonthlyTextCalls": 60,
    "betaMonthlyInsights": 4,
    "trialJudgedTakes": 20,
    "trialTextCalls": 30,
    "trialInsights": 4,
    "trialConversationMinutes": 30,
    "plusMonthlyJudgedTakes": 60,
    "plusMonthlyTextCalls": 100,
    "plusMonthlyInsights": 12,
    "plusMonthlyConversationMinutes": 120,
    "paidCostCapUsd": 2.5,
    "dailyJudgedTakes": 6,
    "maxVideoSeconds": 300,
    "maxUploadBytes": 500000000,
    "maxInputChars": 60000
  },
  "models": {
    "review_video": { "primary": "gemini-3.5-flash-lite", "fallback": "gemini-3.8-flash", "maxOutputTokens": 6000, "videoFps": 1 },
    "text": {
      "primary": "gemini-3.5-flash-lite",
      "fallback": "gemini-3.8-flash",
      "candidate": { "model": "gemini-3.1-flash-lite", "rolloutPercent": 0 },
      "maxOutputTokens": 4000
    },
    "insight": { "primary": "gemini-3.5-flash-lite", "fallback": "gemini-3.8-flash", "maxOutputTokens": 4000 }
  },
  "prices": {
    "gemini-3.5-flash-lite": { "inputPerM": 0.3, "outputPerM": 2.5 },
    "gemini-3.1-flash-lite": { "inputPerM": 0.25, "audioPerM": 0.5, "outputPerM": 1.5 },
    "gemini-3.8-flash": { "inputPerM": 0.75, "outputPerM": 3.75 }
  }
}
$json$::jsonb where id = 1;
-- config-seed-end
