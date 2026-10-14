"""Tests for tools/news_art.py. Run: python3 -m unittest discover -s tests -p 'test_*.py'"""
import json
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

from PIL import Image

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "tools"))
import news_art  # noqa: E402


def git(repo, *args):
    subprocess.run(["git", "-C", str(repo), *args], check=True, capture_output=True)


def rev(repo):
    out = subprocess.run(["git", "-C", str(repo), "rev-parse", "HEAD"], check=True, capture_output=True, text=True)
    return out.stdout.strip()


def noisy(size, mode="RGB"):
    """An image with enough detail that lossy and lossless encodes differ."""
    return Image.effect_noise(size, 80).convert(mode)


def opened(path):
    """The image at path, loaded and closed."""
    with Image.open(path) as im:
        im.load()
        return im.copy()


class Fixture(unittest.TestCase):
    """A throwaway Dorf-like repo with a previous and a release commit (shared, read-only), and an
    empty site per test."""

    @classmethod
    def setUpClass(cls):
        cls.repo_tmp = tempfile.TemporaryDirectory()
        cls.repo = repo = Path(cls.repo_tmp.name) / "dorf"
        (repo / "src/assets/heroes").mkdir(parents=True)
        (repo / "src/assets/maps").mkdir(parents=True)
        git(repo, "init", "-q", "-b", "main")
        git(repo, "config", "user.email", "t@example.com")
        git(repo, "config", "user.name", "t")
        git(repo, "config", "core.hooksPath", "/dev/null")
        noisy((64, 64), "RGBA").save(repo / "src/assets/heroes/old.png")
        git(repo, "add", ".")
        git(repo, "commit", "-q", "-m", "release: 1.0.0")
        cls.previous = rev(repo)
        sprite = Image.new("RGBA", (32, 48), (0, 0, 0, 0))
        for y in range(10, 40):
            for x in range(4, 28):
                sprite.putpixel((x, y), ((x * 9) % 256, (y * 5) % 256, 90, 255))
        sprite.save(repo / "src/assets/heroes/hero.png")
        noisy((1200, 600)).save(repo / "src/assets/maps/map.png")
        noisy((600, 300)).save(repo / "src/assets/maps/small.png")
        noisy((520, 40), "RGBA").save(repo / "src/assets/heroes/huge_sprite.png")
        cutout = noisy((400, 800), "RGBA")
        cutout.paste((0, 0, 0, 0), (0, 0, 400, 100))
        cutout.save(repo / "src/assets/heroes/painting.png")
        git(repo, "add", ".")
        git(repo, "commit", "-q", "-m", "release: 1.1.0")
        cls.release = rev(repo)

    @classmethod
    def tearDownClass(cls):
        cls.repo_tmp.cleanup()

    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.site = Path(self.tmp.name) / "site"
        self.site.mkdir()

    def tearDown(self):
        self.tmp.cleanup()

    def spec(self, *art, **extra):
        return {"version": "1.1.0", "release": self.release, "previous": self.previous, "art": list(art), **extra}

    def build(self, spec):
        return news_art.build(spec, dorf=self.repo, site=self.site)

    def out(self, name, version="1.1.0"):
        return self.site / "assets/img/news" / version / f"{name}.webp"

    def manifest(self):
        return json.loads((self.site / "_data/news_art.json").read_text())


class TestConvert(Fixture):
    def test_painted_is_lossy_webp_shrunk_to_max_width(self):
        self.build(self.spec({"name": "map", "src": "src/assets/maps/map.png", "kind": "painted", "max_width": 600}))
        data = self.out("map").read_bytes()
        self.assertEqual(data[8:12], b"WEBP")
        self.assertIn(b"VP8 ", data)  # the lossy chunk; lossless would be VP8L
        self.assertEqual(opened(self.out("map")).size, (600, 300))

    def test_painted_is_never_upscaled(self):
        self.build(self.spec({"name": "small", "src": "src/assets/maps/small.png", "kind": "painted", "max_width": 1400}))
        self.assertEqual(opened(self.out("small")).size, (600, 300))

    def test_pixel_is_lossless_at_native_size(self):
        self.build(self.spec({"name": "hero", "src": "src/assets/heroes/hero.png", "kind": "pixel"}))
        self.assertIn(b"VP8L", self.out("hero").read_bytes())
        got = opened(self.out("hero")).convert("RGBA")
        want = opened(self.repo / "src/assets/heroes/hero.png").convert("RGBA")
        self.assertEqual(got.size, (32, 48))
        self.assertEqual(got.tobytes(), want.tobytes())

    def test_crop_applies_before_resize(self):
        self.build(self.spec({"name": "band", "src": "src/assets/maps/map.png", "kind": "painted",
                              "crop": [0, 100, 1200, 300], "max_width": 800}))
        self.assertEqual(opened(self.out("band")).size, (800, 200))

    def test_crop_outside_image_fails(self):
        with self.assertRaisesRegex(news_art.NewsArtError, r"crop.*outside"):
            self.build(self.spec({"name": "band", "src": "src/assets/maps/small.png", "kind": "painted",
                                  "crop": [0, 200, 600, 300]}))

    def test_manifest_records_size_and_kind_and_keeps_other_versions(self):
        (self.site / "_data").mkdir()
        (self.site / "_data/news_art.json").write_text(json.dumps(
            {"/assets/img/news/0.9.0/x.webp": {"width": 1, "height": 1, "kind": "pixel"}}))
        self.build(self.spec({"name": "hero", "src": "src/assets/heroes/hero.png", "kind": "pixel"}))
        m = self.manifest()
        self.assertEqual(m["/assets/img/news/1.1.0/hero.webp"], {"width": 32, "height": 48, "kind": "pixel"})
        self.assertIn("/assets/img/news/0.9.0/x.webp", m)

    def test_painted_with_transparency_is_marked_cutout(self):
        self.build(self.spec({"name": "painting", "src": "src/assets/heroes/painting.png", "kind": "painted"},
                             {"name": "map", "src": "src/assets/maps/map.png", "kind": "painted"}))
        m = self.manifest()
        self.assertEqual(m["/assets/img/news/1.1.0/painting.webp"],
                         {"width": 400, "height": 800, "kind": "painted", "cutout": True})
        self.assertNotIn("cutout", m["/assets/img/news/1.1.0/map.webp"])

    def test_rerun_replaces_the_version_folder_and_its_manifest_entries(self):
        self.build(self.spec({"name": "hero", "src": "src/assets/heroes/hero.png", "kind": "pixel"}))
        self.build(self.spec({"name": "hero2", "src": "src/assets/heroes/hero.png", "kind": "pixel"}))
        self.assertFalse(self.out("hero").exists())
        self.assertNotIn("/assets/img/news/1.1.0/hero.webp", self.manifest())
        self.assertIn("/assets/img/news/1.1.0/hero2.webp", self.manifest())


class TestValidation(Fixture):
    def assertFailsWithoutWriting(self, spec, pattern):
        with self.assertRaisesRegex(news_art.NewsArtError, pattern):
            self.build(spec)
        self.assertFalse((self.site / "assets").exists(), "nothing should be written on failure")
        self.assertFalse((self.site / "_data").exists(), "nothing should be written on failure")

    def test_missing_source_fails_naming_the_path(self):
        self.assertFailsWithoutWriting(
            self.spec({"name": "x", "src": "src/assets/heroes/nope.png", "kind": "pixel"}),
            r"src/assets/heroes/nope\.png")

    def test_art_not_changed_in_this_release_fails(self):
        self.assertFailsWithoutWriting(
            self.spec({"name": "old", "src": "src/assets/heroes/old.png", "kind": "pixel"}),
            r"old\.png.*not added or changed")

    def test_expect_size_mismatch_fails(self):
        self.assertFailsWithoutWriting(
            self.spec({"name": "hero", "src": "src/assets/heroes/hero.png", "kind": "pixel", "expect": [64, 64]}),
            r"expected 64x64, got 32x48")

    def test_pixel_art_over_size_limit_fails(self):
        self.assertFailsWithoutWriting(
            self.spec({"name": "big", "src": "src/assets/heroes/huge_sprite.png", "kind": "pixel"}),
            r"huge_sprite\.png.*too big for pixel art")

    def test_over_budget_fails(self):
        self.assertFailsWithoutWriting(
            self.spec({"name": "map", "src": "src/assets/maps/map.png", "kind": "painted"}, budget_kb=1),
            r"budget")

    def test_unknown_kind_fails(self):
        self.assertFailsWithoutWriting(
            self.spec({"name": "hero", "src": "src/assets/heroes/hero.png", "kind": "sketch"}), r"kind")

    def test_duplicate_name_fails(self):
        item = {"name": "hero", "src": "src/assets/heroes/hero.png", "kind": "pixel"}
        self.assertFailsWithoutWriting(self.spec(item, dict(item)), r"duplicate.*hero")

    def test_missing_spec_field_fails(self):
        spec = self.spec({"name": "hero", "src": "src/assets/heroes/hero.png", "kind": "pixel"})
        del spec["previous"]
        self.assertFailsWithoutWriting(spec, r"previous")


class TestCli(Fixture):
    def test_cli_exits_nonzero_with_the_error_on_stderr(self):
        spec_path = Path(self.tmp.name) / "spec.json"
        spec_path.write_text(json.dumps(self.spec({"name": "x", "src": "src/assets/nope.png", "kind": "pixel"})))
        script = Path(__file__).resolve().parent.parent / "tools/news_art.py"
        r = subprocess.run([sys.executable, str(script), str(spec_path), "--dorf", str(self.repo), "--site", str(self.site)],
                           capture_output=True, text=True)
        self.assertNotEqual(r.returncode, 0)
        self.assertIn("src/assets/nope.png", r.stderr)


if __name__ == "__main__":
    unittest.main()
