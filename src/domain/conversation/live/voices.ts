// The partner's voice in a live conversation: Gemini's prebuilt voices, the
// short list the app offers, and the speed. Pure.
//
// Picked for an everyday chat partner, not a narrator: Google describes these
// as friendly, warm, easy-going, casual or gentle. They are a first cut; the
// Dev tab's Partner voices lab is where Ahmad listens to them on the phone and
// the test plan (K) records which ones to keep. Names in the server's list:
// supabase/functions/_shared/conversation.ts (TTS_VOICES); a test keeps the
// two in step.

export interface PartnerVoiceOption {
  id: string;
  // Google's own word for it.
  description: string;
}

export const PARTNER_VOICES: PartnerVoiceOption[] = [
  { id: "Achird", description: "Friendly" },
  { id: "Sulafat", description: "Warm" },
  { id: "Callirrhoe", description: "Easy-going" },
  { id: "Umbriel", description: "Easy-going" },
  { id: "Zubenelgenubi", description: "Casual" },
  { id: "Vindemiatrix", description: "Gentle" },
];

// More voices the lab can compare (and that personas may use), beyond the
// short list in Settings.
export const LAB_EXTRA_VOICES: PartnerVoiceOption[] = [
  { id: "Sadachbia", description: "Lively" },
  { id: "Sadaltager", description: "Knowledgeable" },
  { id: "Charon", description: "Informative" },
  { id: "Aoede", description: "Breezy" },
  { id: "Achernar", description: "Soft" },
  { id: "Kore", description: "Firm" },
  { id: "Puck", description: "Upbeat" },
  { id: "Schedar", description: "Even" },
];

export const DEFAULT_PARTNER_VOICE = "Achird";

// "persona": each person in a conversation has their own voice (the scene
// says which); otherwise one chosen voice for everyone.
export type PartnerVoicePref = "persona" | string;

export function voiceFor(pref: PartnerVoicePref, personaVoice: string): string {
  if (pref === "persona") return personaVoice;
  return [...PARTNER_VOICES, ...LAB_EXTRA_VOICES].some((v) => v.id === pref) ? pref : personaVoice;
}

// Speed is applied on the phone (playback rate with pitch kept), so it costs
// nothing and changes at once. A narrow range: past about 15% either way a
// voice starts to sound processed, which is the tiring listen to avoid.
export const SPEED_MIN = 0.85;
export const SPEED_MAX = 1.15;
export const SPEED_STEPS = [0.85, 0.9, 0.95, 1, 1.05, 1.1, 1.15] as const;

export function clampSpeed(speed: number): number {
  if (!Number.isFinite(speed)) return 1;
  return Math.round(Math.min(SPEED_MAX, Math.max(SPEED_MIN, speed)) * 100) / 100;
}

export function speedLabel(speed: number): string {
  const s = clampSpeed(speed);
  if (s === 1) return "Normal";
  return s < 1 ? `${Math.round((1 - s) * 100)}% slower` : `${Math.round((s - 1) * 100)}% faster`;
}
