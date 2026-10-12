import type { GradingContext } from "../gemini/transcribeSession";
import { getPrompt } from "../db/promptsRepo";
import { getScriptById } from "../db/scriptsRepo";
import type { PlanText } from "../../domain/planYourPoint";
import { ADHOC_PROMPT_PREFIX, type Prompt, type RecordingSubject, type Session } from "../../domain/sessionTypes";

// Rebuilds everything about what a saved session was "about" from its DB
// row, in one place. History, Result, Notion, Retake/"Practice again" and
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
  };
}

async function resolvePrompt(session: Session): Promise<Prompt | undefined> {
  if (session.promptId.startsWith(ADHOC_PROMPT_PREFIX)) {
    const extras = session.subjectExtras;
    if (!extras?.promptText) return undefined;
    return { id: session.promptId, category: extras.promptCategory ?? "Practice", text: extras.promptText, difficultyTier: null };
  }
  return getPrompt(session.promptId);
}

export async function gradingContextFromSession(session: Session): Promise<GradingContext | null> {
  const subject = await subjectFromSession(session);
  if (!subject) return null;
  return subject.kind === "script"
    ? { kind: "script", script: subject.script, cuesEnabled: subject.cuesEnabled, markLevel: subject.markLevel }
    : { kind: "prompt", promptText: subject.prompt.text, planText: subject.planText };
}

export interface SessionSubjectSummary {
  title: string;
  category: string | null;
  typeLabel: string;
}

const TYPE_LABELS: Record<Session["sessionType"], string> = {
  spontaneous: "Impromptu",
  concise: "Concise",
  free_record: "Free record",
  script_practice: "Speech",
};

// What to show for a session in lists and the journal.
export async function describeSessionSubject(session: Session): Promise<SessionSubjectSummary> {
  const typeLabel = TYPE_LABELS[session.sessionType] ?? "Session";
  if (session.sessionType === "script_practice") {
    const script = session.scriptId ? getScriptById(session.scriptId) : undefined;
    return { title: script?.title ?? "Script practice", category: script?.category ?? null, typeLabel };
  }
  const prompt = await resolvePrompt(session);
  return { title: prompt?.text ?? "Practice session", category: prompt?.category ?? null, typeLabel };
}
