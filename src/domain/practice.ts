// Where a practice step was launched from, so its screen can report back
// when it's done: a step of today's plan and/or a lesson.
export interface PracticeContext {
  planDate?: string;
  planStepId?: string;
  lessonId?: string;
  lessonStepIndex?: number;
}
