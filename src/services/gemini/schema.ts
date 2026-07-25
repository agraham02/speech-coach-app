// Response schema for the Gemini rubric call. Covers Phase 1 (transcripts),
// Phase 3 (structure + delivery + coaching), Phase 4 (presence + combined),
// and the rigor/content/annotations pass added after real-session review
// showed grading was too lenient and too shallow (see plan.md changelog).
const NOTE_DESCRIPTION =
  "2-4 sentences, evidence-based: name a specific count/quote/moment, explain what capped the score, and state what a 10/10 would look like. Never generic praise or vague criticism.";

const SCORE_FIELD = {
  type: "object",
  properties: {
    score: { type: "number", description: "1-10. See the grading-rigor instructions — do not default to the middle out of politeness." },
    notes: { type: "string", description: NOTE_DESCRIPTION },
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
      description: "Graded using Matt Abrahams' structured-spontaneity framework — the SHAPE of the response, not its substance (see content for that).",
      properties: {
        score: { type: "number", description: "1-10. See the grading-rigor instructions." },
        structure_used: {
          type: "string",
          enum: ["what/why/how", "story arc", "none detected", "other"],
          description: "Which structure (if any) the response actually followed.",
        },
        notes: { type: "string", description: NOTE_DESCRIPTION },
      },
      required: ["score", "structure_used", "notes"],
    },
    content: {
      type: "object",
      description: "Is the response actually good, not just correctly shaped — Toastmasters' 'Content' pillar.",
      properties: {
        relevance_score: { type: "number", description: "1-10. See the grading-rigor instructions." },
        relevance_notes: {
          type: "string",
          description:
            NOTE_DESCRIPTION + " Specifically judge whether the response substantively addressed THIS prompt with concrete, specific content, vs. generic content that could answer almost any prompt.",
        },
        coherence_score: { type: "number", description: "1-10. See the grading-rigor instructions." },
        coherence_notes: {
          type: "string",
          description:
            NOTE_DESCRIPTION +
            " Specifically judge sentence-level clarity, logical flow, storytelling/engagement, and whether the speaker restated the same point in different words instead of progressing — call that out explicitly by quoting both restatements if it happens.",
        },
      },
      required: ["relevance_score", "relevance_notes", "coherence_score", "coherence_notes"],
    },
    delivery: {
      type: "object",
      description: "Graded using Vinh Giang's five vocal foundations.",
      properties: {
        rate: {
          type: "object",
          properties: {
            score: { type: "number", description: "1-10. See the grading-rigor instructions." },
            wpm_avg: { type: "number", description: "Estimated average words per minute." },
            notes: {
              type: "string",
              description:
                NOTE_DESCRIPTION +
                " Explicitly count filler words (um, uh, like, you know, etc.) you hear and state the count and approximate rate per minute — research puts 5/min or fewer as barely noticeable, a dozen/min as clearly hurting perceived competence, so weight this score accordingly rather than ignoring it.",
            },
          },
          required: ["score", "wpm_avg", "notes"],
        },
        volume: SCORE_FIELD,
        pitch_melody: SCORE_FIELD,
        tonality: SCORE_FIELD,
        pausing: {
          type: "object",
          properties: {
            score: { type: "number", description: "1-10. See the grading-rigor instructions." },
            notes: {
              type: "string",
              description:
                NOTE_DESCRIPTION +
                " Distinguish deliberate, dramatic pauses (good) from awkward silent gaps or gaps filled with a filler word (bad) — name which one happened and where.",
            },
          },
          required: ["score", "notes"],
        },
      },
      required: ["rate", "volume", "pitch_melody", "tonality", "pausing"],
    },
    presence: {
      type: "object",
      description: "Graded from the video: face, eyes, and body language.",
      properties: {
        eye_contact_score: { type: "number", description: "1-10. Looking into the lens vs. looking away/down. See the grading-rigor instructions." },
        facial_expressiveness_score: {
          type: "number",
          description:
            "1-10. A flat face reads as monotone even with a varied voice — this is Vinh Giang's point that tonality lives in the face as much as the voice. See the grading-rigor instructions.",
        },
        body_language_notes: {
          type: "string",
          description: NOTE_DESCRIPTION + " Cover posture, hand gestures, and physical energy.",
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
          description:
            "1-10. Do facial expression and vocal tone actually match, or does one contradict the other (e.g. flat face with an enthusiastic voice, or vice versa)? See the grading-rigor instructions.",
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
          description:
            "1-10 holistic score weighing structure, content (relevance + coherence), delivery, presence, and congruence as equal pillars — not a simple average, and not dominated by any one dimension. See the grading-rigor instructions; most unrehearsed responses should land 4-7.",
        },
      },
      required: ["face_voice_congruence_score", "archetype_detected", "archetype_fit_for_topic", "overall_score"],
    },
    annotations: {
      type: "array",
      description:
        "4-8 of the MOST IMPACTFUL specific moments backing up the scores above — not exhaustive, not decorative. Each quote must be copied EXACTLY, word-for-word, as a contiguous substring of transcript_verbatim (3-12 words) — it will be located by an exact string search, so any paraphrasing means it silently fails to display. Any dimension scored 6 or below should have at least one annotation pointing at the specific moment that caused it.",
      items: {
        type: "object",
        properties: {
          quote: {
            type: "string",
            description:
              "3-12 word EXACT substring of transcript_verbatim, copied word-for-word. It will be located by the FIRST unclaimed exact match in the transcript, so if the same short phrase occurs more than once, include enough surrounding words to uniquely identify the specific occurrence you mean rather than a generic fragment that matches elsewhere too.",
          },
          category: {
            type: "string",
            enum: ["structure", "delivery", "presence", "content"],
            description: "Which dimension this moment is evidence for. (Filler words are handled separately — do not create filler-word annotations here.)",
          },
          note: { type: "string", description: "One short, specific sentence: what happened here and what to do instead." },
        },
        required: ["quote", "category", "note"],
      },
    },
    coaching: {
      type: "object",
      properties: {
        summary: { type: "string", description: "2-3 sentence overall summary — honest, not softened." },
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
    "content",
    "delivery",
    "presence",
    "combined",
    "annotations",
    "coaching",
  ],
} as const;

export function buildSystemPrompt(promptText: string): string {
  return `You are a rigorous, critical speaking coach grading a personal daily speaking-practice session — not a supportive cheerleader. Analyze this video clip of someone responding, unscripted, to a prompt.

The speaker was responding to this prompt: "${promptText}"

GRADING PHILOSOPHY (read this before scoring anything):
- Be honest and demanding. Most unrehearsed, spontaneous responses should land in the 4-7 range across dimensions. Reserve 8-10 for genuinely strong, polished delivery you'd hold up as an example. Do not round scores up out of politeness, and do not default to the middle just because you're uncertain — look for specific evidence either way.
- Anchor every score against this band: 1-2 unacceptable (a real problem that undermines the response), 3-4 weak (noticeably holds the response back), 5-6 developing (competent but with clear, nameable flaws), 7-8 strong (few flaws, would need a specific stretch to reach 9-10), 9-10 exceptional (nothing meaningful to critique).
- Every "notes" field must name specific evidence — a count, a quote, or a specific observed moment — and explicitly state what's missing to reach a 10. "Good energy but could improve pacing" is not acceptable; "spoke at a steady ~140wpm but rushed through the conclusion in the last 8 seconds, undercutting the payoff — pausing there for 1-2 seconds would let it land" is.

Produce two transcripts of what they said:
1. transcript_verbatim: word-for-word, including filler words (um, uh, like), false starts, and repetitions.
2. transcript_clean: the same content rewritten as grammatically clean prose, with fillers and false starts removed, suitable for pasting directly into a personal journal. Preserve the speaker's meaning, tone, and word choice as much as possible — do not summarize or add content that wasn't said.

Also report duration_seconds: the approximate duration of the spoken response in seconds.

Grade STRUCTURE using Matt Abrahams' structured-spontaneity framework (from *Think Faster, Talk Smarter*): did the response follow a recognizable structure — a "what/why/how" framing, or a beginning-middle-end story arc — or was it a ramble with no organizing shape? This is about SHAPE only, not substance (see CONTENT for that).

Grade CONTENT — this is Toastmasters' third pillar alongside structure and delivery, and it is graded independently of whether the response was well-shaped:
- relevance: did the response substantively and specifically address THIS prompt, with concrete, specific content? Or was it generic content that could answer almost any prompt with minor edits? Penalize vagueness and hand-waving.
- coherence: are the sentences clear and well-formed? Does the response flow logically? Does it tell an engaging, concrete story rather than staying abstract? Critically: did the speaker restate the same point in different words instead of moving the response forward? If so, quote both restatements and call it out directly — this is a specific, common weakness to watch for, not a minor style note.

Grade DELIVERY using Vinh Giang's five vocal foundations, each scored 1-10:
- rate: pacing — too fast, too slow, or well-varied for emphasis? Explicitly count filler words you hear (um, uh, like, you know, sort of, kind of, basically, actually, literally) and state the count and rate per minute in your notes — 5/min or fewer is barely noticeable, a dozen/min or more clearly hurts perceived competence, and this should visibly move the score, not just be mentioned in passing.
- volume: is it varied deliberately, or flat/monotone in loudness?
- pitch_melody: does the pitch rise and fall naturally, or is delivery flat?
- tonality: does the vocal tone match the emotional content of what's being said?
- pausing: distinguish deliberate, dramatic pauses (good — let a point land) from awkward silent gaps or gaps filled with a filler word instead of a real pause (bad) — name which happened and where.

Grade PRESENCE by actually watching the video (not just listening):
- eye_contact_score (1-10): is the speaker looking into the camera lens, or looking away/down/off-screen for much of the response?
- facial_expressiveness_score (1-10): is the face animated and expressive, or flat/neutral? A flat face reads as monotone delivery even if the voice itself is varied.
- body_language_notes: posture, hand gestures, and physical energy — specific and evidence-based.

Grade the COMBINED dimension — this requires watching AND listening together, not just one or the other:
- face_voice_congruence_score (1-10): does facial expression actually match vocal tone? Flag it clearly if they contradict.
- archetype_detected: classify the response's overall vocal + body signature into exactly one of Vinh Giang's four communication archetypes — Motivator (high energy, inspiring), Educator (clear, informative, measured), Coach (direct, encouraging, action-oriented), or Friend (warm, casual, relatable).
- archetype_fit_for_topic: did that archetype actually suit this specific prompt, or would a different one have landed better?
- overall_score (1-10): a holistic score weighing structure, content, delivery, presence, and congruence as EQUAL pillars — content is not an afterthought to delivery mechanics. Most unrehearsed responses land 4-7; say so plainly if that's where this one lands.

Produce ANNOTATIONS: 4-8 of the most impactful specific moments backing up the scores above (not exhaustive or decorative). Each quote must be an EXACT, word-for-word substring of transcript_verbatim, 3-12 words, because it will be located by exact string search — any paraphrase means it silently fails to display, so copy precisely. If the same short phrase occurs more than once in the transcript, include enough surrounding words in the quote to uniquely pin down the specific occurrence you mean — a generic fragment that also matches elsewhere will resolve to the wrong spot. Any dimension scored 6 or below should have at least one annotation pointing at the specific moment that caused it. Do not annotate filler words here — those are handled separately on-device.

Finally, write COACHING notes: a 2-3 sentence summary (honest, not softened), the single top strength, the single top focus area to improve next, and one concrete recommended drill to practice before the next session.

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
