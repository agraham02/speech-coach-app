// Tono Plus, as RevenueCat reports it. Pure: no Deno APIs, so jest tests it.
//
// RevenueCat is the source of truth for a subscription. A webhook only says
// "something changed for this person"; the server then asks RevenueCat for the
// whole picture (revenuecat.ts) and this file turns that picture into one row.
// Doing it that way means events arriving late or out of order cannot leave the
// wrong plan behind.

// The entitlement id set up in the RevenueCat dashboard.
export const PLUS_ENTITLEMENT_ID = "plus";

export interface PlusEntitlement {
  productId: string | null;
  expiresAt: Date;
  environment: "production" | "sandbox";
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Tono's RevenueCat user ids are Supabase user ids. Anonymous ids
// ($RCAnonymousID:...) and anything else are not accounts.
export const isUserId = (value: unknown): value is string => typeof value === "string" && UUID.test(value);

function asDate(value: unknown): Date | null {
  if (typeof value !== "string") return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

// The active Plus entitlement in a `GET /v1/subscribers/{id}` answer, or null.
// A billing-grace period keeps Plus on until it ends. An entitlement with no
// end date is not something Tono sells, so it is not trusted.
export function parseSubscriber(body: unknown, now: Date): PlusEntitlement | null {
  const subscriber = (body as { subscriber?: Record<string, unknown> } | null)?.subscriber;
  if (!subscriber || typeof subscriber !== "object") return null;
  const entitlements = subscriber.entitlements as Record<string, Record<string, unknown>> | undefined;
  const plus = entitlements?.[PLUS_ENTITLEMENT_ID];
  if (!plus || typeof plus !== "object") return null;

  const ends = [asDate(plus.expires_date), asDate(plus.grace_period_expires_date)].filter((d): d is Date => d !== null);
  if (ends.length === 0) return null;
  const expiresAt = new Date(Math.max(...ends.map((d) => d.getTime())));
  if (expiresAt.getTime() <= now.getTime()) return null;

  const productId = typeof plus.product_identifier === "string" ? plus.product_identifier : null;
  const subscriptions = subscriber.subscriptions as Record<string, Record<string, unknown>> | undefined;
  const sandbox = productId ? subscriptions?.[productId]?.is_sandbox === true : false;
  return { productId, expiresAt, environment: sandbox ? "sandbox" : "production" };
}

// Every account a webhook event could be about: the buyer, and on a transfer
// the people the purchase moved between. Duplicates and non-accounts removed.
export function accountsInEvent(body: unknown): string[] {
  const event = (body as { event?: Record<string, unknown> } | null)?.event;
  if (!event || typeof event !== "object") return [];
  const candidates: unknown[] = [event.app_user_id, event.original_app_user_id];
  for (const key of ["transferred_from", "transferred_to"]) {
    const list = event[key];
    if (Array.isArray(list)) candidates.push(...list);
  }
  return [...new Set(candidates.filter(isUserId).map((id) => id.toLowerCase()))];
}

export const isTestEvent = (body: unknown): boolean => (body as { event?: { type?: unknown } } | null)?.event?.type === "TEST";

// Compares two secrets without stopping at the first difference. RevenueCat
// sends whatever Authorization value was set in its dashboard, so a "Bearer "
// prefix is allowed on either side.
export function secretsMatch(given: string | null, expected: string): boolean {
  if (!given || !expected) return false;
  const strip = (s: string) => s.replace(/^Bearer\s+/i, "").trim();
  const a = strip(given);
  const b = strip(expected);
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}
