import type { PathStatus } from "./path";

// The finale: the one moment for finishing your whole path, after the last
// unit's own celebration. Pure helpers; the screen is PathFinaleScreen and
// the trigger lives in services/path/pathService.ts.

// Finished means nothing is left to work on: every unit is done, apart from
// any the skill check showed you have already. A path with nothing done yet
// (all shown in the check) doesn't count, since there was no work to finish.
export function isPathComplete(units: { status: PathStatus }[]): boolean {
  if (!units.some((u) => u.status === "done")) return false;
  return !units.some((u) => u.status === "active" || u.status === "upcoming");
}

export interface FinaleFacts {
  units: number;
  lessons: number;
  // Units the skill check marked as shown already.
  shown: number;
  speakerLevel: number | null;
}

// "11 units and 34 lessons" plus what the check covered.
export function describeFinale(facts: FinaleFacts): string {
  const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;
  let text = `${plural(facts.units, "unit")} and ${plural(facts.lessons, "lesson")}`;
  if (facts.shown > 0) text += `, plus ${plural(facts.shown, "unit")} your skill check showed you had already`;
  return text + ".";
}

// Seneca, Letters to Lucilius 76.3: "tamdiu discendum est, quemadmodum
// vivas, quamdiu vivas". Translations vary; this is a close, common one.
export const FINALE_QUOTE = {
  text: "As long as you live, keep learning how to live.",
  attribution: "Seneca, Letters to Lucilius",
};
