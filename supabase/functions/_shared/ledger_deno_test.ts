// Integration test for the ledger against a real Postgres (see
// supabase/README.md for the Docker command). Skipped unless
// SUPABASE_DB_URL is set. Not part of jest.
import { assertEquals } from "jsr:@std/assert@1";
import { DEFAULT_CONFIG, type ServerConfig } from "./config.ts";
import { db, finish, refund, reserve } from "./ledger.ts";
import type { ModelChoice } from "./models.ts";
import type { AiKind } from "./types.ts";

const enabled = !!Deno.env.get("SUPABASE_DB_URL");
const choice: ModelChoice = { model: "gemini-3.5-flash-lite", fallback: "gemini-3.8-flash", isCandidate: false };

function config(patch: (c: ServerConfig) => void): ServerConfig {
  const c = structuredClone(DEFAULT_CONFIG);
  patch(c);
  return c;
}

async function newUser(): Promise<string> {
  const rows = await db()`insert into auth.users (email) values (${crypto.randomUUID() + "@example.com"}) returning id`;
  return rows[0].id as string;
}

async function call(userId: string, cfg: ServerConfig, kind: AiKind = "review", key = crypto.randomUUID(), est = 0.02) {
  return await reserve({ userId, kind, idempotencyKey: key, config: cfg, choice, estCostUsd: est });
}

Deno.test({ name: "ledger", ignore: !enabled, sanitizeOps: false, sanitizeResources: false }, async (t) => {
  await t.step("five calls at once with one review left: exactly one wins", async () => {
    const cfg = config((c) => (c.limits.betaMonthlyReviews = 1));
    const user = await newUser();
    const results = await Promise.all(Array.from({ length: 5 }, () => call(user, cfg)));
    assertEquals(results.filter((r) => r.ok).length, 1);
    assertEquals(results.filter((r) => !r.ok && r.reason === "quota_exhausted").length, 4);
  });

  await t.step("a refunded call gives its review back", async () => {
    const cfg = config((c) => (c.limits.betaMonthlyReviews = 1));
    const user = await newUser();
    const first = await call(user, cfg);
    if (!first.ok) throw new Error("first should work");
    assertEquals((await call(user, cfg)).ok, false);
    await refund(first.callId, user, "test");
    assertEquals((await call(user, cfg)).ok, true);
  });

  await t.step("the same idempotency key: in flight, then done", async () => {
    const cfg = config(() => {});
    const user = await newUser();
    const key = "retry-key-0001";
    const first = await call(user, cfg, "review", key);
    if (!first.ok) throw new Error("first should work");
    const again = await call(user, cfg, "review", key);
    assertEquals(!again.ok && again.reason, "in_flight");
    await finish(first.callId, { model: choice.model, usedFallback: false, tokens: null, costUsd: 0.01 });
    const afterDone = await call(user, cfg, "review", key);
    assertEquals(!afterDone.ok && afterDone.reason, "already_done");
  });

  await t.step("a refunded key can be used again", async () => {
    const cfg = config(() => {});
    const user = await newUser();
    const key = "retry-key-0002";
    const first = await call(user, cfg, "review", key);
    if (!first.ok) throw new Error("first should work");
    await refund(first.callId, user, "upstream down");
    assertEquals((await call(user, cfg, "review", key)).ok, true);
  });

  await t.step("launch mode: the starter pack counts down and a refund gives it back", async () => {
    const cfg = config((c) => {
      c.mode = "launch";
      c.limits.starterReviews = 2;
    });
    const user = await newUser();
    const a = await call(user, cfg);
    const b = await call(user, cfg);
    assertEquals(a.ok && b.ok, true);
    const c = await call(user, cfg);
    assertEquals(!c.ok && c.reason, "quota_exhausted");
    if (a.ok) await refund(a.callId, user, "test");
    const used = await db()`select starter_reviews_used from public.accounts where user_id = ${user}`;
    assertEquals(used[0].starter_reviews_used, 1);
    assertEquals((await call(user, cfg)).ok, true);
  });

  await t.step("launch mode keeps insights for Plus", async () => {
    const cfg = config((c) => (c.mode = "launch"));
    const user = await newUser();
    const r = await call(user, cfg, "insight");
    assertEquals(!r.ok && r.reason, "plus_required");
    await db()`insert into public.entitlements (user_id, environment, expires_at) values (${user}, 'sandbox', now() + interval '5 days')`;
    assertEquals((await call(user, cfg, "insight")).ok, true);
  });

  await t.step("Plus is stopped by the monthly dollar cap", async () => {
    const cfg = config((c) => (c.limits.plusMonthlyCostCapUsd = 0.05));
    const user = await newUser();
    await db()`insert into public.entitlements (user_id, environment, expires_at) values (${user}, 'production', now() + interval '5 days')`;
    const a = await call(user, cfg, "review", crypto.randomUUID(), 0.03);
    assertEquals(a.ok, true);
    const b = await call(user, cfg, "review", crypto.randomUUID(), 0.03);
    assertEquals(!b.ok && b.reason, "plus_cost_cap");
  });

  await t.step("free spend is shared: the budget stops calls from different people", async () => {
    // The budget counts everyone, including earlier steps of this test.
    await db()`delete from public.ai_calls`;
    const cfg = config((c) => (c.freeBudgetUsd = 0.05));
    const a = await newUser();
    const b = await newUser();
    assertEquals((await call(a, cfg, "review", crypto.randomUUID(), 0.04)).ok, true);
    const second = await call(b, cfg, "review", crypto.randomUUID(), 0.04);
    assertEquals(!second.ok && second.reason, "budget_paused");
  });

  await t.step("the daily ceiling holds", async () => {
    const cfg = config((c) => {
      c.limits.dailyReviews = 2;
      c.limits.betaMonthlyReviews = 50;
    });
    const user = await newUser();
    assertEquals((await call(user, cfg)).ok, true);
    assertEquals((await call(user, cfg)).ok, true);
    const third = await call(user, cfg);
    assertEquals(!third.ok && third.reason, "rate_limited");
  });

  await db().end();
});
