"""Cost model for docs/decisions/inference-strategy.md. Change the inputs and re-run:

    python -I cost_model.py

Prices are USD per million tokens from https://ai.google.dev/gemini-api/docs/pricing
(read 2026-10-22) and https://openrouter.ai/api/v1/models (read 2026-10-22).
Token counts per call come from the two Gemini video reviews in the user's own take
exports (analysis_samples, 2026-10-17 and 2026-10-20) and are scaled up for the
richer prompt and output the new design asks for.
"""

PRICES = {
    # model: (input incl. video and audio, output incl. thinking)
    "gemini-3.5-flash-lite": (0.30, 2.50),  # no change listed for 2027
    "gemini-3.1-flash-lite": (0.25, 1.50),  # audio input $0.50
    "gemini-3.8-flash (to Dec 31 2026)": (0.75, 3.75),
    "gemini-3.8-flash (from Jan 1 2027)": (1.50, 7.50),
    "gemma-4-26b-a4b via OpenRouter (text only)": (0.076, 0.255),
    "qwen3.5-35b-a3b via OpenRouter (text only)": (0.14, 1.00),
}

# Per-call token assumptions.
VIDEO_TOKENS_PER_SECOND = 91  # measured: 5005 tokens / 55 s and 8094 / 89 s at default media resolution
CALLS = {
    # name: (input tokens, output tokens incl. thinking)
    "video review, 90 s take": (90 * VIDEO_TOKENS_PER_SECOND + 3000, 2500 + 1500),
    "video review, 3 min take": (180 * VIDEO_TOKENS_PER_SECOND + 3000, 2800 + 1500),
    "text judgement (Rewind, Word Chain, coaching, mark-up)": (1800, 700 + 500),
    "insight (progress report, Then vs now)": (6000, 1500 + 1000),
    # One minute of conversation practice, cascaded: phone STT (free), about
    # 3 partner turns a minute on a text model with a growing history, and
    # ~30 s of partner speech through Gemini 3.8 Flash-Lite TTS.
    "conversation minute, LLM part": (3 * 1500, 3 * 80),
}
TTS_PER_MINUTE_OF_SPEECH = {"to Dec 31 2026": 0.009, "from Jan 1 2027": 0.018}  # Gemini 3.8 Flash-Lite TTS
LIVE_PER_CONVERSATION_MINUTE = 0.02  # Gemini 3.8 Live: $0.005/min in + $0.018/min out, ~half each, plus context re-billing (estimate)

# Monthly usage of one Plus subscriber under the new design (more AI per take).
PROFILES = {
    "light": {"video review, 90 s take": 12, "text judgement (Rewind, Word Chain, coaching, mark-up)": 15, "insight (progress report, Then vs now)": 2, "conversation minutes": 10},
    "typical": {"video review, 90 s take": 30, "text judgement (Rewind, Word Chain, coaching, mark-up)": 40, "insight (progress report, Then vs now)": 4, "conversation minutes": 30},
    "heavy": {"video review, 3 min take": 60, "text judgement (Rewind, Word Chain, coaching, mark-up)": 100, "insight (progress report, Then vs now)": 12, "conversation minutes": 120},
    # A 14-day trial used at "typical" intensity.
    "trial (14 days, typical)": {"video review, 90 s take": 14, "text judgement (Rewind, Word Chain, coaching, mark-up)": 18, "insight (progress report, Then vs now)": 2, "conversation minutes": 15},
}

# Revenue per subscriber per month.
MONTHLY, ANNUAL = 4.99, 49.99
APPLE_CUT = 0.15  # Small Business Program
VAT_HAIRCUT = 0.15  # blended allowance for tax-inclusive prices outside the US (assumption)


def call_cost(model: str, name: str) -> float:
    i, o = CALLS[name]
    pi, po = PRICES[model]
    return (i * pi + o * po) / 1e6


def profile_cost(model: str, profile: dict, period: str = "to Dec 31 2026", voice: str = "cascaded") -> float:
    total = 0.0
    for name, n in profile.items():
        if name == "conversation minutes":
            if voice == "cascaded":
                total += n * (call_cost(model, "conversation minute, LLM part") + 0.5 * TTS_PER_MINUTE_OF_SPEECH[period])
            else:
                total += n * LIVE_PER_CONVERSATION_MINUTE
        else:
            total += n * call_cost(model, name)
    return total


def main() -> None:
    print("Per call, USD")
    for model in ["gemini-3.5-flash-lite", "gemini-3.8-flash (to Dec 31 2026)", "gemini-3.8-flash (from Jan 1 2027)"]:
        print(f"  {model}")
        for name in CALLS:
            print(f"    {name:58} {call_cost(model, name) * 100:6.2f} cents")
    for model in ["gemma-4-26b-a4b via OpenRouter (text only)", "qwen3.5-35b-a3b via OpenRouter (text only)"]:
        print(f"  {model}: text judgement {call_cost(model, 'text judgement (Rewind, Word Chain, coaching, mark-up)') * 100:.3f} cents")
    print(f"  conversation, cascaded: {(call_cost('gemini-3.5-flash-lite', 'conversation minute, LLM part') + 0.5 * TTS_PER_MINUTE_OF_SPEECH['to Dec 31 2026']) * 100:.2f} cents a minute (2026), Live API about {LIVE_PER_CONVERSATION_MINUTE * 100:.1f} cents")

    print("\nPer subscriber per month, USD (default model gemini-3.5-flash-lite)")
    for pname, prof in PROFILES.items():
        c = profile_cost("gemini-3.5-flash-lite", prof)
        c_live = profile_cost("gemini-3.5-flash-lite", prof, voice="live")
        c_flash = profile_cost("gemini-3.8-flash (from Jan 1 2027)", prof, period="from Jan 1 2027")
        print(f"  {pname:26} Flash-Lite ${c:5.2f}   with Live voice ${c_live:5.2f}   if everything ran on 3.8 Flash in 2027 ${c_flash:5.2f}")

    net_m = MONTHLY * (1 - APPLE_CUT) * (1 - VAT_HAIRCUT)
    net_a = ANNUAL / 12 * (1 - APPLE_CUT) * (1 - VAT_HAIRCUT)
    print(f"\nNet revenue per subscriber per month: monthly plan ${net_m:.2f}, annual plan ${net_a:.2f}")
    for pname in ["light", "typical", "heavy"]:
        c = profile_cost("gemini-3.5-flash-lite", PROFILES[pname])
        print(f"  margin, {pname:8}: monthly ${net_m - c:5.2f}, annual ${net_a - c:5.2f}")


if __name__ == "__main__":
    main()
