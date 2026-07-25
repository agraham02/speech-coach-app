import { env } from "../../config/env";
import { todayISODate } from "../../utils/dateUtils";
import { appendBlockChildren, getBlockChildren, type NotionBlock } from "./notionClient";
import { splitIntoNotionRichText } from "./richText";
import { logger } from "../../utils/logger";

interface HeadingBlock extends NotionBlock {
  type: "heading_2";
  heading_2: { rich_text: { plain_text?: string; text?: { content: string } }[] };
}

function isHeadingBlock(block: NotionBlock): block is HeadingBlock {
  return block.type === "heading_2";
}

function headingPlainText(block: HeadingBlock): string {
  return block.heading_2.rich_text
    .map((rt) => rt.plain_text ?? rt.text?.content ?? "")
    .join("");
}

// Pure and unit-testable: given a page's existing children, finds the
// heading_2 block whose text matches today's date, if one already exists.
export function resolveTodayHeadingBlockId(
  children: NotionBlock[],
  todayDate: string,
): string | undefined {
  const heading = children
    .filter(isHeadingBlock)
    .find((block) => headingPlainText(block) === todayDate);
  return heading?.id;
}

async function createTodayHeading(pageId: string, todayDate: string): Promise<string> {
  const result = await appendBlockChildren(pageId, [
    {
      heading_2: {
        rich_text: [{ type: "text", text: { content: todayDate } }],
        is_toggleable: true,
      },
    },
  ]);
  const headingId = result.results[0].id;
  logger.info(
    `[notion] created new toggleable heading "${todayDate}" (block ${headingId}) on page ${pageId}`,
  );
  return headingId;
}

export async function appendTodayTranscript(
  cleanTranscript: string,
  promptText: string,
): Promise<void> {
  const todayDate = todayISODate();
  const pageId = env.notionPageId;

  logger.info(`[notion] fetching existing children of page ${pageId}...`);
  const children = await getBlockChildren(pageId);
  logger.info(`[notion] page has ${children.length} top-level block(s)`);

  let headingBlockId = resolveTodayHeadingBlockId(children, todayDate);
  if (!headingBlockId) {
    headingBlockId = await createTodayHeading(pageId, todayDate);
  } else {
    logger.info(`[notion] found existing heading "${todayDate}" (block ${headingBlockId})`);
  }

  logger.info(`[notion] appending transcript as children of block ${headingBlockId}...`);
  const appendResult = await appendBlockChildren(headingBlockId, [
    {
      paragraph: {
        rich_text: [{ type: "text", text: { content: `Prompt: ${promptText}` }, annotations: { italic: true } }],
      },
    },
    {
      paragraph: {
        rich_text: splitIntoNotionRichText(cleanTranscript),
      },
    },
  ]);
  logger.info(
    `[notion] appended ${appendResult.results.length} block(s) under ${headingBlockId}. ` +
      `Note: this heading is a TOGGLE — if you don't see the text, click the arrow next to "${todayDate}" to expand it.`,
  );
}
