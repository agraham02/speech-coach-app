// The trust status of each reading (docs/overhaul/PLAN.md, section 6.2 and
// 6.5): a reading that isn't proven doesn't count towards a score. "Probation"
// is a sensor that has never been proven on a phone; "tuning" is a sensor that
// works but whose formula needs a quick check. Either way the reading shows
// with a Beta label, and the score leaves it out until it passes its tests in
// Signal Lab and this file says so.
//
// Changing a status here is the only way a reading goes live, so it's reviewed
// and logged (docs/overhaul/DECISIONS.md). A Dev preview switch can count a
// reading early for testing; it never applies outside dev builds.

export type TrustStatus = "now" | "probation" | "tuning";

export type ReadingId =
  | "sentence_end_pauses"
  | "deliberate_pauses"
  | "pitch_variety"
  | "endings_fall"
  | "stand_out_stress"
  | "stress_right_words"
  | "volume_carry"
  | "on_the_lens"
  | "long_lookaways"
  | "face_movement"
  | "range_across_feelings";

export interface ReadingDef {
  id: ReadingId;
  label: string;
  status: TrustStatus;
  // The Signal Lab tests that must all pass before this reading is promoted.
  tests: string[];
}

export const READINGS: Record<ReadingId, ReadingDef> = {
  sentence_end_pauses: { id: "sentence_end_pauses", label: "Pauses at sentence ends", status: "probation", tests: ["voice.pauses"] },
  deliberate_pauses: { id: "deliberate_pauses", label: "Deliberate pauses", status: "probation", tests: ["voice.pauses"] },
  pitch_variety: { id: "pitch_variety", label: "Pitch variety", status: "probation", tests: ["voice.pitch_variety", "voice.pitch_glide"] },
  endings_fall: { id: "endings_fall", label: "Endings that fall", status: "probation", tests: ["voice.endings"] },
  stand_out_stress: { id: "stand_out_stress", label: "Stand-out stress", status: "probation", tests: ["voice.emphasis"] },
  stress_right_words: { id: "stress_right_words", label: "Stress on the right words", status: "probation", tests: ["voice.word_stress"] },
  volume_carry: { id: "volume_carry", label: "Volume carry", status: "probation", tests: ["voice.volume_gain", "voice.volume_distance"] },
  on_the_lens: { id: "on_the_lens", label: "Eye contact on the lens", status: "tuning", tests: ["presence.looking", "presence.glances", "presence.preview"] },
  long_lookaways: { id: "long_lookaways", label: "Long look-aways", status: "tuning", tests: ["presence.glances"] },
  face_movement: { id: "face_movement", label: "Face movement", status: "tuning", tests: ["presence.expression", "presence.face_events"] },
  range_across_feelings: { id: "range_across_feelings", label: "Range across feelings", status: "probation", tests: ["voice.pitch_variety", "presence.expression"] },
};

export const READING_IDS = Object.keys(READINGS) as ReadingId[];

// Dev-only: readings counted early to preview how scores would change.
export type ReadingPreview = Partial<Record<ReadingId, boolean>>;

// Whether a reading counts towards a score right now. `preview` is only passed
// in dev builds (the Signal Lab switch); production code never passes it.
export function readingCounts(id: ReadingId, preview?: ReadingPreview): boolean {
  if (preview?.[id] === true) return true;
  return READINGS[id].status === "now";
}

export function trustLabel(status: TrustStatus): string {
  return status === "now" ? "Counts" : status === "tuning" ? "Beta · being tuned" : "Beta · not proven yet";
}
