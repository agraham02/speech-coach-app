-- Tono AI: accounts, entitlements, AI call ledger, uploads, backups, config.
-- Every table has row level security on. The app talks to the database only
-- through edge functions (service role), except for the few read policies below.

------------------------------------------------------------------ config
-- One row. Limits, prices, pinned models and the kill switch live here, so
-- changing any of them needs no app update and no redeploy.
create table public.config (
  id int primary key default 1 check (id = 1),
  value jsonb not null,
  updated_at timestamptz not null default now()
);
alter table public.config enable row level security;

-- config-seed-begin
insert into public.config (id, value) values (1, $json$
{
  "mode": "beta",
  "killSwitch": false,
  "freeBudgetUsd": 50,
  "limits": {
    "starterReviews": 5,
    "starterTextCalls": 15,
    "betaMonthlyReviews": 15,
    "betaMonthlyInsights": 4,
    "betaMonthlyTextCalls": 60,
    "plusMonthlyReviews": 60,
    "plusMonthlyInsights": 12,
    "plusMonthlyTextCalls": 100,
    "plusMonthlyCostCapUsd": 2.5,
    "dailyReviews": 6,
    "maxVideoSeconds": 300,
    "maxUploadBytes": 500000000,
    "maxPromptChars": 120000,
    "maxSchemaChars": 20000
  },
  "models": {
    "review_video": { "primary": "gemini-3.5-flash-lite", "fallback": "gemini-3.8-flash", "maxOutputTokens": 6000, "videoFps": 1 },
    "text": { "primary": "gemini-3.5-flash-lite", "fallback": "gemini-3.8-flash", "maxOutputTokens": 4000 },
    "insight": { "primary": "gemini-3.5-flash-lite", "fallback": "gemini-3.8-flash", "maxOutputTokens": 4000 }
  },
  "prices": {
    "gemini-3.5-flash-lite": { "inputPerM": 0.3, "outputPerM": 2.5 },
    "gemini-3.1-flash-lite": { "inputPerM": 0.25, "audioPerM": 0.5, "outputPerM": 1.5 },
    "gemini-3.8-flash": { "inputPerM": 0.75, "outputPerM": 3.75 }
  }
}
$json$::jsonb);
-- config-seed-end

------------------------------------------------------------------ accounts
create table public.accounts (
  user_id uuid primary key references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  -- Lifetime starter-pack use (launch mode). Refunds give a review back.
  starter_reviews_used int not null default 0 check (starter_reviews_used >= 0),
  starter_text_used int not null default 0 check (starter_text_used >= 0),
  -- Sign in with Apple refresh token, encrypted by the edge function before it
  -- is stored. Used only to revoke the grant when the account is deleted.
  apple_refresh_token_enc text
);
alter table public.accounts enable row level security;
create policy "own account is readable" on public.accounts for select using (auth.uid() = user_id);

create function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.accounts (user_id) values (new.id) on conflict do nothing;
  return new;
end;
$$;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

------------------------------------------------------------------ entitlements
-- Written only by the RevenueCat webhook. A row with expires_at in the future
-- means Plus.
create table public.entitlements (
  user_id uuid primary key references auth.users (id) on delete cascade,
  plan text not null default 'plus' check (plan = 'plus'),
  environment text not null check (environment in ('production', 'sandbox')),
  product_id text,
  expires_at timestamptz not null,
  updated_at timestamptz not null default now()
);
alter table public.entitlements enable row level security;
create policy "own entitlement is readable" on public.entitlements for select using (auth.uid() = user_id);

------------------------------------------------------------------ AI call ledger
create table public.ai_calls (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  kind text not null check (kind in ('review', 'text', 'insight')),
  idempotency_key text not null,
  -- reserved: counted against limits while in flight. done: finished. refunded: failed, does not count.
  status text not null default 'reserved' check (status in ('reserved', 'done', 'refunded')),
  tier text not null check (tier in ('starter', 'beta', 'plus')),
  model text,
  is_candidate boolean not null default false,
  used_fallback boolean not null default false,
  input_text int not null default 0,
  input_video int not null default 0,
  input_audio int not null default 0,
  output_tokens int not null default 0,
  thinking_tokens int not null default 0,
  est_cost_usd numeric(10, 6) not null default 0,
  cost_usd numeric(10, 6),
  error text,
  created_at timestamptz not null default now(),
  finished_at timestamptz,
  unique (user_id, idempotency_key)
);
create index ai_calls_user_created on public.ai_calls (user_id, created_at desc);
create index ai_calls_tier_created on public.ai_calls (tier, created_at);
alter table public.ai_calls enable row level security;

------------------------------------------------------------------ uploads
-- Files started through ai-upload-start, so a call can only use its own.
create table public.uploads (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  file_name text unique,
  mime_type text not null,
  size_bytes bigint not null,
  created_at timestamptz not null default now()
);
create index uploads_user_created on public.uploads (user_id, created_at desc);
alter table public.uploads enable row level security;

------------------------------------------------------------------ backups
create table public.backups (
  user_id uuid primary key references auth.users (id) on delete cascade,
  size_bytes bigint not null,
  db_version int not null,
  app_version text not null,
  updated_at timestamptz not null default now()
);
alter table public.backups enable row level security;
create policy "own backup row is readable" on public.backups for select using (auth.uid() = user_id);

insert into storage.buckets (id, name, public) values ('backups', 'backups', false) on conflict do nothing;

------------------------------------------------------------------ starter tombstones
-- A keyed one-way hash of the sign-in identity (made in the edge function), so
-- deleting and recreating an account does not hand out another starter pack.
create table public.starter_tombstones (
  identity_hash text primary key,
  starter_reviews_used int not null default 0,
  starter_text_used int not null default 0,
  updated_at timestamptz not null default now()
);
alter table public.starter_tombstones enable row level security;

------------------------------------------------------------------ usage snapshot
-- Everything the allowance rules (supabase/functions/_shared/allowance.ts) read,
-- in one query. The edge function runs it inside a transaction that already
-- holds `select ... for update` on the account row, then reserves the call.
-- Reserved calls count while in flight, but only for 15 minutes, so a crashed
-- function cannot hold a review forever.
create function public.usage_snapshot(p_user uuid, p_month_start timestamptz, p_day_start timestamptz)
returns table (
  plan text,
  starter_reviews_used int,
  starter_text_used int,
  month_reviews int,
  month_insights int,
  month_text int,
  month_cost_usd numeric,
  day_reviews int,
  free_spend_month_usd numeric
)
language sql stable security definer set search_path = public as $$
  with live as (
    select user_id, kind, tier, created_at, coalesce(cost_usd, est_cost_usd) as cost
    from public.ai_calls
    where status = 'done' or (status = 'reserved' and created_at > now() - interval '15 minutes')
  )
  select
    case when exists (select 1 from public.entitlements e where e.user_id = p_user and e.expires_at > now())
         then 'plus' else 'free' end,
    a.starter_reviews_used,
    a.starter_text_used,
    (select count(*) from live where user_id = p_user and kind = 'review' and created_at >= p_month_start)::int,
    (select count(*) from live where user_id = p_user and kind = 'insight' and created_at >= p_month_start)::int,
    (select count(*) from live where user_id = p_user and kind = 'text' and created_at >= p_month_start)::int,
    coalesce((select sum(cost) from live where user_id = p_user and created_at >= p_month_start), 0),
    (select count(*) from live where user_id = p_user and kind = 'review' and created_at >= p_day_start)::int,
    coalesce((select sum(cost) from live where tier in ('starter', 'beta') and created_at >= p_month_start), 0)
  from public.accounts a
  where a.user_id = p_user;
$$;

-- Copies an earlier account's starter use onto this one (see starter_tombstones).
create function public.claim_starter_tombstone(p_user uuid, p_identity_hash text) returns void
language sql security definer set search_path = public as $$
  update public.accounts a
  set starter_reviews_used = greatest(a.starter_reviews_used, t.starter_reviews_used),
      starter_text_used = greatest(a.starter_text_used, t.starter_text_used)
  from public.starter_tombstones t
  where a.user_id = p_user and t.identity_hash = p_identity_hash;
$$;

-- Only the service role (edge functions) may call these.
revoke all on function public.usage_snapshot(uuid, timestamptz, timestamptz) from public, anon, authenticated;
revoke all on function public.claim_starter_tombstone(uuid, text) from public, anon, authenticated;
