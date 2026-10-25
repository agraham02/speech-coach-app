import { useCallback, useEffect, useRef, useState } from "react";
import { loadMoment, markProgressSeen, type LoadedMoment } from "../services/progress/progressMoments";
import { subscribeToProgress, watchSessionProgress } from "../services/progress/progressEvents";
import { celebrate } from "../components/celebrate/CelebrationHost";
import { BEAT_GAP_MS } from "../components/celebrate/ProgressReveal";

// A take's progress moment for its Result screen: loads it (and again when
// it settles), marks this screen as watching so the pipeline doesn't toast
// over it, and the first time it plays, marks it seen and opens the stage
// celebration once the beats have landed. It plays when the card is on screen
// (`visible`), not when it arrives: someone reading further down would miss the
// whole thing. Leaving before then leaves it unseen, so Today offers it again.
// The beats play every time the screen is opened and the card is scrolled to
// (`animate`; `playing` once it has begun), so it is never just there with
// nothing to see; only the first viewing marks the moment seen and opens the
// stage celebration.
export function useProgressMoment(sessionId: string, enabled: boolean, visible = true) {
  const [moment, setMoment] = useState<LoadedMoment | null>(null);
  const [playing, setPlaying] = useState(false);
  const played = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const load = useCallback(() => {
    if (!enabled) return;
    loadMoment(sessionId).then((m) => {
      if (!m) return;
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

  // The first time it is both there and in view, it plays.
  const firstViewing = useRef<boolean | null>(null);
  if (moment && firstViewing.current === null) firstViewing.current = !moment.seen;
  useEffect(() => {
    if (!moment || !visible || played.current) return;
    played.current = true;
    setPlaying(true);
    // Seen before: the beats play again, quietly, with nothing to mark or celebrate.
    if (!firstViewing.current) return;
    const landed = 200 + moment.beats.length * BEAT_GAP_MS + 900;
    const stage = moment.beats.find((b) => b.kind === "stage");
    timer.current = setTimeout(() => {
      markProgressSeen(sessionId).catch(() => undefined);
      if (stage && stage.kind === "stage") celebrate({ kind: "stage", skill: stage.skill, stage: stage.stage, speakerLevel: stage.speakerLevel });
    }, landed);
  }, [moment, visible, sessionId]);

  return { moment, animate: moment !== null, playing };
}
