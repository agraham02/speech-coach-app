import { useCallback, useEffect, useRef, useState } from "react";
import type { TurnMeasurement } from "../domain/conversation/evaluateConversation";
import { fullText } from "../domain/speech/liveTranscript";
import { logger } from "../utils/logger";
import type { useLiveSpeech } from "./useLiveSpeech";

type Speech = ReturnType<typeof useLiveSpeech>;

const POLL_MS = 200;

export interface SpokenTurnTiming {
  // Silence after speech that ends the answer.
  endSilenceMs: number;
  // No speech by then: the turn ends quietly as "no answer".
  maxWaitMs: number;
  // Hard cap on one answer.
  maxReplyMs: number;
}

// One spoken answer on the live recognizer: opens the mic, and ends on
// silence after speech, on a long wait with none, or at the hard cap (the
// recognizer itself never stops on silence). Hands back the measurement the
// scorers read. The same loop the conversation drills run, minus the partner.
export function useSpokenTurn(speech: Speech, timing: SpokenTurnTiming | null, onDone: (measurement: TurnMeasurement) => void) {
  const [listening, setListening] = useState(false);
  const [elapsedMs, setElapsedMs] = useState(0);
  const startRef = useRef(0);
  const endingRef = useRef(false);
  const timingRef = useRef(timing);
  timingRef.current = timing;
  const onDoneRef = useRef(onDone);
  onDoneRef.current = onDone;

  const finish = useCallback(async () => {
    if (endingRef.current) return;
    endingRef.current = true;
    setListening(false);
    // A failed turn still gets a slot, so measurement i lines up with turn i.
    let measurement: TurnMeasurement = {
      transcript: "",
      partnerEndAt: startRef.current,
      listenStartAt: startRef.current,
      volume: [],
      firstResultAt: null,
      lastResultAt: null,
    };
    try {
      const transcript = await speech.session.stop();
      measurement = {
        ...measurement,
        transcript: fullText(transcript),
        segments: transcript.committed.map((u) => u.text),
        volume: [...speech.session.getVolumeSamples()],
        firstResultAt: transcript.firstResultAtMs,
        lastResultAt: transcript.lastResultAtMs,
      };
    } catch (error) {
      logger.error(`[summary] stopping recognition failed — ${(error as Error).message}`);
    }
    onDoneRef.current(measurement);
  }, [speech.session]);

  const begin = useCallback(() => {
    endingRef.current = false;
    speech.session.start({ volumeMeter: true, volumeIntervalMs: 100, punctuation: true });
    startRef.current = Date.now();
    setElapsedMs(0);
    setListening(true);
  }, [speech.session]);

  useEffect(() => {
    if (!listening) return;
    const timer = setInterval(() => {
      const t = timingRef.current;
      if (!t) return;
      const now = Date.now();
      const elapsed = now - startRef.current;
      setElapsedMs(elapsed);
      const snap = speech.session.getSnapshot();
      const heard = fullText(snap.transcript).trim().length > 0;
      const last = snap.transcript.lastResultAtMs;
      if (heard && last != null && now - last >= t.endSilenceMs) finish();
      else if (!heard && elapsed >= t.maxWaitMs) finish();
      else if (elapsed >= t.maxReplyMs) finish();
    }, POLL_MS);
    return () => clearInterval(timer);
  }, [listening, speech.session, finish]);

  return { listening, elapsedMs, begin, finish };
}
