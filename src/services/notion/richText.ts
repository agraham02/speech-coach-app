// Notion rejects rich_text segments longer than 2000 characters, so long
// transcripts need to be chunked into multiple text objects within one block.
const NOTION_RICH_TEXT_LIMIT = 2000;

export function splitIntoNotionRichText(text: string): { type: "text"; text: { content: string } }[] {
  if (text.length === 0) {
    return [{ type: "text", text: { content: "" } }];
  }

  const chunks: string[] = [];
  for (let i = 0; i < text.length; i += NOTION_RICH_TEXT_LIMIT) {
    chunks.push(text.slice(i, i + NOTION_RICH_TEXT_LIMIT));
  }

  return chunks.map((chunk) => ({ type: "text", text: { content: chunk } }));
}
