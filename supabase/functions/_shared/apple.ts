import { importPKCS8, SignJWT } from "npm:jose@5";
import { env, HttpError } from "./http.ts";

// Sign in with Apple, server side. The phone signs in natively and sends us
// the one-time authorization code; we trade it for a refresh token so the
// grant can be revoked when the person deletes their account (App Review
// 5.1.1(v) and Apple's rule on revoking tokens).
//
// The team, key and bundle IDs are not secret, so they live here (each can be
// overridden by a function secret of the same name). The only secret is
// APPLE_PRIVATE_KEY, the text of the .p8 file.
const DEFAULTS: Record<string, string> = {
  APPLE_TEAM_ID: "23NQ9ZTT2W",
  APPLE_KEY_ID: "MFDU2QKLAT",
  APPLE_BUNDLE_ID: "com.ahmadgraham.tono",
};

function setting(name: string): string {
  return Deno.env.get(name) || DEFAULTS[name] || env(name);
}

export function appleConfigured(): boolean {
  return !!Deno.env.get("APPLE_PRIVATE_KEY");
}

// Apple wants a short-lived JWT signed with the .p8 key as the client secret.
async function clientSecret(): Promise<string> {
  const key = await importPKCS8(env("APPLE_PRIVATE_KEY"), "ES256");
  return await new SignJWT({})
    .setProtectedHeader({ alg: "ES256", kid: setting("APPLE_KEY_ID") })
    .setIssuer(setting("APPLE_TEAM_ID"))
    .setIssuedAt()
    .setExpirationTime("10m")
    .setAudience("https://appleid.apple.com")
    .setSubject(setting("APPLE_BUNDLE_ID"))
    .sign(key);
}

async function post(path: string, form: Record<string, string>): Promise<Response> {
  return await fetch(`https://appleid.apple.com${path}`, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ client_id: setting("APPLE_BUNDLE_ID"), client_secret: await clientSecret(), ...form }),
  });
}

export async function exchangeAuthorizationCode(code: string): Promise<string> {
  const res = await post("/auth/token", { grant_type: "authorization_code", code });
  if (!res.ok) throw new HttpError(400, "apple_code_rejected", `Apple ${res.status}`);
  const body = (await res.json()) as { refresh_token?: string };
  if (!body.refresh_token) throw new HttpError(502, "apple_no_refresh_token");
  return body.refresh_token;
}

export async function revokeRefreshToken(refreshToken: string): Promise<void> {
  const res = await post("/auth/revoke", { token: refreshToken, token_type_hint: "refresh_token" });
  if (!res.ok) throw new HttpError(502, "apple_revoke_failed", `Apple ${res.status}`);
}
