#!/usr/bin/env python3
"""Copy a Dorf release's art into a news post: webp files plus _data/news_art.json.

Reads a spec (JSON) that names the release, the release before it, and the art to use:

    {
      "version": "4.9.0",
      "release": "612f7392",          # the release commit
      "previous": "bef6ddc4",         # the release before it
      "budget_kb": 1500,              # optional, total webp weight for the post
      "art": [
        {"name": "banner", "src": "src/assets/battle_backgrounds/cave_rival_01.png",
         "kind": "painted", "crop": [0, 300, 600, 330], "max_width": 1400, "expect": [600, 1000]},
        {"name": "ser_hagen", "src": "src/assets/heroes/ser_hagen.png", "kind": "pixel"}
      ]
    }

Each source is read from the release commit (not the working tree) and must be one the
release added or changed (`git diff previous release -- <src>`), so a post only shows art
that shipped in that release.

  painted: lossy webp (quality, default 85), cropped first if `crop` ([x, y, w, h]) is set,
           then shrunk to `max_width` (default 1400). Never upscaled.
  pixel:   lossless webp at native size (at most 512px a side); CSS scales it up.
  expect:  optional [w, h]; the source must be exactly that size.

Output goes to assets/img/news/<version>/<name>.webp, replacing that folder, and each file's
width, height and kind go into _data/news_art.json (keyed by URL path) for the post includes.
Painted art with see-through pixels (a figure cut out of its background) also gets "cutout": true,
which the includes use to stand it on a stage instead of framing it.
Every item is checked and converted before anything is written, so a bad spec leaves the site
untouched. Any problem stops it with a message naming the item.

Needs Pillow. Run it from the site root:
    python3 tools/news_art.py tools/news/4.9.0.json
"""
import argparse
import io
import json
import shutil
import subprocess
import sys
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
KINDS = ("painted", "pixel")
PIXEL_MAX_SIDE = 512
DEFAULT_MAX_WIDTH = 1400
DEFAULT_QUALITY = 85
DEFAULT_BUDGET_KB = 1500


class NewsArtError(Exception):
    pass


def git(repo, *args):
    result = subprocess.run(["git", "-C", str(repo), *args], capture_output=True)
    if result.returncode != 0:
        raise NewsArtError(f"git {' '.join(args)} failed: {result.stderr.decode().strip()}")
    return result.stdout


def check_spec(spec):
    for field in ("version", "release", "previous", "art"):
        if field not in spec:
            raise NewsArtError(f"spec is missing '{field}'")
    if not spec["art"]:
        raise NewsArtError("spec has no art")
    seen = set()
    for item in spec["art"]:
        for field in ("name", "src", "kind"):
            if field not in item:
                raise NewsArtError(f"art item {item} is missing '{field}'")
        if item["kind"] not in KINDS:
            raise NewsArtError(f"{item['name']}: kind must be one of {KINDS}, got '{item['kind']}'")
        if item["name"] in seen:
            raise NewsArtError(f"duplicate art name '{item['name']}'")
        seen.add(item["name"])


def convert(item, data):
    """The item's webp bytes, output size, and whether it is a painted cutout (has see-through pixels)."""
    name, src = item["name"], item["src"]
    im = Image.open(io.BytesIO(data))
    im.load()
    if "expect" in item and list(im.size) != list(item["expect"]):
        w, h = item["expect"]
        raise NewsArtError(f"{name} ({src}): expected {w}x{h}, got {im.width}x{im.height}")
    im = im.convert("RGBA" if im.mode in ("RGBA", "LA", "P", "PA") else "RGB")
    out = io.BytesIO()

    if item["kind"] == "pixel":
        if max(im.size) > PIXEL_MAX_SIDE:
            raise NewsArtError(f"{name} ({src}) is {im.width}x{im.height}, too big for pixel art "
                               f"(limit {PIXEL_MAX_SIDE}px a side); is it painted?")
        im.save(out, "WEBP", lossless=True, exact=True, method=6)
        return out.getvalue(), im.size, False

    if "crop" in item:
        x, y, w, h = item["crop"]
        if x < 0 or y < 0 or w <= 0 or h <= 0 or x + w > im.width or y + h > im.height:
            raise NewsArtError(f"{name} ({src}): crop {item['crop']} falls outside the "
                               f"{im.width}x{im.height} image")
        im = im.crop((x, y, x + w, y + h))
    max_width = item.get("max_width", DEFAULT_MAX_WIDTH)
    if im.width > max_width:
        im = im.resize((max_width, round(im.height * max_width / im.width)), Image.LANCZOS)
    im.save(out, "WEBP", quality=item.get("quality", DEFAULT_QUALITY), method=6)
    cutout = im.mode == "RGBA" and im.getchannel("A").getextrema()[0] < 255
    return out.getvalue(), im.size, cutout


def build(spec, dorf, site):
    """Check and convert every item, then write the webp files and the manifest."""
    check_spec(spec)
    version, release, previous = spec["version"], spec["release"], spec["previous"]
    shipped = set(git(dorf, "diff", "--name-only", previous, release, "--").decode().split("\n"))

    outputs = []
    for item in spec["art"]:
        src = item["src"]
        if src not in shipped:
            raise NewsArtError(f"{item['name']}: {src} was not added or changed between "
                               f"{previous} and {release}, so it didn't ship in {version}")
        try:
            data = git(dorf, "show", f"{release}:{src}")
        except NewsArtError as err:
            raise NewsArtError(f"{item['name']}: can't read {src} at {release}: {err}") from err
        outputs.append((item, *convert(item, data)))

    total_kb = sum(len(webp) for _, webp, _, _ in outputs) / 1024
    budget = spec.get("budget_kb", DEFAULT_BUDGET_KB)
    if total_kb > budget:
        biggest = sorted(outputs, key=lambda o: -len(o[1]))[:3]
        names = ", ".join(f"{i['name']} {len(w) / 1024:.0f} KB" for i, w, _, _ in biggest)
        raise NewsArtError(f"art totals {total_kb:.0f} KB, over the {budget} KB budget (biggest: {names})")

    folder = site / "assets/img/news" / version
    prefix = f"/assets/img/news/{version}/"
    manifest_path = site / "_data/news_art.json"
    manifest = json.loads(manifest_path.read_text()) if manifest_path.exists() else {}
    manifest = {k: v for k, v in manifest.items() if not k.startswith(prefix)}

    if folder.exists():
        shutil.rmtree(folder)
    folder.mkdir(parents=True)
    for item, webp, (w, h), cutout in outputs:
        (folder / f"{item['name']}.webp").write_bytes(webp)
        entry = {"width": w, "height": h, "kind": item["kind"]}
        if cutout:
            entry["cutout"] = True
        manifest[f"{prefix}{item['name']}.webp"] = entry
    manifest_path.parent.mkdir(parents=True, exist_ok=True)
    manifest_path.write_text(json.dumps(dict(sorted(manifest.items())), indent=2) + "\n")
    return [(f"{prefix}{item['name']}.webp", len(webp), size) for item, webp, size, _ in outputs]


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    parser.add_argument("spec", type=Path, help="the post's art spec (JSON)")
    parser.add_argument("--dorf", type=Path, default=Path.home() / "code/dorf", help="path to the Dorf repo")
    parser.add_argument("--site", type=Path, default=ROOT, help="path to the site repo")
    args = parser.parse_args(argv)
    try:
        spec = json.loads(args.spec.read_text())
        written = build(spec, dorf=args.dorf, site=args.site)
    except (NewsArtError, OSError, json.JSONDecodeError) as err:
        sys.exit(f"news_art: {err}")
    for path, size, (w, h) in written:
        print(f"{path}  {w}x{h}  {size / 1024:.0f} KB")
    print(f"total {sum(s for _, s, _ in written) / 1024:.0f} KB")


if __name__ == "__main__":
    main()
