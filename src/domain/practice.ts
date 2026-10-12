// Where a practice step was launched from, so its screen can report back
// when it's done: a step of today's plan and/or a lesson.
export interface PracticeContext {
  planDate?: string;
  planStepId?: string;
  // 0 (or missing) = the daily plan; 1-2 = a top-up session.
  planSlot?: number;
  lessonId?: string;
  lessonStepIndex?: number;
}
