-- Tono Plus: when an account's subscription was last checked with RevenueCat,
-- so the `me` function can cap how often it asks (refresh after a purchase,
-- and an hourly safety net if a webhook is ever missed).
alter table public.accounts add column if not exists entitlement_synced_at timestamptz;
