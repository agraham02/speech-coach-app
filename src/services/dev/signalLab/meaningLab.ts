import { WORD_CHAIN_LINKS, TOPIC_GOLD } from "../../../domain/meaning/gold";
import type { StepMeasure } from "../../../domain/signalLab/types";
import { similarity } from "../../language/embeddings";
import { meaningCheck, readTopic, resetMeaningCheck } from "../../language/meaningCheck";

// Signal Lab's content tests run the phone's meaning check on its stored cases
// (domain/meaning/gold.ts) and hand the raw readings to the pure evaluators in
// domain/signalLab/contentTests.ts.
export async function measureMeaning(which: "word_links" | "on_topic"): Promise<NonNullable<StepMeasure["meaning"]>> {
  // Start from a fresh self-test, so the lab shows what the phone does now.
  resetMeaningCheck();
  const check = await meaningCheck();
  if (which === "word_links") {
    const linkSims = await Promise.all(WORD_CHAIN_LINKS.map((l) => similarity("word", l.from, l.to)));
    return { linkSims, category: { ready: check.category.ready, note: check.category.note } };
  }
  const topicReadings = await Promise.all(TOPIC_GOLD.map((c) => readTopic(c.prompt, c.answer)));
  return { topicReadings };
}
