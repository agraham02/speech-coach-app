// Small HTTP helpers shared by every Tono edge function (Deno).

const CORS: Record<string, string> = {
  "access-control-allow-origin": "*",
  "access-control-allow-headers": "authorization, content-type, x-client-info, apikey",
  "access-control-allow-methods": "GET, POST, OPTIONS",
};

// A request the server refuses on purpose. `code` is what the app switches on;
// `extra` rides along in the error body (for example the allowance left).
export class HttpError extends Error {
  constructor(
    public status: number,
    public code: string,
    message?: string,
    public extra?: Record<string, unknown>,
  ) {
    super(message ?? code);
  }
}

export function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, "content-type": "application/json" },
  });
}

// Bodies bigger than this are refused before parsing. A review prompt is far
// smaller (the schema and prompt limits in config are about 140 KB).
const MAX_BODY_BYTES = 400_000;

export async function readJson(req: Request): Promise<unknown> {
  const text = await req.text();
  if (text.length > MAX_BODY_BYTES) throw new HttpError(413, "too_large");
  try {
    return text ? JSON.parse(text) : {};
  } catch {
    throw new HttpError(400, "bad_json");
  }
}

// Wraps a handler: CORS preflight, HttpError -> JSON error, anything else ->
// a bare 500 that never leaks internals.
export function handler(fn: (req: Request) => Promise<Response>): (req: Request) => Promise<Response> {
  return async (req) => {
    if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });
    try {
      return await fn(req);
    } catch (e) {
      if (e instanceof HttpError) {
        return json({ error: { code: e.code, message: e.message, ...e.extra } }, e.status);
      }
      console.error("unhandled", e instanceof Error ? e.stack ?? e.message : e);
      return json({ error: { code: "internal" } }, 500);
    }
  };
}

export function env(name: string): string {
  const v = Deno.env.get(name);
  if (!v) throw new HttpError(500, "server_misconfigured", `Missing secret ${name}`);
  return v;
}

export function optionalEnv(name: string): string | undefined {
  return Deno.env.get(name) || undefined;
}
