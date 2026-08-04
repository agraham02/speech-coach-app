import { NotionApiError } from "./notionClient";

// Mirrors describeGeminiError (src/services/gemini/describeError.ts): turns a
// raw failure into a message worth showing a user. NotionApiError messages
// are already curated at the throw site (notionClient.ts's handleResponse),
// so this only needs to add framing for the case that never reaches there —
// a raw network failure (device offline) throwing before a Response exists.
export function describeNotionError(error: unknown): string {
  if (error instanceof NotionApiError) return error.message;
  if (error instanceof TypeError) return "Couldn't reach Notion — check your internet connection.";
  return error instanceof Error ? error.message : "Something went wrong syncing to Notion.";
}
