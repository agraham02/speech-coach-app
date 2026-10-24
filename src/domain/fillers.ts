// Filler words, in two kinds:
//
// - "hesitation": um, uh, er. Always fillers.
// - "contextual": like, actually, basically, literally, you know, I mean.
//   Fillers only in some uses: "like" can compare ("it looks like rain") or
//   be a verb ("I like it"), "actually" can mark a contrast ("I actually
//   disagree"). These are counted only on positive evidence that they're
//   filling, and left out when unsure, so the count is conservative.
//
// "kind of" and "sort of" are not fillers here: they soften a claim, so they
// are hedges, counted once, in Confidence (coach/structureHeuristics.ts
// findHedges), per the scoring taxonomy (docs/decisions/scoring-taxonomy.md).
//
// Deterministic and on-device. Runs on the verbatim transcript (Whisper with
// the filler prompt keeps the ums and the commas around a filler "like").
// The weight each kind gets in a score is decided by the scoring layer; this
// only labels and counts.

export type FillerType = "hesitation" | "contextual";

export interface TypedFillerMatch {
  start: number;
  end: number; // exclusive
  word: string;
  type: FillerType;
}

interface Token {
  text: string;
  lower: string;
  start: number;
  end: number;
  punct: boolean;
}

const HESITATION = /^(um+|uhm+|uh+|erm?)$/;

// After these, "like" is the verb ("I like", "would like").
const LIKE_VERB_BEFORE = new Set(
  "i you we they would i'd you'd we'd they'd he'd she'd don't didn't doesn't do does did to really not might may will should could also still always never".split(" "),
);
// After these, "like" compares or gives an example ("looks like", "things like").
const LIKE_COMPARE_BEFORE = new Set(
  "look looks looked looking sound sounds sounded seem seems seemed feel feels felt just more less something nothing anything everything much lot exactly kind sort things stuff ones people places someone somebody anyone alike unlike".split(" "),
);
// "like" straight before these, with no comma, is a preposition ("like this", "like a").
const LIKE_OBJECT_AFTER = new Set("this that these those a an the him her them me you us it my your his our their what when how".split(" "));
// "be like" + one of these is the filler use ("it was like really good").
const INTENSIFIERS = new Set("really so super totally very just kind sort literally actually basically pretty such quite".split(" "));
const BE_FORMS = new Set("is was were are be been am it's that's he's she's there's i'm you're we're they're".split(" "));
// "actually" before these is padding ("actually really", "actually just").
const ACTUALLY_PADDING_AFTER = new Set("really just like kind sort pretty quite so literally basically".split(" "));
// "literally" in its literal sense.
const LITERAL_SENSE_BEFORE = new Set("translate translated translates translating take taken took mean means meant interpret interpreted read".split(" "));
// "you know" before these takes an object ("you know what", "you know how").
const YOU_KNOW_OBJECT_AFTER = new Set("what that how where when why who whether the a an about it him her them this these those me us".split(" "));
const YOU_KNOW_QUESTION_BEFORE = new Set("do did don't didn't if as what whether".split(" "));
const OTHER_FILLERS = new Set(["like", "actually", "basically", "literally", "so"]);

function tokenize(text: string): Token[] {
  const tokens: Token[] = [];
  const re = /[A-Za-z0-9]+(?:['’][A-Za-z]+)*|[.,!?;:—–-]+|…/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    const raw = m[0];
    const punct = !/[A-Za-z0-9]/.test(raw);
    tokens.push({ text: raw, lower: raw.toLowerCase().replace(/’/g, "'"), start: m.index, end: m.index + raw.length, punct });
  }
  return tokens;
}

const SENTENCE_PUNCT = /[.!?…]/;

export function detectTypedFillers(transcript: string): TypedFillerMatch[] {
  const tokens = tokenize(transcript);
  const out: TypedFillerMatch[] = [];
  // Neighbouring words and whether punctuation sits between.
  const prevWord = (i: number) => {
    for (let k = i - 1; k >= 0; k--) if (!tokens[k].punct) return tokens[k];
    return null;
  };
  const nextWord = (i: number) => {
    for (let k = i + 1; k < tokens.length; k++) if (!tokens[k].punct) return tokens[k];
    return null;
  };
  const punctBefore = (i: number) => i > 0 && tokens[i - 1].punct;
  const punctAfter = (i: number) => i + 1 < tokens.length && tokens[i + 1].punct;
  const sentenceStart = (i: number) => i === 0 || (tokens[i - 1].punct && SENTENCE_PUNCT.test(tokens[i - 1].text));
  const sentenceEndAfter = (i: number) => i + 1 >= tokens.length || (tokens[i + 1].punct && SENTENCE_PUNCT.test(tokens[i + 1].text));
  const isHes = (t: Token | null) => !!t && HESITATION.test(t.lower);
  const push = (a: Token, b: Token, type: FillerType) => out.push({ start: a.start, end: b.end, word: transcript.slice(a.start, b.end), type });

  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i];
    if (t.punct) continue;
    if (HESITATION.test(t.lower)) {
      push(t, t, "hesitation");
      continue;
    }
    const prev = prevWord(i);
    const next = nextWord(i);
    const nextTok = i + 1 < tokens.length ? tokens[i + 1] : null;
    // Set off by punctuation on at least one side, inside a sentence.
    const setOff = punctAfter(i) || (punctBefore(i) && !sentenceStart(i));
    const nearHes = (isHes(prev) && !punctBefore(i)) || (isHes(next) && !punctAfter(i)) || isHes(next);

    // Two-word markers.
    if (t.lower === "you" && nextTok && !nextTok.punct && nextTok.lower === "know") {
      const j = i + 1;
      const after = nextWord(j);
      const before = prev;
      const questionish = !!before && !punctBefore(i) && YOU_KNOW_QUESTION_BEFORE.has(before.lower);
      const object = !!after && !punctAfter(j) && YOU_KNOW_OBJECT_AFTER.has(after.lower);
      const filler = !questionish && !object && (punctAfter(j) || sentenceEndAfter(j) || isHes(after) || (punctBefore(i) && punctAfter(j)));
      if (filler) push(t, nextTok, "contextual");
      i = j;
      continue;
    }
    if (t.lower === "i" && nextTok && !nextTok.punct && nextTok.lower === "mean") {
      const j = i + 1;
      const after = nextWord(j);
      const quoted = !!prev && !punctBefore(i) && (prev.lower === "what" || prev.lower === "if");
      const filler = !quoted && (punctAfter(j) || ((sentenceStart(i) || punctBefore(i)) && isHes(after)));
      if (filler) push(t, nextTok, "contextual");
      i = j;
      continue;
    }

    if (t.lower === "like") {
      if (prev && !punctBefore(i) && (LIKE_VERB_BEFORE.has(prev.lower) || LIKE_COMPARE_BEFORE.has(prev.lower))) continue;
      if (next && !punctAfter(i) && LIKE_OBJECT_AFTER.has(next.lower)) {
        // "like this" is a comparison, unless the "like" is plainly set off
        // before it ("and, like this...") or sits next to an um.
        if (!(punctBefore(i) && !sentenceStart(i)) && !nearHes) continue;
      }
      const doubled = !!next && next.lower === "like";
      const beIntensifier = !!prev && !punctBefore(i) && BE_FORMS.has(prev.lower) && !!next && !punctAfter(i) && INTENSIFIERS.has(next.lower);
      const openingComma = sentenceStart(i) && punctAfter(i);
      if (setOff || nearHes || doubled || beIntensifier || openingComma) push(t, t, "contextual");
      continue;
    }
    if (t.lower === "actually") {
      const padding = !!next && !punctAfter(i) && ACTUALLY_PADDING_AFTER.has(next.lower);
      const afterFiller = !!prev && !punctBefore(i) && (isHes(prev) || prev.lower === "like");
      const doubled = !!next && next.lower === "actually";
      if (padding || afterFiller || doubled || (isHes(next) && !punctAfter(i))) push(t, t, "contextual");
      continue;
    }
    if (t.lower === "basically" || t.lower === "literally") {
      if (t.lower === "literally" && prev && !punctBefore(i) && LITERAL_SENSE_BEFORE.has(prev.lower)) continue;
      if (t.lower === "literally" && next && !punctAfter(i) && (next.lower === "translated" || next.lower === "means")) continue;
      const padding = !!next && !punctAfter(i) && INTENSIFIERS.has(next.lower);
      const nearFiller = nearHes || (!!prev && !punctBefore(i) && OTHER_FILLERS.has(prev.lower)) || (!!next && !punctAfter(i) && OTHER_FILLERS.has(next.lower));
      if (setOff || sentenceStart(i) || padding || nearFiller) push(t, t, "contextual");
      continue;
    }
  }
  return out;
}

export interface FillerCounts {
  hesitation: number;
  contextual: number;
}

export function countFillerTypes(matches: TypedFillerMatch[]): FillerCounts {
  return {
    hesitation: matches.filter((m) => m.type === "hesitation").length,
    contextual: matches.filter((m) => m.type === "contextual").length,
  };
}
