import { parseSubscriber, type PlusEntitlement } from "./entitlement.ts";
import { HttpError, optionalEnv } from "./http.ts";
import { db } from "./ledger.ts";

// Talking to RevenueCat's REST API (v1) with the project's secret key, which
// only ever lives in a function secret. The app never sees it.

const API = "https://api.revenuecat.com/v1";

export const revenueCatConfigured = (): boolean => !!optionalEnv("REVENUECAT_SECRET_KEY");

async function request(method: "GET" | "DELETE", userId: string): Promise<Response> {
  const key = optionalEnv("REVENUECAT_SECRET_KEY");
  if (!key) throw new HttpError(503, "purchases_not_configured");
  return await fetch(`${API}/subscribers/${encodeURIComponent(userId)}`, {
    method,
    headers: { authorization: `Bearer ${key}`, "content-type": "application/json", "x-platform": "ios" },
  });
}

export async function fetchEntitlement(userId: string): Promise<PlusEntitlement | null> {
  const res = await request("GET", userId);
  if (!res.ok) throw new HttpError(502, "revenuecat_failed", `RevenueCat ${res.status}`);
  return parseSubscriber(await res.json(), new Date());
}

// Makes the entitlements row match what RevenueCat says right now. A person
// RevenueCat has never heard of simply has no Plus. Returns whether they do.
export async function syncEntitlement(userId: string): Promise<boolean> {
  const entitlement = await fetchEntitlement(userId);
  if (entitlement) {
    // The `where exists` keeps an id for a deleted account from raising.
    const plan = entitlement.periodType === "trial" ? "trial" : "plus";
    const started = entitlement.periodStartedAt?.toISOString() ?? null;
    await db()`
      insert into public.entitlements (user_id, plan, environment, product_id, expires_at, period_started_at, updated_at)
      select ${userId}::uuid, ${plan}::text, ${entitlement.environment}::text, ${entitlement.productId}::text,
             ${entitlement.expiresAt.toISOString()}::timestamptz, ${started}::timestamptz, now()
      where exists (select 1 from auth.users where id = ${userId}::uuid)
      on conflict (user_id) do update
        set plan = excluded.plan,
            environment = excluded.environment,
            product_id = excluded.product_id,
            expires_at = excluded.expires_at,
            period_started_at = excluded.period_started_at,
            updated_at = now()
    `;
  } else {
    await db()`delete from public.entitlements where user_id = ${userId}::uuid`;
  }
  await db()`update public.accounts set entitlement_synced_at = now() where user_id = ${userId}::uuid`;
  return entitlement !== null;
}

// For account deletion: removes the person from RevenueCat. A 404 means they
// were never there. This does not cancel the Apple subscription (nothing but
// the person can), so the app says so.
export async function deleteSubscriber(userId: string): Promise<void> {
  const res = await request("DELETE", userId);
  if (!res.ok && res.status !== 404) throw new HttpError(502, "revenuecat_failed", `RevenueCat ${res.status}`);
}
