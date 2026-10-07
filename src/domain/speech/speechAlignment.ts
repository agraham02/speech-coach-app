import { canonicalPhrase, canonicalWord } from "./equivalences";
import { cleanText, normalizeWord, type HeardToken } from "./normalize";
import { levenshtein, phoneticKey } from "./phonetic";

// Shared by the live highlight and the final score so the two can never
// disagree about what counts as a match (the old drill screen's live
// highlight stopped at the first miss while its final scorer didn't).

export interface TargetWord {
  // Text shown on screen for this word, punctuation included. A hyphenated
  // word ("One-one,") becomes two targets: "One-" and "one,".
  display: string;
  norm: string;
  // 0-based repetition this word belongs to (twisters repeat N times).
  rep: number;
  indexInRep: number;
  globalIndex: number;
}

export type MatchKind = "hit" | "near";
export type WordStatus = MatchKind | "missed" | "pending";

export function buildTarget(text: string, repeatCount = 1): TargetWord[] {
  const oneRep: { display: string; norm: string }[] = [];
  for (const word of text.trim().split(/\s+/)) {
    // Split hyphenated compounds into separately-tracked parts, keeping the
    // hyphen on the first part's display so it still renders joined.
    const parts = word.split(/(?<=[-‐-―])/);
    for (const part of parts) {
      const norm = normalizeWord(part);
      if (norm) oneRep.push({ display: part, norm });
    }
  }
  const target: TargetWord[] = [];
  const reps = Math.max(1, Math.floor(repeatCount));
  for (let rep = 0; rep < reps; rep++) {
    oneRep.forEach((word, indexInRep) => {
      target.push({ ...word, rep, indexInRep, globalIndex: target.length });
    });
  }
  return target;
}

function editThreshold(length: number): number {
  if (length >= 8) return 2;
  if (length >= 4) return 1;
  return 0;
}

// Compares two normalized strings (single words or concatenated spans).
function compareNorms(target: string, heard: string, heardReadings: string[] = []): MatchKind | null {
  if (target === heard || heardReadings.includes(target)) return "hit";
  if (canonicalPhrase(target) === canonicalPhrase(heard)) return "hit";
  if (heardReadings.some((r) => canonicalPhrase(r) === canonicalPhrase(target))) return "hit";
  const threshold = editThreshold(Math.min(target.length, heard.length));
  if (threshold > 0 && levenshtein(target, heard) <= threshold) return "near";
  if (target.length >= 3 && phoneticKey(target) === phoneticKey(heard)) return "near";
  return null;
}

export function wordMatch(targetNorm: string, heard: HeardToken): MatchKind | null {
  if (canonicalWord(targetNorm) === canonicalWord(heard.norm)) return "hit";
  return compareNorms(targetNorm, heard.norm, heard.readings);
}

// A matched span: `targetSpan` target words starting at `targetIndex`
// matched `heardSpan` heard words starting at the current heard position.
// Spans > 1 cover compounds the recognizer split or joined differently
// ("woodchuck" vs "wood chuck", "One-one" vs "11", "I scream" vs "ice cream").
interface SpanMatch {
  targetIndex: number;
  targetSpan: number;
  heardSpan: number;
  kind: MatchKind;
}

const SPANS: [number, number][] = [
  [1, 1],
  [2, 1],
  [1, 2],
  [2, 2],
];

function matchSpan(
  target: TargetWord[],
  t: number,
  heard: HeardToken[],
  h: number,
  targetSpan: number,
  heardSpan: number,
): MatchKind | null {
  if (t + targetSpan > target.length || h + heardSpan > heard.length) return null;
  if (targetSpan === 1 && heardSpan === 1) return wordMatch(target[t].norm, heard[h]);
  // Never merge across a repetition boundary — "...seashore. She..." must
  // stay two reps, not one blended span.
  if (target[t].rep !== target[t + targetSpan - 1].rep) return null;
  const targetJoined = target
    .slice(t, t + targetSpan)
    .map((w) => w.norm)
    .join("");
  const heardTokens = heard.slice(h, h + heardSpan);
  const heardJoined = heardTokens.map((w) => w.norm).join("");
  const readings = heardSpan === 1 ? heardTokens[0].readings : [];
  const kind = compareNorms(targetJoined, heardJoined, readings);
  // Near merges are only for genuine compounds split differently (1<->2
  // words) and long enough to be meaningful. A 2<->2 span must match
  // exactly ("i scream" = "ice cream"); otherwise "black bog" would blend
  // into one fuzzy span instead of a hit plus a near miss.
  if (kind === "near" && (targetSpan === heardSpan || targetJoined.length < 7)) return null;
  return kind;
}

// ---------------------------------------------------------------------------
// Live follower
// ---------------------------------------------------------------------------

export interface LiveFollowState {
  statuses: WordStatus[];
  // Index of the next target word the speaker is expected to say.
  cursor: number;
  currentRep: number;
  extraWords: number;
}

export interface FollowOptions {
  // How far past the cursor a heard word may match. Bounded so a common
  // word ("fed", "big", "can") can't jump to its second occurrence and
  // silently skip everything in between.
  lookahead?: number;
}

// Recomputed from scratch on every recognizer update, so a revised partial
// never leaves stale state behind. A miss never freezes the cursor: the
// heard word either matches within the window (the words in between become
// missed) or counts as an extra and the cursor stays put.
export function followLive(target: TargetWord[], heard: HeardToken[], options: FollowOptions = {}): LiveFollowState {
  const lookahead = options.lookahead ?? 3;
  const statuses: WordStatus[] = target.map(() => "pending");
  let cursor = 0;
  let extraWords = 0;
  let h = 0;

  while (h < heard.length && cursor < target.length) {
    let found: SpanMatch | null = null;
    const windowEnd = Math.min(cursor + lookahead, target.length - 1);
    outer: for (let t = cursor; t <= windowEnd; t++) {
      for (const [targetSpan, heardSpan] of SPANS) {
        const kind = matchSpan(target, t, heard, h, targetSpan, heardSpan);
        if (kind) {
          found = { targetIndex: t, targetSpan, heardSpan, kind };
          break outer;
        }
      }
    }
    if (!found) found = resync(target, heard, h, windowEnd + 1);

    if (found) {
      for (let i = cursor; i < found.targetIndex; i++) statuses[i] = "missed";
      for (let i = 0; i < found.targetSpan; i++) statuses[found.targetIndex + i] = found.kind;
      cursor = found.targetIndex + found.targetSpan;
      h += found.heardSpan;
    } else {
      extraWords += 1;
      h += 1;
    }
  }
  extraWords += heard.length - h;

  const currentRep = target[Math.min(cursor, target.length - 1)]?.rep ?? 0;
  return { statuses, cursor, currentRep, extraWords };
}

// The speaker jumped further ahead than the look-ahead window (skipped a
// line). Requires three consecutive heard words to match three consecutive
// target words before trusting the jump, so a single common word can't.
function resync(target: TargetWord[], heard: HeardToken[], h: number, from: number): SpanMatch | null {
  if (h + 2 >= heard.length) return null;
  for (let t = from; t + 2 < target.length; t++) {
    const first = wordMatch(target[t].norm, heard[h]);
    if (!first) continue;
    if (wordMatch(target[t + 1].norm, heard[h + 1]) && wordMatch(target[t + 2].norm, heard[h + 2])) {
      return { targetIndex: t, targetSpan: 1, heardSpan: 1, kind: first };
    }
  }
  return null;
}

// ---------------------------------------------------------------------------
// Final alignment (Needleman-Wunsch style, minimizing total cost)
// ---------------------------------------------------------------------------

export type AlignOpKind = "match" | "near" | "sub" | "del" | "ins" | "merge";

export interface AlignOp {
  kind: AlignOpKind;
  targetIdx: number[];
  heardIdx: number[];
  // For merges: whether the merged span was an exact or near match.
  mergeKind?: MatchKind;
}

// Substitution (1) is cheaper than deletion + insertion (1.7), so a
// misheard word pairs with the word it replaced ("heard bed for bread")
// instead of showing up as one skip plus one extra.
const COST = { match: 0, near: 0.5, sub: 1, del: 1, ins: 0.7 } as const;
// Tie-breakers, far smaller than any real cost difference:
// - a merge costs a hair more than the equivalent single-word matches;
// - an earlier deletion costs a hair more than a later one, so stopping
//   early blames the *last* repetition, not an arbitrary one.
const MERGE_EPSILON = 1e-3;
const DELETE_POSITION_EPSILON = 1e-5;

export function alignFinal(target: TargetWord[], heard: HeardToken[]): AlignOp[] {
  const n = target.length;
  const m = heard.length;
  const cost: number[][] = Array.from({ length: n + 1 }, () => new Array<number>(m + 1).fill(Infinity));
  const back: (AlignOp | null)[][] = Array.from({ length: n + 1 }, () => new Array<AlignOp | null>(m + 1).fill(null));
  cost[0][0] = 0;

  for (let i = 0; i <= n; i++) {
    for (let j = 0; j <= m; j++) {
      const base = cost[i][j];
      if (base === Infinity) continue;
      const relax = (ni: number, nj: number, c: number, op: AlignOp) => {
        if (base + c < cost[ni][nj]) {
          cost[ni][nj] = base + c;
          back[ni][nj] = op;
        }
      };
      if (i < n) {
        relax(i + 1, j, COST.del + DELETE_POSITION_EPSILON * (n - i), { kind: "del", targetIdx: [i], heardIdx: [] });
      }
      if (j < m) relax(i, j + 1, COST.ins, { kind: "ins", targetIdx: [], heardIdx: [j] });
      if (i < n && j < m) {
        const kind = wordMatch(target[i].norm, heard[j]);
        if (kind === "hit") relax(i + 1, j + 1, COST.match, { kind: "match", targetIdx: [i], heardIdx: [j] });
        else if (kind === "near") relax(i + 1, j + 1, COST.near, { kind: "near", targetIdx: [i], heardIdx: [j] });
        else relax(i + 1, j + 1, COST.sub, { kind: "sub", targetIdx: [i], heardIdx: [j] });
      }
      for (const [ts, hs] of SPANS) {
        if (ts === 1 && hs === 1) continue;
        const kind = matchSpan(target, i, heard, j, ts, hs);
        if (!kind) continue;
        relax(i + ts, j + hs, (kind === "hit" ? COST.match : COST.near) + MERGE_EPSILON, {
          kind: "merge",
          targetIdx: Array.from({ length: ts }, (_, k) => i + k),
          heardIdx: Array.from({ length: hs }, (_, k) => j + k),
          mergeKind: kind,
        });
      }
    }
  }

  const ops: AlignOp[] = [];
  let i = n;
  let j = m;
  while (i > 0 || j > 0) {
    const op = back[i][j];
    if (!op) break;
    ops.push(op);
    i -= op.targetIdx.length;
    j -= op.heardIdx.length;
  }
  return ops.reverse();
}

// Per-target-word status from a final alignment (the result screen renders
// from this, not from the live follower).
export function statusesFromAlignment(target: TargetWord[], ops: AlignOp[]): WordStatus[] {
  const statuses: WordStatus[] = target.map(() => "missed");
  for (const op of ops) {
    let status: WordStatus | null = null;
    if (op.kind === "match") status = "hit";
    else if (op.kind === "near") status = "near";
    else if (op.kind === "merge") status = op.mergeKind ?? "hit";
    if (status) for (const t of op.targetIdx) statuses[t] = status;
  }
  return statuses;
}

// ---------------------------------------------------------------------------
// Scoring
// ---------------------------------------------------------------------------

export interface DrillMiss {
  target: string;
  heard: string | null;
  kind: "near" | "substituted" | "skipped";
  rep: number;
}

export interface RepScore {
  rep: number;
  hits: number;
  near: number;
  total: number;
  percent: number;
}

export interface FocusSoundScore {
  sound: string;
  total: number;
  missed: number;
}

export interface DrillScore {
  accuracyPercent: number;
  cleanWordPercent: number;
  perRep: RepScore[];
  repsCompleted: number;
  misses: DrillMiss[];
  extraWords: number;
  wpm: number;
  focusSounds: FocusSoundScore[];
}

export interface AttemptTiming {
  // Milliseconds from first recognized speech to the last recognized word.
  // Callers fall back to the whole attempt's duration when unknown.
  speakingMs: number;
}

const REP_COMPLETE_PERCENT = 80;

// "s" shouldn't count words whose only s is part of "sh" (likewise c/ch,
// t/th, w/wh) — otherwise every "she" would count as an s-word.
function hasSound(norm: string, sound: string): boolean {
  if (sound.length === 1 && "sctw".includes(sound)) return new RegExp(sound + "(?!h)").test(norm);
  return norm.includes(sound);
}

function displayText(display: string): string {
  return cleanText(display)
    .replace(/[^a-z0-9' ]/g, "")
    .trim();
}

export function scoreAlignment(
  target: TargetWord[],
  heard: HeardToken[],
  ops: AlignOp[],
  timing: AttemptTiming,
  focusSounds: string[] = [],
): DrillScore {
  const statuses = statusesFromAlignment(target, ops);
  const hits = statuses.filter((s) => s === "hit").length;
  const near = statuses.filter((s) => s === "near").length;
  const total = target.length;

  const misses: DrillMiss[] = [];
  let extraWords = 0;
  let spokenWords = 0;
  for (const op of ops) {
    spokenWords += op.heardIdx.length;
    if (op.kind === "ins") {
      extraWords += 1;
      continue;
    }
    const rep = target[op.targetIdx[0]].rep;
    const heardText = op.heardIdx.length ? op.heardIdx.map((h) => heard[h].raw).join(" ") : null;
    const targetText = op.targetIdx.map((t) => displayText(target[t].display)).join(" ");
    if (op.kind === "sub") misses.push({ target: targetText, heard: heardText, kind: "substituted", rep });
    else if (op.kind === "del") misses.push({ target: targetText, heard: null, kind: "skipped", rep });
    else if (op.kind === "near" || (op.kind === "merge" && op.mergeKind === "near")) {
      misses.push({ target: targetText, heard: heardText, kind: "near", rep });
    }
  }

  const repCount = total ? target[total - 1].rep + 1 : 0;
  const perRep: RepScore[] = [];
  for (let rep = 0; rep < repCount; rep++) {
    const idx = target.filter((w) => w.rep === rep).map((w) => w.globalIndex);
    const repHits = idx.filter((i) => statuses[i] === "hit").length;
    const repNear = idx.filter((i) => statuses[i] === "near").length;
    perRep.push({
      rep,
      hits: repHits,
      near: repNear,
      total: idx.length,
      percent: idx.length ? Math.round(((repHits + 0.5 * repNear) / idx.length) * 100) : 0,
    });
  }

  const focus: FocusSoundScore[] = focusSounds.map((sound) => {
    const withSound = target.filter((w) => hasSound(w.norm, sound));
    return {
      sound,
      total: withSound.length,
      missed: withSound.filter((w) => statuses[w.globalIndex] !== "hit").length,
    };
  });

  const minutes = Math.max(timing.speakingMs, 1000) / 60000;
  return {
    accuracyPercent: total ? Math.round(((hits + 0.5 * near) / total) * 100) : 0,
    cleanWordPercent: total ? Math.round((hits / total) * 100) : 0,
    perRep,
    repsCompleted: perRep.filter((r) => r.percent >= REP_COMPLETE_PERCENT).length,
    misses,
    extraWords,
    wpm: Math.round(spokenWords / minutes),
    focusSounds: focus,
  };
}

// Manual-timer fallback (no transcript at all): a WPM figure from elapsed
// time against the expanded target's word count; no accuracy is possible.
export function scoreManualAttempt(targetText: string, elapsedSeconds: number, repeatCount: number): number {
  const words = buildTarget(targetText, repeatCount).length;
  const minutes = Math.max(elapsedSeconds / 60, 1 / 60);
  return Math.round(words / minutes);
}
