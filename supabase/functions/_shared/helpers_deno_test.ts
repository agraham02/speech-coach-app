// Tests for the Deno-only helpers: secrets, the Gemini guard and answer
// checks. Run with `deno test` (see supabase/README.md). Not part of jest.
import { assertEquals, assertRejects, assertThrows } from "jsr:@std/assert@1";
import { answerText, GeminiError, startUpload } from "./gemini.ts";
import { decryptText, encryptText } from "./secrets.ts";

const ROOT = "dGVzdC1zZWNyZXQtZm9yLXRvbm8tdGVzdHMtb25seS0hISE=";

Deno.test("encrypt and decrypt round trip, and differ every time", async () => {
  const a = await encryptText("refresh-token-123", ROOT);
  const b = await encryptText("refresh-token-123", ROOT);
  assertEquals(await decryptText(a, ROOT), "refresh-token-123");
  assertEquals(a === b, false);
});

Deno.test("decrypting with another secret fails", async () => {
  const a = await encryptText("x", ROOT);
  await assertRejects(() => decryptText(a, "b3RoZXItc2VjcmV0"));
});

Deno.test("answerText accepts a finished answer", () => {
  const body = { candidates: [{ finishReason: "STOP", content: { parts: [{ text: '{"a":1}' }] } }] };
  assertEquals(answerText(body), '{"a":1}');
});

Deno.test("answerText refuses blocked, truncated and empty answers", () => {
  assertThrows(() => answerText({ promptFeedback: { blockReason: "SAFETY" } }), GeminiError);
  assertThrows(() => answerText({ candidates: [] }), GeminiError);
  assertThrows(() => answerText({ candidates: [{ finishReason: "MAX_TOKENS", content: { parts: [{ text: "{" }] } }] }), GeminiError);
  assertThrows(() => answerText({ candidates: [{ finishReason: "STOP", content: { parts: [{ text: "  " }] } }] }), GeminiError);
});

Deno.test("startUpload never returns a URL that carries the key", async () => {
  const realFetch = globalThis.fetch;
  try {
    const KEY = "AIzaSyTESTKEY";
    globalThis.fetch = (_url, init) => {
      const headers = init?.headers as Record<string, string>;
      assertEquals(headers["x-goog-api-key"], KEY);
      return Promise.resolve(new Response("{}", { status: 200, headers: { "x-goog-upload-url": "https://upload.example/abc?upload_id=1" } }));
    };
    assertEquals(await startUpload(KEY, { sizeBytes: 10, mimeType: "video/mp4", displayName: "d" }), "https://upload.example/abc?upload_id=1");

    globalThis.fetch = () =>
      Promise.resolve(new Response("{}", { status: 200, headers: { "x-goog-upload-url": `https://upload.example/abc?key=${KEY}` } }));
    await assertRejects(() => startUpload(KEY, { sizeBytes: 10, mimeType: "video/mp4", displayName: "d" }), GeminiError);

    globalThis.fetch = () => Promise.resolve(new Response("{}", { status: 200, headers: { "x-goog-upload-url": "https://upload.example/abc?upload_id=AIzaSyTESTKEY" } }));
    await assertRejects(() => startUpload(KEY, { sizeBytes: 10, mimeType: "video/mp4", displayName: "d" }), GeminiError);
  } finally {
    globalThis.fetch = realFetch;
  }
});
