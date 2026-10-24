import { useCallback, useEffect, useReducer, useRef, useState } from "react";
import { AppState } from "react-native";
import type { TurnMeasurement } from "../domain/conversation/evaluateConversation";
import type { LiveSetup } from "../domain/conversation/live/prepareLive";
import { latencySummary, type TurnLatency } from "../domain/conversation/live/stream";
import {
  historyOf,
  initialLiveState,
  liveReducer,
  readingDelayMs,
  turnsLeftAfterNext,
  type FailReason,
  type LiveEvent,
  type LiveState,
} from "../domain/conversation/live/turnMachine";
import { FIRST_RESULT_LATENCY_MS, fullText } from "../domain/speech/liveTranscript";
import { converse, newConversationId, type SpeakRequest, type TurnRequest } from "../services/conversation/converseClient";
import { PartnerLinePlayer } from "../services/conversation/partnerAudio";
import { stutterMode } from "../services/analysis/inputs";
import { TonoApiError } from "../services/tono/tonoError";
import { TimeoutError } from "../utils/fetchWithTimeout";
import { logger } from "../utils/logger";
import { useLiveSpeech } from "./useLiveSpeech";

// Drives a live conversation: the turn machine (domain/conversation/live/
// turnMachine.ts) decides; this hook does what each phase needs. Asks the
// server for the partner's line, plays it as it streams, opens the mic a
// moment after the last word, feeds the recognizer's progress back for the
// end-of-reply decision, closes the mic and hands over the reply.
//
// The person's words are never shown while they reply (watching yourself is
// the habit this skill trains away from); the screen only knows the phase.

// A volume reading above this (the recognizer's -2..10 meter) counts as voice
// for the end-of-reply decision. Untuned: the test plan (K) checks it.
const VOICE_LEVEL = 1;
const TICK_MS = 100;
// How long stopping the recognizer may wait for its last words. Shorter than
// the drills' default: the reply already ended on a pause, so the words are
// in, and every millisecond here is the partner's silence.
const STOP_GRACE_MS = 500;

export interface LiveOptions {
  voice: string;
  speed: number;
}

function failureOf(error: unknown): { reason: FailReason; retryable: boolean; message?: string } {
  if (error instanceof TonoApiError) {
    switch (error.code) {
      case "quota_exhausted":
      case "conversation_over":
        return { reason: "quota", retryable: false };
      case "plus_cost_cap":
        return { reason: "cost_cap", retryable: false };
      case "plus_required":
        return { reason: "not_entitled", retryable: false };
      case "disabled":
        return { reason: "kill_switch", retryable: false };
      case "signed_out":
        return { reason: "offline", retryable: true };
      default:
        return { reason: "error", retryable: error.status >= 500 || error.status === 409, message: error.message };
    }
  }
  if (error instanceof TypeError || error instanceof TimeoutError) return { reason: "offline", retryable: true };
  return { reason: "error", retryable: true, message: (error as Error)?.message };
}

export function useLiveConversation(setup: LiveSetup | null, options: LiveOptions) {
  const speech = useLiveSpeech();
  const setupRef = useRef(setup);
  setupRef.current = setup;
  const optionsRef = useRef(options);
  optionsRef.current = options;

  const reducer = useCallback((s: LiveState, e: LiveEvent) => (setupRef.current ? liveReducer(setupRef.current, s, e) : s), []);
  const [state, dispatch] = useReducer(reducer, undefined, initialLiveState);
  const stateRef = useRef(state);
  stateRef.current = state;

  const conversationIdRef = useRef<string>(newConversationId());
  const playerRef = useRef<PartnerLinePlayer | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const requestedForRef = useRef<string | null>(null);
  const silentTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [latencies, setLatencies] = useState<TurnLatency[]>([]);
  const [voiceFailed, setVoiceFailed] = useState(false);

  const stopPartner = useCallback(() => {
    if (silentTimerRef.current) clearTimeout(silentTimerRef.current);
    silentTimerRef.current = null;
    playerRef.current?.stop();
    playerRef.current = null;
  }, []);

  // ---- asking for the partner's line ----
  const request = useCallback(async (key: string) => {
    const s = stateRef.current;
    const live = setupRef.current;
    if (!live) return;
    const opts = optionsRef.current;
    const opening = s.turns.length === 0;
    const turnsLeft = opening ? 1 : turnsLeftAfterNext(s, live, Date.now());
    const body: TurnRequest | SpeakRequest = opening
      ? { op: "speak", conversationId: conversationIdRef.current, voice: opts.voice, text: live.scene.opener, mood: "warm" }
      : {
          op: "turn",
          conversationId: conversationIdRef.current,
          voice: opts.voice,
          scene: live.scene,
          focus: live.focus,
          level: live.contentLevel,
          history: historyOf(s),
          turnsLeft,
          stutterMode: stutterMode(),
        };
    const latency: TurnLatency = { sentAt: Date.now(), lineAt: null, firstAudioAt: null, doneAt: null, server: null };
    const controller = new AbortController();
    abortRef.current = controller;
    let player: PartnerLinePlayer | null = null;
    let gotLine = false;
    let lineFinished = false;
    const log = () => {
      const summary = latencySummary(latency);
      logger.info(`[live] turn ${s.turns.length}: words ${summary.toLineMs ?? "-"} ms, first sound ${summary.toFirstAudioMs ?? "-"} ms, server ${JSON.stringify(latency.server)}`);
    };
    const finishLine = (text: string, hadVoice: boolean) => {
      if (lineFinished) return;
      lineFinished = true;
      if (hadVoice && player) {
        player.finish();
        return;
      }
      // No voice: the words stay on screen for about reading time.
      setVoiceFailed(true);
      log();
      silentTimerRef.current = setTimeout(() => dispatch({ type: "AUDIO_END", now: Date.now() }), readingDelayMs(text));
    };
    let lineText = "";
    let audioChunks = 0;
    try {
      await converse(
        body,
        {
          onEvent: (event) => {
            if (requestedForRef.current !== key) return;
            if (event.type === "line") {
              gotLine = true;
              lineText = event.line;
              latency.lineAt = Date.now();
              player = new PartnerLinePlayer(opts.speed, {
                onStart: () => {
                  latency.firstAudioAt = Date.now();
                  dispatch({ type: "AUDIO_START", now: Date.now() });
                  log();
                },
                onEnd: (how) => {
                  if (how === "played") dispatch({ type: "AUDIO_END", now: Date.now() });
                },
              });
              playerRef.current = player;
              // The closing line closes, whatever the model said.
              dispatch({ type: "LINE", line: { text: event.line, ended: event.ended || (!opening && turnsLeft === 0), safety: event.safety, mood: event.mood }, now: Date.now() });
            } else if (event.type === "audio") {
              audioChunks += 1;
              player?.push(event.pcm);
            } else if (event.type === "done") {
              latency.doneAt = Date.now();
              latency.server = { llmMs: event.timing.llmMs, ttsFirstAudioMs: event.timing.ttsFirstAudioMs, totalMs: event.timing.totalMs };
              finishLine(lineText, audioChunks > 0 && !!event.voice);
            } else if (event.type === "error") {
              if (gotLine) finishLine(lineText, audioChunks > 0);
              else throw new TonoApiError(502, event.code);
            }
          },
        },
        controller.signal,
      );
      if (!gotLine) throw new TonoApiError(502, "no_line");
      // A stream that ended without its last event still plays what came.
      if (latency.doneAt == null) finishLine(lineText, audioChunks > 0);
    } catch (error) {
      if (controller.signal.aborted || requestedForRef.current !== key) return;
      logger.warn(`[live] partner line failed — ${(error as Error)?.message ?? error}`);
      if (gotLine) {
        finishLine(lineText, audioChunks > 0);
      } else {
        dispatch({ type: "FAILED", ...failureOf(error) });
      }
    } finally {
      if (gotLine) setLatencies((prev) => [...prev, latency]);
    }
  }, []);

  // ---- phase effects ----
  const listeningRef = useRef(false);
  useEffect(() => {
    const phase = state.phase;
    if (phase === "opening" || phase === "thinking") {
      const key = `${phase}:${state.turns.length}:${Date.now()}`;
      requestedForRef.current = key;
      void request(key);
    }
    if (phase === "listening" && !listeningRef.current) {
      listeningRef.current = true;
      speech.session.start({ volumeMeter: true, volumeIntervalMs: 100 });
    }
    if (phase === "capturing" && listeningRef.current) {
      listeningRef.current = false;
      const turn = stateRef.current.turns[stateRef.current.turns.length - 1];
      void (async () => {
        let measurement: TurnMeasurement = {
          transcript: "",
          partnerEndAt: turn?.partnerEndedAt ?? Date.now(),
          listenStartAt: turn?.reply?.listenStartAt ?? Date.now(),
          volume: [],
          firstResultAt: null,
          lastResultAt: null,
        };
        try {
          const transcript = await speech.session.stop(STOP_GRACE_MS);
          measurement = {
            ...measurement,
            transcript: fullText(transcript),
            segments: transcript.committed.map((u) => u.text),
            volume: [...speech.session.getVolumeSamples()],
            firstResultAt: transcript.firstResultAtMs,
            lastResultAt: transcript.lastResultAtMs,
          };
        } catch (error) {
          logger.error(`[live] stopping recognition failed — ${(error as Error).message}`);
        }
        dispatch({ type: "CAPTURED", measurement });
      })();
    }
    if (phase === "paused" || phase === "finished" || phase === "failed") {
      abortRef.current?.abort();
      requestedForRef.current = null;
      stopPartner();
      if (listeningRef.current) {
        listeningRef.current = false;
        speech.session.abort();
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.phase, state.turns.length]);

  // The clock for the mic gap and the end-of-reply decision.
  useEffect(() => {
    if (state.phase !== "gap" && state.phase !== "listening") return;
    const timer = setInterval(() => dispatch({ type: "TICK", now: Date.now() }), TICK_MS);
    return () => clearInterval(timer);
  }, [state.phase]);

  // What the recognizer hears, for the end-of-reply decision.
  useEffect(() => {
    if (state.phase !== "listening") return;
    let seen: number | null = null;
    const unsubscribe = speech.session.subscribe(() => {
      const snap = speech.session.getSnapshot();
      const last = snap.transcript.lastResultAtMs;
      // The snapshot also changes with every volume reading; only a new
      // recognizer result is news here.
      if (last == null || last === seen) return;
      seen = last;
      dispatch({ type: "HEARD", transcript: fullText(snap.transcript), at: last - FIRST_RESULT_LATENCY_MS });
    });
    const offVolume = speech.session.onVolume((value) => {
      if (value > VOICE_LEVEL) dispatch({ type: "VOICE", at: Date.now() });
    });
    return () => {
      unsubscribe();
      offVolume();
    };
  }, [state.phase, speech.session]);

  // A phone call or Siri pauses the recognizer; leaving the app pauses all.
  useEffect(() => {
    if (speech.status === "paused" && stateRef.current.phase === "listening") dispatch({ type: "INTERRUPT", now: Date.now() });
  }, [speech.status]);

  useEffect(() => {
    const sub = AppState.addEventListener("change", (next) => {
      if (next !== "active") dispatch({ type: "INTERRUPT", now: Date.now() });
    });
    return () => sub.remove();
  }, []);

  useEffect(
    () => () => {
      abortRef.current?.abort();
      stopPartner();
    },
    [stopPartner],
  );

  const start = useCallback(() => {
    conversationIdRef.current = newConversationId();
    setLatencies([]);
    setVoiceFailed(false);
    dispatch({ type: "START", now: Date.now() });
  }, []);

  const skipPartner = useCallback(() => {
    if (stateRef.current.phase !== "partner") return;
    stopPartner();
    dispatch({ type: "SKIP", now: Date.now() });
  }, [stopPartner]);

  return {
    state,
    latencies,
    voiceFailed,
    volume: speech.volume,
    speechStatus: speech.status,
    prepareMic: () => speech.session.prepare(),
    start,
    done: () => dispatch({ type: "DONE", now: Date.now() }),
    skipPartner,
    end: () => dispatch({ type: "END", now: Date.now() }),
    retry: () => dispatch({ type: "RETRY", now: Date.now() }),
    resume: () => dispatch({ type: "RESUME", now: Date.now() }),
    reset: () => dispatch({ type: "RESET" }),
  };
}
