import { topicFromLevel } from "../../domain/analysis/onTopicCheck";
import type { TopicVerdict } from "../../domain/meaning/meaning";
import { TAKE_MIN_WORDS } from "../../domain/gates";
import type { Session } from "../../domain/sessionTypes";
import { requestAnalysis } from "../analysis";
import { getArtifact, putArtifact } from "../db/artifactsRepo";
import { checkTopic } from "../language/meaningCheck";
import { logger } from "../../utils/logger";

// Is a take about its prompt? Asked once per take, the answer kept with it:
// first this phone's own meaning check (offline, free), and when it can't tell,
// the small content check on the server (free for a signed-in adult who has
// allowed Tono AI, 60 a month). Nothing here ever fails a take for being
// unreachable: no answer means no check (docs/overhaul/PLAN.md, 6.6, rule 8).

interface StoredTopic {
  verdict: TopicVerdict;
  by: "phone" | "tono_ai";
  // The small check's level and note, when it was the one that answered.
  level?: number;
  note?: string;
}

// Takes where the server was already asked this launch and couldn't answer: not
// asked again until the app restarts, so a rescore doesn't repeat a failed call.
const askedServer = new Set<string>();

export async function topicVerdictFor(session: Session, hasJudgedReview: boolean): Promise<TopicVerdict | null> {
  const prompt = session.subjectExtras?.promptText;
  const text = session.transcriptVerbatim ?? "";
  // A judge that scored the take already knows whether it answered; a script take
  // has no prompt to answer; a record with no topic has none.
  if (hasJudgedReview || session.sessionType === "script_practice" || !prompt || text.trim().split(/\s+/).length < TAKE_MIN_WORDS) return null;

  const stored = await getArtifact<StoredTopic>(session.id, "topic_check");
  if (stored) return stored.verdict;

  const phone = await checkTopic(prompt, text);
  if (phone) {
    await putArtifact(session.id, "topic_check", { verdict: phone, by: "phone" } satisfies StoredTopic);
    return phone;
  }

  if (askedServer.has(session.id)) return null;
  askedServer.add(session.id);
  try {
    const result = await requestAnalysis("check_on_topic", { prompt, answer: text }, { hasVideo: false, hasTranscript: true });
    if (result.status !== "done") return null;
    const verdict = topicFromLevel(result.value.level);
    await putArtifact(session.id, "topic_check", { verdict, by: "tono_ai", level: result.value.level, note: result.value.note } satisfies StoredTopic);
    return verdict;
  } catch (error) {
    logger.warn(`[topic] small check failed — ${(error as Error).message}`);
    return null;
  }
}
