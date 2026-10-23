import postgres from "npm:postgres@3.4.5";
import { decideAllowance, type Tier, type UsageSnapshot } from "./allowance.ts";
import { parseServerConfig, type ServerConfig } from "./config.ts";
import { env } from "./http.ts";
import type { ModelChoice } from "./models.ts";
import type { TokenCounts } from "./pricing.ts";
import { utcDayStart, utcMonthStart } from "./time.ts";
import type { AiKind, DenyReason, Plan } from "./types.ts";

// All database access for AI calls. The reservation runs inside ONE
// transaction that holds a row lock on the account, so two calls at once
// cannot both take the last review.

let connection: ReturnType<typeof postgres> | null = null;

export function db() {
  if (!connection) {
    // Prepared statements are off because the pooler runs in transaction mode.
    connection = postgres(env("SUPABASE_DB_URL"), { max: 3, prepare: false, idle_timeout: 20 });
  }
  return connection;
}

type Sql = ReturnType<typeof postgres>;
// postgres.js hands the callback a TransactionSql, which tags just like Sql.
type Tx = Parameters<Parameters<Sql["begin"]>[1]>[0];

// ---- config ----

let cached: { at: number; config: ServerConfig } | null = null;

// The config row, cached for 30 seconds so a model change reaches every
// instance within half a minute and a burst of calls reads it once.
export async function loadConfig(): Promise<ServerConfig> {
  if (cached && Date.now() - cached.at < 30_000) return cached.config;
  const rows = await db()`select value from public.config where id = 1`;
  if (rows.length === 0) throw new Error("config row missing");
  const config = parseServerConfig(rows[0].value);
  cached = { at: Date.now(), config };
  return config;
}

// ---- usage ----

interface SnapshotRow {
  plan: Plan;
  starter_reviews_used: number;
  starter_text_used: number;
  month_reviews: number;
  month_insights: number;
  month_text: number;
  month_cost_usd: string | number;
  day_reviews: number;
  free_spend_month_usd: string | number;
}

function toSnapshot(row: SnapshotRow): UsageSnapshot {
  return {
    plan: row.plan,
    starterReviewsUsed: row.starter_reviews_used,
    starterTextUsed: row.starter_text_used,
    monthReviews: row.month_reviews,
    monthInsights: row.month_insights,
    monthText: row.month_text,
    monthCostUsd: Number(row.month_cost_usd),
    dayReviews: row.day_reviews,
    freeSpendMonthUsd: Number(row.free_spend_month_usd),
  };
}

async function readSnapshot(sql: Sql | Tx, userId: string, now: Date): Promise<UsageSnapshot | null> {
  const rows = (await sql`
    select * from public.usage_snapshot(${userId}, ${utcMonthStart(now)}, ${utcDayStart(now)})
  `) as unknown as SnapshotRow[];
  return rows.length ? toSnapshot(rows[0]) : null;
}

// Read-only (no lock, no reservation): for pages and checks that only need to
// know what a person has left.
export async function peekSnapshot(userId: string, now = new Date()): Promise<UsageSnapshot> {
  const snap = await readSnapshot(db(), userId, now);
  if (!snap) throw new Error("account row missing");
  return snap;
}

// ---- reserve / finish / refund ----

export interface ReserveArgs {
  userId: string;
  kind: AiKind;
  idempotencyKey: string;
  config: ServerConfig;
  choice: ModelChoice;
  estCostUsd: number;
  now?: Date;
}

export type ReserveResult =
  | { ok: true; callId: string; tier: Tier; snapshot: UsageSnapshot }
  | { ok: false; reason: DenyReason | "in_flight" | "already_done"; snapshot: UsageSnapshot | null };

export async function reserve(args: ReserveArgs): Promise<ReserveResult> {
  const now = args.now ?? new Date();
  return await db().begin(async (tx) => {
    // The account row is the lock: every call for one person queues here.
    await tx`insert into public.accounts (user_id) values (${args.userId}) on conflict do nothing`;
    await tx`select 1 from public.accounts where user_id = ${args.userId} for update`;

    let snapshot = await readSnapshot(tx, args.userId, now);
    if (!snapshot) throw new Error("account row missing");

    // Everyone who is not on Plus shares one monthly spend budget, so those
    // calls also queue on one global lock (always taken after the account lock).
    if (snapshot.plan !== "plus") {
      await tx`select pg_advisory_xact_lock(hashtext('tono_free_budget'))`;
      snapshot = (await readSnapshot(tx, args.userId, now))!;
    }

    const existing = (await tx`
      select id, status, tier, created_at from public.ai_calls
      where user_id = ${args.userId} and idempotency_key = ${args.idempotencyKey} for update
    `) as unknown as { id: string; status: string; tier: Tier; created_at: Date }[];
    const prior = existing[0];
    if (prior?.status === "done") return { ok: false, reason: "already_done", snapshot };
    const staleMs = 15 * 60 * 1000;
    if (prior?.status === "reserved" && now.getTime() - new Date(prior.created_at).getTime() < staleMs) {
      return { ok: false, reason: "in_flight", snapshot };
    }

    const decision = decideAllowance({ config: args.config, kind: args.kind, snapshot, estCostUsd: args.estCostUsd });
    if (!decision.ok) return { ok: false, reason: decision.reason, snapshot };

    const tier = decision.tier;
    let callId: string;
    if (prior) {
      await tx`
        update public.ai_calls
        set status = 'reserved', tier = ${tier}, model = ${args.choice.model}, is_candidate = ${args.choice.isCandidate},
            used_fallback = false, est_cost_usd = ${args.estCostUsd}, cost_usd = null, error = null,
            created_at = now(), finished_at = null
        where id = ${prior.id}
      `;
      callId = prior.id;
    } else {
      const inserted = (await tx`
        insert into public.ai_calls (user_id, kind, idempotency_key, tier, model, is_candidate, est_cost_usd)
        values (${args.userId}, ${args.kind}, ${args.idempotencyKey}, ${tier}, ${args.choice.model}, ${args.choice.isCandidate}, ${args.estCostUsd})
        returning id
      `) as unknown as { id: string }[];
      callId = inserted[0].id;
    }

    // A stale reservation that was already counted against the starter pack
    // (its function died before refunding) must not be counted twice.
    const alreadyCounted = prior?.status === "reserved" && prior.tier === "starter";
    if (tier === "starter" && !alreadyCounted) {
      if (args.kind === "review") {
        await tx`update public.accounts set starter_reviews_used = starter_reviews_used + 1 where user_id = ${args.userId}`;
      } else if (args.kind === "text") {
        await tx`update public.accounts set starter_text_used = starter_text_used + 1 where user_id = ${args.userId}`;
      }
    }
    return { ok: true, callId, tier, snapshot };
  });
}

export async function finish(
  callId: string,
  result: { model: string; usedFallback: boolean; tokens: TokenCounts | null; costUsd: number },
): Promise<void> {
  const t = result.tokens;
  await db()`
    update public.ai_calls
    set status = 'done', model = ${result.model}, used_fallback = ${result.usedFallback},
        input_text = ${t?.inputText ?? 0}, input_video = ${t?.inputVideo ?? 0}, input_audio = ${t?.inputAudio ?? 0},
        output_tokens = ${t?.output ?? 0}, thinking_tokens = ${t?.thinking ?? 0},
        cost_usd = ${result.costUsd}, finished_at = now()
    where id = ${callId}
  `;
}

// A failed call gives its review back, including a starter-pack one.
export async function refund(callId: string, userId: string, error: string): Promise<void> {
  await db().begin(async (tx) => {
    const rows = (await tx`
      update public.ai_calls set status = 'refunded', error = ${error.slice(0, 300)}, finished_at = now()
      where id = ${callId} and status = 'reserved' returning tier, kind
    `) as unknown as { tier: Tier; kind: AiKind }[];
    const row = rows[0];
    if (row?.tier !== "starter") return;
    if (row.kind === "review") {
      await tx`update public.accounts set starter_reviews_used = greatest(starter_reviews_used - 1, 0) where user_id = ${userId}`;
    } else if (row.kind === "text") {
      await tx`update public.accounts set starter_text_used = greatest(starter_text_used - 1, 0) where user_id = ${userId}`;
    }
  });
}
