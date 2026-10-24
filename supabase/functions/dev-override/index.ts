import { requireUser } from "../_shared/auth.ts";
import { handler, HttpError, json, optionalEnv, readJson } from "../_shared/http.ts";
import { db } from "../_shared/ledger.ts";

// The developer's testing switch. With the right password (the
// DEV_OVERRIDE_PASSWORD secret) the signed-in account goes past every Tono AI
// limit for a few hours, so the limits themselves can be tested (and the
// products used past them). Anyone else gets "not_available": with no secret
// set the function does nothing at all, which is how a build ships.
//
//   POST {"password": "..."}   switch on for OVERRIDE_HOURS
//   POST {"off": true}         switch off now
//   POST {}                    just say whether it is on
//
// The password is checked here, never in the app, and a wrong one waits
// before answering and is logged. The override lives on the account row
// (accounts.dev_override_until) and the allowance rules read it
// (_shared/allowance.ts), so it cannot be set from a phone any other way.

const OVERRIDE_HOURS = 6;
const WRONG_PASSWORD_DELAY_MS = 1500;

// Same time for any password of the same length, so the answer can't be
// guessed a character at a time.
function sameSecret(given: string, secret: string): boolean {
  const a = new TextEncoder().encode(given);
  const b = new TextEncoder().encode(secret);
  let diff = a.length ^ b.length;
  for (let i = 0; i < Math.max(a.length, b.length); i++) diff |= (a[i] ?? 0) ^ (b[i] ?? 0);
  return diff === 0;
}

async function status(userId: string): Promise<{ active: boolean; until: string | null }> {
  const rows = (await db()`
    select dev_override_until as until from public.accounts where user_id = ${userId}
  `) as unknown as { until: Date | null }[];
  const until = rows[0]?.until ? new Date(rows[0].until) : null;
  return { active: !!until && until.getTime() > Date.now(), until: until && until.getTime() > Date.now() ? until.toISOString() : null };
}

Deno.serve(
  handler(async (req) => {
    if (req.method !== "POST") throw new HttpError(405, "method_not_allowed");
    const secret = optionalEnv("DEV_OVERRIDE_PASSWORD");
    if (!secret) throw new HttpError(404, "not_available");
    const user = await requireUser(req);
    const body = (await readJson(req)) as { password?: unknown; off?: unknown };

    await db()`insert into public.accounts (user_id) values (${user.id}) on conflict do nothing`;

    if (body.off === true) {
      await db()`update public.accounts set dev_override_until = null where user_id = ${user.id}`;
      return json(await status(user.id));
    }
    if (typeof body.password === "string") {
      if (!sameSecret(body.password, secret)) {
        console.warn("dev-override: wrong password for", user.id);
        await new Promise((resolve) => setTimeout(resolve, WRONG_PASSWORD_DELAY_MS));
        throw new HttpError(403, "wrong_password");
      }
      await db()`
        update public.accounts set dev_override_until = now() + make_interval(hours => ${OVERRIDE_HOURS}) where user_id = ${user.id}
      `;
    }
    return json(await status(user.id));
  }),
);
