-- Live conversation with a voice (docs/decisions/conversation-voice.md).
-- - A new count kind, 'conversation', metered in seconds the server measures
--   between a conversation's calls (supabase/functions/_shared/conversation.ts),
--   against the tier's minutes: Plus 120 a month, the trial 30, beta 30, free 0.
-- - Each ai_calls row of a conversation carries the conversation's id (made on
--   the phone) and the seconds charged for that turn.
-- - Config: the conversation and voice model roles, the voice models' prices
--   (with Google's 2027-01-01 change written down), and the new limits.
-- Apply in the SQL editor after 20261023000000_tiers_and_trial.sql, before
-- deploying ai-converse and the updated ai-generate and me.

------------------------------------------------------------------ AI call ledger
alter table public.ai_calls drop constraint if exists ai_calls_kind_check;
alter table public.ai_calls add constraint ai_calls_kind_check check (kind in ('take', 'text', 'insight', 'conversation'));
alter table public.ai_calls add column if not exists conversation_id text;
alter table public.ai_calls add column if not exists units_seconds numeric(8, 1) not null default 0;
create index if not exists ai_calls_user_conversation on public.ai_calls (user_id, conversation_id) where conversation_id is not null;

------------------------------------------------------------------ usage snapshot
-- As before, plus the conversation seconds charged in the window.
drop function if exists public.usage_snapshot(uuid, timestamptz, timestamptz);
create function public.usage_snapshot(p_user uuid, p_month_start timestamptz, p_day_start timestamptz)
returns table (
  plan text,
  trial_ends_at timestamptz,
  takes int,
  text_calls int,
  insights int,
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
    coalesce((select sum(live.units_seconds) from live, win where live.user_id = p_user and live.kind = 'conversation' and live.created_at >= win.start), 0),
    coalesce((select sum(live.cost) from live, win where live.user_id = p_user and live.created_at >= win.start), 0),
    (select count(*) from live where live.user_id = p_user and live.kind = 'take' and live.created_at >= p_day_start)::int,
    coalesce((select sum(live.cost) from live where live.tier in ('free', 'beta') and live.created_at >= p_month_start), 0)
  from public.accounts a
  where a.user_id = p_user;
$$;

revoke all on function public.usage_snapshot(uuid, timestamptz, timestamptz) from public, anon, authenticated;

------------------------------------------------------------------ config
-- The whole row again (the tests check it equals DEFAULT_CONFIG). This
-- replaces mode and plusPurchasable too: set them back afterwards if they had
-- been changed on the live project.
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
    "betaMonthlyTextCalls": 100,
    "betaMonthlyInsights": 4,
    "trialJudgedTakes": 20,
    "trialTextCalls": 60,
    "trialInsights": 4,
    "trialConversationMinutes": 30,
    "plusMonthlyJudgedTakes": 60,
    "plusMonthlyTextCalls": 300,
    "plusMonthlyInsights": 12,
    "plusMonthlyConversationMinutes": 120,
    "freeMonthlyConversationMinutes": 0,
    "betaMonthlyConversationMinutes": 30,
    "conversationMaxMinutes": 8,
    "conversationMaxTurnSeconds": 120,
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
    "insight": { "primary": "gemini-3.5-flash-lite", "fallback": "gemini-3.8-flash", "maxOutputTokens": 4000 },
    "conversation": { "primary": "gemini-3.5-flash-lite", "fallback": "gemini-3.1-flash-lite", "maxOutputTokens": 400, "thinkingBudget": 0 },
    "tts": { "primary": "gemini-3.8-flash-lite-tts", "fallback": "gemini-3.8-flash-tts", "maxOutputTokens": 750 }
  },
  "prices": {
    "gemini-3.5-flash-lite": { "inputPerM": 0.3, "outputPerM": 2.5 },
    "gemini-3.1-flash-lite": { "inputPerM": 0.25, "audioPerM": 0.5, "outputPerM": 1.5 },
    "gemini-3.8-flash": { "inputPerM": 0.75, "outputPerM": 3.75, "next": { "from": "2027-01-01", "inputPerM": 1.5, "outputPerM": 7.5 } },
    "gemini-3.8-flash-lite-tts": { "inputPerM": 0.5, "outputPerM": 6, "next": { "from": "2027-01-01", "inputPerM": 1, "outputPerM": 12 } },
    "gemini-3.8-flash-tts": { "inputPerM": 0.5, "outputPerM": 9, "next": { "from": "2027-01-01", "inputPerM": 1, "outputPerM": 18 } }
  }
}
$json$::jsonb where id = 1;
-- config-seed-end
