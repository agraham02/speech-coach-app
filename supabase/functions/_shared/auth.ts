import { createClient, type SupabaseClient } from "npm:@supabase/supabase-js@2";
import { env, HttpError, optionalEnv } from "./http.ts";

let admin: SupabaseClient | null = null;

// A service-role client. It bypasses row level security, so it is only ever
// used here on the server, after the caller has been identified.
export function adminClient(): SupabaseClient {
  if (!admin) {
    const key = optionalEnv("SUPABASE_SECRET_KEY") ?? env("SUPABASE_SERVICE_ROLE_KEY");
    admin = createClient(env("SUPABASE_URL"), key, { auth: { persistSession: false, autoRefreshToken: false } });
  }
  return admin;
}

export interface AuthedUser {
  id: string;
  // "apple:001234.abc" style: the sign-in provider and its stable user id.
  // Null for an anonymous account (nobody has to sign in to use Tono).
  identity: string | null;
  provider: string | null;
}

// Every function verifies the caller itself (verify_jwt is off in config.toml,
// because the platform check does not understand the new signing keys).
export async function requireUser(req: Request): Promise<AuthedUser> {
  const match = /^Bearer (.+)$/i.exec(req.headers.get("authorization") ?? "");
  if (!match) throw new HttpError(401, "signed_out");
  const { data, error } = await adminClient().auth.getUser(match[1]);
  if (error || !data.user) throw new HttpError(401, "signed_out");
  const identity = data.user.identities?.[0];
  return {
    id: data.user.id,
    identity: identity ? `${identity.provider}:${identity.id}` : null,
    provider: identity?.provider ?? null,
  };
}
