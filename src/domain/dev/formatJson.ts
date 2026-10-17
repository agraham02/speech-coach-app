// JSON for people (and for pasting into a chat): pretty-printed, but with
// runs of numbers on one line, so a pitch contour is not a thousand lines.

const isPrimitive = (v: unknown) => v === null || typeof v !== "object";
const inline = (v: unknown) => (v === undefined ? "null" : JSON.stringify(v));

export function formatJson(value: unknown, depth = 0): string {
  const pad = "  ".repeat(depth + 1);
  const end = "  ".repeat(depth);
  if (Array.isArray(value)) {
    if (value.length === 0) return "[]";
    // All plain values: one line.
    if (value.every(isPrimitive)) return "[" + value.map(inline).join(", ") + "]";
    // A list of short rows (timed words): one row per line.
    if (value.every((v) => Array.isArray(v) && v.every(isPrimitive))) {
      return "[\n" + value.map((row) => pad + "[" + (row as unknown[]).map(inline).join(", ") + "]").join(",\n") + "\n" + end + "]";
    }
    return "[\n" + value.map((v) => pad + formatJson(v, depth + 1)).join(",\n") + "\n" + end + "]";
  }
  if (value !== null && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>).filter(([, v]) => v !== undefined);
    if (entries.length === 0) return "{}";
    return "{\n" + entries.map(([k, v]) => pad + JSON.stringify(k) + ": " + formatJson(v, depth + 1)).join(",\n") + "\n" + end + "}";
  }
  return inline(value);
}
