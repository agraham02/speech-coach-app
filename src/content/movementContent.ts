import type { Ionicons } from "@expo/vector-icons";

// Move It: big physical actions that wake the voice up. Punch, wring, press,
// slash, flick and float are Laban effort actions — the movement vocabulary
// actors' voice training uses to tie body and voice together.

export interface Movement {
  id: string;
  name: string;
  cue: string;
  icon: keyof typeof Ionicons.glyphMap;
}

export const MOVEMENTS: Movement[] = [
  { id: "punch", name: "Punch", cue: "Punch the air hard on the key word.", icon: "hand-left-outline" },
  { id: "wring", name: "Wring", cue: "Wring out a soaking wet towel through the whole line.", icon: "sync-outline" },
  { id: "point", name: "Point", cue: "Jab a finger at the air on every stressed word.", icon: "arrow-forward-outline" },
  { id: "press", name: "Press", cue: "Push against a heavy wall the whole time you speak.", icon: "push-outline" },
  { id: "throw", name: "Throw", cue: "Throw a ball across the room on the key word.", icon: "baseball-outline" },
  { id: "slash", name: "Slash", cue: "Slash one arm across your body as you say it.", icon: "cut-outline" },
  { id: "pull", name: "Pull", cue: "Pull a rope toward you, hand over hand.", icon: "git-pull-request-outline" },
  { id: "float", name: "Float", cue: "Let your arms drift up, open and light.", icon: "cloud-outline" },
];

export function getMovement(id: string): Movement | undefined {
  return MOVEMENTS.find((m) => m.id === id);
}
