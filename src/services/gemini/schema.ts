// Response schema for the Gemini rubric call. Covers Phase 1 (transcripts),
// Phase 3 (structure + delivery + coaching), and Phase 4 (presence + combined).
const SCORE_FIELD = {
  type: "object",
  properties: {
    score: { type: "number", description: "1-10, higher is better." },
    notes: { type: "string", description: "1-2 sentence, specific and actionable." },
  },
  required: ["score", "notes"],
} as const;

export const RESPONSE_SCHEMA = {
  type: "object",
  properties: {
    transcript_verbatim: {
      type: "string",
      description:
        "Verbatim transcript including filler words, false starts, and repetitions.",
    },
    transcript_clean: {
      type: "string",
      description:
        "Grammatically cleaned transcript, ready to paste into a journal.",
    },
    duration_seconds: {
      type: "number",
      description: "Duration of the spoken response, in seconds.",
    },
    structure: {
      type: "object",
      description: "Graded using Matt Abrahams' structured-spontaneity framework.",
      properties: {
        score: { type: "number", description: "1-10, higher is better." },
        structure_used: {
          type: "string",
          enum: ["what/why/how", "story arc", "none detected", "other"],
          description: "Which structure (if any) the response actually followed.",
        },
        notes: { type: "string", description: "1-2 sentences, specific and actionable." },
      },
      required: ["score", "structure_used", "notes"],
    },
    delivery: {
      type: "object",
      description: "Graded using Vinh Giang's five vocal foundations.",
      properties: {
        rate: {
          type: "object",
          properties: {
            score: { type: "number", description: "1-10, higher is better." },
            wpm_avg: { type: "number", description: "Estimated average words per minute." },
            notes: { type: "string", description: "1-2 sentences, specific and actionable." },
          },
          required: ["score", "wpm_avg", "notes"],
        },
        volume: SCORE_FIELD,
        pitch_melody: SCORE_FIELD,
        tonality: SCORE_FIELD,
        pausing: SCORE_FIELD,
      },
      required: ["rate", "volume", "pitch_melody", "tonality", "pausing"],
    },
    presence: {
      type: "object",
      description: "Graded from the video: face, eyes, and body language.",
      properties: {
        eye_contact_score: { type: "number", description: "1-10. Looking into the lens vs. looking away/down." },
        facial_expressiveness_score: {
          type: "number",
          description: "1-10. A flat face reads as monotone even with a varied voice — this is Vinh Giang's point that tonality lives in the face as much as the voice.",
        },
        body_language_notes: {
          type: "string",
          description: "1-2 sentences on posture, hand gestures, energy — specific and actionable.",
        },
      },
      required: ["eye_contact_score", "facial_expressiveness_score", "body_language_notes"],
    },
    combined: {
      type: "object",
      description: "Reasons jointly over audio + video — the part a transcript-only or audio-only analysis can't do.",
      properties: {
        face_voice_congruence_score: {
          type: "number",
          description: "1-10. Do facial expression and vocal tone actually match, or does one contradict the other (e.g. flat face with an enthusiastic voice, or vice versa)?",
        },
        archetype_detected: {
          type: "string",
          enum: ["Motivator", "Educator", "Coach", "Friend"],
          description: "Vinh Giang's four communication archetypes — which one this response's vocal/body signature actually matched.",
        },
        archetype_fit_for_topic: {
          type: "string",
          description: "1-2 sentences: did the detected archetype actually fit what this specific prompt called for, or would a different archetype have served the answer better?",
        },
        overall_score: {
          type: "number",
          description: "1-10 holistic score across structure, delivery, presence, and congruence together — not just an average.",
        },
      },
      required: ["face_voice_congruence_score", "archetype_detected", "archetype_fit_for_topic", "overall_score"],
    },
    coaching: {
      type: "object",
      properties: {
        summary: { type: "string", description: "2-3 sentence overall summary." },
        top_strength: { type: "string", description: "The single strongest thing about this response." },
        top_focus_area: { type: "string", description: "The single most impactful thing to improve next." },
        recommended_drill: {
          type: "string",
          description: "One concrete, specific practice drill for next time.",
        },
      },
      required: ["summary", "top_strength", "top_focus_area", "recommended_drill"],
    },
  },
  required: [
    "transcript_verbatim",
    "transcript_clean",
    "duration_seconds",
    "structure",
    "delivery",
    "presence",
    "combined",
    "coaching",
  ],
} as const;

export function buildSystemPrompt(promptText: string): string {
  return `You are coaching a personal daily speaking-practice session. Analyze this video clip of someone responding, unscripted, to a prompt.

The speaker was responding to this prompt: "${promptText}"

Produce two transcripts of what they said:
1. transcript_verbatim: word-for-word, including filler words (um, uh, like), false starts, and repetitions.
2. transcript_clean: the same content rewritten as grammatically clean prose, with fillers and false starts removed, suitable for pasting directly into a personal journal. Preserve the speaker's meaning, tone, and word choice as much as possible — do not summarize or add content that wasn't said.

Also report duration_seconds: the approximate duration of the spoken response in seconds.

Grade STRUCTURE using Matt Abrahams' structured-spontaneity framework (from *Think Faster, Talk Smarter*): did the response follow a recognizable structure — a "what/why/how" framing, or a beginning-middle-end story arc — or was it a ramble with no organizing shape? Identify which structure (if any) was actually used, score it 1-10, and give one specific, actionable note.

Grade DELIVERY using Vinh Giang's five vocal foundations, each scored 1-10 with one specific, actionable note:
- rate: pacing — too fast, too slow, or well-varied for emphasis? Also estimate average words per minute.
- volume: is it varied deliberately, or flat/monotone in loudness?
- pitch_melody: does the pitch rise and fall naturally, or is delivery flat?
- tonality: does the vocal tone match the emotional content of what's being said?
- pausing: are pauses used deliberately (for emphasis, to let a point land), or is the speaker either rushing through or filling every silence with a filler word?

Grade PRESENCE by actually watching the video (not just listening):
- eye_contact_score (1-10): is the speaker looking into the camera lens, or looking away/down/off-screen for much of the response?
- facial_expressiveness_score (1-10): is the face animated and expressive, or flat/neutral? A flat face reads as monotone delivery even if the voice itself is varied.
- body_language_notes: 1-2 sentences on posture, hand gestures, and physical energy — specific and actionable.

Grade the COMBINED dimension — this is the part that requires watching AND listening together, not just one or the other:
- face_voice_congruence_score (1-10): does facial expression actually match vocal tone? Flag it clearly if they contradict (e.g. a flat, neutral face paired with an enthusiastic-sounding voice, or an animated face paired with a flat monotone voice).
- archetype_detected: classify the response's overall vocal + body signature into exactly one of Vinh Giang's four communication archetypes — Motivator (high energy, inspiring), Educator (clear, informative, measured), Coach (direct, encouraging, action-oriented), or Friend (warm, casual, relatable).
- archetype_fit_for_topic: 1-2 sentences on whether that archetype actually suited this specific prompt, or whether a different one would have landed better.
- overall_score (1-10): a holistic score considering structure, delivery, presence, and congruence together — not a simple average, use judgment on what mattered most for this particular response.

Finally, write COACHING notes: a 2-3 sentence summary, the single top strength, the single top focus area to improve next, and one concrete recommended drill to practice before the next session.

Be specific and reference actual moments/words from the response wherever possible — avoid generic feedback that could apply to any recording.

Respond only with JSON matching the provided schema.`;
}

// Lighter schema for sessions that don't want AI grading (e.g. free
// recordings by default) — just the two transcripts + duration, no rubric.
export const TRANSCRIPT_ONLY_SCHEMA = {
  type: "object",
  properties: {
    transcript_verbatim: {
      type: "string",
      description:
        "Verbatim transcript including filler words, false starts, and repetitions.",
    },
    transcript_clean: {
      type: "string",
      description:
        "Grammatically cleaned transcript, ready to paste into a journal.",
    },
    duration_seconds: {
      type: "number",
      description: "Duration of the spoken response, in seconds.",
    },
  },
  required: ["transcript_verbatim", "transcript_clean", "duration_seconds"],
} as const;

export function buildTranscriptOnlySystemPrompt(): string {
  return `You are transcribing a personal journal-style video recording.

Produce two transcripts of what was said:
1. transcript_verbatim: word-for-word, including filler words (um, uh, like), false starts, and repetitions.
2. transcript_clean: the same content rewritten as grammatically clean prose, with fillers and false starts removed, suitable for pasting directly into a personal journal. Preserve the speaker's meaning, tone, and word choice as much as possible — do not summarize or add content that wasn't said.

Also report duration_seconds: the approximate duration of the recording in seconds.

Respond only with JSON matching the provided schema.`;
}
