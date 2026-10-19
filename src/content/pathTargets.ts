import type { EventKind, Obstacle, SpeakingContext } from "../domain/profile";
import type { SkillCheckInput } from "../domain/skillCheck";

// What pulls a unit forward on your path (domain/path.ts): the things you
// said get in your way, an event coming up, where you speak, and what the
// skill check heard. Each entry names units, not whole skills — that's what
// makes two people's paths differ — and carries the line shown as the
// reason ("You said you ramble").

export const OBSTACLE_UNITS: Record<Obstacle, string[]> = {
  ramble: ["imp_short", "conv_straight", "imp_structure"],
  blank: ["imp_start", "conv_moves", "imp_feet"],
  fillers: ["cad_pause"],
  nerves: ["con_nerves", "con_breath"],
  monotone: ["cad_pitch", "cad_melody"],
  fast: ["cad_pace", "cad_pause"],
  mumble: ["art_wake", "art_sounds"],
  quiet: ["con_authority", "con_breath"],
  unsure: ["con_authority", "cad_pitch"],
  eye_contact: ["con_presence"],
  feelings: [],
};

export const OBSTACLE_REASONS: Record<Obstacle, string> = {
  ramble: "You said you ramble",
  blank: "You said you blank",
  fillers: "You said filler words get in",
  nerves: "You said nerves get in the way",
  monotone: "You said your voice goes flat",
  fast: "You said you talk too fast",
  mumble: "You said words run together",
  quiet: "You said your voice is too quiet",
  unsure: "You said you sound unsure",
  eye_contact: "You said eye contact is hard",
  feelings: "You want to put feelings into words",
};

export const EVENT_UNITS: Record<EventKind, string[]> = {
  interview: ["imp_structure", "imp_short", "con_nerves"],
  talk: ["cad_pause", "cad_pace", "con_presence"],
  toast: ["cad_pause", "cad_melody", "con_nerves"],
  pitch: ["imp_short", "con_authority", "cad_pause"],
  date: ["conv_attention", "conv_moves", "conv_edges"],
  other: ["con_nerves"],
};

export const CONTEXT_UNITS: Record<SpeakingContext, string[]> = {
  meetings: ["imp_short", "conv_straight"],
  presentations: ["cad_pause", "con_presence"],
  interviews: ["imp_structure", "imp_short"],
  social: ["conv_attention", "conv_edges", "conv_wit"],
  everyday: ["conv_moves", "conv_attention"],
  camera: ["con_presence", "cad_melody"],
  leading: ["con_authority", "conv_straight", "imp_structure"],
  school: ["imp_structure", "cad_pause"],
};

export const CONTEXT_REASONS: Record<SpeakingContext, string> = {
  meetings: "For your meetings",
  presentations: "For your presentations",
  interviews: "For interviews",
  social: "For dating and social life",
  everyday: "For everyday conversation",
  camera: "For speaking on camera",
  leading: "For leading a team",
  school: "For school",
};

// What the skill check measured that points at a unit. `test` reads the
// check's raw measurements; `text` is the reason, in plain words.
export interface CheckSignal {
  units: string[];
  test: (input: SkillCheckInput) => boolean;
  text: (input: SkillCheckInput) => string;
}

export const CHECK_SIGNALS: CheckSignal[] = [
  {
    units: ["art_wake", "art_sounds"],
    test: (i) => i.readAccuracy != null && i.readAccuracy < 80,
    text: () => "Your skill check: some words got lost",
  },
  {
    units: ["cad_pace"],
    test: (i) => (i.talkWpm ?? i.readWpm ?? 0) > 175,
    text: (i) => `Your skill check: about ${Math.round(i.talkWpm ?? i.readWpm ?? 0)} words a minute`,
  },
  {
    units: ["cad_pause"],
    test: (i) => (i.boundaryPauseRate != null && i.boundaryPauseRate < 0.3) || (!i.stutterMode && (i.fillerRatePerMinute ?? 0) > 6),
    text: (i) =>
      !i.stutterMode && (i.fillerRatePerMinute ?? 0) > 6 ? "Your skill check: filler words filled the gaps" : "Your skill check: sentences ran together",
  },
  {
    units: ["cad_pitch"],
    test: (i) => i.pitchRangeHz != null && i.pitchRangeHz < 50,
    text: () => "Your skill check: your pitch stayed narrow",
  },
  {
    units: ["imp_start"],
    test: (i) => i.categoryCount != null && !!i.categoryTarget && i.categoryCount / i.categoryTarget < 0.5,
    text: () => "Your skill check: words came slowly",
  },
  {
    units: ["imp_structure"],
    test: (i) => i.structured === false,
    text: () => "Your skill check: the answer lacked a shape",
  },
  {
    units: ["con_presence"],
    test: (i) => i.eyeContactPercent != null && i.eyeContactPercent < 40,
    text: () => "Your skill check: eyes were mostly away",
  },
  {
    units: ["con_authority"],
    test: (i) => (i.hedgeCount ?? 0) >= 4 || i.strongEnding === false,
    text: (i) => ((i.hedgeCount ?? 0) >= 4 ? "Your skill check: hedges softened your points" : "Your skill check: the ending trailed off"),
  },
  {
    units: ["conv_moves"],
    test: (i) => i.replyLatencyMs != null && i.replyLatencyMs > 4000,
    text: () => "Your skill check: replies took a while to start",
  },
];
