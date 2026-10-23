import { appleConfigured, exchangeAuthorizationCode } from "../_shared/apple.ts";
import { requireUser } from "../_shared/auth.ts";
import { handler, HttpError, json, readJson } from "../_shared/http.ts";
import { db } from "../_shared/ledger.ts";
import { encryptText } from "../_shared/secrets.ts";

// After a Sign in with Apple the phone sends the one-time authorization code.
// We trade it for a refresh token and keep it, encrypted, only so the grant can
// be revoked when the person deletes their account.
Deno.serve(
  handler(async (req) => {
    if (req.method !== "POST") throw new HttpError(405, "method_not_allowed");
    const user = await requireUser(req);
    if (user.provider !== "apple") throw new HttpError(400, "not_an_apple_account");
    if (!appleConfigured()) throw new HttpError(503, "apple_not_configured");

    const body = (await readJson(req)) as { authorizationCode?: unknown };
    const code = typeof body.authorizationCode === "string" ? body.authorizationCode : "";
    if (code.length < 10 || code.length > 2000) throw new HttpError(400, "bad_request", "authorizationCode");

    const refreshToken = await exchangeAuthorizationCode(code);
    const encrypted = await encryptText(refreshToken);
    await db()`
      update public.accounts set apple_refresh_token_enc = ${encrypted} where user_id = ${user.id}
    `;
    return json({ ok: true });
  }),
);
