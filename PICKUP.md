# Pickup notes — Phase 2 (Audio-First Analysis Pipeline)

Updated 2026-08-09, evening. The original reason this file existed (a Windows
path-length build bug) is **resolved** — see below. A **new, different**
blocker was found via live device testing and is now the active blocker.
Full details live in the plan file; this is the "what just happened and
what's next" summary.

## Where the full plan lives

**`C:\Users\acgra\.claude\plans\okay-a-couple-of-partitioned-owl.md`**

Authoritative, up-to-date roadmap. Read Phase 2's section there — it has two
new "Correction from live implementation (2026-08-09, later same day)" notes
with full technical detail on everything below.

## What got resolved today

The Windows MAX_PATH build bug is **fixed**. The project now lives at
`C:\dev\speech-coach-app` (moved from the old, too-long path) with
`LongPathsEnabled=1` confirmed. `npx expo prebuild --clean --platform android`
+ `npx expo run:android` both succeed cleanly — native CMake/Ninja compiles
for `react-native-audio-api`, `react-native-executorch`,
`react-native-reanimated`, `react-native-mmkv`, and `react-native-skia` all
pass. Also found and fixed a real, separate missing-dependency bug along the
way: `react-native-audio-api`'s JS entry imports `react-native-gesture-handler`
(for a UI component this app doesn't use), which was never installed — fixed
via `npx expo install react-native-gesture-handler`.

**The app now builds, installs, and runs live on an Android emulator**
(Pixel_10a, API 37.1). Confirmed via live MCP-driven interaction: Home screen
renders, navigation works, the full recording flow (camera/mic permission,
live VisionCamera preview, record, stop, review screen) all work correctly.

## The new blocker: `decodeAudioData()` fails on this emulator

Recorded a real session and ran it through the pipeline. `decodeAudioData()`
threw `FFmpegDecoder::openCodec failed: decoder not found`. Root-caused by
pulling the actual recorded `.mp4` off the device and inspecting its raw
bytes: **the audio track is encoded as AMR-NB** (`samr` fourcc), not AAC.
`react-native-audio-api`'s bundled FFmpeg build only supports
`flac, mp3, ogg, opus, wav, aac, m4a, mp4` — no AMR decoder. Confirmed
`react-native-vision-camera` has no `audioCodec` option to force AAC from JS
— the codec choice is entirely up to Android's `CameraX`/`MediaRecorder`
default, and something about this specific emulator image is resolving that
default to AMR-NB.

**This is very likely an emulator-only artifact**, not a real bug in this
app's code — AMR-NB as a CameraX default would be unusual on real hardware.
It is **unconfirmed** without a physical Android device.

The good news: the failure mode itself is handled exactly as designed.
`decodeVideoAudio` returns `null` without throwing, on-device ASR/DSP both
correctly report unavailable, the pipeline falls back to Gemini
transcription per the documented three-way matrix, and — since this app's
Settings has no Gemini API key configured (separate from the `.env` key used
for dev-server purposes) — the session surfaces a clean, accurate
"Processing failed — No Gemini API key set" screen instead of crashing or
hanging. Confirmed this happens the same way whether "Get AI feedback" is on
or off, since transcription itself (not just grading) needs a resolved
transcript source.

## Update: Gemini key added, full pipeline + Result screen degrade paths now confirmed live

Added the Gemini API key (from `.env`) into this app's own Settings screen.
This unblocked the Gemini-fallback transcription path, and a real test
session was graded end-to-end to `done`. Confirmed live on the Result
screen's Scores tab: `WpmSparkline` correctly renders nothing (no crash, no
broken chart) when there's no word-level data, and `PitchVolumeChart`
correctly shows "Not available — no on-device analysis run yet" when
`dsp_status !== 'complete'`. Both are exactly the designed behavior.

**What's left is narrowly the AMR-NB decode issue itself** — everything
downstream of it (fallback transcription, grading, Result screen rendering,
degrade states) is now confirmed working.

## What's NOT done / next steps, in order

1. **Get a real Android device to test on** (the one remaining blocker) —
   if it records AAC (expected), the decode/DSP/ASR pipeline should just
   work with zero code changes, and this whole blocker was emulator-only.
2. Once decode succeeds (real device, or a fixed emulator image): confirm
   Whisper's transcript retains filler tokens ("um"/"uh") — never reached
   yet since on-device ASR shares the same failed decode step.
3. Also once decode succeeds: re-check the Result screen with *real* DSP
   data (not just the degrade states already confirmed above) — real WPM
   sparkline curve, real pitch/volume chart.
4. Update the plan file's Phase 2 verification checkboxes based on what
   actually gets confirmed.
5. Smoke-test `RecordingScreen.tsx`'s `fileType: "mp4", videoCodec: "h264"`
   change on a real device if one becomes available (separate, still-open
   item from before — unrelated to the codec issue above).
6. Only after Phase 2 is reported verified: Phases 3-5 remain, per the plan.

## Housekeeping once this is confirmed working

- Delete this file (`PICKUP.md`) — it's a one-time handoff note, not
  meant to become permanent project documentation.
