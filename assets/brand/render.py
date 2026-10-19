"""Renders the app icon, Android adaptive icon layers and splash marks from
the SVG masters in this folder, using headless Chrome (for exact SVG
rendering) and Pillow.

    python assets/brand/render.py [path-to-chrome]

The mark: a waveform of a spoken phrase that rises, falls and lands, and
the red dot as its last beat: a full stop on the same baseline, one bar-gap
after the last bar. The dot is both the stop and the record light.
"""

import os
import subprocess
import sys
import tempfile

from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
ASSETS = os.path.dirname(HERE)
CHROME = sys.argv[1] if len(sys.argv) > 1 else r"C:\Program Files\Google\Chrome\Application\chrome.exe"

PAPER = "#F6F5F1"  # theme background, light
INK = "#0E0E0C"  # theme background, dark
WARM_WHITE = "#F4F2EC"
INK_STROKE = "#181714"
RED = "#FF453A"  # colors.record

# The mark on a 1024 canvas, centered on (512, 500) — a little above the
# middle, where the eye puts the center. Seven rounded bars and the stop,
# all standing on one baseline. Kept in step with BrandMark in
# src/components/onboarding/WelcomeIntro.tsx. Sized to fill the icon the way
# other apps' marks do: about 80% of the width and 50% of the height.
BAR_WIDTH = 70
BAR_GAP = 32
BAR_HEIGHTS = [187, 360, 512, 383, 294, 332, 242]
STOP_RADIUS = 53  # a bar-sized stop: the last beat
BAR_STEP = BAR_WIDTH + BAR_GAP
MARK_W = len(BAR_HEIGHTS) * BAR_STEP + 2 * STOP_RADIUS  # 820
MARK_H = max(BAR_HEIGHTS)
FIRST_BAR_X = (1024 - MARK_W) // 2
BASELINE = 500 + MARK_H // 2
STOP_CX = FIRST_BAR_X + len(BAR_HEIGHTS) * BAR_STEP + STOP_RADIUS
MARK_BOX = (FIRST_BAR_X, BASELINE - MARK_H, MARK_W, MARK_H)  # x, y, w, h of the bars and the stop


def mark(fill, dot=RED):
    bars = "".join(
        f'<rect x="{FIRST_BAR_X + i * BAR_STEP}" y="{BASELINE - h}" width="{BAR_WIDTH}" height="{h}" rx="{BAR_WIDTH // 2}" fill="{fill}"/>'
        for i, h in enumerate(BAR_HEIGHTS)
    )
    return bars + f'<circle cx="{STOP_CX}" cy="{BASELINE - STOP_RADIUS}" r="{STOP_RADIUS}" fill="{dot}"/>'


INK_GRADIENT = (
    '<defs><linearGradient id="bg" x1="0" y1="0" x2="0" y2="1">'
    '<stop offset="0" stop-color="#1C1B18"/><stop offset="1" stop-color="#0B0B0A"/>'
    "</linearGradient></defs>"
)


def svg(body, view_box="0 0 1024 1024"):
    return f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="{view_box}">{body}</svg>'


# Android's adaptive icon masks to a shape that keeps only the middle ~61%
# for sure, so the mark shrinks to fit inside it.
def adaptive(body):
    return f'<g transform="translate(512 512) scale(0.65) translate(-512 -500)">{body}</g>'


MASTERS = {
    "icon.svg": svg(INK_GRADIENT + '<rect width="1024" height="1024" fill="url(#bg)"/>' + mark(WARM_WHITE)),
    "mark-light.svg": svg(mark(INK_STROKE), " ".join(map(str, MARK_BOX))),
    "mark-dark.svg": svg(mark(WARM_WHITE), " ".join(map(str, MARK_BOX))),
}

# (output, svg, width, height, keep alpha)
OUTPUTS = [
    ("icon.png", MASTERS["icon.svg"], 1024, 1024, False),
    ("favicon.png", MASTERS["icon.svg"], 1024, 1024, False),
    ("splash-icon.png", MASTERS["mark-light.svg"], MARK_BOX[2] * 2, MARK_BOX[3] * 2, True),
    ("splash-icon-dark.png", MASTERS["mark-dark.svg"], MARK_BOX[2] * 2, MARK_BOX[3] * 2, True),
    ("android-icon-background.png", svg(INK_GRADIENT + '<rect width="1024" height="1024" fill="url(#bg)"/>'), 1024, 1024, False),
    ("android-icon-foreground.png", svg(adaptive(mark(WARM_WHITE))), 1024, 1024, True),
    ("android-icon-monochrome.png", svg(adaptive(mark("#FFFFFF", "#FFFFFF"))), 1024, 1024, True),
]


def render(markup, width, height, out_path):
    with tempfile.TemporaryDirectory() as tmp:
        page = os.path.join(tmp, "page.html")
        with open(page, "w", encoding="utf-8") as f:
            f.write(
                "<!doctype html><html><head><style>html,body{margin:0;background:transparent}"
                f"svg{{display:block;width:{width}px;height:{height}px}}</style></head><body>{markup}</body></html>"
            )
        subprocess.run(
            [CHROME, "--headless=new", "--disable-gpu", "--hide-scrollbars", "--force-device-scale-factor=1",
             "--default-background-color=00000000", f"--window-size={width},{height}",
             f"--screenshot={out_path}", "file:///" + page.replace("\\", "/")],
            check=True, capture_output=True,
        )


def main():
    for name, markup in MASTERS.items():
        with open(os.path.join(HERE, name), "w", encoding="utf-8", newline="\n") as f:
            f.write(markup + "\n")
    for name, markup, width, height, alpha in OUTPUTS:
        out = os.path.join(ASSETS, name)
        render(markup, width, height, out)
        image = Image.open(out)
        # The App Store rejects an icon with an alpha channel.
        image = image.convert("RGBA" if alpha else "RGB")
        if name == "favicon.png":
            image = image.resize((48, 48), Image.LANCZOS)
        image.save(out, optimize=True)
        print(f"{name}: {image.size} {image.mode}")


if __name__ == "__main__":
    main()
