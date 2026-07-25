import Constants from "expo-constants";

interface AppEnv {
  geminiApiKey: string;
  notionToken: string;
  notionPageId: string;
}

const PLACEHOLDER_VALUES = new Set([
  "",
  "your-gemini-api-key-here",
  "secret_your-notion-integration-token-here",
  "your-notion-journal-page-id-here",
]);

function readExtra(): AppEnv {
  const extra = Constants.expoConfig?.extra ?? {};
  return {
    geminiApiKey: String(extra.geminiApiKey ?? ""),
    notionToken: String(extra.notionToken ?? ""),
    notionPageId: String(extra.notionPageId ?? ""),
  };
}

export const env = readExtra();

export function getMissingEnvKeys(): (keyof AppEnv)[] {
  return (Object.keys(env) as (keyof AppEnv)[]).filter((key) =>
    PLACEHOLDER_VALUES.has(env[key]),
  );
}

export class MissingEnvError extends Error {
  constructor(public readonly missingKeys: (keyof AppEnv)[]) {
    super(
      `Missing/placeholder config values: ${missingKeys.join(", ")}. Fill in real values in .env (see .env.example) and rebuild.`,
    );
    this.name = "MissingEnvError";
  }
}

export function assertEnvConfigured(): void {
  const missing = getMissingEnvKeys();
  if (missing.length > 0) {
    throw new MissingEnvError(missing);
  }
}
