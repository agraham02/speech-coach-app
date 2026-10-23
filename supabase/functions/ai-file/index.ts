import { requireUser } from "../_shared/auth.ts";
import { deleteFile, fileUri, GeminiError, getFile } from "../_shared/gemini.ts";
import { env, handler, HttpError, json, readJson } from "../_shared/http.ts";
import { db } from "../_shared/ledger.ts";

const FILE_NAME = /^files\/[a-z0-9-]{1,40}$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

// Step 2 of a video review: after the phone finished uploading it asks for the
// file's state (until it is ACTIVE), and later to check a file can be reused.
// Only the person who started the upload can see it.
//
// With `delete: true` it instead removes the person's uploaded video from
// Google and forgets the upload: the phone asks for this when a take is
// deleted, so a video does not sit on Google's side for its 48 hours.
Deno.serve(
  handler(async (req) => {
    if (req.method !== "POST") throw new HttpError(405, "method_not_allowed");
    const user = await requireUser(req);

    const body = (await readJson(req)) as { fileName?: unknown; delete?: unknown };
    const fileName = typeof body.fileName === "string" ? body.fileName : "";
    if (!FILE_NAME.test(fileName)) throw new HttpError(400, "bad_request", "fileName");

    if (body.delete === true) {
      const owned = await db()`
        select id from public.uploads where file_name = ${fileName} and user_id = ${user.id}
      `;
      // Not this person's (or already gone): nothing to remove, nothing to reveal.
      if (owned.length === 0) return json({ ok: true });
      await deleteFile(env("GEMINI_API_KEY"), fileName);
      await db()`delete from public.uploads where file_name = ${fileName} and user_id = ${user.id}`;
      return json({ ok: true });
    }

    let file;
    try {
      file = await getFile(env("GEMINI_API_KEY"), fileName);
    } catch (e) {
      if (e instanceof GeminiError) throw new HttpError(502, "upstream_unavailable");
      throw e;
    }
    if (!file) throw new HttpError(404, "file_not_found");

    // Known file: it must already be registered to this person.
    const known = await db()`
      select id from public.uploads where file_name = ${fileName} and user_id = ${user.id}
    `;
    if (known.length === 0) {
      // First sight: the display name is the upload row id we chose at the start.
      const id = file.displayName ?? "";
      if (!UUID.test(id)) throw new HttpError(404, "file_not_found");
      const claimed = await db()`
        update public.uploads set file_name = ${fileName}
        where id = ${id} and user_id = ${user.id} and file_name is null returning id
      `;
      if (claimed.length === 0) throw new HttpError(404, "file_not_found");
    }

    return json({
      name: fileName,
      uri: file.uri ?? fileUri(fileName),
      mimeType: file.mimeType ?? "video/mp4",
      state: file.state ?? "PROCESSING",
    });
  }),
);
