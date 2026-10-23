import { accountsInEvent, isTestEvent, isUserId, parseSubscriber, secretsMatch } from "../entitlement";

const NOW = new Date("2026-11-10T12:00:00Z");
const USER = "0b8f6c1e-2d7a-4a55-9a1c-6f3b2d9e8a10";
const OTHER = "9c1d0e2f-3a4b-4c5d-8e6f-7a8b9c0d1e2f";

function subscriber(entitlement: Record<string, unknown> | null, subscriptions: Record<string, unknown> = {}) {
  return { subscriber: { entitlements: entitlement ? { plus: entitlement } : {}, subscriptions } };
}

describe("parseSubscriber", () => {
  it("finds an active Plus and where it was bought", () => {
    const body = subscriber(
      { expires_date: "2026-12-10T12:00:00Z", product_identifier: "tono_plus_monthly" },
      { tono_plus_monthly: { is_sandbox: false } },
    );
    expect(parseSubscriber(body, NOW)).toEqual({ productId: "tono_plus_monthly", expiresAt: new Date("2026-12-10T12:00:00Z"), environment: "production" });
  });

  it("marks a sandbox purchase", () => {
    const body = subscriber({ expires_date: "2026-11-10T12:05:00Z", product_identifier: "p" }, { p: { is_sandbox: true } });
    expect(parseSubscriber(body, NOW)?.environment).toBe("sandbox");
  });

  it("is not Plus once it has expired", () => {
    expect(parseSubscriber(subscriber({ expires_date: "2026-11-10T11:59:59Z", product_identifier: "p" }), NOW)).toBeNull();
    expect(parseSubscriber(subscriber({ expires_date: "2026-11-10T12:00:00Z", product_identifier: "p" }), NOW)).toBeNull();
  });

  it("keeps Plus through a billing grace period", () => {
    const body = subscriber({ expires_date: "2026-11-09T12:00:00Z", grace_period_expires_date: "2026-11-12T12:00:00Z", product_identifier: "p" });
    expect(parseSubscriber(body, NOW)?.expiresAt).toEqual(new Date("2026-11-12T12:00:00Z"));
  });

  it("does not trust an entitlement with no end date", () => {
    expect(parseSubscriber(subscriber({ expires_date: null, product_identifier: "p" }), NOW)).toBeNull();
  });

  it("is not Plus without the plus entitlement, or from junk", () => {
    expect(parseSubscriber(subscriber(null), NOW)).toBeNull();
    expect(parseSubscriber({ subscriber: { entitlements: { other: { expires_date: "2027-01-01T00:00:00Z" } } } }, NOW)).toBeNull();
    expect(parseSubscriber(null, NOW)).toBeNull();
    expect(parseSubscriber("nope", NOW)).toBeNull();
    expect(parseSubscriber(subscriber({ expires_date: "not a date" }), NOW)).toBeNull();
  });

  it("tolerates a missing product", () => {
    expect(parseSubscriber(subscriber({ expires_date: "2026-12-10T12:00:00Z" }), NOW)).toMatchObject({ productId: null, environment: "production" });
  });
});

describe("accountsInEvent", () => {
  it("names the buyer once", () => {
    expect(accountsInEvent({ event: { type: "RENEWAL", app_user_id: USER, original_app_user_id: USER } })).toEqual([USER]);
  });

  it("includes both sides of a transfer, and ignores anonymous ids", () => {
    const event = { type: "TRANSFER", transferred_from: ["$RCAnonymousID:abc", USER], transferred_to: [OTHER], app_user_id: "$RCAnonymousID:abc" };
    expect(accountsInEvent({ event })).toEqual([USER, OTHER]);
  });

  it("lower-cases ids so one account is never synced twice", () => {
    expect(accountsInEvent({ event: { app_user_id: USER.toUpperCase(), original_app_user_id: USER } })).toEqual([USER]);
  });

  it("is empty for junk", () => {
    expect(accountsInEvent(null)).toEqual([]);
    expect(accountsInEvent({ event: { app_user_id: "$RCAnonymousID:x" } })).toEqual([]);
    expect(accountsInEvent({})).toEqual([]);
  });
});

describe("isUserId and isTestEvent", () => {
  it("only accepts a UUID", () => {
    expect(isUserId(USER)).toBe(true);
    expect(isUserId("$RCAnonymousID:abc")).toBe(false);
    expect(isUserId(12)).toBe(false);
  });

  it("recognizes RevenueCat's test event", () => {
    expect(isTestEvent({ event: { type: "TEST" } })).toBe(true);
    expect(isTestEvent({ event: { type: "RENEWAL" } })).toBe(false);
    expect(isTestEvent(null)).toBe(false);
  });
});

describe("secretsMatch", () => {
  it("matches the same secret, with or without Bearer", () => {
    expect(secretsMatch("s3cret-value", "s3cret-value")).toBe(true);
    expect(secretsMatch("Bearer s3cret-value", "s3cret-value")).toBe(true);
    expect(secretsMatch("s3cret-value", "Bearer s3cret-value")).toBe(true);
  });

  it("refuses anything else", () => {
    expect(secretsMatch(null, "s3cret-value")).toBe(false);
    expect(secretsMatch("", "s3cret-value")).toBe(false);
    expect(secretsMatch("s3cret-valuf", "s3cret-value")).toBe(false);
    expect(secretsMatch("s3cret", "s3cret-value")).toBe(false);
    expect(secretsMatch("anything", "")).toBe(false);
  });
});
