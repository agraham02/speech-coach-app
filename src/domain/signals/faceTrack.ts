import { BLENDSHAPE_NAMES, expressionFromBlendshapes } from "../faceSignals";
import { PRESENCE_THRESHOLDS_VERSION, type PresenceMetrics, type PresenceSample } from "../presenceMetrics";
import { packInt16, packUint32, packUint8, unpackInt16, unpackUint32, unpackUint8 } from "./pack";
import type { FaceTrack, PresenceStats } from "./types";

// The face timeline as a packed track: one entry per detection. Pose and
// gaze are stored as measured (gaze already flipped where the platform needs
// it); the expression numbers come back from the blendshapes, so they can be
// redefined later without re-recording. Pure.

export const FACE_MODEL = { name: "mediapipe-face-landmarker", version: "0.10.35" };

const NAMES = BLENDSHAPE_NAMES as readonly string[];
const BS_COUNT = NAMES.length;

export function packFaceTrack(timeline: PresenceSample[]): FaceTrack {
  const n = timeline.length;
  const spanMs = n > 1 ? timeline[n - 1].tMs - timeline[0].tMs : 0;
  const withBs = timeline.some((s) => s.bs && s.bs.length === BS_COUNT);
  const bs = new Uint8Array(withBs ? n * BS_COUNT : 0);
  if (withBs) {
    timeline.forEach((s, i) => {
      if (!s.bs || s.bs.length !== BS_COUNT) return;
      for (let k = 0; k < BS_COUNT; k++) bs[i * BS_COUNT + k] = Math.max(0, Math.min(255, Math.round(s.bs[k] * 255)));
    });
  }
  return {
    extractor: { ...FACE_MODEL, thresholdsVersion: PRESENCE_THRESHOLDS_VERSION },
    rateHz: spanMs > 0 ? Math.round(((n - 1) / (spanMs / 1000)) * 10) / 10 : 0,
    samples: n,
    tMs: packUint32(timeline.map((s) => s.tMs)),
    flags: packUint8(timeline.map((s) => (s.present ? 1 : 0) | (s.framed ? 2 : 0))),
    yawDeg: packInt16(timeline.map((s) => s.yaw * 10)),
    pitchDeg: packInt16(timeline.map((s) => s.pitch * 10)),
    rollDeg: packInt16(timeline.map((s) => (s.roll ?? 0) * 10)),
    gazeX: packInt16(timeline.map((s) => (s.gazeX ?? 0) * 1000)),
    gazeY: packInt16(timeline.map((s) => (s.gazeY ?? 0) * 1000)),
    blinks: packUint8(timeline.map((s) => s.blinks ?? 0)),
    blendshapes: withBs ? packUint8(bs) : "",
  };
}

export function unpackFaceTrack(track: FaceTrack): PresenceSample[] {
  const t = unpackUint32(track.tMs);
  const flags = unpackUint8(track.flags);
  const yaw = unpackInt16(track.yawDeg);
  const pitch = unpackInt16(track.pitchDeg);
  const roll = unpackInt16(track.rollDeg);
  const gx = unpackInt16(track.gazeX);
  const gy = unpackInt16(track.gazeY);
  const blinks = unpackUint8(track.blinks);
  const bs = track.blendshapes ? unpackUint8(track.blendshapes) : null;
  const out: PresenceSample[] = [];
  for (let i = 0; i < track.samples; i++) {
    const present = (flags[i] & 1) === 1;
    const framed = (flags[i] & 2) === 2;
    if (!present) {
      out.push({ tMs: t[i], present: false, yaw: 0, pitch: 0, smile: 0, eyesOpen: 0, framed: false, blinks: blinks[i] });
      continue;
    }
    const row = bs && bs.length >= (i + 1) * BS_COUNT ? bs.subarray(i * BS_COUNT, (i + 1) * BS_COUNT) : null;
    const get = (name: string) => {
      const k = NAMES.indexOf(name);
      return row && k >= 0 ? row[k] / 255 : 0;
    };
    out.push({
      tMs: t[i],
      present: true,
      yaw: yaw[i] / 10,
      pitch: pitch[i] / 10,
      roll: roll[i] / 10,
      ...expressionFromBlendshapes(get),
      framed,
      gazeX: gx[i] / 1000,
      gazeY: gy[i] / 1000,
      blinks: blinks[i],
    });
  }
  return out;
}

export function presenceStatsOf(m: PresenceMetrics): PresenceStats {
  return {
    eyeContactShare: m.eyeContactPercent / 100,
    lookingDownShare: m.lookingDownPercent != null ? m.lookingDownPercent / 100 : null,
    lookingUpShare: m.lookingUpPercent != null ? m.lookingUpPercent / 100 : null,
    blinksPerMinute: m.blinksPerMinute,
    expressiveness: m.expressiveness,
    headMovementDeg: m.headMovement,
    nodsPerMinute: m.nodsPerMinute ?? null,
    smileShare: m.smilePercent / 100,
  };
}

export function faceQualityReasons(m: PresenceMetrics): string[] {
  const out: string[] = [];
  if (m.presentPercent < 60) out.push(`face lost ${100 - m.presentPercent}% of the time`);
  if (m.detectionRateHz != null && m.detectionRateHz < 12) out.push(`face checked ${m.detectionRateHz} times a second`);
  return out;
}

// A compact, column-wise copy of the timeline for the Dev export.
export function timelineColumns(timeline: PresenceSample[]) {
  const r = (v: number | undefined, d: number) => (v === undefined ? null : Math.round(v * 10 ** d) / 10 ** d);
  return {
    tMs: timeline.map((s) => s.tMs),
    present: timeline.map((s) => (s.present ? 1 : 0)),
    framed: timeline.map((s) => (s.framed ? 1 : 0)),
    yaw: timeline.map((s) => r(s.yaw, 1)),
    pitch: timeline.map((s) => r(s.pitch, 1)),
    roll: timeline.map((s) => r(s.roll, 1)),
    gazeX: timeline.map((s) => r(s.gazeX, 3)),
    gazeY: timeline.map((s) => r(s.gazeY, 3)),
    eyesOpen: timeline.map((s) => r(s.eyesOpen, 2)),
    smile: timeline.map((s) => r(s.smile, 2)),
    cheekSquint: timeline.map((s) => r(s.cheekSquint, 2)),
    browRaise: timeline.map((s) => r(s.browRaise, 2)),
    jawOpen: timeline.map((s) => r(s.jawOpen, 2)),
    blinks: timeline.map((s) => s.blinks ?? 0),
  };
}
