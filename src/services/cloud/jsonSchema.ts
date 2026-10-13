// The rubric schema is written once (services/gemini/schema.ts) in the
// JSON-Schema subset Gemini reads. OpenAI's and Anthropic's structured
// outputs need it strict: every object closed (additionalProperties: false)
// with every property required.

type Schema = { type?: string; properties?: Record<string, Schema>; items?: Schema; required?: string[]; [key: string]: unknown };

export function toStrictSchema(schema: object): object {
  const node = schema as Schema;
  if (node.type === "object" && node.properties) {
    const properties = Object.fromEntries(Object.entries(node.properties).map(([key, value]) => [key, toStrictSchema(value) as Schema]));
    return { ...node, properties, required: Object.keys(properties), additionalProperties: false };
  }
  if (node.type === "array" && node.items) return { ...node, items: toStrictSchema(node.items) };
  return node;
}

// The same schema without some top-level properties (fields the app fills
// in itself rather than asking the model for).
export function withoutProperties(schema: object, keys: string[]): object {
  const node = schema as Schema;
  const properties = Object.fromEntries(Object.entries(node.properties ?? {}).filter(([key]) => !keys.includes(key)));
  return { ...node, properties, required: (node.required ?? []).filter((key) => !keys.includes(key)) };
}
