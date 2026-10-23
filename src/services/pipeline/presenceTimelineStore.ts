import type { PresenceSample } from "../../domain/presenceMetrics";

// Hands the face timeline from the Recording screen to createSessionFromTake
// without pushing ~1,500 samples through navigation params. Keyed by the
// take's preview file URI; consumed once.
const pending = new Map<string, PresenceSample[]>();

export function stashPresenceTimeline(previewUri: string, timeline: PresenceSample[] | null): void {
  if (timeline && timeline.length > 0) pending.set(previewUri, timeline);
}

export function takePresenceTimeline(previewUri: string): PresenceSample[] | null {
  const timeline = pending.get(previewUri) ?? null;
  pending.delete(previewUri);
  return timeline;
}
