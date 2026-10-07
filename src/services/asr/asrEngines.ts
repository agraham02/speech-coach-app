import { Platform } from "react-native";
import { File, Paths } from "expo-file-system";
import { decodeVideoAudio, type DecodedAudio } from "../../domain/audioAnalysis";
import { encodeWavPcm16 } from "../../domain/eval/wer";
import { transcribeOnDevice } from "../onDeviceAsr/onDeviceAsrClient";
import { getAppleProvider } from "../onDeviceLlm/onDeviceCoach";

// Interchangeable transcription engines for the ASR Lab. Each takes the
// already-decoded audio so every engine hears exactly the same input.

export interface AsrEngine {
  id: "whisper" | "apple" | "system";
  label: string;
  isAvailable(): boolean;
  transcribe(audio: DecodedAudio): Promise<string>;
}

const whisper: AsrEngine = {
  id: "whisper",
  label: "Whisper base.en (current default)",
  isAvailable: () => true,
  async transcribe(audio) {
    const result = await transcribeOnDevice(audio.waveform);
    if (!result) throw new Error("Whisper returned nothing");
    return result.text;
  },
};

// Apple SpeechAnalyzer (iOS 26), file-based, no download (system model).
const apple: AsrEngine = {
  id: "apple",
  label: "Apple SpeechAnalyzer (iOS 26)",
  isAvailable: () => Platform.OS === "ios" && getAppleProvider() !== null,
  async transcribe(audio) {
    const provider = getAppleProvider() as unknown as { transcriptionModel: () => unknown } | null;
    if (!provider) throw new Error("Apple provider unavailable");
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { experimental_transcribe } = require("ai") as typeof import("ai");
    const result = await experimental_transcribe({
      model: provider.transcriptionModel() as Parameters<typeof experimental_transcribe>[0]["model"],
      audio: encodeWavPcm16(audio.waveform, audio.sampleRate),
    });
    return result.text;
  },
};

// The OS recognizer (SFSpeechRecognizer / Android SpeechRecognizer) run over
// a WAV file, on-device where supported — the same engine the live drills
// use, so its filler handling matters for the filler buzzer.
const system: AsrEngine = {
  id: "system",
  label: "System recognizer (file mode)",
  isAvailable: () => {
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { ExpoSpeechRecognitionModule } = require("expo-speech-recognition");
      return ExpoSpeechRecognitionModule.isRecognitionAvailable();
    } catch {
      return false;
    }
  },
  transcribe(audio) {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { ExpoSpeechRecognitionModule } = require("expo-speech-recognition");
    const file = new File(Paths.cache, "asr-lab.wav");
    if (file.exists) file.delete();
    file.create();
    file.write(encodeWavPcm16(audio.waveform, audio.sampleRate));

    return new Promise<string>((resolve, reject) => {
      const finals: string[] = [];
      let partial = "";
      const subs = [
        ExpoSpeechRecognitionModule.addListener("result", (e: { isFinal: boolean; results: { transcript: string }[] }) => {
          const text = e.results?.[0]?.transcript ?? "";
          if (e.isFinal) {
            if (text) finals.push(text);
            partial = "";
          } else partial = text;
        }),
        ExpoSpeechRecognitionModule.addListener("error", (e: { error: string; message: string }) => {
          if (e.error !== "no-speech") {
            cleanup();
            reject(new Error(`${e.error}: ${e.message}`));
          }
        }),
        ExpoSpeechRecognitionModule.addListener("end", () => {
          cleanup();
          resolve([...finals, partial].filter(Boolean).join(" "));
        }),
      ];
      function cleanup() {
        subs.forEach((s: { remove(): void }) => s.remove());
      }
      ExpoSpeechRecognitionModule.start({
        lang: "en-US",
        interimResults: true,
        continuous: true,
        requiresOnDeviceRecognition: ExpoSpeechRecognitionModule.supportsOnDeviceRecognition(),
        addsPunctuation: false,
        audioSource: { uri: file.uri, sampleRate: audio.sampleRate },
      });
    });
  },
};

export const ASR_ENGINES: AsrEngine[] = [whisper, apple, system];

export async function decodeForLab(videoUri: string): Promise<DecodedAudio | null> {
  return decodeVideoAudio(videoUri);
}
