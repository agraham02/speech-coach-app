import { topicFromLevel } from "../../domain/analysis/onTopicCheck";
import type { TopicVerdict } from "../../domain/meaning/meaning";
import { TAKE_MIN_WORDS } from "../../domain/gates";
import type { Session } from "../../domain/sessionTypes";
import { requestAnalysis } from "../analysis";
import { getArtifact, putArtifact } from "../db/artifactsRepo";
import { checkTopic } from "../language/meaningCheck";
import { gradingContextFromSession } from "./sessionSubject";
import { logger } from "../../utils/logger";

// Is a take about its prompt? Asked once per take, the answer kept with it:
// first this phone's own meaning check (offline, free), and when it can't tell,
// the small content check on the server (free for a signed-in adult who has
// allowed Tono AI, 60 a month). Nothing here ever fails a take for being
// unreachable: no answer means no check (docs/overhaul/PLAN.md, 6.6, rule 8).

interface StoredTopic {
  verdict: TopicVerdict;
  // How long the transcript was when it was checked: a retried transcription is checked again.
  words?: number;
  by: "phone" | "tono_ai";
  // The small check's level and note, when it was the one that answered.
  level?: number;
  note?: string;
}

// A check under way for a take, shared by everyone who asks while it runs: a score
// is never worked out before the verdict is in, and the server is asked once.
const inFlight = new Map<string, Promise<TopicVerdict | null>>();

export async function topicVerdictFor(session: Session, hasJudgedReview: boolean): Promise<TopicVerdict | null> {
  const text = session.transcriptVerbatim ?? "";
  // A judge that scored the take already knows whether it answered; a script take
  // and a feeling rep have no prompt to answer; a free record has one only if it
  // was given a topic.
  if (hasJudgedReview || session.sessionType === "script_practice" || session.sessionType === "feeling") return null;
  if (session.sessionType === "free_record" && !session.subjectExtras?.promptText) return null;
  if (text.trim().split(/\s+/).length < TAKE_MIN_WORDS) return null;

  const running = inFlight.get(session.id);
  if (running) return running;
  const job = check(session, text).finally(() => inFlight.delete(session.id));
  inFlight.set(session.id, job);
  return job;
}

// Taken once a launch for a take the server couldn't answer, so a rescore doesn't repeat it.
const serverFailed = new Set<string>();

async function check(session: Session, text: string): Promise<TopicVerdict | null> {
  const wordCount = text.trim().split(/\s+/).length;
  const stored = await getArtifact<StoredTopic>(session.id, "topic_check");
  if (stored && (stored.words == null || stored.words === wordCount)) return stored.verdict;

  // The prompt's words: a library prompt is looked up, a made-up one is on the take.
  const context = await gradingContextFromSession(session);
  const prompt = context?.kind === "prompt" ? context.promptText : null;
  if (!prompt) return null;

  const phone = await checkTopic(prompt, text);
  if (phone) {
    await putArtifact(session.id, "topic_check", { verdict: phone, by: "phone", words: wordCount } satisfies StoredTopic);
    return phone;
  }

  if (serverFailed.has(session.id)) return null;
  try {
    const result = await requestAnalysis("check_on_topic", { prompt, answer: text }, { hasVideo: false, hasTranscript: true });
    if (result.status !== "done") {
      serverFailed.add(session.id);
      return null;
    }
    const verdict = topicFromLevel(result.value.level);
    await putArtifact(session.id, "topic_check", { verdict, by: "tono_ai", level: result.value.level, note: result.value.note, words: wordCount } satisfies StoredTopic);
    return verdict;
  } catch (error) {
    serverFailed.add(session.id);
    logger.warn(`[topic] small check failed — ${(error as Error).message}`);
    return null;
  }
}
