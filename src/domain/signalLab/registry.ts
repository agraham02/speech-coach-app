import { CLARITY_TESTS } from "./clarityTests";
import { CONTENT_TESTS } from "./contentTests";
import { PRESENCE_TESTS } from "./presenceTests";
import { VOICE_TESTS } from "./voiceTests";
import type { LabGroup, LabTestEntry } from "./types";

// Every Signal Lab test, in the order the lab shows and runs them.
export const LAB_TESTS: LabTestEntry[] = [...VOICE_TESTS, ...CLARITY_TESTS, ...PRESENCE_TESTS, ...CONTENT_TESTS];

export function labTest(id: string): LabTestEntry | undefined {
  return LAB_TESTS.find((t) => t.def.id === id);
}

export function labTestsIn(group: LabGroup): LabTestEntry[] {
  return LAB_TESTS.filter((t) => t.def.group === group);
}
