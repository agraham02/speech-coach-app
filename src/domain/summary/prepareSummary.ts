import {
  EXPLAIN_TOPICS,
  SUMMARY_PASSAGES,
  SUM_UP_SUBJECTS,
  type SubjectKind,
} from "../../content/summaryContent";
import { contentLevel, paramsFor, type DrillParams, type SummaryDrillType } from "../drills/drillSpecs";

// Turns (summary drill, level, seed, optional content) into the turns the
// summary screen plays and the targets it scores against. Pure.

export interface SummaryTurn {
  // What is on screen while you read it: a subject, a paragraph, a topic.
  show: string;
  // The reading card says this above `show`.
  eyebrow: string;
  // Relay: the text is hidden once you start speaking.
  hideWhileSpeaking: boolean;
  // Words that show you caught it: each appears in `show` (relay), or is the
  // subject's own (explain), which is never counted as jargon.
  keyWords: string[];
  // Relay: the previous paragraph's key words, on rolling turns.
  prevKeyWords?: string[];
  prevText?: string;
  rolling: boolean;
  // Most sentences allowed this turn.
  sentenceLimit: number;
  budgetSeconds: number;
  // Written reference answer, when one exists.
  example?: string;
  // The subject was the speaker's own: nothing to check a fact against.
  own?: boolean;
  kind?: SubjectKind;
}

export interface SummarySetup {
  type: SummaryDrillType;
  level: number;
  params: DrillParams;
  contentId: string;
  title: string;
  instructions: string;
  cue: string;
  turns: SummaryTurn[];
  // Silence after speech that ends the answer.
  endSilenceMs: number;
  maxWaitMs: number;
  // Hard cap on one answer.
  maxReplyMs: number;
  // The relay passage title / explain topic, for the review.
  subject: string;
}

function pick<T>(items: T[], seed: number): T {
  return items[Math.abs(seed) % items.length];
}

function pool<T extends { level: number }>(items: T[], level: number): T[] {
  const cl = contentLevel(level);
  const eligible = items.filter((i) => i.level <= cl);
  return eligible.length ? eligible : items;
}

export function prepareSummary(type: SummaryDrillType, level: number, seed: number, contentId?: string): SummarySetup {
  const params = paramsFor(type, level);
  const budget = params.budgetSeconds ?? 30;
  const timing = { endSilenceMs: 3000, maxWaitMs: 20_000, maxReplyMs: Math.round(budget * 2.2 * 1000) };

  switch (type) {
    case "sum_up": {
      const subject = SUM_UP_SUBJECTS.find((s) => s.id === contentId) ?? pick(pool(SUM_UP_SUBJECTS, level), seed);
      const limit = params.sentenceLimit ?? 2;
      return {
        type,
        level,
        params,
        contentId: subject.id,
        title: "Sum it up",
        subject: subject.text,
        instructions:
          limit === 1
            ? `You'll get something to sum up. Say it in one sentence — who or what, what happens, and what's at stake — then stop. About ${budget} seconds.`
            : `You'll get something to sum up. Say it in two sentences at most — who or what, what happens, and what's at stake — then stop. About ${budget} seconds.`,
        cue: limit === 1 ? "One sentence. Then stop." : "Two sentences. Then stop.",
        turns: [
          {
            show: subject.text,
            eyebrow: "Sum up",
            hideWhileSpeaking: false,
            keyWords: [],
            rolling: false,
            sentenceLimit: limit,
            budgetSeconds: budget,
            example: subject.example,
            own: subject.kind === "own",
            kind: subject.kind,
          },
        ],
        ...timing,
      };
    }
    case "relay": {
      const passage = SUMMARY_PASSAGES.find((p) => p.id === contentId) ?? pick(pool(SUMMARY_PASSAGES, level), seed);
      const count = Math.min(params.paragraphs ?? 3, passage.paragraphs.length);
      const turns: SummaryTurn[] = passage.paragraphs.slice(0, count).map((p, i) => {
        const prev = i >= 2 ? passage.paragraphs[i - 1] : null;
        return {
          show: p.text,
          eyebrow: `Paragraph ${i + 1} of ${count}`,
          hideWhileSpeaking: true,
          keyWords: p.keyWords,
          // Words both paragraphs share would pass the link-back check by accident.
          prevKeyWords: prev ? prev.keyWords.filter((k) => !p.keyWords.includes(k)) : undefined,
          prevText: prev?.text,
          rolling: !!prev,
          sentenceLimit: params.sentenceLimit ?? 2,
          budgetSeconds: budget,
          example: prev ? `${prev.example} ${p.example}` : p.example,
        };
      });
      return {
        type,
        level,
        params,
        contentId: passage.id,
        title: passage.title,
        subject: passage.title,
        instructions:
          "Read each paragraph, then it hides and you say it back in two sentences. From the third paragraph on, give the previous one in a single sentence, then the new one in a single sentence.",
        cue: "Say it in two sentences.",
        turns,
        ...timing,
      };
    }
    case "explain_simple": {
      const topic = EXPLAIN_TOPICS.find((t) => t.id === contentId) ?? pick(pool(EXPLAIN_TOPICS, level), seed);
      return {
        type,
        level,
        params,
        contentId: topic.id,
        title: "Explain it simply",
        subject: topic.text,
        instructions: `Explain it like you're talking to a ten-year-old: short sentences, everyday words, and one example. About ${budget} seconds.`,
        cue: "Short sentences. Everyday words.",
        turns: [
          {
            show: topic.text,
            eyebrow: "Explain",
            hideWhileSpeaking: false,
            keyWords: topic.keep,
            rolling: false,
            sentenceLimit: 99,
            budgetSeconds: budget,
            example: topic.example,
          },
        ],
        ...timing,
      };
    }
  }
}
