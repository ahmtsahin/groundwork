"""Render the illustrative README walkthrough. Requires Python 3 and Pillow."""

import argparse
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont


ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "docs" / "assets"
WIDTH, HEIGHT = 1200, 820
COLORS = {
    "bg": "#F5F5F2",
    "paper": "#FFFFFF",
    "ink": "#20212C",
    "muted": "#5B5E70",
    "line": "#DDDEE6",
    "accent": "#4F46E5",
    "tint": "#EEEDFE",
    "green": "#16704D",
    "green_bg": "#EAF6EF",
}


def fonts(directory):
    roots = ([Path(directory)] if directory else []) + [
        Path("C:/Windows/Fonts"),
        Path("/usr/share/fonts/truetype/dejavu"),
        Path("/usr/share/fonts/dejavu-sans-fonts"),
        Path("/Library/Fonts"),
    ]
    families = [
        ("DejaVuSans.ttf", "DejaVuSans-Bold.ttf", "DejaVuSansMono.ttf"),
        ("segoeui.ttf", "segoeuib.ttf", "consola.ttf"),
        ("Arial.ttf", "Arial Bold.ttf", "Courier New.ttf"),
    ]
    for root in roots:
        for family in families:
            paths = [root / name for name in family]
            if all(p.is_file() for p in paths):
                return paths
    raise SystemExit("Fonts not found. Pass --font-dir with DejaVu Sans and Sans Mono fonts.")


class Scene:
    def __init__(self, index, title, subtitle, font_paths):
        self.image = Image.new("RGB", (WIDTH, HEIGHT), COLORS["bg"])
        self.draw = ImageDraw.Draw(self.image)
        self.font_paths = font_paths
        self.box((48, 40, 92, 84), "accent", radius=12)
        self.text(59, 45, "g", size=32, color="paper", weight=1)
        self.text(108, 45, "groundwork", size=28, weight=1)
        self.text(866, 50, "ILLUSTRATED WORKFLOW", size=18, color="muted")
        self.text(48, 116, title, size=44, weight=1)
        self.text(48, 178, subtitle, size=23, color="muted")

        for n, label in enumerate(["Read the code", "Answer", "Confirm", "Build + verify"]):
            x = 48 + n * 282
            active = n == index
            self.box((x, 234, x + 258, 286), "tint" if active else "bg",
                     outline="accent" if active else "line", radius=12)
            self.text(x + 17, 245, f"{n + 1:02}  {label}", size=22,
                      color="accent" if active else "muted", weight=int(active))

        self.box((48, 312, 1152, 744), "paper", outline="line", radius=20)
        self.text(48, 776, "Codex  /  Claude Code", size=20, color="muted")
        self.text(635, 776, "Native questions. Your decisions. One task.", size=20, color="muted")

    def box(self, bounds, fill, outline=None, radius=10, width=1):
        self.draw.rounded_rectangle(bounds, radius=radius, fill=COLORS[fill],
                                    outline=COLORS[outline] if outline else None, width=width)

    def text(self, x, y, value, size=24, color="ink", weight=0):
        font = ImageFont.truetype(str(self.font_paths[weight]), size)
        bounds = self.draw.textbbox((x, y), value, font=font)
        if bounds[2] > WIDTH - 40 or bounds[3] > HEIGHT - 12:
            raise ValueError(f"Text overflows the image: {value}")
        self.draw.text((x, y), value, font=font, fill=COLORS[color])

    def option(self, y, title, detail, selected=False):
        self.box((80, y, 1120, y + 76), "tint" if selected else "paper",
                 outline="accent" if selected else "line", radius=12, width=2 if selected else 1)
        self.draw.ellipse((99, y + 26, 119, y + 46), outline=COLORS["accent" if selected else "muted"], width=2)
        if selected:
            self.draw.ellipse((105, y + 32, 113, y + 40), fill=COLORS["accent"])
        self.text(138, y + 9, title, size=24, weight=1)
        self.text(138, y + 42, detail, size=21, color="muted")

    def check(self, y, title, detail):
        self.box((80, y + 4, 116, y + 40), "green_bg", radius=10)
        self.draw.line([(90, y + 22), (97, y + 29), (107, y + 15)], fill=COLORS["green"], width=3)
        self.text(136, y, title, size=27, weight=1)
        self.text(136, y + 39, detail, size=22, color="muted")


def render(font_paths):
    first = Scene(0, "Start with the repository.",
                  "A rough request is enough to begin.", font_paths)
    first.text(80, 337, "YOUR REQUEST", size=18, color="muted", weight=1)
    first.box((80, 376, 1120, 444), "tint", radius=12)
    first.text(103, 392, "Fix exports that sometimes return old data.", size=29, weight=1)
    first.text(80, 475, "GROUNDWORK FINDS", size=18, color="muted", weight=1)
    first.text(80, 514, "src/cache.js", size=24, color="accent", weight=2)
    first.text(370, 514, "Data is cached for 15 minutes.", size=24)
    first.text(80, 565, "src/exporter.js", size=24, color="accent", weight=2)
    first.text(370, 565, "Manual exports read the cached data.", size=24)
    first.box((80, 632, 1120, 709), "bg", radius=12)
    first.text(103, 644, "Path: bounded change to the existing export flow.", size=24, weight=1)
    first.text(103, 679, "Open decision: how fresh should a manual export be?", size=21, color="muted")

    second = Scene(1, "Answer in the native form.",
                   "Found in code: exports can reuse data cached for 15 minutes.", font_paths)
    second.text(80, 335, "NATIVE QUESTION  /  FRESHNESS", size=18, color="accent", weight=1)
    second.text(80, 375, "How fresh should a manual export be?", size=32, weight=1)
    second.text(80, 423, "Choose the freshness you need and the wait you can accept.", size=23, color="muted")
    second.option(476, "Always fresh (Recommended)",
                  "Read the current source each time; exports can take longer.", selected=True)
    second.option(564, "Allow cached data",
                  "Keep faster exports; data may be up to 15 minutes old.")
    second.box((80, 660, 1120, 716), "bg", outline="line", radius=10)
    second.text(103, 673, "Or write your own answer...", size=23, color="muted")

    third = Scene(2, "Review the scope before code.",
                  "After follow-up questions, your decisions become a concrete brief.", font_paths)
    third.text(80, 335, "NATIVE QUESTION  /  FINAL SCOPE", size=18, color="accent", weight=1)
    third.text(80, 375, "Ready to implement this outcome?", size=32, weight=1)
    third.text(80, 431, "Refresh manual exports. Keep schedules and CSV columns.", size=24)
    third.text(80, 467, "Report source-read failures. Verify with exporter tests.", size=24)
    third.option(525, "Implement this scope (Recommended)",
                 "Apply the agreed behavior, run checks, and record the decisions.", selected=True)
    third.option(613, "Adjust the scope",
                 "Reopen any missing or incorrect decision before implementation.")

    fourth = Scene(3, "Build from settled decisions.",
                   "The implementation follows the brief you confirmed.", font_paths)
    fourth.text(80, 337, "ILLUSTRATIVE RESULT", size=18, color="muted", weight=1)
    fourth.check(385, "Agreed behavior implemented", "Manual exports refresh data; scheduled behavior is preserved.")
    fourth.check(486, "Verification reported", "Exporter checks cover freshness, failures, and the CSV contract.")
    fourth.check(587, "Decisions recorded", "Your answers and check results stay with the repository.")
    fourth.text(136, 685, "docs/decisions/YYYY-MM-DD-export-freshness.md", size=21, color="accent", weight=2)
    return [scene.image for scene in (first, second, third, fourth)]


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--font-dir", help="Directory containing DejaVu fonts")
    args = parser.parse_args()
    frames = render(fonts(args.font_dir))
    OUT.mkdir(parents=True, exist_ok=True)
    frames[1].save(OUT / "native-questions.png", optimize=True)
    # Repeat so readers can catch the walkthrough after switching tabs or
    # scrolling. The README also links to a still image and a text walkthrough.
    frames[0].save(OUT / "native-questions.gif", save_all=True,
                   append_images=frames[1:], duration=[4500, 6500, 6000, 4500],
                   loop=0, optimize=True, disposal=2)
    for filename in ("native-questions.gif", "native-questions.png"):
        asset = OUT / filename
        print(f"Rendered {asset.relative_to(ROOT)} ({asset.stat().st_size:,} bytes)")


if __name__ == "__main__":
    main()
