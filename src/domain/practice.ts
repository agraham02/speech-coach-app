// Where a practice step was launched from, so its screen can report back
// when it's done: a step of today's plan and/or a lesson.
export interface PracticeContext {
  planDate?: string;
  planStepId?: string;
  // 0 (or missing) = the daily plan; 1-2 = a top-up session.
  planSlot?: number;
  lessonId?: string;
  lessonStepIndex?: number;
  // This rep is a unit's checkpoint: its number decides the checkpoint, and it
  // doesn't tick a lesson step (domain/checkpoint.ts).
  checkpointUnitId?: string;
  // A sample for the skill check's starting levels: it is recorded, but it
  // isn't practice, so it doesn't move a rating or count an attempt. That
  // keeps seedSkillRatings (which skips any skill with attempts) free to place
  // each skill from the check.
  placement?: boolean;
}
