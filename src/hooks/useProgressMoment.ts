import { useCallback, useEffect, useRef, useState } from "react";
import { loadMoment, markProgressSeen, type LoadedMoment } from "../services/progress/progressMoments";
import { subscribeToProgress, watchSessionProgress } from "../services/progress/progressEvents";
import { celebrate } from "../components/celebrate/CelebrationHost";
import { BEAT_GAP_MS } from "../components/celebrate/ProgressReveal";

// A take's progress moment for its Result screen: loads it (and again when
// it settles), marks this screen as watching so the pipeline doesn't toast
// over it, and the first time it plays, marks it seen and opens the stage
// celebration once the beats have landed. Leaving before then leaves it
// unseen, so Today offers it again. `animate` is true for that first
// viewing only.
export function useProgressMoment(sessionId: string, enabled: boolean) {
  const [moment, setMoment] = useState<LoadedMoment | null>(null);
  const [animate, setAnimate] = useState(false);
  const played = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const load = useCallback(() => {
    if (!enabled) return;
    loadMoment(sessionId).then((m) => {
      if (!m) return;
      if (!m.seen && !played.current) {
        played.current = true;
        setAnimate(true);
        const landed = 200 + m.beats.length * BEAT_GAP_MS + 900;
        const stage = m.beats.find((b) => b.kind === "stage");
        timer.current = setTimeout(() => {
          markProgressSeen(sessionId).catch(() => undefined);
          if (stage && stage.kind === "stage") celebrate({ kind: "stage", skill: stage.skill, stage: stage.stage, speakerLevel: stage.speakerLevel });
        }, landed);
      }
      setMoment(m);
    });
  }, [sessionId, enabled]);

  useEffect(() => {
    if (!enabled) return;
    load();
    const stopWatching = watchSessionProgress(sessionId);
    const unsubscribe = subscribeToProgress((id) => {
      if (id === sessionId) load();
    });
    return () => {
      stopWatching();
      unsubscribe();
      if (timer.current) clearTimeout(timer.current);
    };
  }, [sessionId, enabled, load]);

  return { moment, animate };
}
