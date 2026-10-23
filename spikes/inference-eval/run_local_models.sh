#!/usr/bin/env bash
# Runs the eval against each local GGUF model through llama.cpp's llama-server.
# Paths are this machine's (Windows, Git Bash); change them for yours.
set -u
LLAMA=${LLAMA:-/c/dev/tono-models/llama}
MODELS=${MODELS:-/c/dev/tono-models/gguf}
OUT=${OUT:-/c/dev/tono-models/eval-results}
SAMPLES=${SAMPLES:-/c/dev/speech-coach-app/analysis_samples}
REWIND=${REWIND:-$HOME/.claude/plans/tono-session-prompts/10-exercise-judging.md}
HERE=$(cd "$(dirname "$0")" && pwd)
EXTRA=${EXTRA:-}
SUFFIX=${SUFFIX:-}

run() {
  local label=$1 file=$2
  "$LLAMA/llama-server.exe" -m "$MODELS/$file" -ngl 99 -c 8192 --jinja --port 8080 --log-disable >/dev/null 2>&1 &
  local pid=$!
  for _ in $(seq 1 120); do
    curl -s http://127.0.0.1:8080/health | grep -q '"ok"' && break
    sleep 1
  done
  python -I "$HERE/eval.py" --backend llamacpp --label "$label$SUFFIX" --samples-dir "$SAMPLES" --rewind-prompt "$REWIND" --out "$OUT" $EXTRA
  kill $pid; wait $pid 2>/dev/null
}

run gemma4-e2b gemma-4-E2B-it-Q4_K_M.gguf
run qwen3.5-4b Qwen3.5-4B-Q4_K_M.gguf
run qwen3.5-2b Qwen3.5-2B-Q4_K_M.gguf
run lfm2.5-1.2b LFM2.5-1.2B-Instruct-Q4_K_M.gguf
