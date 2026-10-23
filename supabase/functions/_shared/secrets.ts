import { env } from "./http.ts";

// Everything secret the server derives comes from ONE random secret,
// TONO_SECRET (32 random bytes, base64), by labelled HMAC. One value to set,
// and the encryption key and the identity pepper can never be the same.

const encoder = new TextEncoder();

function b64(bytes: Uint8Array): string {
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s);
}

function unb64(text: string): Uint8Array {
  const s = atob(text);
  const out = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
  return out;
}

async function hmac(keyBytes: Uint8Array, data: string): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey("raw", keyBytes, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return new Uint8Array(await crypto.subtle.sign("HMAC", key, encoder.encode(data)));
}

async function derive(label: string, root: string = env("TONO_SECRET")): Promise<Uint8Array> {
  return hmac(encoder.encode(root), `tono:${label}`);
}

// A keyed one-way hash of a sign-in identity, so a deleted account cannot be
// re-created for another starter pack and the table never holds the identity.
export async function identityHash(identity: string, root?: string): Promise<string> {
  const digest = await hmac(await derive("identity", root), identity);
  return Array.from(digest, (b) => b.toString(16).padStart(2, "0")).join("");
}

// AES-GCM with a fresh random IV. Output is base64(iv || ciphertext).
export async function encryptText(plain: string, root?: string): Promise<string> {
  const key = await crypto.subtle.importKey("raw", await derive("aes", root), "AES-GCM", false, ["encrypt"]);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const cipher = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, encoder.encode(plain)));
  const out = new Uint8Array(iv.length + cipher.length);
  out.set(iv);
  out.set(cipher, iv.length);
  return b64(out);
}

export async function decryptText(blob: string, root?: string): Promise<string> {
  const bytes = unb64(blob);
  const key = await crypto.subtle.importKey("raw", await derive("aes", root), "AES-GCM", false, ["decrypt"]);
  const plain = await crypto.subtle.decrypt({ name: "AES-GCM", iv: bytes.slice(0, 12) }, key, bytes.slice(12));
  return new TextDecoder().decode(plain);
}
