import { EVERYDAY_QUESTIONS, PARTNER_ITEMS, REACTION_LINES, type PartnerItem } from "../../../content/conversationContent";
import { LIVE_SETTINGS, QUESTION_SETTING, type LivePersona, type LiveSetting } from "../../../content/liveScenes";
import { contentLevel } from "../../drills/drillSpecs";

// A live conversation's setup (Tono Plus): who the partner is, how it opens,
// what move it practices, and the turn-taking timings. Pure.
//
// The timings are lenient on purpose. Blanking and rambling are what's being
// practiced, so the phone waits through a thinking pause before it decides a
// reply is over, waits a long time before treating silence as a blank, and
// never cuts a reply short until a generous cap.

export const LIVE_FOCUSES = ["reply", "beat", "thread", "echo", "hold", "outsider", "land", "react", "open", "exit"] as const;
export type LiveFocus = (typeof LIVE_FOCUSES)[number];

export interface LiveTiming {
  // After the partner's last word, before the mic opens: the tail of the
  // speaker's own sound must not reach the recognizer.
  micOpenDelayMs: number;
  // Silence after speech that ends a reply (longer after a connecting word,
  // see endpoint.ts).
  endSilenceMs: number;
  // No speech by then: a blank. The partner carries on, as a kind person would.
  blankWaitMs: number;
  // The cap on one reply; past it the partner picks up where they were.
  maxReplyMs: number;
}

export interface LiveScene {
  setting: string;
  partner: { name: string; role: string; mood?: string };
  opener: string;
  details?: string[];
}

export interface LiveSetup {
  focus: LiveFocus;
  level: number;
  // 1-3, for the content pool and the partner's register.
  contentLevel: 1 | 2 | 3;
  contentId: string;
  title: string;
  instructions: string;
  // One line shown while you reply.
  cue: string;
  scene: LiveScene;
  personaVoice: string;
  // Replies before the partner wraps up.
  maxReplies: number;
  // The phone ends the conversation by then (the server allows a little more).
  maxConversationMs: number;
  timing: LiveTiming;
}

export const FOCUS_COPY: Record<LiveFocus, { title: string; instructions: string; cue: string }> = {
  reply: {
    title: "Just talk",
    instructions: "A real back-and-forth. Reply with anything real: a reaction, a question, a line of your own. A plain reply beats a perfect one you never say.",
    cue: "Anything real counts.",
  },
  beat: {
    title: "Take a beat",
    instructions: "Each time they finish, take one easy breath, then reply. A short pause sounds thoughtful, and it gives you time to find the words.",
    cue: "One breath first.",
  },
  thread: {
    title: "Follow the thread",
    instructions: "Keep the conversation going by asking about the last thing they said. Use their words. Nothing to plan, nothing to remember.",
    cue: "Ask about what they said.",
  },
  echo: {
    title: "Echo, ask, add",
    instructions: "Echo a few of their words, ask one thing about it, then add a line of your own. Three small moves, every turn if you like.",
    cue: "Echo · Ask · Add",
  },
  hold: {
    title: "Hold one word",
    instructions: "While they talk, keep just one word you want to ask about, not a whole sentence. When it's your turn, build the question from it.",
    cue: "Keep one word.",
  },
  outsider: {
    title: "The curious outsider",
    instructions: "They'll talk about work you don't know. Don't fake it: ask how it works, what's hard about it, or why.",
    cue: "How… what… why…?",
  },
  land: {
    title: "Land the plane",
    instructions: "They'll ask you things. Say your point in the first sentence, give one reason or example, then stop and let them talk.",
    cue: "Point · reason · stop.",
  },
  react: {
    title: "React",
    instructions: "React the way a friend would: a laugh, a 'no way', a question. You're not trying to be funny, just showing you heard it.",
    cue: "Just react.",
  },
  open: {
    title: "Open with what's here",
    instructions: "Keep it plain: something about the moment, then a question. Let their answer be what you pick up next.",
    cue: "Say what's here, then ask.",
  },
  exit: {
    title: "Leave gracefully",
    instructions: "Have a short chat, then end it yourself: something you liked, a reason to go, a clear goodbye.",
    cue: "Something you liked · a reason · goodbye.",
  },
};

// The lessons a live conversation can follow, and the move each practices.
export const LESSON_FOCUS: Record<string, LiveFocus> = {
  conv_1_check: "reply",
  conv_2_spark: "thread",
  conv_3_safety: "reply",
  conv_4_gap: "beat",
  conv_5_enough: "reply",
  conv_6_echo: "echo",
  conv_7_thread: "thread",
  conv_8_story: "thread",
  conv_9_metoo: "echo",
  conv_10_hold: "hold",
  conv_11_recover: "beat",
  conv_12_outsider: "outsider",
  conv_13_group: "react",
  conv_23_open: "open",
  conv_24_exit: "exit",
  conv_14_headline: "land",
  conv_15_land: "land",
  conv_16_squeeze: "land",
  conv_17_detours: "land",
  conv_18_offer: "land",
  conv_19_react: "react",
  conv_20_callback: "thread",
  conv_21_exaggerate: "react",
  conv_22_tease: "react",
};

export function focusForLesson(lessonId: string | undefined): LiveFocus | null {
  return lessonId ? LESSON_FOCUS[lessonId] ?? null : null;
}

const clampLevel = (level: number) => Math.max(1, Math.min(10, Math.round(level)));

export function timingFor(focus: LiveFocus, level: number): LiveTiming {
  const l = clampLevel(level);
  return {
    micOpenDelayMs: 300,
    // People pause mid-answer when they're asked for a point and a reason.
    endSilenceMs: focus === "land" ? 2000 : 1500,
    // 10 s at level 1, 6.4 s at level 10.
    blankWaitMs: Math.round(10_000 - (l - 1) * 400),
    maxReplyMs: focus === "land" ? 45_000 : 60_000,
  };
}

export function maxRepliesFor(level: number): number {
  const l = clampLevel(level);
  return l <= 3 ? 4 : l <= 6 ? 5 : 6;
}

export const MAX_CONVERSATION_MS = 6 * 60_000;

function pick<T>(items: T[], seed: number): T {
  return items[Math.abs(Math.floor(seed)) % items.length];
}

function pool<T extends { level: number }>(items: T[], cl: number): T[] {
  const eligible = items.filter((i) => i.level <= cl);
  return eligible.length ? eligible : items;
}

function personaFrom(setting: LiveSetting, seed: number): LivePersona {
  return pick(setting.personas, seed);
}

export function prepareLive(focus: LiveFocus, level: number, seed: number, contentId?: string): LiveSetup {
  const cl = contentLevel(level);
  let opener: string;
  let id: string;
  let setting: LiveSetting;
  if (focus === "land") {
    const q = EVERYDAY_QUESTIONS.find((e) => e.id === contentId) ?? pick(pool(EVERYDAY_QUESTIONS, cl), seed);
    opener = q.text;
    id = q.id;
    setting = QUESTION_SETTING;
  } else if (focus === "react") {
    const r = REACTION_LINES.find((e) => e.id === contentId) ?? pick(pool(REACTION_LINES, cl), seed);
    opener = r.text;
    id = r.id;
    setting = LIVE_SETTINGS.friends;
  } else {
    const source: PartnerItem[] = focus === "outsider" ? PARTNER_ITEMS.filter((p) => p.scenario === "outsider") : PARTNER_ITEMS.filter((p) => p.scenario !== "outsider");
    const item = source.find((p) => p.id === contentId) ?? pick(pool(source, cl), seed);
    opener = item.text;
    id = item.id;
    setting = LIVE_SETTINGS[item.scenario];
  }
  const persona = personaFrom(setting, seed + 1);
  const copy = FOCUS_COPY[focus];
  return {
    focus,
    level,
    contentLevel: cl,
    contentId: id,
    title: copy.title,
    instructions: copy.instructions,
    cue: copy.cue,
    scene: {
      setting: setting.setting,
      partner: { name: persona.name, role: persona.role, ...(persona.mood ? { mood: persona.mood } : {}) },
      opener,
    },
    personaVoice: persona.voice,
    maxReplies: maxRepliesFor(level),
    maxConversationMs: MAX_CONVERSATION_MS,
    timing: timingFor(focus, level),
  };
}
