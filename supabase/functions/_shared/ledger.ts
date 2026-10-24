import postgres from "npm:postgres@3.4.5";
import { decideAllowance, type UsageSnapshot } from "./allowance.ts";
import type { ConversationSpan } from "./conversation.ts";
import { parseServerConfig, type ServerConfig } from "./config.ts";
import { env } from "./http.ts";
import type { ModelChoice } from "./models.ts";
import type { TokenCounts } from "./pricing.ts";
import { utcDayStart, utcMonthStart } from "./time.ts";
import { isPaid, type CountKind, type DenyReason, type Plan, type Tier } from "./types.ts";

// All database access for AI calls. The reservation runs inside ONE
// transaction that holds a row lock on the account, so two calls at once
// cannot both take the last judged take.

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
  trial_ends_at: Date | string | null;
  takes: number;
  text_calls: number;
  insights: number;
  conversation_seconds: string | number;
  cost_usd: string | number;
  day_takes: number;
  free_spend_month_usd: string | number;
}

export interface SnapshotWithTrial {
  snapshot: UsageSnapshot;
  // When the trial ends (it renews into Plus then, unless cancelled).
  trialEndsAt: Date | null;
}

function toSnapshot(row: SnapshotRow): SnapshotWithTrial {
  return {
    snapshot: {
      plan: row.plan,
      takes: row.takes,
      text: row.text_calls,
      insights: row.insights,
      conversationSeconds: Number(row.conversation_seconds),
      costUsd: Number(row.cost_usd),
      dayTakes: row.day_takes,
      freeSpendMonthUsd: Number(row.free_spend_month_usd),
    },
    trialEndsAt: row.trial_ends_at ? new Date(row.trial_ends_at) : null,
  };
}

async function readSnapshot(sql: Sql | Tx, userId: string, now: Date): Promise<SnapshotWithTrial | null> {
  const rows = (await sql`
    select * from public.usage_snapshot(${userId}, ${utcMonthStart(now)}, ${utcDayStart(now)})
  `) as unknown as SnapshotRow[];
  return rows.length ? toSnapshot(rows[0]) : null;
}

// Read-only (no lock, no reservation): for pages and checks that only need to
// know what a person has left.
export async function peekSnapshot(userId: string, now = new Date()): Promise<SnapshotWithTrial> {
  const snap = await readSnapshot(db(), userId, now);
  if (!snap) throw new Error("account row missing");
  return snap;
}

// ---- reserve / finish / refund ----

export interface ReserveArgs {
  userId: string;
  kind: CountKind;
  idempotencyKey: string;
  config: ServerConfig;
  choice: ModelChoice;
  estCostUsd: number;
  now?: Date;
  // A conversation call: its id, and the seconds to charge given the
  // conversation so far (null: it has run past its length). Read under the
  // account lock, so two turns at once can't both skip being charged.
  conversation?: { id: string; charge: (span: ConversationSpan | null) => number | null };
  // A conversation call that finishes one already allowed (a written line's
  // voice, the debrief): skips the minutes check, never the cost cap.
  finishing?: boolean;
}

export type ReserveResult =
  | { ok: true; callId: string; tier: Tier; snapshot: UsageSnapshot; chargedSeconds: number }
  | { ok: false; reason: DenyReason | "in_flight" | "already_done" | "conversation_over"; snapshot: UsageSnapshot | null };

export async function reserve(args: ReserveArgs): Promise<ReserveResult> {
  const now = args.now ?? new Date();
  return await db().begin(async (tx) => {
    // The account row is the lock: every call for one person queues here.
    await tx`insert into public.accounts (user_id) values (${args.userId}) on conflict do nothing`;
    await tx`select 1 from public.accounts where user_id = ${args.userId} for update`;

    let snapshot = (await readSnapshot(tx, args.userId, now))?.snapshot;
    if (!snapshot) throw new Error("account row missing");

    // Everyone who is not paying shares one monthly spend budget, so those
    // calls also queue on one global lock (always taken after the account lock).
    if (!isPaid(snapshot.plan)) {
      await tx`select pg_advisory_xact_lock(hashtext('tono_free_budget'))`;
      snapshot = (await readSnapshot(tx, args.userId, now))!.snapshot;
    }

    const existing = (await tx`
      select id, status, created_at from public.ai_calls
      where user_id = ${args.userId} and idempotency_key = ${args.idempotencyKey} for update
    `) as unknown as { id: string; status: string; created_at: Date }[];
    const prior = existing[0];
    if (prior?.status === "done") return { ok: false, reason: "already_done", snapshot };
    const staleMs = 15 * 60 * 1000;
    if (prior?.status === "reserved" && now.getTime() - new Date(prior.created_at).getTime() < staleMs) {
      return { ok: false, reason: "in_flight", snapshot };
    }

    const decision = decideAllowance({
      config: args.config,
      kind: args.kind,
      snapshot,
      estCostUsd: args.estCostUsd,
      finishing: args.finishing,
    });
    if (!decision.ok) return { ok: false, reason: decision.reason, snapshot };

    let charged = 0;
    const conversationId = args.conversation?.id ?? null;
    if (args.conversation) {
      const spans = (await tx`
        select min(created_at) as first_at, max(created_at) as last_at from public.ai_calls
        where user_id = ${args.userId} and conversation_id = ${args.conversation.id} and status <> 'refunded'
      `) as unknown as { first_at: Date | null; last_at: Date | null }[];
      const row = spans[0];
      const span = row?.first_at && row?.last_at ? { firstAt: new Date(row.first_at), lastAt: new Date(row.last_at) } : null;
      const seconds = args.conversation.charge(span);
      if (seconds == null) return { ok: false, reason: "conversation_over", snapshot };
      charged = seconds;
    }

    const tier = decision.tier;
    let callId: string;
    if (prior) {
      await tx`
        update public.ai_calls
        set status = 'reserved', kind = ${args.kind}, tier = ${tier}, model = ${args.choice.model}, is_candidate = ${args.choice.isCandidate},
            used_fallback = false, est_cost_usd = ${args.estCostUsd}, cost_usd = null, error = null,
            conversation_id = ${conversationId}, units_seconds = ${charged},
            created_at = now(), finished_at = null
        where id = ${prior.id}
      `;
      callId = prior.id;
    } else {
      const inserted = (await tx`
        insert into public.ai_calls (user_id, kind, idempotency_key, tier, model, is_candidate, est_cost_usd, conversation_id, units_seconds)
        values (${args.userId}, ${args.kind}, ${args.idempotencyKey}, ${tier}, ${args.choice.model}, ${args.choice.isCandidate}, ${args.estCostUsd}, ${conversationId}, ${charged})
        returning id
      `) as unknown as { id: string }[];
      callId = inserted[0].id;
    }
    return { ok: true, callId, tier, snapshot, chargedSeconds: charged };
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

// A failed call gives its count back: a refunded call never counts.
export async function refund(callId: string, error: string): Promise<void> {
  await db()`
    update public.ai_calls set status = 'refunded', error = ${error.slice(0, 300)}, finished_at = now()
    where id = ${callId} and status = 'reserved'
  `;
}
