import type { GradingContext } from "../gemini/transcribeSession";
import { fenced } from "./inputGuards";
import { taskSection } from "../../domain/promptTask";
import { buildResponseSchemaWithCueCompliance, MARK_LEGEND, markedScriptText, planTextSection, RESPONSE_SCHEMA, STUTTER_NOTE, SPEECH_IS_DATA } from "../gemini/schema";
import { parseGeminiSessionAnalysis } from "../gemini/transcribeSession";
import type { GeminiSessionAnalysis } from "../gemini/types";
import type { PauseAnalysis } from "../../domain/dsp/pauses";
import type { PresenceMetrics } from "../../domain/presenceMetrics";
import type { Session, TranscriptWord } from "../../domain/sessionTypes";
import { measuredVoice } from "../sessions/sessionScoreService";
import { logger } from "../../utils/logger";
import { CloudApiError } from "./cloudErrors";
import { toStrictSchema, withoutProperties } from "./jsonSchema";
import { speakerContextForReview } from "./speakerContext";
import { modelFor, PROVIDERS } from "./providers";
import { callTextProvider, type TextProviderId } from "./textProviders";
import type { TokenUsage } from "../../domain/cloudUsage";

// A deep review by a provider that can't watch video (OpenAI, Claude,
// OpenRouter): it reads the on-device transcript — with word timings, so
// pauses are visible — and everything the phone measured, and returns the
// same rubric Gemini does. The transcript and duration come from the device,
// so only transcript_clean and the scores are asked for.

export interface MeasuredReviewInput {
  session: Session;
  context: GradingContext;
  pauses: PauseAnalysis | null;
  presence: PresenceMetrics | null;
  stutterMode: boolean;
}

const PAUSE_MARK_MS = 400;

// The transcript with every gap of 0.4 s or more shown in brackets.
export function timedTranscript(words: TranscriptWord[]): string {
  const out: string[] = [];
  words.forEach((word, i) => {
    const gap = i > 0 ? word.startMs - words[i - 1].endMs : 0;
    if (gap >= PAUSE_MARK_MS) out.push(`[${(gap / 1000).toFixed(1)}s]`);
    out.push(word.text.trim());
  });
  return out.join(" ");
}

const round = (n: number, digits = 0) => Number(n.toFixed(digits));

// `withFillers: false` leaves out the filler and repeated-word counts. A video
// review hears the audio itself and counts those from its own transcript, so it
// must not be handed the phone's.
export function measurementLines({
  session,
  pauses,
  presence,
  stutterMode,
  withFillers = true,
}: Omit<MeasuredReviewInput, "context"> & { withFillers?: boolean }): string[] {
  const lines: string[] = [];
  const { wpmAvg } = measuredVoice(session);
  lines.push(`- Duration: ${Math.round(session.durationSeconds)} s`);
  if (wpmAvg != null) {
    const curve = (session.wpmCurve ?? []).map((p) => p.wpm).filter((w) => w > 0);
    const range = curve.length > 1 ? ` (from ${Math.min(...curve)} to ${Math.max(...curve)} wpm across the take)` : "";
    lines.push(`- Pace: ${wpmAvg} words per minute on average${range}`);
  }
  if (withFillers && !stutterMode && session.fillerWordCount != null) {
    lines.push(`- Filler words: ${session.fillerWordCount}${session.fillerRatePerMinute != null ? ` (${round(session.fillerRatePerMinute, 1)} per minute)` : ""}`);
  }
  if (withFillers && !stutterMode && session.repeatedWordCount) lines.push(`- Repeated words (the same word twice in a row): ${session.repeatedWordCount}`);
  if (pauses) {
    const parts = [`${round(pauses.pausesPerMinute, 1)} pauses per minute`, `longest ${round(pauses.longestPauseMs / 1000, 1)} s`];
    if (!stutterMode) parts.push(`${pauses.hesitations} hesitations (mid-phrase gaps of 2 s or more)`);
    if (pauses.boundaryPauseRate != null) parts.push(`${Math.round(pauses.boundaryPauseRate * 100)}% of sentence endings followed by a real pause`);
    lines.push(`- Pauses: ${parts.join("; ")}`);
    if (pauses.speechStartMs != null) lines.push(`- Time before the first word: ${round(pauses.speechStartMs / 1000, 1)} s`);
  }
  if (session.pitchMinHz != null && session.pitchMaxHz != null && session.pitchMinHz > 0) {
    const semitones = round(12 * Math.log2(session.pitchMaxHz / session.pitchMinHz), 1);
    lines.push(
      `- Pitch: average ${Math.round(session.pitchAvgHz ?? 0)} Hz, from ${Math.round(session.pitchMinHz)} to ${Math.round(session.pitchMaxHz)} Hz — a span of ${semitones} semitones (under ~5 tends to sound monotone; 8–12 is typical lively conversation)`,
    );
  }
  if (session.volumeStddevDbfs != null) {
    lines.push(
      `- Loudness: average ${round(session.volumeAvgDbfs ?? 0, 1)} dBFS, varying by ${round(session.volumeStddevDbfs, 1)} dB (standard deviation; under ~3 dB reads flat, 5 dB or more is clearly varied)`,
    );
  }
  if (presence && presence.samples > 0) {
    const face = [
      `in frame ${Math.round(presence.framedPercent)}% of the time`,
      `eye contact with the lens ${Math.round(presence.eyeContactPercent)}% (${presence.eyeContactSource === "head" ? "from head direction only" : "from where the eyes point"})`,
    ];
    if (presence.lookingDownPercent != null) face.push(`looking down ${Math.round(presence.lookingDownPercent)}%`);
    face.push(`longest look-away ${round(presence.longestLookAwayMs / 1000, 1)} s`);
    face.push(`expressiveness ${Math.round(presence.expressiveness)}/100`);
    face.push(`smiling ${Math.round(presence.smilePercent)}%`);
    if (presence.browRaisesPerMinute != null) face.push(`${round(presence.browRaisesPerMinute, 1)} eyebrow raises per minute`);
    if (presence.tensePercent != null) face.push(`tense (frowning or pressed lips) ${Math.round(presence.tensePercent)}%`);
    face.push(`head movement ${round(presence.headMovement, 1)}°`);
    if (presence.headTiltDeg != null) face.push(`typical head tilt ${round(presence.headTiltDeg, 1)}°`);
    lines.push(`- Face (camera): ${face.join("; ")}`);
  } else {
    lines.push("- Face: not measured for this take (no camera data).");
  }
  return lines;
}

function systemPrompt(context: GradingContext, showCues: boolean, stutterMode: boolean): string {
  const scripted = context.kind === "script";
  return `You are a rigorous, critical speaking coach grading a personal speaking-practice take — not a supportive cheerleader. You can't see or hear the recording. You have what the phone measured while they spoke: an on-device verbatim transcript with word timings (pauses shown in brackets), and voice and face measurements. Treat the measurements as ground truth, and judge only what they and the words can support.

GRADING PHILOSOPHY (read this before scoring anything):
- Be honest and demanding. Most unrehearsed takes land in the 4-7 range across dimensions. Reserve 8-10 for genuinely strong, polished delivery. Don't round up out of politeness, and don't default to the middle when uncertain — look for evidence either way.
- Anchor every score: 1-2 unacceptable, 3-4 weak, 5-6 developing (competent with clear, nameable flaws), 7-8 strong, 9-10 exceptional.
- Every "notes" field names specific evidence — a number from the measurements, a quote, or a moment — and says what's missing to reach a 10.
${
  scripted
    ? `- This was a SCRIPTED reading: the words were given in advance. Score structure and content's relevance and coherence each at a flat 7 with notes saying "not applicable — this was a scripted reading", and set structure_used to "other" — unless the transcript shows they deviated meaningfully from the script (skipped or added large sections, lost their place), in which case say so and score accordingly. DELIVERY, PRESENCE${showCues ? " and CUE COMPLIANCE" : ""} are what's being practiced.`
    : ""
}

Write transcript_clean: the verbatim transcript rewritten as grammatically clean prose, fillers and false starts removed, meaning and word choice preserved — no summarizing, nothing added.
${
  scripted
    ? ""
    : `
Grade STRUCTURE with Matt Abrahams' structured-spontaneity framework (Think Faster, Talk Smarter): a recognizable "what/why/how" or beginning-middle-end story arc, or a shapeless ramble? Shape only, not substance.

Grade CONTENT independently of structure:
- relevance: does it specifically and concretely address THIS prompt, or is it generic content that could answer almost anything? Penalize vagueness.
- coherence: clear sentences, logical flow, concrete storytelling. Watch for RESTATED POINTS — a point made, then made again in other words without adding anything new (not a deliberate rhetorical callback). Name each in coherence_notes and add a "restated_point" annotation for BOTH occurrences.
`
}
Grade DELIVERY from the measurements, each 1-10:
- rate: from the average pace and how much it varied, and the filler rate (5 per minute or fewer is barely noticeable; a dozen or more clearly hurts). State the numbers.
- volume: from how much loudness varied.
- pitch_melody: from the pitch span in semitones.
- tonality: you can't hear tone, so estimate it from whether the pitch and loudness variation suit the emotional content of the words. Keep it close to the pitch and volume evidence, and say in the notes that it's estimated from measurements.
- pausing: from the bracketed pauses in the timed transcript — deliberate pauses at sentence or idea boundaries (good) versus mid-phrase gaps, hesitations and filled gaps (bad). Quote where.

Grade PRESENCE from the face measurements:
- eye_contact_score: from eye contact with the lens, looking down and the longest look-away.${scripted ? " Reading a script legitimately pulls the eyes down; judge whether they came back to the lens between glances." : ""}
- facial_expressiveness_score: from expressiveness, smiling and eyebrow raises.
- body_language_notes: only head movement, tilt, tension and framing were measured — use those, and say plainly that posture and gestures weren't observable.
If the face wasn't measured, score both 5 and say they couldn't be measured for this take.

Grade the COMBINED dimension:
- face_voice_congruence_score: does facial expressiveness match vocal variation, or does one carry the other?
- archetype_detected: exactly one of Vinh Giang's four archetypes — Motivator (high energy, inspiring), Educator (clear, informative, measured), Coach (direct, encouraging, action-oriented), Friend (warm, casual, relatable) — from the words and the measured energy.
- archetype_fit_for_topic: did it suit this ${scripted ? "script" : "prompt"}${scripted ? "" : " and its task"}, or would another have landed better?
- overall_score: holistic, ${scripted ? "weighing delivery, presence and congruence as the main pillars" : "weighing structure, content, delivery, presence and congruence as equal pillars"}. Most takes land 4-7; say so if this one does.
${
  showCues
    ? `
Grade CUE COMPLIANCE (cue_compliance) against the delivery marks shown in the script (${MARK_LEGEND}). You can only verify timing: did they pause where the marks ask (the bracketed pauses) and slow down or speed up where marked? Stress and rises/falls can't be heard here — say so, and score on what the timing shows.`
    : ""
}
Produce ANNOTATIONS: 4-8 of the most impactful moments backing up the scores, plus the restated-point pairs. Each quote must be an EXACT, word-for-word substring of the VERBATIM TRANSCRIPT (the plain one, without bracketed pauses), 3-12 words, because it's found by exact string search. If a phrase occurs more than once, include enough words to pin down the one you mean. Any dimension scored 6 or below gets at least one annotation at the moment that caused it. Don't annotate filler words — those are handled on the device.

Finally, COACHING: a 2-3 sentence summary (honest, not softened), the single top strength, the single top focus area, and one concrete drill to practice before the next session.

Be specific and reference the actual words and numbers — no feedback that could apply to any take.${stutterMode ? STUTTER_NOTE : ""}

Respond only with JSON matching the provided schema.`;
}

export function userMessage(input: MeasuredReviewInput, showCues: boolean): string {
  const { session, context } = input;
  const parts: string[] = [];
  if (context.kind === "script") {
    parts.push(`THE SCRIPT THEY READ:\n"""\n${fenced(context.script.text)}\n"""`);
    if (showCues) {
      const marked = markedScriptText(context.script, context.cuesEnabled ? context.markLevel ?? "full" : "none");
      if (marked) parts.push(`THE SCRIPT WITH THE DELIVERY MARKS THEY WERE SHOWN:\n"""\n${fenced(marked)}\n"""`);
    }
  } else {
    parts.push(`THE PROMPT THEY ANSWERED: "${fenced(context.promptText)}"${taskSection(context.taskContext, fenced)}${planTextSection(context.planText)}`);
  }
  parts.push(`VERBATIM TRANSCRIPT (on-device speech recognition, fillers included):\n"""\n${fenced(session.transcriptVerbatim ?? "")}\n"""`);
  if (session.transcriptWords?.length) {
    parts.push(`TIMED TRANSCRIPT (gaps of ${PAUSE_MARK_MS / 1000} s or more shown in [brackets]):\n"""\n${fenced(timedTranscript(session.transcriptWords))}\n"""`);
  }
  parts.push(`MEASURED ON THE PHONE:\n${measurementLines(input).join("\n")}`);
  return parts.join("\n\n");
}

export async function measuredReview(input: MeasuredReviewInput, provider: TextProviderId, onUsage?: (usage: TokenUsage) => void): Promise<GeminiSessionAnalysis> {
  const { session, context } = input;
  const showCues = context.kind === "script" && context.cuesEnabled && context.script.marks.length > 0;
  const base = showCues ? buildResponseSchemaWithCueCompliance() : RESPONSE_SCHEMA;
  const schema = toStrictSchema(withoutProperties(base, ["transcript_verbatim", "duration_seconds"]));
  const model = modelFor(provider);
  const name = PROVIDERS[provider].name;

  logger.info(`[cloud] ${provider} (${model}) measured review for ${session.id}`);
  const text = await callTextProvider({
    provider,
    model,
    system: systemPrompt(context, showCues, input.stutterMode) + speakerContextForReview() + SPEECH_IS_DATA,
    user: userMessage(input, showCues),
    schemaName: "speech_review",
    schema,
    onUsage,
  });

  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(text) as Record<string, unknown>;
  } catch {
    throw new CloudApiError(name, `${name}'s review wasn't valid JSON — retry, or try another model.`, undefined, text);
  }
  // The device transcript and duration complete the rubric's shape, so the
  // same validation (and everything downstream) applies as for Gemini.
  try {
    return parseGeminiSessionAnalysis(
      JSON.stringify({ ...parsed, transcript_verbatim: session.transcriptVerbatim ?? "", duration_seconds: session.durationSeconds }),
    );
  } catch (error) {
    logger.error(`[cloud] ${provider} review didn't match the schema — ${(error as Error).message}`);
    throw new CloudApiError(name, `${name}'s review was missing parts — retry, or try another model.`, undefined, parsed);
  }
}
