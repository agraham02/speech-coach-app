"""Tono inference eval: the same task prompts against local and hosted models.

Standard library only. Usage (see README.md):

  # local model behind llama.cpp's llama-server (OpenAI-compatible API)
  python -I eval.py --backend llamacpp --url http://127.0.0.1:8080 --label gemma4-e2b \
      --samples-dir C:/dev/speech-coach-app/analysis_samples \
      --rewind-prompt C:/Users/<you>/.claude/plans/tono-session-prompts/10-exercise-judging.md \
      --out C:/dev/tono-models/eval-results

  # hosted Gemini (reads GEMINI_API_KEY from the environment; billed to that key)
  python -I eval.py --backend gemini --model gemini-3.5-flash-lite --label flash-lite ...

  # score every results file in a folder
  python -I eval.py --score C:/dev/tono-models/eval-results

Real takes and the real Rewind transcript are read from your own files at run
time and are never copied into this repository (it is public). Results files
contain model output about them, so keep --out outside the repo.
"""

from __future__ import annotations

import argparse
import glob
import json
import math
import os
import re
import sys
import time
import urllib.error
import urllib.request

HERE = os.path.dirname(os.path.abspath(__file__))
SKILLS = ["articulation", "cadence", "impromptu", "confidence", "conversation"]

# --------------------------------------------------------------------------
# Prompts. Rewind and mark-up mirror the app's current prompts
# (src/domain/rewind/reviewPrompt.ts, src/domain/cadence/autoMarkPrompt.ts);
# Rewind adds the structured coverage the decision doc proposes.
# --------------------------------------------------------------------------

# The app's PREVIOUS Rewind prompt and schema (free-text coverage), kept to
# see whether a model reproduces the session 10 failure with it.
REWIND_APP_SYSTEM = """You are a warm, honest speaking coach reading the transcript of someone telling the story of their day out loud. They are practicing recalling a day in detail and putting it into words. You only have the transcript — you can't hear them, so say nothing about voice, pace, volume, fillers or confidence.

Write short notes on the CONTENT only:
- specificity: how concrete it was — names, places, times, numbers, what they saw, heard or felt — and one place a vague line could have been a specific one.
- storytelling: whether it told moments (this happened, then I felt/did this) or only listed things.
- flow: whether it followed a clear order and how it moved from one part of the day to the next.
- coverage: which parts of the day it covered (morning, midday, evening) and which got little.

Also pick the single most vivid detail they said (quote it exactly), and give one small thing to try tomorrow.

Rules: no scores, grades, numbers out of ten, or percentages. Be kind but never flatter — point at real words from the transcript. Each note is one or two plain sentences. Don't diagnose or mention anxiety. Write to them as "you"."""

REWIND_APP_SCHEMA = {
    "type": "object",
    "properties": {k: {"type": "string"} for k in ["specificity", "storytelling", "flow", "coverage", "vividDetail", "tryTomorrow"]},
    "required": ["specificity", "storytelling", "flow", "coverage", "vividDetail", "tryTomorrow"],
}

# The prompts the app sends now (src/services/analysis/prompts.ts). Generated
# into app_prompts.json by the jest test evalPrompts.test.ts, so this eval
# always tests what the app really asks. Scoring also applies the checks the
# phone makes (verbatim quotes, one verdict per link).
with open(os.path.join(HERE, "app_prompts.json"), encoding="utf-8") as _f:
    APP = json.load(_f)
REWIND_SYSTEM, REWIND_SCHEMA = APP["rewind"]["system"], APP["rewind"]["schema"]
CHAIN_SYSTEM, CHAIN_SCHEMA = APP["word_chain"]["system"], APP["word_chain"]["schema"]
BRIDGE_SYSTEM, BRIDGE_SCHEMA = APP["bridge_chain"]["system"], APP["bridge_chain"]["schema"]

COACH_SYSTEM = """You are a warm, direct public-speaking coach. You get the transcript of a short practice answer and measurements the phone took while they spoke. Treat the measurements as facts. Never invent numbers: any number you write must come from the measurements given.

Return:
- strength: one specific thing done well, under 20 words.
- tip: the single most useful change for next time, concrete and under 35 words. Pick the weakness that matters most for this take.
- focusSkill: the skill the tip trains. articulation = clear words and pronunciation; cadence = pace, pauses, pitch and loudness variety; impromptu = structure, fillers and thinking on your feet; confidence = eye contact, face and presence on camera; conversation = back-and-forth replies.
- followUpQuestion: a natural question a listener would ask next, under 18 words."""

COACH_SCHEMA = {
    "type": "object",
    "properties": {
        "strength": {"type": "string"},
        "tip": {"type": "string"},
        "focusSkill": {"type": "string", "enum": SKILLS},
        "followUpQuestion": {"type": "string"},
    },
    "required": ["strength", "tip", "focusSkill", "followUpQuestion"],
}

MARK_SYSTEM = """You mark short texts for reading aloud, like a voice coach annotating a script.
Rewrite the text EXACTLY as given (same words, same order, same punctuation), adding only these marks:
*word* = stress this word (at most one per phrase, on the word that carries the new information or the contrast)
word↗ = pitch rises at the end of this word (yes/no questions, a thought that continues, list items before the last)
word↘ = pitch falls at the end of this word (statements, wh-questions, the last item of a list)
| = a short pause between words (at commas, dashes, and before a key word)
|| = a long pause (at the end of each sentence, except the very last word)
Every sentence end gets ↗ or ↘. Every comma gets a pause. Do not add or change any words."""

MARK_SCHEMA = {"type": "object", "properties": {"marked": {"type": "string"}}, "required": ["marked"]}

# --------------------------------------------------------------------------
# Cases
# --------------------------------------------------------------------------


def semitones(lo: float, hi: float) -> float:
    return round(12 * math.log2(hi / lo), 1)


def export_to_coach_case(path: str) -> dict | None:
    """Build a coaching case from a Tono take export (Dev tab), the way
    src/services/cloud/measuredReview.ts measurementLines() writes them."""
    with open(path, encoding="utf-8") as f:
        d = json.load(f)
    if d.get("kind") != "tono-take-export":
        return None
    t, v, p, pr = d["take"], d["voice"], d["pauses"], d["presence"]
    pace = next((o["value"] for o in d["coach"]["observations"] if o["label"] == "Pace"), None)
    lines = [f"- Duration: {round(t['durationSeconds'])} s"]
    if pace:
        lines.append(f"- Pace: {pace.replace(' wpm', '')} words per minute on average")
    fl = d.get("fluency", {})
    lines.append(f"- Filler words: {fl.get('fillerWordCount', 0)} ({fl.get('fillerRatePerMinute', 0)} per minute)")
    lines.append(
        f"- Pauses: {round(p['pausesPerMinute'], 1)} pauses per minute; longest {round(p['longestPauseMs'] / 1000, 1)} s; "
        f"{p['hesitations']} hesitations (mid-phrase gaps of 2 s or more); {round(p['boundaryPauseRate'] * 100)}% of sentence endings followed by a real pause"
    )
    ph = v["pitchHz"]
    lines.append(
        f"- Pitch: average {round(ph['avg'])} Hz, from {round(ph['min'])} to {round(ph['max'])} Hz — a span of {semitones(ph['min'], ph['max'])} semitones "
        "(under ~5 tends to sound monotone; 8–12 is typical lively conversation)"
    )
    vo = v["volumeDbfs"]
    lines.append(
        f"- Loudness: average {round(vo['avg'], 1)} dBFS, varying by {round(vo['stddev'], 1)} dB (standard deviation; under ~3 dB reads flat, 5 dB or more is clearly varied)"
    )
    lines.append(
        f"- Face (camera): in frame {pr['framedPercent']}% of the time; eye contact with the lens {pr['eyeContactPercent']}% (from where the eyes point); "
        f"looking down {pr['lookingDownPercent']}%; longest look-away {round(pr['longestLookAwayMs'] / 1000, 1)} s; expressiveness {pr['expressiveness']}/100; smiling {pr['smilePercent']}%"
    )
    # The reference the hosted video review (Gemini Flash, with video and audio)
    # gave for the same take, when there is one: its focus area is the label.
    review = d.get("review") or {}
    return {
        "id": "coach_real_" + os.path.splitext(os.path.basename(path))[0],
        "promptText": None,
        "measurements": lines,
        "transcript": d["transcript"]["verbatim"],
        "goldFocus": None,
        "referenceFocusArea": review.get("topFocusArea"),
        "private": True,
    }


def real_rewind_case(prompt_file: str) -> dict | None:
    """The real Rewind transcript quoted in the session 10 prompt."""
    with open(prompt_file, encoding="utf-8") as f:
        text = f.read()
    m = re.search(r"this was the transcript it heard:\s*\n\s*\n> \"(.+?)\"\s*\n", text, re.S)
    if not m:
        return None
    return {"id": "rewind_real_full_day", "transcript": m.group(1), "gold": {"morning": "covered", "midday": "covered", "evening": "covered|brief"}, "private": True}


# Expected focus for the real exports, read off the measurements and the hosted
# video review of each take (label by the eval author; see the decision doc).
REAL_COACH_GOLD = {
    "coach_real_run1": ["cadence", "confidence"],
    "coach_real_run2": ["cadence", "confidence"],
    "coach_real_run3": ["cadence"],
}


def load_cases(args) -> list[dict]:
    with open(os.path.join(HERE, "cases_synthetic.json"), encoding="utf-8") as f:
        syn = json.load(f)
    cases: list[dict] = []
    rewinds = list(syn["rewind"])
    if args.rewind_prompt and os.path.exists(args.rewind_prompt):
        real = real_rewind_case(args.rewind_prompt)
        if real:
            rewinds.insert(0, real)
    for c in rewinds:
        cases.append({"task": "rewind", **c})
    for c in rewinds:
        cases.append({"task": "rewind_app", **c})
    for c in syn["word_chain"]:
        cases.append({"task": "word_chain", **c})
    for c in syn["bridge_chain"]:
        cases.append({"task": "bridge_chain", **c})
    coach = list(syn["coaching_synthetic"])
    if args.samples_dir:
        for path in sorted(glob.glob(os.path.join(args.samples_dir, "*.json"))):
            c = export_to_coach_case(path)
            if c:
                c["goldFocus"] = REAL_COACH_GOLD.get(c["id"])
                coach.append(c)
    for c in coach:
        cases.append({"task": "coaching", **c})
    for c in syn["mark_up"]:
        cases.append({"task": "mark_up", **c})
    if args.only:
        cases = [c for c in cases if c["task"] in args.only.split(",")]
    return cases


def build_prompt(case: dict) -> tuple[str, str, dict]:
    task = case["task"]
    if task == "rewind":
        return REWIND_SYSTEM, f"Here is the transcript of their day:\n\n\"\"\"{case['transcript']}\"\"\"", REWIND_SCHEMA
    if task == "rewind_app":
        return REWIND_APP_SYSTEM, f"Here is the transcript of their day:\n\n{case['transcript']}", REWIND_APP_SCHEMA
    if task == "word_chain":
        words = case["words"]
        pairs = "\n".join(f"{i + 1}. {a} -> {b}" for i, (a, b) in enumerate(zip(words, words[1:])))
        return CHAIN_SYSTEM, f"Judge these {len(words) - 1} links, in the order spoken:\n{pairs}", CHAIN_SCHEMA
    if task == "bridge_chain":
        blocks = "\n\n".join(f"Start word {i + 1}: {seg['seed']}\nThey said: \"\"\"{seg['said']}\"\"\"" for i, seg in enumerate(case["segments"]))
        return BRIDGE_SYSTEM, blocks, BRIDGE_SCHEMA
    if task == "coaching":
        head = f'Prompt they answered: "{case["promptText"]}"' if case.get("promptText") else "This was a free-form recording."
        body = "\n".join(case["measurements"])
        return COACH_SYSTEM, f"{head}\n\nMeasurements:\n{body}\n\nTranscript:\n\"\"\"{case['transcript']}\"\"\"", COACH_SCHEMA
    if task == "mark_up":
        return MARK_SYSTEM, f"Mark this text:\n\n{case['text']}", MARK_SCHEMA
    raise ValueError(task)


# --------------------------------------------------------------------------
# Backends
# --------------------------------------------------------------------------


def post_json(url: str, body: dict, headers: dict, timeout: int = 300) -> dict:
    req = urllib.request.Request(url, data=json.dumps(body).encode(), headers={"Content-Type": "application/json", **headers})
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return json.loads(r.read().decode())


def call_llamacpp(args, system: str, user: str, schema: dict) -> dict:
    body = {
        "messages": [{"role": "system", "content": system}, {"role": "user", "content": user}],
        "temperature": args.temperature,
        "max_tokens": args.max_tokens,
        "seed": args.seed,
        "chat_template_kwargs": {"enable_thinking": args.thinking},
    }
    if args.constrained:
        body["response_format"] = {"type": "json_schema", "json_schema": {"name": "answer", "schema": schema}}
    else:
        body["messages"][0]["content"] = system + "\n\nAnswer with only a JSON object matching this schema:\n" + json.dumps(schema)
    t0 = time.time()
    r = post_json(args.url.rstrip("/") + "/v1/chat/completions", body, {})
    dt = time.time() - t0
    msg = r["choices"][0]["message"]
    usage = r.get("usage", {})
    timings = r.get("timings", {})
    return {
        "text": msg.get("content") or "",
        "seconds": round(dt, 2),
        "promptTokens": usage.get("prompt_tokens"),
        "outputTokens": usage.get("completion_tokens"),
        "decodeTps": timings.get("predicted_per_second"),
        "prefillTps": timings.get("prompt_per_second"),
    }


def call_gemini(args, system: str, user: str, schema: dict) -> dict:
    key = os.environ.get("GEMINI_API_KEY")
    if not key:
        sys.exit("Set GEMINI_API_KEY to run the hosted side. It is billed to that key.")
    gen = {"responseMimeType": "application/json", "responseJsonSchema": schema, "temperature": args.temperature, "maxOutputTokens": args.max_tokens}
    if args.thinking_budget is not None:
        gen["thinkingConfig"] = {"thinkingBudget": args.thinking_budget}
    body = {"systemInstruction": {"parts": [{"text": system}]}, "contents": [{"role": "user", "parts": [{"text": user}]}], "generationConfig": gen}
    url = f"https://generativelanguage.googleapis.com/v1beta/models/{args.model}:generateContent"
    t0 = time.time()
    r = post_json(url, body, {"x-goog-api-key": key})
    dt = time.time() - t0
    parts = r.get("candidates", [{}])[0].get("content", {}).get("parts", [])
    um = r.get("usageMetadata", {})
    return {
        "text": "".join(p.get("text", "") for p in parts if not p.get("thought")),
        "seconds": round(dt, 2),
        "promptTokens": um.get("promptTokenCount"),
        "outputTokens": um.get("candidatesTokenCount"),
        "thinkingTokens": um.get("thoughtsTokenCount"),
    }


# --------------------------------------------------------------------------
# Scoring
# --------------------------------------------------------------------------


def norm(s: str) -> str:
    s = s.lower().replace("’", "'")
    s = re.sub(r"[^a-z0-9' ]+", " ", s)
    return re.sub(r"\s+", " ", s).strip()


def verbatim(quote: str, source: str) -> bool:
    q = norm(quote.strip().strip('"'))
    return bool(q) and q in norm(source)


def parse(text: str):
    t = text.strip()
    t = re.sub(r"^```(?:json)?\s*|\s*```$", "", t)
    try:
        return json.loads(t)
    except Exception:
        m = re.search(r"\{.*\}", t, re.S)
        if m:
            try:
                return json.loads(m.group(0))
            except Exception:
                return None
    return None


NUM = re.compile(r"(?<![\w.])\d+(?:\.\d+)?")


def numbers_grounded(text: str, source: str) -> tuple[bool, list[str]]:
    src = [float(x) for x in NUM.findall(source)]
    bad = []
    for n in NUM.findall(text):
        f = float(n)
        if f in (1.0, 2.0, 3.0) and len(n) == 1:
            continue  # "one", "two" counts, "3 seconds" style advice
        if not any(abs(f - s) <= max(1.0, 0.02 * s) for s in src):
            bad.append(n)
    return (not bad, bad)


MARK_TOKEN = re.compile(r"[*↗↘]")


def markup_words(marked: str) -> list[str]:
    out = []
    for tok in marked.split():
        if set(tok) <= {"|"}:
            continue
        w = MARK_TOKEN.sub("", tok).replace("|", "")
        if w:
            out.append(w)
    return out


def score_one(case: dict, out) -> dict:
    task = case["task"]
    if out is None:
        return {"valid": False}
    try:
        if task == "rewind":
            cov = out["parts"]
            res = {"valid": True, "parts": {}}
            missing_ok = exact_ok = grounded = 0
            for part in ("morning", "midday", "evening"):
                gold = case["gold"][part].split("|")
                st = cov[part]["status"]
                ev = cov[part].get("evidence", "")
                m_ok = (st == "missing") == ("missing" in gold)
                missing_ok += m_ok
                exact_ok += st in gold
                g = st == "missing" or verbatim(ev, case["transcript"])
                grounded += g
                res["parts"][part] = {"status": st, "gold": case["gold"][part], "missingCorrect": m_ok, "evidenceVerbatim": g}
            res["missingCorrect"] = missing_ok
            res["exactCorrect"] = exact_ok
            res["evidenceGrounded"] = grounded
            res["vividVerbatim"] = verbatim(out.get("vividDetail", ""), case["transcript"])
            return res
        if task == "rewind_app":
            # Heuristic only; read the notes too. A part counts as "said to be
            # thin or missing" when a sentence of the coverage note names it
            # next to a negative cue.
            note = out.get("coverage", "")
            parts = {"morning": ["morning"], "midday": ["midday", "afternoon", "lunch", "work day", "workday", "middle of the day"], "evening": ["evening", "night"]}
            cues = re.compile(r"\b(little|less|not|no|missing|didn't|barely|brief|briefly|lack|without|skipp\w*|could add|more about|mostly|focus(?:ed)? on)\b", re.I)
            flagged = {}
            for part, names in parts.items():
                hit = False
                for sent in re.split(r"(?<=[.!?;])\s+", note):
                    low = sent.lower()
                    if any(n in low for n in names) and cues.search(sent):
                        hit = True
                flagged[part] = hit
            wrong = [p for p in parts if flagged[p] and "missing" not in case["gold"][p] and "brief" not in case["gold"][p]]
            return {"valid": True, "coverageNote": note, "flaggedThinOrMissing": flagged, "wronglyFlagged": wrong, "vividVerbatim": verbatim(out.get("vividDetail", ""), case["transcript"])}
        if task == "word_chain":
            gold = case["gold"]
            n = len(gold)
            by_n = {l.get("n"): l.get("verdict") for l in out["links"]}
            got = [by_n.get(i + 1) for i in range(n)]
            right = sum(1 for g, p in zip(gold, got) if p in g.split("|"))
            none_gold = [i for i, g in enumerate(gold) if g == "none"]
            none_caught = sum(1 for i in none_gold if got[i] == "none")
            strong_gold = [i for i, g in enumerate(gold) if g == "strong"]
            false_reject = sum(1 for i in strong_gold if got[i] == "none")
            # The app refuses an answer that skips a link (and asks once more).
            return {"valid": all(g is not None for g in got), "links": n, "correct": right, "brokenLinks": len(none_gold), "brokenCaught": none_caught, "falseRejects": false_reject, "got": got}
        if task == "bridge_chain":
            said = " ".join(seg["said"] for seg in case["segments"])
            steps = out["steps"]
            gold = case["gold"]
            weights = {"explained": 1.0, "thin": 0.5, "unexplained": 0.0}
            got = [s.get("verdict") for s in steps]
            right = sum(1 for g, p in zip(gold, got) if g == p)
            reasons = [s.get("reason", "") for s in steps if s.get("verdict") != "unexplained"]
            return {
                "valid": len(steps) == len(gold),
                "steps": len(gold),
                "correct": right,
                "reasonsVerbatim": sum(1 for r in reasons if verbatim(r, said)),
                "reasonsClaimed": len(reasons),
                # What the score would be: a judge that over-credits is the failure that matters.
                "credit": sum(weights.get(v, 0) for v in got),
                "goldCredit": sum(weights[g] for g in gold),
                "got": got,
            }
        if task == "coaching":
            src = "\n".join(case["measurements"]) + "\n" + case["transcript"]
            text = f"{out.get('strength', '')} {out.get('tip', '')}"
            ok, bad = numbers_grounded(text, src)
            fs = out.get("focusSkill")
            return {
                "valid": fs in SKILLS,
                "focusSkill": fs,
                "focusMatches": bool(case.get("goldFocus")) and fs in case["goldFocus"],
                "numbersGrounded": ok,
                "inventedNumbers": bad,
                "tipWords": len(out.get("tip", "").split()),
                "strength": out.get("strength"),
                "tip": out.get("tip"),
            }
        if task == "mark_up":
            marked = out.get("marked", "")
            want = case["text"].split()
            got = markup_words(marked)
            sentences = len(re.findall(r"[.?!](?=\s|$)", case["text"]))
            ends = len(re.findall(r"[.?!][↗↘]|[↗↘][.?!]", marked))
            return {"valid": True, "wordsExact": [w.replace("’", "'") for w in got] == [w.replace("’", "'") for w in want], "sentenceEndsMarked": f"{ends}/{sentences}", "hasMarks": bool(re.search(r"[*↗↘|]", marked))}
    except Exception as e:  # malformed but parseable JSON
        return {"valid": False, "error": str(e)}
    return {"valid": False}


def summarize(folder: str) -> None:
    rows = []
    for path in sorted(glob.glob(os.path.join(folder, "*.jsonl"))):
        with open(path, encoding="utf-8") as f:
            rows += [json.loads(line) for line in f if line.strip()]
    labels = sorted({r["label"] for r in rows})
    print(f"{len(rows)} results, {len(labels)} configurations\n")
    for label in labels:
        rs = [r for r in rows if r["label"] == label]
        s = {}
        rw = [r for r in rs if r["task"] == "rewind"]
        if rw:
            ok = [r["score"] for r in rw if r["score"].get("valid")]
            s["rewind_valid"] = f"{len(ok)}/{len(rw)}"
            s["rewind_missing_ok"] = f"{sum(x['missingCorrect'] for x in ok)}/{3 * len(rw)}"
            s["rewind_exact"] = f"{sum(x['exactCorrect'] for x in ok)}/{3 * len(rw)}"
            s["rewind_evidence_verbatim"] = f"{sum(x['evidenceGrounded'] for x in ok)}/{3 * len(rw)}"
            s["rewind_vivid_verbatim"] = f"{sum(x['vividVerbatim'] for x in ok)}/{len(rw)}"
            real = [r for r in rw if r["case"] == "rewind_real_full_day"]
            if real:
                s["rewind_REAL_all_parts_right"] = f"{sum(1 for r in real if r['score'].get('valid') and r['score']['missingCorrect'] == 3)}/{len(real)}"
        ra = [r for r in rs if r["task"] == "rewind_app"]
        if ra:
            ok = [r for r in ra if r["score"].get("valid")]
            s["rewindApp_wrongly_flagged_takes"] = f"{sum(1 for r in ok if r['score']['wronglyFlagged'])}/{len(ra)}"
            s["rewindApp_vivid_verbatim"] = f"{sum(1 for r in ok if r['score']['vividVerbatim'])}/{len(ra)}"
            real = [r for r in ok if r["case"] == "rewind_real_full_day"]
            if real:
                s["rewindApp_REAL_wrongly_flagged"] = f"{sum(1 for r in real if r['score']['wronglyFlagged'])}/{len(real)}"
        wc = [r for r in rs if r["task"] == "word_chain"]
        if wc:
            ok = [r["score"] for r in wc if r["score"].get("links")]
            s["chain_valid"] = f"{sum(1 for r in wc if r['score'].get('valid'))}/{len(wc)}"
            s["chain_links_correct"] = f"{sum(x['correct'] for x in ok)}/{sum(x['links'] for x in ok)}"
            s["chain_broken_caught"] = f"{sum(x['brokenCaught'] for x in ok)}/{sum(x['brokenLinks'] for x in ok)}"
            s["chain_false_rejects"] = sum(x["falseRejects"] for x in ok)
        bc = [r for r in rs if r["task"] == "bridge_chain"]
        if bc:
            ok = [r["score"] for r in bc if r["score"].get("steps")]
            s["bridge_valid"] = f"{sum(1 for r in bc if r['score'].get('valid'))}/{len(bc)}"
            s["bridge_steps_correct"] = f"{sum(x['correct'] for x in ok)}/{sum(x['steps'] for x in ok)}"
            s["bridge_reasons_verbatim"] = f"{sum(x['reasonsVerbatim'] for x in ok)}/{sum(x['reasonsClaimed'] for x in ok)}"
            s["bridge_credit_vs_gold"] = f"{sum(x['credit'] for x in ok)} / {sum(x['goldCredit'] for x in ok)}"
        co = [r for r in rs if r["task"] == "coaching"]
        if co:
            ok = [r["score"] for r in co if r["score"].get("valid")]
            s["coach_valid"] = f"{len(ok)}/{len(co)}"
            s["coach_focus_match"] = f"{sum(1 for x in ok if x['focusMatches'])}/{len(co)}"
            s["coach_numbers_grounded"] = f"{sum(1 for x in ok if x['numbersGrounded'])}/{len(co)}"
        mk = [r for r in rs if r["task"] == "mark_up"]
        if mk:
            s["markup_words_exact"] = f"{sum(1 for r in mk if r['score'].get('wordsExact'))}/{len(mk)}"
        secs = [r["seconds"] for r in rs if r.get("seconds")]
        outs = [r["outputTokens"] for r in rs if r.get("outputTokens")]
        if secs:
            s["median_seconds"] = sorted(secs)[len(secs) // 2]
        if outs:
            s["median_output_tokens"] = sorted(outs)[len(outs) // 2]
        print(label)
        for k, v in s.items():
            print(f"  {k:30} {v}")
        print()


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--backend", choices=["llamacpp", "gemini"])
    ap.add_argument("--url", default="http://127.0.0.1:8080")
    ap.add_argument("--model", default="gemini-3.5-flash-lite")
    ap.add_argument("--label", help="name for this configuration in the results")
    ap.add_argument("--samples-dir", help="folder of Tono take exports (Dev tab JSON)")
    ap.add_argument("--rewind-prompt", help="the session 10 prompt file that quotes the real Rewind transcript")
    ap.add_argument("--out", help="results folder (keep it outside the repo)")
    ap.add_argument("--runs", type=int, default=2)
    ap.add_argument("--temperature", type=float, default=0.3)
    ap.add_argument("--max-tokens", type=int, default=1200)
    ap.add_argument("--seed", type=int, default=7)
    ap.add_argument("--thinking", action="store_true", help="let the model think first (llama.cpp chat templates that support it)")
    ap.add_argument("--thinking-budget", type=int, help="Gemini thinking budget in tokens (0 = off)")
    ap.add_argument("--unconstrained", dest="constrained", action="store_false", help="ask for JSON in the prompt instead of grammar-constrained decoding")
    ap.add_argument("--only", help="comma-separated tasks: rewind,rewind_app,word_chain,bridge_chain,coaching,mark_up")
    ap.add_argument("--score", help="summarize every results file in this folder and exit")
    args = ap.parse_args()

    if args.score:
        summarize(args.score)
        return
    if not (args.backend and args.label and args.out):
        ap.error("--backend, --label and --out are required to run")
    os.makedirs(args.out, exist_ok=True)
    call = call_llamacpp if args.backend == "llamacpp" else call_gemini
    cases = load_cases(args)
    path = os.path.join(args.out, f"{args.label}.jsonl")
    with open(path, "a", encoding="utf-8") as f:
        for case in cases:
            system, user, schema = build_prompt(case)
            for run in range(args.runs):
                try:
                    r = call(args, system, user, schema)
                except (urllib.error.URLError, TimeoutError, KeyError) as e:
                    r = {"text": "", "error": str(e)}
                out = parse(r.get("text", ""))
                row = {"label": args.label, "task": case["task"], "case": case["id"], "run": run, **r, "output": out, "score": score_one(case, out)}
                f.write(json.dumps(row, ensure_ascii=False) + "\n")
                f.flush()
                print(f"{args.label} {case['id']} run {run}: {row['score'].get('valid')} {r.get('seconds')} s", flush=True)
    print(f"\nWrote {path}")


if __name__ == "__main__":
    main()
