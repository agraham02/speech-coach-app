-- A testing switch for the developer's own account: while dev_override_until is
-- in the future, the allowance rules let every Tono AI call through (counts,
-- the daily ceiling, the cost caps and the free budget). It is set only by the
-- dev-override function, which needs the DEV_OVERRIDE_PASSWORD secret, and it
-- expires on its own. The kill switch still stops everything.
alter table public.accounts add column if not exists dev_override_until timestamptz;
