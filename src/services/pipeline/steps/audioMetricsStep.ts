import { getSessionById, updateAudioMetricFields } from "../../db/sessionsRepo";
import { resolveVideoUri } from "../../storage/videoStorage";
import { analyzePitchVolume } from "../../../domain/audioAnalysis";
import { computeFillerStats, detectRepeatedWordsFromText, detectRepeatedWordsFromWords } from "../../../domain/transcriptAnnotations";
import { computeWpmCurve } from "../../../domain/wpmCurve";
import { StepError } from "../stepRunner";
import { putArtifact } from "../../db/artifactsRepo";
import { detectPauses } from "../../../domain/dsp/pauses";
import { getDecodedAudio } from "./decodedAudioCache";

// Voice analysis: pitch/volume from the audio itself, plus fillers,
// repeated words and the pace curve from whatever transcript exists. Runs
// after transcription but doesn't require it — the DSP half works alone.
export async function audioMetricsStep(sessionId: string): Promise<void> {
  const session = await getSessionById(sessionId);
  if (!session) throw new StepError("Session not found.");

  const decoded = await getDecodedAudio(resolveVideoUri(session));
  const dsp = decoded ? analyzePitchVolume(decoded.waveform, decoded.sampleRate) : null;
  const words = session.transcriptWords;
  const verbatim = session.transcriptVerbatim;

  if (!dsp && !verbatim) {
    throw new StepError("Couldn't read this recording's audio, and there's no transcript to analyze yet.");
  }

  const fillers = verbatim ? computeFillerStats(verbatim, session.durationSeconds) : null;
  const repeated = words && words.length > 0 ? detectRepeatedWordsFromWords(words) : verbatim ? detectRepeatedWordsFromText(verbatim) : null;

  if (decoded) {
    await putArtifact(sessionId, "pauses", detectPauses(decoded.waveform, decoded.sampleRate, words));
  }

  await updateAudioMetricFields(sessionId, {
    dspStatus: dsp?.status ?? (decoded ? "failed" : null),
    pitchContourHz: dsp?.pitchContourHz ?? null,
    volumeEnvelopeDbfs: dsp?.volumeEnvelopeDbfs ?? null,
    pitchAvgHz: dsp?.pitchAvgHz ?? null,
    pitchMinHz: dsp?.pitchMinHz ?? null,
    pitchMaxHz: dsp?.pitchMaxHz ?? null,
    volumeAvgDbfs: dsp?.volumeAvgDbfs ?? null,
    volumeStddevDbfs: dsp?.volumeStddevDbfs ?? null,
    wpmCurve: words && words.length > 0 ? computeWpmCurve(words, session.durationSeconds) : null,
    repeatedWordCount: repeated ? repeated.length : null,
    fillerWordCount: fillers?.count ?? null,
    fillerRatePerMinute: fillers?.ratePerMinute ?? null,
  });
}
