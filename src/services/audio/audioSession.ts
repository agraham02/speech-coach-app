// The app's iOS audio session, set in one place. Several libraries share the
// one AVAudioSession, and each sets it its own way when it starts:
//
// - Speech recognition (expo-speech-recognition: Line of the Day, Move It,
//   Rewind, drills, conversation): this file, RECORDING_SESSION_IOS.
// - Video recording (VisionCamera: impromptu, scripts): playAndRecord,
//   videoRecording mode, speaker, A2DP Bluetooth, mixes with others. Set by
//   VisionCamera itself.
// - Video playback (expo-video: preview, results, history): playback,
//   moviePlayback mode. Set by expo-video itself.
// - Take playback (react-native-audio-api, services/audio/clipPlayer.ts):
//   PLAYBACK_SESSION_IOS.
//
// Whoever starts last wins, so each surface must set what it needs rather
// than inherit what the last one left. Left to its defaults, the recognizer
// asked for Bluetooth HFP (the phone-call profile: AirPods record and play at
// call quality) and saved takes at 16 kHz, and listen-back played in
// whatever session the last recording left.
//
// None of this touches the camera: VisionCamera sets its own session when it
// records, and none of it touches the Dynamic Island timer (ActivityKit, no
// audio at all).

// For recording through the speech recognizer.
// - playAndRecord: the recognizer needs the microphone.
// - measurement: no automatic gain or voice processing, so the live volume
//   meter (projection and pause drills, the waveform) reads your real level.
//   It is what the recognizer used before; the drills' thresholds were tuned
//   with it. It is not a call mode (voiceChat/videoChat are).
// - defaultToSpeaker: anything played while the session is in this category
//   (spoken drill prompts) comes from the speaker, never the earpiece.
// - allowBluetoothA2DP, not allowBluetooth: with AirPods in, sound goes to
//   them at full quality and the iPhone's own microphone records, instead of
//   both dropping to the call profile. VisionCamera does the same.
export const RECORDING_SESSION_IOS = {
  category: "playAndRecord",
  categoryOptions: ["defaultToSpeaker", "allowBluetoothA2DP"],
  mode: "measurement",
} as const;

// Saved takes on iPhone: the microphone's own rate, not 16 kHz (which cuts
// everything above 8 kHz and sounds like a phone line). Analysis and Whisper
// still decode at 16 kHz (audioAnalysis.ts resamples). Android's recognizer
// only records at 16 kHz, and the option is ignored there.
export const RECORDING_SAMPLE_RATE_IOS = 48000;

// For listening back to a take: plain playback. It always plays from the
// speaker (or headphones, or Bluetooth at full quality), ignores the silent
// switch, as listen-back should, and has no earpiece route.
export const PLAYBACK_SESSION_IOS = {
  iosCategory: "playback",
  iosMode: "default",
  iosOptions: [],
} as const;

// For the live conversation partner's voice (services/conversation/
// partnerAudio.ts): the same session the recognizer sets, so going from the
// partner's line to your reply never switches the session (no route change,
// no gap, AirPods stay on A2DP at full quality). It is not a call mode, so
// there is no voice processing and no echo cancellation; that is why the
// conversation is turn-based (the mic is closed while the partner speaks).
// The Dev tab's Partner voices lab can switch to PLAYBACK_SESSION_IOS to
// compare loudness on the speaker (test plan K).
export const CONVERSATION_SESSION_IOS = {
  iosCategory: "playAndRecord",
  iosMode: "measurement",
  iosOptions: ["defaultToSpeaker", "allowBluetoothA2DP"],
} as const;
