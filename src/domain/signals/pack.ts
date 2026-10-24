// Packing for the feature tracks: typed arrays as little-endian bytes in
// base64, so a minute of 10 ms frames costs tens of KB in the stored JSON
// instead of hundreds. Pure, no platform base64 (runs the same in tests,
// Hermes and the offline scripts).

const ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
const LOOKUP = (() => {
  const t = new Int16Array(128).fill(-1);
  for (let i = 0; i < ALPHABET.length; i++) t[ALPHABET.charCodeAt(i)] = i;
  return t;
})();

export function bytesToBase64(bytes: Uint8Array): string {
  const parts: string[] = [];
  let chunk = "";
  for (let i = 0; i < bytes.length; i += 3) {
    const a = bytes[i];
    const b = i + 1 < bytes.length ? bytes[i + 1] : 0;
    const c = i + 2 < bytes.length ? bytes[i + 2] : 0;
    const n = (a << 16) | (b << 8) | c;
    chunk +=
      ALPHABET[(n >> 18) & 63] +
      ALPHABET[(n >> 12) & 63] +
      (i + 1 < bytes.length ? ALPHABET[(n >> 6) & 63] : "=") +
      (i + 2 < bytes.length ? ALPHABET[n & 63] : "=");
    if (chunk.length >= 8192) {
      parts.push(chunk);
      chunk = "";
    }
  }
  parts.push(chunk);
  return parts.join("");
}

export function base64ToBytes(text: string): Uint8Array {
  const clean = text.replace(/[^A-Za-z0-9+/]/g, "");
  const out = new Uint8Array(Math.floor((clean.length * 3) / 4));
  let o = 0;
  for (let i = 0; i < clean.length; i += 4) {
    const v = (k: number) => (i + k < clean.length ? LOOKUP[clean.charCodeAt(i + k)] : 0);
    const n = (v(0) << 18) | (v(1) << 12) | (v(2) << 6) | v(3);
    if (o < out.length) out[o++] = (n >> 16) & 255;
    if (o < out.length) out[o++] = (n >> 8) & 255;
    if (o < out.length) out[o++] = n & 255;
  }
  return out;
}

function littleEndian(view: ArrayBufferView): Uint8Array {
  // Every platform the app runs on is little-endian; the bytes are taken as
  // they are in memory.
  return new Uint8Array(view.buffer, view.byteOffset, view.byteLength);
}

export function packInt16(values: ArrayLike<number>): string {
  const a = new Int16Array(values.length);
  for (let i = 0; i < values.length; i++) a[i] = Math.max(-32768, Math.min(32767, Math.round(values[i])));
  return bytesToBase64(littleEndian(a));
}

export function unpackInt16(text: string): Int16Array {
  const bytes = base64ToBytes(text);
  const out = new Int16Array(Math.floor(bytes.length / 2));
  for (let i = 0; i < out.length; i++) {
    const v = bytes[2 * i] | (bytes[2 * i + 1] << 8);
    out[i] = v > 32767 ? v - 65536 : v;
  }
  return out;
}

export function packUint8(values: ArrayLike<number>): string {
  const a = new Uint8Array(values.length);
  for (let i = 0; i < values.length; i++) a[i] = Math.max(0, Math.min(255, Math.round(values[i])));
  return bytesToBase64(a);
}

export function unpackUint8(text: string): Uint8Array {
  return base64ToBytes(text);
}

export function packUint32(values: ArrayLike<number>): string {
  const a = new Uint32Array(values.length);
  for (let i = 0; i < values.length; i++) a[i] = Math.max(0, Math.round(values[i]));
  return bytesToBase64(littleEndian(a));
}

export function unpackUint32(text: string): Uint32Array {
  const bytes = base64ToBytes(text);
  const out = new Uint32Array(Math.floor(bytes.length / 4));
  for (let i = 0; i < out.length; i++) {
    out[i] = (bytes[4 * i] | (bytes[4 * i + 1] << 8) | (bytes[4 * i + 2] << 16)) + bytes[4 * i + 3] * 16777216;
  }
  return out;
}

// Pitch as cents over 55 Hz in an Int16 (600 Hz is about 4,140), with a
// marker for unvoiced frames: no float noise, half the size.
export const UNVOICED_CENTS = -32768;

export function hzToCents(hz: number): number {
  return hz > 0 ? Math.round(1200 * Math.log2(hz / 55)) : UNVOICED_CENTS;
}

export function centsToHz(cents: number): number {
  return cents === UNVOICED_CENTS ? 0 : 55 * Math.pow(2, cents / 1200);
}
