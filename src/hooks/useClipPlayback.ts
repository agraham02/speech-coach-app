import { useCallback, useEffect, useRef, useState } from "react";
import type { AudioBuffer } from "react-native-audio-api";
import { loadClip, startClip, stopClip } from "../services/audio/clipPlayer";
import { atEnd, clampMs } from "../domain/playback/followAlong";

export interface ClipPlayback {
  positionMs: number;
  durationMs: number;
  playing: boolean;
  loading: boolean;
  rate: number;
  failed: boolean;
  togglePlay: () => void;
  // Jumps to `ms`. Keeps playing if it was; `play: true` starts it too.
  seek: (ms: number, options?: { play?: boolean }) => void;
  setRate: (rate: number) => void;
}

// A saved WAV as a transport: play, pause, seek, speed and where it is —
// for the Rewind player. Decodes the file on the first play (or seek), so
// opening a result costs nothing until you listen. `knownDurationMs` fills
// the scrubber before then.
export function useClipPlayback(uri: string | null, knownDurationMs: number): ClipPlayback {
  const [positionMs, setPositionMs] = useState(0);
  const [durationMs, setDurationMs] = useState(knownDurationMs);
  const [playing, setPlaying] = useState(false);
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);
  const [rate, setRateState] = useState(1);
  const buffer = useRef<AudioBuffer | null>(null);
  const position = useRef(0);
  const alive = useRef(true);
  // Bumped on every start or stop, so a late start from an earlier tap
  // can't resume playback that has since been paused.
  const generation = useRef(0);

  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
      generation.current++;
      stopClip();
    };
  }, []);

  useEffect(() => {
    buffer.current = null;
    position.current = 0;
    setPositionMs(0);
    setPlaying(false);
    setFailed(false);
  }, [uri]);

  useEffect(() => {
    if (!buffer.current) setDurationMs(knownDurationMs);
  }, [knownDurationMs]);

  const moveTo = useCallback((ms: number) => {
    position.current = ms;
    setPositionMs(ms);
  }, []);

  const ensureBuffer = useCallback(async (): Promise<AudioBuffer | null> => {
    if (buffer.current) return buffer.current;
    if (!uri) return null;
    setLoading(true);
    const loaded = await loadClip(uri);
    if (!alive.current) return null;
    setLoading(false);
    if (!loaded) {
      setFailed(true);
      return null;
    }
    buffer.current = loaded;
    setDurationMs(Math.round(loaded.duration * 1000));
    return loaded;
  }, [uri]);

  const startAt = useCallback(
    async (ms: number, atRate: number) => {
      const run = ++generation.current;
      const decoded = await ensureBuffer();
      if (!alive.current || run !== generation.current) return;
      if (!decoded) {
        setPlaying(false);
        return;
      }
      const total = Math.round(decoded.duration * 1000);
      const from = atEnd(ms, total) ? 0 : clampMs(ms, total);
      moveTo(from);
      const ok = await startClip(decoded, {
        offsetMs: from,
        rate: atRate,
        onPosition: (at) => alive.current && moveTo(clampMs(at, total)),
        onFinished: () => {
          if (!alive.current) return;
          moveTo(total);
          setPlaying(false);
        },
      });
      if (!alive.current || run !== generation.current) return;
      setPlaying(ok);
      if (!ok) setFailed(true);
    },
    [ensureBuffer, moveTo],
  );

  const pause = useCallback(() => {
    generation.current++;
    stopClip();
    setPlaying(false);
  }, []);

  const togglePlay = useCallback(() => {
    if (playing) pause();
    else {
      setPlaying(true);
      startAt(position.current, rate);
    }
  }, [playing, pause, startAt, rate]);

  const seek = useCallback(
    (ms: number, options?: { play?: boolean }) => {
      const target = clampMs(ms, durationMs);
      moveTo(target);
      if (playing || options?.play) {
        setPlaying(true);
        startAt(target, rate);
      }
    },
    [durationMs, moveTo, playing, startAt, rate],
  );

  const setRate = useCallback(
    (next: number) => {
      setRateState(next);
      if (playing) startAt(position.current, next);
    },
    [playing, startAt],
  );

  return { positionMs, durationMs, playing, loading, rate, failed, togglePlay, seek, setRate };
}
