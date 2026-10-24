import { appleConfigured, revokeRefreshToken } from "../_shared/apple.ts";
import { adminClient, requireUser } from "../_shared/auth.ts";
import { handler, HttpError, json } from "../_shared/http.ts";
import { db } from "../_shared/ledger.ts";
import { deleteSubscriber, revenueCatConfigured } from "../_shared/revenuecat.ts";
import { decryptText } from "../_shared/secrets.ts";

// Deletes the account and everything tied to it (App Review 5.1.1(v)).
// Order matters: the Apple grant is revoked first and a failure stops the
// delete, so the person can retry instead of being left with a live grant.
Deno.serve(
  handler(async (req) => {
    if (req.method !== "POST") throw new HttpError(405, "method_not_allowed");
    const user = await requireUser(req);

    const rows = await db()`select apple_refresh_token_enc from public.accounts where user_id = ${user.id}`;
    const account = rows[0];

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
