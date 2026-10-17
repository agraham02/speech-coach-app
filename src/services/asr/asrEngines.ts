import { Platform } from "react-native";
import { File, Paths } from "expo-file-system";
import { decodeVideoAudio, type DecodedAudio } from "../../domain/audioAnalysis";
import { encodeWavPcm16 } from "../../domain/eval/wer";
import type { TimedWord } from "../../domain/asr/verbatim";
import { getAppleProvider } from "../onDeviceLlm/onDeviceCoach";
import { isModelDownloaded, type WhisperModelId } from "./whisperModels";
import { FILLER_PROMPT, transcribeWithWhisperRn } from "./whisperRn";

// Interchangeable transcription engines for the ASR Lab (Dev tab). Each takes
// the already-decoded audio so every engine hears exactly the same input.

export interface AsrOutput {
  text: string;
  // Present when the engine reports when each word was said.
  words?: TimedWord[];
}

export type AsrEngineId = "apple" | "system" | "turbo" | "turbo-prompted";

export interface AsrEngine {
  id: AsrEngineId;
  label: string;
  // The model this engine needs on the phone, if it is downloaded separately.
  model?: WhisperModelId;
  isAvailable(): boolean;
  transcribe(audio: DecodedAudio): Promise<AsrOutput>;
}

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
    return { text: result.text };
  },
};

// The OS recognizer (SFSpeechRecognizer / Android SpeechRecognizer) run over
// a WAV file, on-device where supported: the same engine the live drills
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
  async transcribe(audio) {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { ExpoSpeechRecognitionModule } = require("expo-speech-recognition");
    const file = new File(Paths.cache, "asr-lab.wav");
    if (file.exists) file.delete();
    file.create();
    file.write(encodeWavPcm16(audio.waveform, audio.sampleRate));

    const text = await new Promise<string>((resolve, reject) => {
      const finals: string[] = [];
      let partial = "";
      const subs = [
        ExpoSpeechRecognitionModule.addListener("result", (e: { isFinal: boolean; results: { transcript: string }[] }) => {
          const piece = e.results?.[0]?.transcript ?? "";
          if (e.isFinal) {
            if (piece) finals.push(piece);
            partial = "";
          } else partial = piece;
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
    return { text };
  },
};

// whisper.cpp through whisper.rn, on a model downloaded in the Lab.
function whisperRnEngine(id: AsrEngineId, label: string, model: WhisperModelId, prompt?: string): AsrEngine {
  return {
    id,
    label,
    model,
    isAvailable: () => isModelDownloaded(model),
    async transcribe(audio) {
      return transcribeWithWhisperRn(model, audio.waveform, { prompt });
    },
  };
}

export const ASR_ENGINES: AsrEngine[] = [
  apple,
  system,
  whisperRnEngine("turbo", "Whisper large-v3-turbo", "turbo-q5"),
  whisperRnEngine("turbo-prompted", "large-v3-turbo + filler prompt (the app's engine)", "turbo-q5", FILLER_PROMPT),
];

export async function decodeForLab(videoUri: string): Promise<DecodedAudio | null> {
  return decodeVideoAudio(videoUri);
}
