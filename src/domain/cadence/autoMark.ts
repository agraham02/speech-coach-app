import { wordsOf, type Mark, type MarkedText } from "./marks";

// Rule-based marking for any text, following the marking guide in
// practice-expansion-plan.md §4.6 — the fallback when there's no on-device
// model, and the starting point for the built-in content. Pure.
//
// 1. Every phrase boundary gets a pause: , ; : and dashes a short one,
//    sentence ends a long one.
// 2. Every sentence end gets an inflection: statements fall; yes/no
//    questions rise, wh-questions fall. A clause that continues the thought
//    (before a comma) rises slightly — which also makes list items rise and
//    the last one fall.
// 3. At most one stress per phrase, on the word carrying the news: a
//    negation, a number, a superlative or "only/every/all", the word after
//    "but", and otherwise the LAST content word (English puts the main
//    stress at the end of a phrase by default).
// 4. No spans or notes — those are judgment calls left to a person.

const FUNCTION_WORDS = new Set(
  (
    "a an the and or but nor so yet for of to in on at by with from into onto upon over under about above below between " +
    "as than then that this these those there here it its it's i i'm i've i'd i'll me my mine you you're your yours he his him " +
    "she her hers we we're our ours us they they're their theirs them who whom whose which what when where why how " +
    "is are was were be been being am do does did done have has had having will would can could shall should may might must " +
    "just very really quite also too even still again ever up down out off if because while though although until unless " +
    "some any each such own same other another both either neither much many more few one's let's okay oh um uh like well"
  ).split(" "),
);

const NEGATIONS = new Set(["not", "never", "no", "nothing", "nobody", "none", "nowhere", "neither", "nor", "without"]);
const NUMBER_WORDS = new Set(
  (
    "one two three four five six seven eight nine ten eleven twelve thirteen fourteen fifteen sixteen seventeen eighteen nineteen twenty " +
    "thirty forty fifty sixty seventy eighty ninety hundred thousand million billion first second third fourth fifth last half once twice"
  ).split(" "),
);
const FOCUS_WORDS = new Set(["only", "every", "all", "always", "most", "least", "best", "worst", "everything", "everyone", "nobody", "entire", "whole"]);
const CONTRAST = new Set(["but", "yet", "instead", "however", "although"]);
const WH_WORDS = new Set(["who", "what", "when", "where", "why", "how", "which", "whose", "whom"]);
// Lead-ins skipped when deciding whether a question is a wh-question
// ("So what do you do?").
const LEAD_INS = new Set(["so", "and", "but", "then", "okay", "well", "now", "oh"]);
// Pronouns that carry the stress when nothing else in the phrase can
// ("Because it's ours", "Not even me").
const STRESSABLE_PRONOUNS = new Set(["me", "you", "him", "her", "us", "them", "mine", "yours", "his", "hers", "ours", "theirs", "i", "we", "they", "she", "he"]);
// Where a long phrase can take a breath: before a conjunction or relative
// word if there is one, otherwise before a preposition. Never before "to"
// (it splits "had to go", "next to me").
const STRONG_BREAKS = new Set(["and", "but", "or", "because", "who", "which", "that", "when", "while", "where", "so", "until", "before", "after", "if", "since", "though", "although", "whether"]);
const WEAK_BREAKS = new Set(["than", "with", "without", "for", "from", "in", "on", "at", "about", "into", "like", "behind", "under", "between"]);
// Phrases longer than this many words get split at a natural break.
const LONG_PHRASE = 9;
// Tokens that end in a period without ending a sentence.
const NOT_SENTENCE_END = /^(a\.m\.|p\.m\.|e\.g\.|i\.e\.|mr\.|mrs\.|ms\.|dr\.|st\.|vs\.|etc\.)$/i;

// The word stripped of punctuation, lowercased.
export function bare(word: string): string {
  return word.toLowerCase().replace(/^[^a-z0-9']+|[^a-z0-9']+$/g, "").replace(/’/g, "'");
}

function endsSentence(word: string, next?: string): "." | "!" | "?" | null {
  const m = /([.!?])["'”’)\]]*$/.exec(word);
  if (!m) return null;
  // "2 a.m. watching" — an abbreviation mid-sentence, unless a capital follows.
  if (m[1] === "." && NOT_SENTENCE_END.test(word) && next && !/^[A-Z]/.test(next)) return null;
  return m[1] as "." | "!" | "?";
}

function isDash(word: string | undefined): boolean {
  return !!word && /^[—–-]+$/.test(word);
}

// A phrase boundary after this word. A standalone dash takes the pause
// itself (after the dash), so "automatically — booking" breaks once.
function endsClause(word: string): boolean {
  return /[,;:—–]["'”’)\]]*$/.test(word) || isDash(word);
}

function isContent(word: string): boolean {
  const b = bare(word);
  return b.length > 1 && !FUNCTION_WORDS.has(b) && !/^\W+$/.test(word);
}

// How strongly a word asks to be stressed (0 = not a candidate).
function focusScore(word: string, afterContrast: boolean): number {
  const b = bare(word);
  if (!b || /^[—–-]+$/.test(word)) return 0;
  if (NEGATIONS.has(b) || /n't$/.test(b)) return 5;
  if (/^\d/.test(b) || NUMBER_WORDS.has(b)) return 4;
  if (afterContrast && isContent(word)) return 4;
  if (FOCUS_WORDS.has(b) || (b.length > 5 && /est$/.test(b) && !/(interest|forest|honest|modest|request|harvest|suggest|protest|contest)$/.test(b))) return 3.5;
  if (isContent(word)) return 1;
  return STRESSABLE_PRONOUNS.has(b) ? 0.5 : 0;
}

// Splits phrases longer than LONG_PHRASE words at the most central natural
// break (before "and", "because", "who", a preposition…), repeatedly, so
// there's a breath every few words — the densest mark in the guide.
function splitLongPhrases(words: string[], gaps: Set<number>): number[] {
  const added: number[] = [];
  const boundaries = () => [...gaps, ...added].sort((a, b) => a - b);
  for (let guard = 0; guard < words.length; guard++) {
    let changed = false;
    let from = 0;
    for (const end of [...boundaries(), words.length - 1]) {
      const length = end - from + 1;
      if (length > LONG_PHRASE) {
        const mid = from + length / 2;
        const central = (set: Set<string>) => {
          let best = -1;
          for (let j = from + 3; j <= end - 2; j++) {
            if (!set.has(bare(words[j]))) continue;
            if (best < 0 || Math.abs(j - mid) < Math.abs(best - mid)) best = j;
          }
          return best;
        };
        const strong = central(STRONG_BREAKS);
        const best = strong > 0 ? strong : central(WEAK_BREAKS);
        if (best > 0) {
          added.push(best - 1);
          changed = true;
          break;
        }
      }
      from = end + 1;
    }
    if (!changed) break;
  }
  return added;
}

export function autoMark(text: string): MarkedText {
  const words = wordsOf(text);
  const marks: Mark[] = [];
  if (!words.length) return { text: "", marks };

  // --- pauses and inflections -----------------------------------------------
  let sentenceStart = 0;
  words.forEach((word, i) => {
    const end = endsSentence(word, words[i + 1]);
    const last = i === words.length - 1;
    if (end) {
      if (end === "?") {
        let k = sentenceStart;
        while (k < i && LEAD_INS.has(bare(words[k]))) k++;
        const first = bare(words[k] ?? "");
        // "Or are we the team…?" closes an alternative — it falls.
        const alternative = bare(words[sentenceStart] ?? "") === "or";
        marks.push({ kind: WH_WORDS.has(first) || alternative ? "fall" : "rise", word: i });
      } else {
        marks.push({ kind: "fall", word: i });
      }
      if (!last) marks.push({ kind: "long_pause", afterWord: i });
      sentenceStart = i + 1;
    } else if (!last && endsClause(word) && !isDash(words[i + 1])) {
      if (/[,]["'”’)\]]*$/.test(word)) marks.push({ kind: "rise", word: i });
      else if (/[;:]["'”’)\]]*$/.test(word)) marks.push({ kind: "fall", word: i });
      marks.push({ kind: "pause", afterWord: i });
    }
  });

  // --- a breath every few words ----------------------------------------------
  const gapAfter = new Set(marks.flatMap((m) => (m.kind === "pause" || m.kind === "long_pause" ? [m.afterWord] : [])));
  for (const afterWord of splitLongPhrases(words, gapAfter)) {
    marks.push({ kind: "pause", afterWord });
    gapAfter.add(afterWord);
  }

  // --- one stress per phrase ------------------------------------------------
  let from = 0;
  for (let i = 0; i < words.length; i++) {
    if (!gapAfter.has(i) && i !== words.length - 1) continue;
    let best = -1;
    let bestScore = 0;
    let afterContrast = false;
    for (let j = from; j <= i; j++) {
      const score = focusScore(words[j], afterContrast);
      // ">=" so that among equals the LAST one wins (end focus).
      if (score > 0 && score >= bestScore) {
        best = j;
        bestScore = score;
      }
      if (CONTRAST.has(bare(words[j]))) afterContrast = true;
      else if (afterContrast && isContent(words[j])) afterContrast = false;
    }
    if (best >= 0) marks.push({ kind: "emphasis", word: best });
    from = i + 1;
  }
  return { text: words.join(" "), marks };
}

// Remix: the same line with the stress moved to a different content word in
// one phrase — "*I* never said she stole it" vs "I never said she *stole* it".
// Returns null when there's nothing else worth stressing.
export function remixEmphasis(marked: MarkedText, seed: number): MarkedText | null {
  const words = wordsOf(marked.text);
  const stressed = new Set(marked.marks.flatMap((m) => (m.kind === "emphasis" ? [m.word] : [])));
  const candidates = words
    .map((w, i) => ({ i, ok: !stressed.has(i) && (isContent(w) || ["i", "you", "she", "he", "we", "they", "my", "your"].includes(bare(w))) }))
    .filter((c) => c.ok)
    .map((c) => c.i);
  if (!candidates.length || !stressed.size) return null;
  const target = candidates[Math.abs(seed) % candidates.length];
  // Move the stress nearest the new word; keep the rest of the marks.
  const nearest = [...stressed].reduce((a, b) => (Math.abs(b - target) < Math.abs(a - target) ? b : a));
  const marks = marked.marks.filter((m) => !(m.kind === "emphasis" && m.word === nearest));
  return { text: marked.text, marks: [...marks, { kind: "emphasis", word: target }] };
}
