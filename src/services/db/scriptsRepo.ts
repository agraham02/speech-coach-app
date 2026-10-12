import { getSpeeches } from "../../content/speeches";
import { tokenizeScript, type Script } from "../../domain/scriptTypes";

// Scripts are the Speeches shelf: static content (content/speeches.ts) with
// marks, no DB table.
let scripts: Script[] | null = null;

export function getAllScripts(): Script[] {
  if (!scripts) {
    scripts = getSpeeches().map((s) => ({
      id: s.id,
      title: s.title,
      category: s.category,
      text: s.text,
      wordCount: tokenizeScript(s.text).length,
      targetDurationSeconds: s.targetDurationSeconds,
      marks: s.marks,
    }));
  }
  return scripts;
}

export function getScriptById(id: string): Script | undefined {
  return getAllScripts().find((s) => s.id === id);
}
