// What the browser hands back after Google sign-in: a return URL such as
//   tono://auth/callback?code=abc            (success, PKCE flow)
//   tono://auth/callback?error=access_denied&error_description=...
// Parsed by hand: it is a short, known shape, and not every runtime's URL class
// treats a custom scheme like this one the same way. Pure.

export interface AuthCallback {
  code: string | null;
  error: string | null;
}

function decode(part: string): string {
  try {
    return decodeURIComponent(part.replace(/\+/g, " "));
  } catch {
    return part;
  }
}

function pairs(text: string): Map<string, string> {
  const map = new Map<string, string>();
  for (const pair of text.split("&")) {
    if (!pair) continue;
    const eq = pair.indexOf("=");
    const key = decode(eq === -1 ? pair : pair.slice(0, eq));
    if (!map.has(key)) map.set(key, eq === -1 ? "" : decode(pair.slice(eq + 1)));
  }
  return map;
}

export function parseAuthCallback(url: string): AuthCallback {
  const hash = url.indexOf("#");
  const beforeHash = hash === -1 ? url : url.slice(0, hash);
  const query = beforeHash.indexOf("?") === -1 ? "" : beforeHash.slice(beforeHash.indexOf("?") + 1);
  const fragment = hash === -1 ? "" : url.slice(hash + 1);
  // Errors can arrive in either place; the query wins when both have one.
  const params = new Map([...pairs(fragment), ...pairs(query)]);
  const error = params.get("error_description") || params.get("error") || null;
  const code = params.get("code") || null;
  return { code, error };
}
