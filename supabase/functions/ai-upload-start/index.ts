import { decideAllowance } from "../_shared/allowance.ts";
import { describeAllowance, statusForDeny } from "../_shared/allowanceInfo.ts";
import { requireUser } from "../_shared/auth.ts";
import { startUpload, GeminiError } from "../_shared/gemini.ts";
import { env, handler, HttpError, json, readJson } from "../_shared/http.ts";
import { db, loadConfig, peekSnapshot } from "../_shared/ledger.ts";
import { uploadStartSchema } from "../_shared/request.ts";

// Step 1 of a video review: the phone says a file is coming, the server asks
// Google for an upload URL (holding the API key itself) and hands back only the
// URL. The bytes then go from the phone straight to Google.
Deno.serve(
  handler(async (req) => {
    if (req.method !== "POST") throw new HttpError(405, "method_not_allowed");
    const user = await requireUser(req);
    const config = await loadConfig();

    const parsed = uploadStartSchema(config.limits).safeParse(await readJson(req));
    if (!parsed.success) throw new HttpError(400, "bad_request", parsed.error.issues[0]?.message);

    // Refuse before storing anything for someone who could not review it anyway.
    const snapshot = await peekSnapshot(user.id);
    const decision = decideAllowance({ config, kind: "review", snapshot, estCostUsd: 0.01 });
    if (!decision.ok) {
      throw new HttpError(statusForDeny(decision.reason), decision.reason, undefined, {
        allowance: describeAllowance(config, snapshot, new Date()),
      });
    }

    const recent = await db()`
      select count(*)::int as n from public.uploads where user_id = ${user.id} and created_at > now() - interval '1 hour'
    `;
    if (recent[0].n >= 20) throw new HttpError(429, "rate_limited");

    const inserted = await db()`
      insert into public.uploads (user_id, mime_type, size_bytes)
      values (${user.id}, ${parsed.data.mimeType}, ${parsed.data.sizeBytes}) returning id
    `;
    const uploadId = inserted[0].id as string;

    try {
      // The upload's display name is our row id: it is how ai-file later proves
      // that a file belongs to the person who started it.
      const uploadUrl = await startUpload(env("GEMINI_API_KEY"), {
        sizeBytes: parsed.data.sizeBytes,
        mimeType: parsed.data.mimeType,
        displayName: uploadId,
      });
      return json({ uploadUrl, uploadId });
    } catch (e) {
      await db()`delete from public.uploads where id = ${uploadId}`;
      if (e instanceof GeminiError) {
        console.error("start upload failed", e.message);
        throw new HttpError(502, "upstream_unavailable");
      }
      throw e;
    }
  }),
);
