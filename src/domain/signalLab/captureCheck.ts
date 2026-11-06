import type { LabOutcome, LabTestEntry, StepMeasures } from "./types";

// "Check the lab": one short take that proves the capture path works on this
// phone before any real test is run: the recording, the audio decode, the
// pitch and level extractor, and the face tracker. It decides nothing about a
// reading; it passes when audio came through.

const STEP_ID = "say_a_sentence";
const SECONDS = 8;

export const CAPTURE_CHECK: LabTestEntry = {
  def: {
    id: "lab.capture_check",
    group: "setup",
    title: "Capture check",
    summary: "A quick take that proves recording, audio analysis and face tracking work on this phone, before you run the real tests.",
    minutes: 1,
    steps: [
      {
        id: STEP_ID,
        title: "Say a sentence",
        instruction: "Look at the camera and say a few sentences about your day.",
        script: "Today I woke up, made some coffee, and sat down to test how well my phone can hear and see me.",
        seconds: SECONDS,
        capture: "face_take",
      },
    ],
    bars: ["The recording decodes and the audio analysis finds speech.", "Face tracking reports its detection rate (information only)."],
    onFail: "Nothing else in the lab can be trusted until this passes; check the microphone and camera permissions and try again.",
  },
  evaluate(measures: StepMeasures): LabOutcome {
    const m = measures[STEP_ID];
    const audio = m?.audio?.summary;
    if (!m || !audio) {
      return { pass: null, checks: [], summary: "No audio came through, so there is nothing to check.", numbers: {} };
    }
    const heardSpeech = audio.voicedPercent > 5 && audio.frames > 100;
    const face = m.face ?? [];
    const seconds = Math.max(1, m.durationMs / 1000);
    const faceRate = face.length / seconds;
    const present = face.filter((s) => s.present).length;
    return {
      pass: heardSpeech,
      checks: [
        { label: "Audio decoded and speech found", value: `${audio.voicedPercent}% voiced, ${audio.frames} frames`, pass: heardSpeech, bar: "over 5% voiced" },
        { label: "Noise floor", value: `${audio.noiseFloorDb} dBFS`, pass: null },
        { label: "Median pitch", value: audio.medianHz == null ? "none" : `${Math.round(audio.medianHz)} Hz`, pass: null },
        { label: "Face detections", value: `${face.length} samples, ${faceRate.toFixed(1)} a second, face in ${face.length ? Math.round((present / face.length) * 100) : 0}%`, pass: null },
      ],
      summary: heardSpeech ? "Recording and audio analysis work." : "The recording had little or no speech in it.",
      numbers: {
        voicedPercent: audio.voicedPercent,
        frames: audio.frames,
        noiseFloorDb: audio.noiseFloorDb,
        medianHz: audio.medianHz,
        faceSamples: face.length,
        faceRateHz: Math.round(faceRate * 10) / 10,
        facePresentPercent: face.length ? Math.round((present / face.length) * 100) : 0,
      },
    };
  },
};
