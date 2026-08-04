import scriptsData from "../../data/scripts.json";
import type { Script } from "../../domain/scriptTypes";

// Scripts are a static curated list (no AI, no DB table), same pattern as
// promptsRepo.ts's TOPICS.
const SCRIPTS = scriptsData as Script[];

export function getAllScripts(): Script[] {
  return SCRIPTS;
}

export function getScriptById(id: string): Script | undefined {
  return SCRIPTS.find((s) => s.id === id);
}
