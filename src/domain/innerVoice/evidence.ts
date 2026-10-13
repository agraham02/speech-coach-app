import { presetById } from "./thoughts";

// What your own practice says about a worry — shown next to it, so the
// "what doesn't fit?" step has facts to work with, not just reassurance.
// Only things that actually happened are used; with nothing to say, this
// says nothing. Pure.

export interface EvidenceInput {
  presetId: string | null;
  // Turns from your conversation drills (most recent first is fine).
  turns: { replied: boolean; latencyMs: number | null }[];
  // Things you wrote in Three things (any order).
  selfLikes: string[];
  // Different days you have practiced.
  practiceDays: number;
}

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

export function evidenceFor(input: EvidenceInput): string[] {
  const out: string[] = [];
  const preset = presetById(input.presetId);

  // "I'll blank": did you reply, in the drills that practice exactly that?
  if (preset?.evidence === "replies" && input.turns.length > 0) {
    const replied = input.turns.filter((t) => t.replied);
    out.push(`In your conversation drills you replied on ${replied.length} of ${plural(input.turns.length, "turn", "turns")}.`);
    const quick = replied.map((t) => t.latencyMs).filter((v): v is number => typeof v === "number");
    if (quick.length >= 3) {
      const median = [...quick].sort((a, b) => a - b)[Math.floor(quick.length / 2)];
      out.push(`A typical reply came about ${(median / 1000).toFixed(1)} seconds after they finished.`);
    }
  }

  if (input.practiceDays >= 3) out.push(`You've shown up to practice on ${plural(input.practiceDays, "day", "days")}.`);

  for (const like of input.selfLikes.slice(0, 3)) out.push(`You wrote: “${like}”`);

  return out;
}
