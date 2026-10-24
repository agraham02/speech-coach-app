import { decideAllowance } from "../_shared/allowance.ts";
import { describeAllowance } from "../_shared/allowanceInfo.ts";
import { requireUser } from "../_shared/auth.ts";
import { handler, HttpError, json, readJson } from "../_shared/http.ts";
import { db, loadConfig, peekSnapshot } from "../_shared/ledger.ts";
import { revenueCatConfigured, syncEntitlement } from "../_shared/revenuecat.ts";
import type { CountKind } from "../_shared/types.ts";

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

// What the app asks on launch, after a purchase and when a count may have
// refilled: what plan this person is on, what they have left, and the server
// switches the app follows (kill switch, Plus on sale, the minors policy).
// Works the same for an anonymous account (the default: nobody has to sign in)
// and one linked to Apple or Google.
Deno.serve(
  handler(async (req) => {
    if (req.method !== "GET" && req.method !== "POST") throw new HttpError(405, "method_not_allowed");
    const user = await requireUser(req);
    const config = await loadConfig();
    const body = req.method === "POST" ? ((await readJson(req)) as { refresh?: unknown }) : {};

    await db()`insert into public.accounts (user_id) values (${user.id}) on conflict do nothing`;
    await syncPlusIfDue(user.id, body.refresh === true);
    const { snapshot, trialEndsAt } = await peekSnapshot(user.id);
    const can = (kind: CountKind) => decideAllowance({ config, kind, snapshot, estCostUsd: 0.01 }).ok;
    return json({
      allowance: describeAllowance(config, snapshot, new Date(), trialEndsAt),
      mode: config.mode,
      // Which kinds of call would be accepted right now, so the app can pick
      // its route without making a call that is bound to be refused.
      allowed: { take: can("take"), text: can("text"), insight: can("insight"), conversation: can("conversation") },
      killSwitch: config.killSwitch,
      // The launch switch: whether the app should show Tono Plus for sale.
      plusPurchasable: config.plusPurchasable,
      // Whether someone who said they are under 18 may use Tono AI.
      minorsMayUseAi: config.minorsMayUseAi,
    });
  }),
);
