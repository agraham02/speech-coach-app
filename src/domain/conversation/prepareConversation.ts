import {
  CALLBACK_SCRIPTS,
  EVERYDAY_QUESTIONS,
  GROUP_SCENES,
  PARTNER_ITEMS,
  REACTION_LINES,
  SQUEEZE_TOPICS,
  type PartnerItem,
  type PartnerLine,
} from "../../content/conversationContent";
import { contentLevel, paramsFor, type ConversationDrillType, type DrillParams } from "../drills/drillSpecs";
import { contentWords } from "./text";

// Turns (conversation drill, level, seed, optional content) into the turns
// the conversation screen plays and the windows it scores against. Pure.

export interface ConversationTurn {
  // What the partner says before you reply (spoken, and shown as text —
  // iPhones in silent mode don't play speech).
  lines: PartnerLine[];
  // Words a follow-up could pick up.
  threads: string[];
  // Silent wait before the mic opens (hold one word).
  holdSeconds?: number;
  // Answer budget (land the plane / squeeze).
  budgetSeconds?: number;
  // Any of these in this reply counts as a callback.
  callbackWords?: string[];
}

export interface ConversationSetup {
  type: ConversationDrillType;
  level: number;
  params: DrillParams;
  contentId: string;
  title: string;
  instructions: string;
  // One-line reminder shown while you reply.
  cue: string;
  turns: ConversationTurn[];
  // A reply that starts within this window counts as "in time". Replying
  // fast is never penalized.
  replyWindowMs: number;
  // No speech by then: the turn ends quietly as "no reply".
  maxWaitMs: number;
  // Silence after speech that ends the reply.
  endSilenceMs: number;
  // Hard cap on one reply.
  maxReplyMs: number;
  // Self-rated drills (react) ask this 1–5 question at the end.
  selfRatingQuestion?: string;
}

export interface ReplayMoment {
  id: string;
  text: string;
}

function pick<T>(items: T[], seed: number): T {
  return items[Math.abs(seed) % items.length];
}

function pool<T extends { level: number }>(items: T[], level: number): T[] {
  const cl = contentLevel(level);
  const eligible = items.filter((i) => i.level <= cl);
  return eligible.length ? eligible : items;
}

function partnerTurn(item: PartnerItem): ConversationTurn {
  return { lines: [{ voice: "a", text: item.text }], threads: item.threads };
}

function shortReplyTimings(windowSec: number) {
  return {
    replyWindowMs: Math.round(windowSec * 1000),
    maxWaitMs: Math.round(Math.max(10, windowSec + 6) * 1000),
    endSilenceMs: 2200,
    maxReplyMs: 45_000,
  };
}

export function prepareConversation(
  type: ConversationDrillType,
  level: number,
  seed: number,
  contentId?: string,
  replay?: ReplayMoment,
): ConversationSetup {
  const params = paramsFor(type, level);
  const base = { type, level, params };
  const window = params.replyWindowSec ?? 6;
  const everyday = PARTNER_ITEMS.filter((p) => p.scenario !== "outsider");
  const findItem = (id?: string) => (id ? PARTNER_ITEMS.find((p) => p.id === id) : undefined);

  switch (type) {
    case "conv_reply": {
      const item = findItem(contentId) ?? pick(pool(everyday, level), seed);
      return {
        ...base,
        contentId: item.id,
        title: "Say something back",
        instructions: "Listen, then reply with anything real — a reaction, a question, one sentence of your own. A plain reply beats a perfect one you never say.",
        cue: "Anything real counts.",
        turns: [partnerTurn(item)],
        ...shortReplyTimings(window),
      };
    }
    case "conv_beat": {
      const item = findItem(contentId) ?? pick(pool(everyday, level), seed + 3);
      return {
        ...base,
        contentId: item.id,
        title: "Breathe, then reply",
        instructions: "When they finish, take one easy breath before you answer. A one-to-two-second pause sounds thoughtful, not stuck — and it gives your brain time to find the words.",
        cue: "One breath first.",
        turns: [partnerTurn(item)],
        ...shortReplyTimings(6),
      };
    }
    case "conv_thread":
    case "conv_held":
    case "conv_outsider": {
      const source = type === "conv_outsider" ? PARTNER_ITEMS.filter((p) => p.scenario === "outsider") : everyday;
      const item = findItem(contentId) ?? pick(pool(source, level), seed + (type === "conv_held" ? 7 : 0));
      const held = type === "conv_held";
      return {
        ...base,
        contentId: item.id,
        title: type === "conv_outsider" ? "Be the curious outsider" : held ? "Hold one word" : "Ask about the last thing",
        instructions:
          type === "conv_outsider"
            ? "This is shop talk you don't know — which makes you the perfect person to ask. Ask a how, what or why about something they said."
            : held
              ? "While they talk, pick one word you want to ask about. Keep just that word — not a whole sentence — through the wait, then ask."
              : "Ask a question about something they just said. Use their words. Nothing to plan, nothing to remember.",
        cue: type === "conv_outsider" ? "How… what… why…?" : held ? "Keep one word." : "Ask about what they said.",
        turns: [{ ...partnerTurn(item), holdSeconds: held ? params.holdSeconds : undefined }],
        ...shortReplyTimings(window),
      };
    }
    case "conv_echo": {
      const item = findItem(contentId) ?? pick(pool(everyday, level), seed + 11);
      return {
        ...base,
        contentId: item.id,
        title: "Echo – Ask – Add",
        instructions: "Echo a few of their words back, ask one thing about it, then add one sentence of your own. Three small moves — no wit required.",
        cue: "Echo · Ask · Add",
        turns: [partnerTurn(item)],
        ...shortReplyTimings(window),
        endSilenceMs: 2600,
      };
    }
    case "conv_group": {
      const scenes = pool(GROUP_SCENES, level);
      const scene = GROUP_SCENES.find((s) => s.id === contentId) ?? pick(scenes, seed);
      const turns = scene.exchanges.slice(0, params.turns ?? 2).map((e) => ({ lines: e.lines, threads: e.threads }));
      return {
        ...base,
        contentId: scene.id,
        title: scene.title,
        instructions: "A few people are chatting. After each exchange, jump in — react, ask, or add a line. In a group you don't need the perfect moment, just a moment.",
        cue: "Jump in.",
        turns,
        ...shortReplyTimings(window),
      };
    }
    case "conv_replay": {
      const text = replay?.text?.trim() || "So, what do you think?";
      return {
        ...base,
        contentId: replay?.id ?? "replay",
        title: "Replay a moment you blanked",
        instructions: "Here's what they said. This time, try one of the moves: echo it, ask about it, or say one honest sentence back.",
        cue: "Echo it, ask about it, or say one sentence.",
        turns: [{ lines: [{ voice: "a", text }], threads: contentWords(text).slice(0, 8) }],
        ...shortReplyTimings(window),
      };
    }
    case "land_plane": {
      const q = EVERYDAY_QUESTIONS.find((e) => e.id === contentId) ?? pick(pool(EVERYDAY_QUESTIONS, level), seed);
      const budget = params.budgetSeconds ?? 40;
      return {
        ...base,
        contentId: q.id,
        title: "Land the plane",
        instructions: `Answer, give one reason or example, then stop — about ${budget} seconds. Say your point in the first sentence.`,
        cue: "Point · reason · stop.",
        turns: [{ lines: [{ voice: "a", text: q.text }], threads: [], budgetSeconds: budget }],
        replyWindowMs: 6000,
        maxWaitMs: 15_000,
        endSilenceMs: 3500,
        maxReplyMs: Math.round(budget * 2 * 1000),
      };
    }
    case "squeeze": {
      const topic = SQUEEZE_TOPICS.find((t) => t.id === contentId) ?? pick(SQUEEZE_TOPICS, seed);
      return {
        ...base,
        contentId: topic.id,
        title: "Squeeze it",
        instructions: "Tell one story three times: about a minute, then thirty seconds, then fifteen. Each version keeps the heart of it and drops the detours.",
        cue: "Keep the heart, drop the detours.",
        turns: [
          { lines: [{ voice: "a", text: `${topic.text} Take about a minute.` }], threads: [], budgetSeconds: 60 },
          { lines: [{ voice: "a", text: "Nice. Now tell it again in thirty seconds." }], threads: [], budgetSeconds: 30 },
          { lines: [{ voice: "a", text: "One more time. Fifteen seconds." }], threads: [], budgetSeconds: 15 },
        ],
        replyWindowMs: 6000,
        maxWaitMs: 15_000,
        endSilenceMs: 3500,
        maxReplyMs: 120_000,
      };
    }
    case "callback": {
      const script = CALLBACK_SCRIPTS.find((c) => c.id === contentId) ?? pick(CALLBACK_SCRIPTS, seed);
      const last = script.lines.length - 1;
      return {
        ...base,
        contentId: script.id,
        title: "Call it back",
        instructions: "Reply to each line. In your last reply, bring back something from the very first thing they said — that's a callback, and it's most of what 'wit' is.",
        cue: "Reply — and save a detail for later.",
        turns: script.lines.map((text, i) => ({
          lines: [{ voice: "a" as const, text }],
          threads: i === 0 ? script.callbackWords : contentWords(text).slice(0, 6),
          callbackWords: i === last ? script.callbackWords : undefined,
        })),
        ...shortReplyTimings(params.replyWindowSec ?? 8),
      };
    }
    case "conv_react": {
      const line = REACTION_LINES.find((r) => r.id === contentId) ?? pick(pool(REACTION_LINES, level), seed);
      return {
        ...base,
        contentId: line.id,
        title: "React",
        instructions: "React the way a friend would — a laugh, a 'no way', a playful exaggeration. You're not trying to be funny; you're showing you heard it.",
        cue: "Just react.",
        turns: [{ lines: [{ voice: "a", text: line.text }], threads: [] }],
        ...shortReplyTimings(6),
        selfRatingQuestion: "How present did you feel in that reaction?",
      };
    }
  }
}
