import type { PartnerVoice } from "../../content/conversationContent";

// Picks distinct-sounding text-to-speech voices for the partner roles so a
// group scene doesn't sound like one person talking to themself. Pure.

export interface VoiceInfo {
  identifier: string;
  language: string;
  name?: string;
  quality?: string;
}

export interface VoiceStyle {
  voice?: string;
  pitch: number;
  rate: number;
}

// When there aren't enough distinct voices, pitch keeps the roles apart.
const FALLBACK_PITCH: Record<PartnerVoice, number> = { a: 1.0, b: 0.85, c: 1.15 };

export function assignPartnerVoices(voices: VoiceInfo[]): Record<PartnerVoice, VoiceStyle> {
  const english = voices.filter((v) => /^en[-_]/i.test(v.language));
  // US first, then other English; enhanced before default; stable by id.
  const ranked = [...english].sort((x, y) => {
    const us = Number(/^en[-_]us/i.test(y.language)) - Number(/^en[-_]us/i.test(x.language));
    if (us !== 0) return us;
    const q = Number(y.quality === "Enhanced") - Number(x.quality === "Enhanced");
    if (q !== 0) return q;
    return x.identifier.localeCompare(y.identifier);
  });
  // Skip novelty voices (iOS ships some whose names make them sound like robots or bells).
  const usable = ranked.filter((v) => !/(bell|bubble|organ|whisper|zarvox|trinoids|cellos|bahh|boing|wobble|jester|superstar|albert|bad news|good news|fred|junior|ralph)/i.test(v.name ?? ""));
  const roles: PartnerVoice[] = ["a", "b", "c"];
  const out = {} as Record<PartnerVoice, VoiceStyle>;
  roles.forEach((role, i) => {
    const v = usable[i];
    // With a distinct voice, a neutral pitch sounds most natural.
    out[role] = v ? { voice: v.identifier, pitch: 1.0, rate: 1.0 } : { voice: usable[0]?.identifier, pitch: FALLBACK_PITCH[role], rate: 1.0 };
  });
  return out;
}
