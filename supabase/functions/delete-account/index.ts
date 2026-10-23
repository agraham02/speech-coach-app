import { appleConfigured, revokeRefreshToken } from "../_shared/apple.ts";
import { adminClient, requireUser } from "../_shared/auth.ts";
import { handler, HttpError, json, optionalEnv } from "../_shared/http.ts";
import { db } from "../_shared/ledger.ts";
import { deleteSubscriber, revenueCatConfigured } from "../_shared/revenuecat.ts";
import { decryptText, identityHash } from "../_shared/secrets.ts";

// Deletes the account and everything tied to it (App Review 5.1.1(v)).
// Order matters: the Apple grant is revoked first and a failure stops the
// delete, so the person can retry instead of being left with a live grant.
Deno.serve(
  handler(async (req) => {
    if (req.method !== "POST") throw new HttpError(405, "method_not_allowed");
    const user = await requireUser(req);

    const rows = await db()`
      select starter_reviews_used, starter_text_used, apple_refresh_token_enc
      from public.accounts where user_id = ${user.id}
    `;
    const account = rows[0];

    // Remember (by keyed hash) how much of the starter pack was used.
    if (account && user.identity && optionalEnv("TONO_SECRET")) {
      const hash = await identityHash(user.identity);
      await db()`
        insert into public.starter_tombstones (identity_hash, starter_reviews_used, starter_text_used)
        values (${hash}, ${account.starter_reviews_used}, ${account.starter_text_used})
        on conflict (identity_hash) do update
          set starter_reviews_used = greatest(public.starter_tombstones.starter_reviews_used, excluded.starter_reviews_used),
              starter_text_used = greatest(public.starter_tombstones.starter_text_used, excluded.starter_text_used),
              updated_at = now()
      `;
    }

    if (account?.apple_refresh_token_enc) {
      if (!appleConfigured()) throw new HttpError(503, "apple_not_configured");
      await revokeRefreshToken(await decryptText(account.apple_refresh_token_enc as string));
    }

    // Remove the person from RevenueCat too (their purchase history there is
    // tied to this id). A failure stops the delete so it can be retried. The
    // Apple subscription itself keeps running until the person cancels it.
    if (revenueCatConfigured()) await deleteSubscriber(user.id);

    const admin = adminClient();
    await admin.storage.from("backups").remove([`${user.id}/latest.db`]);
    const { error } = await admin.auth.admin.deleteUser(user.id);
    if (error) {
      console.error("deleteUser failed", error.message);
      throw new HttpError(500, "delete_failed");
    }
    return json({ ok: true });
  }),
);
