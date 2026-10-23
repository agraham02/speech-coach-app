import * as Crypto from "expo-crypto";

// supabase-js protects the Google sign-in with PKCE: a random secret ("verifier")
// and its SHA-256 hash. It asks the platform's WebCrypto for both. React
// Native has neither, and without them the library quietly falls back to
// Math.random() for the secret and to sending it unhashed, which defeats the
// point. So the two functions it needs are provided here, backed by expo-crypto
// (the operating system's secure random generator and SHA-256).

type DigestName = "SHA-1" | "SHA-256" | "SHA-384" | "SHA-512";

const ALGORITHMS: Record<DigestName, Crypto.CryptoDigestAlgorithm> = {
  "SHA-1": Crypto.CryptoDigestAlgorithm.SHA1,
  "SHA-256": Crypto.CryptoDigestAlgorithm.SHA256,
  "SHA-384": Crypto.CryptoDigestAlgorithm.SHA384,
  "SHA-512": Crypto.CryptoDigestAlgorithm.SHA512,
};

function algorithmName(algorithm: string | { name: string }): DigestName {
  const name = (typeof algorithm === "string" ? algorithm : algorithm.name).toUpperCase();
  if (name in ALGORITHMS) return name as DigestName;
  throw new Error(`Unsupported digest algorithm: ${name}`);
}

interface CryptoLike {
  getRandomValues?: (array: ArrayBufferView) => ArrayBufferView;
  subtle?: { digest?: (algorithm: string | { name: string }, data: BufferSource) => Promise<ArrayBuffer> };
}

// Adds only what is missing; a platform that already has WebCrypto keeps its own.
export function installWebCrypto(target: { crypto?: CryptoLike } = globalThis as { crypto?: CryptoLike }): void {
  const existing = target.crypto ?? {};
  const getRandomValues = typeof existing.getRandomValues === "function" ? existing.getRandomValues : (array: ArrayBufferView) => Crypto.getRandomValues(array as Uint8Array);
  const digest =
    typeof existing.subtle?.digest === "function"
      ? existing.subtle.digest
      : (algorithm: string | { name: string }, data: BufferSource) => Crypto.digest(ALGORITHMS[algorithmName(algorithm)], data);
  target.crypto = Object.assign(existing, { getRandomValues, subtle: Object.assign(existing.subtle ?? {}, { digest }) });
}
