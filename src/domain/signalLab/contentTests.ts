import type { LabTestEntry } from "./types";

// The Content tests (docs/overhaul/PLAN.md, section 6.5, the "Content" rows of
// the test table). Each entry is a definition plus a pure evaluator; the runner
// records the steps, and registry.ts lists them in the lab.
export const CONTENT_TESTS: LabTestEntry[] = [];
