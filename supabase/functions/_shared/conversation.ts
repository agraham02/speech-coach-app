// How a live conversation is metered and voiced. Pure, so jest tests it and
// the edge function (ai-converse) imports it.
//
// Minutes are measured by the server, never reported by the phone: each turn
// is charged the time since the conversation's previous call, capped, so the
// count is what the person actually spent talking (their reply, the partner's
// line, the pauses), and an app left open between turns costs at most one cap.

export interface ConversationSpan {
  // The conversation's first and latest calls (any status but refunded).
  firstAt: Date;
  lastAt: Date;
}

// About 2.6 words a second: an unhurried speaking pace (156 a minute).
const WORDS_PER_SECOND = 2.6;

export function speechSecondsFor(text: string): number {
  const words = text.trim().split(/\s+/).filter(Boolean).length;
  return words / WORDS_PER_SECOND;
}

// Seconds to charge for one turn, or null when the conversation has run past
// its length (the phone ends it before then; this is the server's backstop).
// The first call is charged the opener's speaking time, at least 3 s.
export function conversationCharge(args: {
  span: ConversationSpan | null;
  now: Date;
  // The text the partner will say on a first call (the opener).
  firstLine?: string;
  maxTurnSeconds: number;
  maxMinutes: number;
}): number | null {
  const { span, now } = args;
  if (!span) return Math.round(Math.max(3, speechSecondsFor(args.firstLine ?? "")) * 10) / 10;
  // A minute of grace past the limit: the partner's closing line and voice.
  if (now.getTime() - span.firstAt.getTime() > (args.maxMinutes + 1) * 60_000) return null;
  const gap = (now.getTime() - span.lastAt.getTime()) / 1000;
  return Math.round(Math.min(args.maxTurnSeconds, Math.max(0, gap)) * 10) / 10;
}

// ---- the voices ----

// Gemini's prebuilt voices (ai.google.dev/gemini-api/docs/speech-generation,
// read 2026-10-24) with Google's one-word descriptions. The phone offers a
// short list of these; the server accepts only names on this list.
export const TTS_VOICES = {
  Zephyr: "Bright",
  Puck: "Upbeat",
  Charon: "Informative",
  Kore: "Firm",
  Fenrir: "Excitable",
  Leda: "Youthful",
  Orus: "Firm",
  Aoede: "Breezy",
  Callirrhoe: "Easy-going",
  Autonoe: "Bright",
  Enceladus: "Breathy",
  Iapetus: "Clear",
  Umbriel: "Easy-going",
  Algieba: "Smooth",
  Despina: "Smooth",
  Erinome: "Clear",
  Algenib: "Gravelly",
  Rasalgethi: "Informative",
  Laomedeia: "Upbeat",
  Achernar: "Soft",
  Alnilam: "Firm",
  Schedar: "Even",
  Gacrux: "Mature",
  Pulcherrima: "Forward",
  Achird: "Friendly",
  Zubenelgenubi: "Casual",
  Vindemiatrix: "Gentle",
  Sadachbia: "Lively",
  Sadaltager: "Knowledgeable",
  Sulafat: "Warm",
} as const;

export type TtsVoice = keyof typeof TTS_VOICES;
export const TTS_VOICE_NAMES = Object.keys(TTS_VOICES) as TtsVoice[];

// How the partner says a line. The text model picks one per line; the speech
// model gets the words for it as its style annotation. Kept to everyday
// moods so the voice never sounds staged.
export const PARTNER_MOODS = {
  warm: "warm and relaxed, like chatting with someone you like",
  curious: "genuinely curious and interested",
  amused: "amused, smiling while talking",
  surprised: "pleasantly surprised",
  thoughtful: "thoughtful, unhurried",
  sympathetic: "kind and sympathetic",
  excited: "lightly excited, upbeat",
  matter_of_fact: "relaxed and matter-of-fact",
} as const;

export type PartnerMood = keyof typeof PARTNER_MOODS;
export const PARTNER_MOOD_NAMES = Object.keys(PARTNER_MOODS) as PartnerMood[];

// Gemini's speech is 24 kHz, mono, 16-bit PCM; billed at 25 tokens a second.
export const TTS_SAMPLE_RATE = 24_000;
export const AUDIO_TOKENS_PER_SECOND = 25;

export function pcmSeconds(bytes: number, sampleRate = TTS_SAMPLE_RATE): number {
  return bytes / (sampleRate * 2);
}

// A line spoken with nothing that could steer the speech model: no angle
// brackets (its inline tags), no control characters, and short.
export function speakableText(text: string, max = 600): string {
  return text
    .replace(/[<>[\]{}]/g, " ")
    .replace(/[\u0000-\u001F\u007F]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, max);
}
