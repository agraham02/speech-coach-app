# Inference eval (spike for the inference strategy decision)

Supports `docs/decisions/inference-strategy.md`. These scripts are a research spike, not app code. They use only the Python standard library.

## What it tests

The tasks Tono actually asks a model to do, with checks a script can make:

| Task | Cases | Checked automatically |
|---|---|---|
| Rewind notes (`rewind`): **the app's prompt as shipped** in session 10 | 5 synthetic (incl. `rewind_day_with_nap`, a lookalike of the regression transcript), plus the real transcript from the session 10 prompt | part-of-day status against gold (missing vs present, and exact), evidence quotes verbatim, "most vivid" quote verbatim |
| Rewind notes, the app's previous prompt (`rewind_app`) | same | heuristic: does the coverage note call a covered part thin or missing (read the notes too). Kept to show the failure the new prompt fixes |
| Word Chain link judging (`word_chain`): the app's prompt | 4 synthetic chains, 38 links | per-link verdict (matched by link number) against gold, broken links caught, good links wrongly rejected |
| Bridge Chain judging (`bridge_chain`): the app's prompt | 4 synthetic attempts, including "because" said with nothing after it | step verdicts against gold, reasons verbatim, total credit against gold (over-crediting is the failure that matters) |
| Coaching tip from measured stats | 2 synthetic, plus your own take exports | focus skill matches the expected one, every number in the tip appears in the measurements |
| Mark it up | 3 synthetic texts | words come back exactly, sentence ends marked |

The Rewind, Word Chain and Bridge Chain prompts are not written in the Python: `app_prompts.json` is generated from `supabase/functions/_shared/prompts/exercises.ts` by a jest test, so this always tests what the app sends (after changing a prompt: `UPDATE_EVAL_PROMPTS=1 npx jest evalPrompts`).

Real takes are read from your take exports (`--samples-dir`) and the real Rewind transcript is read from the session 10 prompt file (`--rewind-prompt`) at run time. Neither is copied into this repository, which is public. Write results (`--out`) outside the repo, because they quote that content.

## Run a local model (what was run for the decision doc)

1. Download a llama.cpp release build (for example `llama-<build>-bin-win-vulkan-x64.zip`) and GGUF files into a folder outside the repo, such as `C:\dev\tono-models`.
2. `bash run_local_models.sh` starts `llama-server` for each model and runs the eval. Edit the paths at the top for your machine.
3. `python -I eval.py --score C:/dev/tono-models/eval-results` prints the summary.

Local runs on a desktop GPU are a quality proxy for the same weights on a phone. They say nothing about phone speed, memory, heat or battery; the iPhone checklist in the decision doc covers those.

## Run the hosted side (you run this; it is billed to your key)

```bash
export GEMINI_API_KEY=...   # a paid-tier key; never commit it
python -I eval.py --backend gemini --model gemini-3.5-flash-lite --label flash-lite \
  --samples-dir C:/dev/speech-coach-app/analysis_samples \
  --rewind-prompt ~/.claude/plans/tono-session-prompts/10-exercise-judging.md \
  --out C:/dev/tono-models/eval-results --thinking-budget 512
python -I eval.py --backend gemini --model gemini-3.8-flash --label flash ... (same flags)
python -I eval.py --score C:/dev/tono-models/eval-results
```

About 70 calls per model at 2 runs each: well under 50 cents on Flash-Lite.

## Cost model

`python -I cost_model.py` prints the per-call and per-subscriber costs used in the decision doc. Change the assumptions at the top of the file.
