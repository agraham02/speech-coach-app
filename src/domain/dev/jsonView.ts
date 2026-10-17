// Helpers for the Dev tab's JSON viewer. Artifacts can be big (a face
// timeline is ~1,500 samples), so nothing here renders more than asked.

export function describeJson(value: unknown): string {
  if (value === null) return "null";
  if (Array.isArray(value)) return "array · " + value.length.toLocaleString("en-US") + (value.length === 1 ? " item" : " items");
  switch (typeof value) {
    case "object": {
      const n = Object.keys(value as object).length;
      return "object · " + n + (n === 1 ? " key" : " keys");
    }
    case "string":
      return "string · " + (value as string).length.toLocaleString("en-US") + " chars";
    default:
      return typeof value;
  }
}

export interface JsonEntry {
  key: string;
  value: unknown;
}

// The first level of a value: an object's keys, or an array's first items.
export function topLevelEntries(value: unknown, maxItems = 50): { entries: JsonEntry[]; hidden: number } {
  if (Array.isArray(value)) {
    return {
      entries: value.slice(0, maxItems).map((v, i) => ({ key: "[" + i + "]", value: v })),
      hidden: Math.max(0, value.length - maxItems),
    };
  }
  if (value && typeof value === "object") {
    return { entries: Object.entries(value as Record<string, unknown>).map(([key, v]) => ({ key, value: v })), hidden: 0 };
  }
  return { entries: [], hidden: 0 };
}

export function isContainer(value: unknown): boolean {
  return value !== null && typeof value === "object";
}

// Pretty-printed JSON cut to about `limit` characters, at a line boundary.
export function sliceJsonText(value: unknown, limit: number): { text: string; total: number; truncated: boolean } {
  const full = JSON.stringify(value, null, 2) ?? "undefined";
  if (full.length <= limit) return { text: full, total: full.length, truncated: false };
  const cut = full.lastIndexOf("\n", limit);
  return { text: full.slice(0, cut > 0 ? cut : limit), total: full.length, truncated: true };
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return bytes + " B";
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + " KB";
  return (bytes / (1024 * 1024)).toFixed(1) + " MB";
}
