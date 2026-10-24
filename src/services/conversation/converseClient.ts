import { randomUUID } from "expo-crypto";
import type { TonoAllowance } from "../../domain/aiAllowance";
import { NdjsonReader, toConverseEvent, type ConverseEvent } from "../../domain/conversation/live/stream";
import type { HistoryItem } from "../../domain/conversation/live/turnMachine";
import type { LiveFocus, LiveScene } from "../../domain/conversation/live/prepareLive";
import { ensureAccount } from "../account/accountStore";
import { reportAllowance, tonoStream } from "../tono/tonoApi";

// The phone's side of ai-converse (supabase/functions/ai-converse): asks for
// the partner's next line ("turn") or for a line to be spoken ("speak"), and
// hands the streamed events over as they arrive: the words, the audio
// chunks, then the timings. The phone sends what was said and the scene,
// never a prompt; the server writes the prompt and meters the minutes.

export const CONVERSATION_TURN_SCHEMA_VERSION = 1;

// Nothing for this long: the connection has gone. The line itself comes in
// about a second; this only catches a stall.
const IDLE_MS = 15_000;

export interface TurnRequest {
  op: "turn";
  conversationId: string;
  voice: string;
  scene: LiveScene;
  focus: LiveFocus;
  level: 1 | 2 | 3;
  history: HistoryItem[];
  turnsLeft: number;
  stutterMode: boolean;
}

export interface SpeakRequest {
  op: "speak";
  conversationId: string;
  voice: string;
  text: string;
  mood?: string;
}

export interface ConverseHandlers {
  onEvent: (event: ConverseEvent) => void;
}

export function newConversationId(): string {
  return `conv_${randomUUID().replace(/-/g, "")}`.slice(0, 40);
}

function bodyFor(r: TurnRequest | SpeakRequest): Record<string, unknown> {
  const idempotencyKey = randomUUID().replace(/-/g, "");
  if (r.op === "speak") return { op: "speak", text: r.text, ...(r.mood ? { mood: r.mood } : {}), voice: r.voice, conversationId: r.conversationId, idempotencyKey };
  return {
    op: "turn",
    schemaVersion: CONVERSATION_TURN_SCHEMA_VERSION,
    inputs: { scene: r.scene, focus: r.focus, level: r.level, history: r.history, turnsLeft: r.turnsLeft, stutterMode: r.stutterMode },
    voice: r.voice,
    conversationId: r.conversationId,
    idempotencyKey,
  };
}

function isAllowance(v: unknown): v is TonoAllowance {
  return !!v && typeof v === "object" && typeof (v as TonoAllowance).takesLeft === "number" && typeof (v as TonoAllowance).tier === "string";
}

// Runs one request to the end. Throws TonoApiError for a refusal (minutes
// used up, Plus needed), TypeError or TimeoutError for no connection.
export async function converse(request: TurnRequest | SpeakRequest, handlers: ConverseHandlers, signal?: AbortSignal): Promise<void> {
  await ensureAccount();
  const reader = new NdjsonReader();
  const emit = (raw: unknown) => {
    const event = toConverseEvent(raw);
    if (!event) return;
    if (event.type === "done" && isAllowance(event.allowance)) reportAllowance(event.allowance);
    handlers.onEvent(event);
  };
  await tonoStream("ai-converse", bodyFor(request), (text) => reader.push(text).forEach(emit), { idleMs: IDLE_MS, signal });
  reader.end().forEach(emit);
}
