import type { GradingContext } from "../gemini/transcribeSession";
import { getPrompt } from "../db/promptsRepo";
import { getScriptById } from "../db/scriptsRepo";
import type { PlanText } from "../../domain/planYourPoint";
import { taskOf, type PromptTask, type PromptTaskContext } from "../../domain/promptTask";
import { FRAMEWORK_LABELS, type FrameworkId } from "../../domain/coach/structureHeuristics";
import { ADHOC_PROMPT_PREFIX, type Prompt, type RecordingSubject, type Session } from "../../domain/sessionTypes";

// Rebuilds everything about what a saved session was "about" from its DB
// row, in one place. History, Result, Retake/"Practice again" and
// the deep review all used to rebuild this separately — and inconsistently
// (History dropped the PREP plan; scripts showed as "Unknown prompt").

function planTextFor(session: Session): PlanText | undefined {
  if (!session.planPointText && !session.planReasonText && !session.planExampleText) return undefined;
  return {
    point: session.planPointText ?? "",
    reason: session.planReasonText ?? "",
    example: session.planExampleText ?? "",
  };
}

// The full subject, for recording the same prompt/script again.
export async function subjectFromSession(session: Session): Promise<RecordingSubject | null> {
  if (session.sessionType === "script_practice") {
    const script = session.scriptId ? getScriptById(session.scriptId) : undefined;
    if (!script) return null;
    return { kind: "script", script, cuesEnabled: session.cuesEnabled ?? false };
  }
  const prompt = await resolvePrompt(session);
  if (!prompt) return null;
  const extras = session.subjectExtras;
  return {
    kind: "prompt",
    prompt,
    planText: planTextFor(session),
    conciseSeconds: session.sessionType === "concise" ? extras?.conciseSeconds : undefined,
    lessonId: extras?.lessonId,
    targetFramework: extras?.targetFramework,
    feeling: extras?.feelingEmotion ? { emotion: extras.feelingEmotion, angle: extras.feelingAngle ?? 0 } : undefined,
  };
}

async function resolvePrompt(session: Session): Promise<Prompt | undefined> {
  if (session.promptId.startsWith(ADHOC_PROMPT_PREFIX)) {
    const extras = session.subjectExtras;
    if (!extras?.promptText) return undefined;
    return {
      id: session.promptId,
      category: extras.promptCategory ?? "Practice",
      text: extras.promptText,
      difficultyTier: null,
      ...(extras.promptTask ? { task: extras.promptTask } : {}),
    };
  }
  return getPrompt(session.promptId);
}

// What the reviewer is told about the task beyond the prompt's words: what
// it asked for, the structure practiced, how long, and what preparation went
// in. Only what was recorded — an older take simply knows less.
export function taskContextFor(session: Session, prompt: Prompt): PromptTaskContext {
  const extras = session.subjectExtras;
  const framework = extras?.targetFramework as FrameworkId | undefined;
  return {
    task: taskOf(prompt),
    category: prompt.category,
    framework: framework && framework !== "None" ? FRAMEWORK_LABELS[framework] : undefined,
    targetSeconds: extras?.targetSeconds ?? (session.sessionType === "concise" ? extras?.conciseSeconds : undefined),
    prep: extras?.prepUsed,
  };
}

export async function gradingContextFromSession(session: Session): Promise<GradingContext | null> {
  const subject = await subjectFromSession(session);
  if (!subject) return null;
  return subject.kind === "script"
    ? { kind: "script", script: subject.script, cuesEnabled: subject.cuesEnabled, markLevel: subject.markLevel }
    : { kind: "prompt", promptText: subject.prompt.text, planText: subject.planText, taskContext: taskContextFor(session, subject.prompt) };
}

export interface SessionSubjectSummary {
  title: string;
  category: string | null;
  typeLabel: string;
  // What the prompt asked for, when it asked for something particular.
  task: PromptTask | null;
}

const TYPE_LABELS: Record<Session["sessionType"], string> = {
  spontaneous: "Impromptu",
  concise: "Concise",
  free_record: "Free record",
  script_practice: "Speech",
  feeling: "Feeling",
};

// What to show for a session in lists and the journal.
export async function describeSessionSubject(session: Session): Promise<SessionSubjectSummary> {
  const typeLabel = TYPE_LABELS[session.sessionType] ?? "Session";
  if (session.sessionType === "script_practice") {
    const script = session.scriptId ? getScriptById(session.scriptId) : undefined;
    return { title: script?.title ?? "Script practice", category: script?.category ?? null, typeLabel, task: null };
  }
  const prompt = await resolvePrompt(session);
  return { title: prompt?.text ?? "Practice session", category: prompt?.category ?? null, typeLabel, task: prompt ? taskOf(prompt) : null };
}
