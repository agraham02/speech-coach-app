// The things an inner critic says before you speak, offered as one-tap
// starting points in onboarding and in Talk back. The words are the ones
// people actually use — you can add your own too. Pure.

export interface PresetThought {
  id: string;
  text: string;
  // Which of your own practice speaks to it (see evidence.ts).
  evidence: "replies" | "general";
}

export const PRESET_THOUGHTS: PresetThought[] = [
  { id: "stupid", text: "I'll sound stupid", evidence: "general" },
  { id: "ramble", text: "I'll ramble on and on", evidence: "general" },
  { id: "blank", text: "I'll blank and have nothing to say", evidence: "replies" },
  { id: "nervous", text: "Everyone can tell I'm nervous", evidence: "general" },
  { id: "boring", text: "I'm boring", evidence: "general" },
  { id: "voice", text: "My voice sounds bad", evidence: "general" },
  { id: "others", text: "Everyone else is better at this", evidence: "general" },
];

// Thoughts of your own, beyond the presets.
export const MAX_CUSTOM_THOUGHTS = 3;

export const presetById = (id: string | null | undefined): PresetThought | undefined => PRESET_THOUGHTS.find((p) => p.id === id);

// 1-5 felt-true ratings: a drop of one or more is worth saying out loud.
export function beliefChange(before: number, after: number): "lighter" | "same" | "heavier" {
  if (after < before) return "lighter";
  if (after > before) return "heavier";
  return "same";
}
