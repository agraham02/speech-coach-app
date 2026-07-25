import { env } from "../../config/env";

const API_BASE = "https://api.notion.com/v1";
const NOTION_VERSION = "2022-06-28";

export class NotionApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly body?: unknown,
  ) {
    super(message);
    this.name = "NotionApiError";
  }
}

function headers(): Record<string, string> {
  return {
    Authorization: `Bearer ${env.notionToken}`,
    "Notion-Version": NOTION_VERSION,
    "Content-Type": "application/json",
  };
}

async function handleResponse<T>(response: Response): Promise<T> {
  if (!response.ok) {
    const body = await response.json().catch(() => undefined);
    const message =
      response.status === 401
        ? "Notion rejected the integration token (401) — check NOTION_TOKEN."
        : response.status === 404
          ? "Notion page not found (404) — check NOTION_PAGE_ID, and make sure the integration has been shared with that page."
          : `Notion API error (${response.status})`;
    throw new NotionApiError(message, response.status, body);
  }
  return response.json() as Promise<T>;
}

export interface NotionBlock {
  id: string;
  type: string;
  [key: string]: unknown;
}

export async function getBlockChildren(blockId: string): Promise<NotionBlock[]> {
  const results: NotionBlock[] = [];
  let cursor: string | undefined;

  do {
    const url = new URL(`${API_BASE}/blocks/${blockId}/children`);
    url.searchParams.set("page_size", "100");
    if (cursor) url.searchParams.set("start_cursor", cursor);

    const response = await fetch(url.toString(), { headers: headers() });
    const data = await handleResponse<{
      results: NotionBlock[];
      has_more: boolean;
      next_cursor: string | null;
    }>(response);

    results.push(...data.results);
    cursor = data.has_more ? (data.next_cursor ?? undefined) : undefined;
  } while (cursor);

  return results;
}

export async function appendBlockChildren(
  blockId: string,
  children: object[],
): Promise<{ results: NotionBlock[] }> {
  const response = await fetch(`${API_BASE}/blocks/${blockId}/children`, {
    method: "PATCH",
    headers: headers(),
    body: JSON.stringify({ children }),
  });
  return handleResponse(response);
}
