import { accountsInEvent, isTestEvent, secretsMatch } from "../_shared/entitlement.ts";
import { env, handler, HttpError, json, readJson } from "../_shared/http.ts";
import { syncEntitlement } from "../_shared/revenuecat.ts";

// RevenueCat calls this when a subscription starts, renews, lapses, moves
// between accounts and so on. The event itself is not trusted for the plan:
// it only names who changed, and the server then asks RevenueCat for the
// current state (see _shared/entitlement.ts). Set the same value as the
// Authorization header in RevenueCat's webhook settings and as the function
// secret REVENUECAT_WEBHOOK_SECRET.
Deno.serve(
  handler(async (req) => {
    if (req.method !== "POST") throw new HttpError(405, "method_not_allowed");
    if (!secretsMatch(req.headers.get("authorization"), env("REVENUECAT_WEBHOOK_SECRET"))) {
      throw new HttpError(401, "unauthorized");
    }
    const body = await readJson(req);
    if (isTestEvent(body)) return json({ ok: true, test: true });

    // A failure here is a non-200, so RevenueCat retries the event.
    for (const userId of accountsInEvent(body)) await syncEntitlement(userId);
    return json({ ok: true });
  }),
);
