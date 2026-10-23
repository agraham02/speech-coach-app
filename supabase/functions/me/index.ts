import { decideAllowance } from "../_shared/allowance.ts";
import { describeAllowance } from "../_shared/allowanceInfo.ts";
import { requireUser } from "../_shared/auth.ts";
import { handler, HttpError, json, optionalEnv, readJson } from "../_shared/http.ts";
import { db, loadConfig, peekSnapshot } from "../_shared/ledger.ts";
import { revenueCatConfigured, syncEntitlement } from "../_shared/revenuecat.ts";
import { identityHash } from "../_shared/secrets.ts";

// How soon the subscription is checked with RevenueCat again. A purchase or
// restore asks for a check at once (`refresh`), but not more than every ten
// seconds. Otherwise it is re-checked about hourly, as a safety net in case a
// webhook was ever missed; the webhook normally keeps the plan current.
const REFRESH_MIN_MS = 10_000;
const STALE_MS = 60 * 60 * 1000;

async function syncPlusIfDue(userId: string, wanted: boolean): Promise<void> {
  if (!revenueCatConfigured()) return;
  const rows = await db()`select entitlement_synced_at from public.accounts where user_id = ${userId}`;
  const last = rows[0]?.entitlement_synced_at ? new Date(rows[0].entitlement_synced_at as string).getTime() : 0;
  const age = Date.now() - last;
  if (age < (wanted ? REFRESH_MIN_MS : STALE_MS)) return;
  try {
    await syncEntitlement(userId);
  } catch (e) {
    // RevenueCat being down must not stop the app learning its allowance.
    console.warn("entitlement sync failed", e instanceof Error ? e.message : e);
  }
}

// What the app asks on launch and after a purchase: who am I, what do I have
// left. The first call for a new account also looks up whether this sign-in
// identity had a starter pack before (a deleted account), and carries the use
// forward so deleting and re-creating cannot hand out another one.
Deno.serve(
  handler(async (req) => {
    if (req.method !== "GET" && req.method !== "POST") throw new HttpError(405, "method_not_allowed");
    const user = await requireUser(req);
    const config = await loadConfig();
    const body = req.method === "POST" ? ((await readJson(req)) as { refresh?: unknown }) : {};

    if (user.identity && optionalEnv("TONO_SECRET")) {
      const hash = await identityHash(user.identity);
      await db()`select public.claim_starter_tombstone(${user.id}, ${hash})`;
    }

    await db()`insert into public.accounts (user_id) values (${user.id}) on conflict do nothing`;
    await syncPlusIfDue(user.id, body.refresh === true);
    const snapshot = await peekSnapshot(user.id);
    const can = (kind: "review" | "text" | "insight") =>
      decideAllowance({ config, kind, snapshot, estCostUsd: 0.01 }).ok;
    return json({
      allowance: describeAllowance(config, snapshot, new Date()),
      mode: config.mode,
      // Which kinds of call would be accepted right now, so the app can pick
      // its route without making a call that is bound to be refused.
      allowed: { review: can("review"), text: can("text"), insight: can("insight") },
      killSwitch: config.killSwitch,
      // The launch switch: whether the app should show Tono Plus for sale.
      plusPurchasable: config.plusPurchasable,
    });
  }),
);
