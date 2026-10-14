"""Tests for tools/make_preview.py. Run: python3 -m unittest discover -s tests -p 'test_*.py'"""
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "tools"))
import make_preview  # noqa: E402

FONTS = "https://fonts.googleapis.com/css2?family=Lexend&display=swap"
PAGE = f"""<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <title>Old title</title>
  <link rel="stylesheet" href="{FONTS}">
  <link rel="stylesheet" href="/assets/css/site.css">
</head>
<body>
<nav><a href="/news/">News</a> <a href="https://bsky.app/x">Bluesky</a></nav>
<header class="post-head"><h1>Post</h1></header>
<div class="banner-frame" style="--banner:url('/assets/img/a.webp')"><img src="/assets/img/a.webp" alt="a"></div>
<script type="module" src="/assets/js/site.js"></script>
</body>
</html>
"""


class Fixture(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.site = Path(self.tmp.name) / "_site"
        (self.site / "news/post").mkdir(parents=True)
        (self.site / "assets/css").mkdir(parents=True)
        (self.site / "assets/img").mkdir(parents=True)
        (self.site / "news/post/index.html").write_text(PAGE)
        (self.site / "assets/css/site.css").write_text("body{background:url('/assets/img/bg.png')}\n")
        (self.site / "assets/img/a.webp").write_bytes(b"RIFFfakeWEBP")
        (self.site / "assets/img/bg.png").write_bytes(b"\x89PNGfake")

    def tearDown(self):
        self.tmp.cleanup()

    def build(self, **kw):
        return make_preview.build_preview(self.site, "/news/post/", "Dorf 9.9.9 Patch Notes", **kw)


class TestPreview(Fixture):
    def test_title_comes_first_then_the_style(self):
        out = self.build()
        self.assertTrue(out.startswith("<title>Dorf 9.9.9 Patch Notes</title>\n<style>\n"))

    def test_no_document_or_script_tags(self):
        out = self.build().lower()
        for tag in ("<!doctype", "<html", "<head>", "</head>", "<body", "</body>", "<script"):
            self.assertNotIn(tag, out)
        self.assertIn('<header class="post-head">', out)  # <header> is not <head>

    def test_images_and_urls_are_inlined(self):
        out = self.build()
        self.assertIn('src="data:image/webp;base64,', out)
        self.assertIn("--banner:url('data:image/webp;base64,", out)
        self.assertIn("url('data:image/png;base64,", out)  # from the CSS
        self.assertNotIn("/assets/img/", out)

    def test_site_links_go_to_the_live_site_and_fonts_stay(self):
        out = self.build()
        self.assertIn('href="https://lanternrot.com/news/"', out)
        self.assertIn('href="https://bsky.app/x"', out)
        self.assertIn(f'href="{FONTS}"', out)
        self.assertNotIn("/assets/css/site.css", out)

    def test_missing_image_fails_naming_it(self):
        (self.site / "assets/img/a.webp").unlink()
        with self.assertRaisesRegex(make_preview.PreviewError, r"/assets/img/a\.webp"):
            self.build()

    def test_remote_image_fails(self):
        page = (self.site / "news/post/index.html")
        page.write_text(PAGE.replace('<img src="/assets/img/a.webp"', '<img src="https://example.com/x.png"'))
        with self.assertRaisesRegex(make_preview.PreviewError, r"example\.com"):
            self.build()

    def test_over_the_size_limit_fails(self):
        with self.assertRaisesRegex(make_preview.PreviewError, r"over"):
            self.build(limit_bytes=100)


class TestCli(Fixture):
    def test_cli_writes_the_file_and_fails_loudly(self):
        script = Path(__file__).resolve().parent.parent / "tools/make_preview.py"
        out = Path(self.tmp.name) / "p.html"
        ok = subprocess.run([sys.executable, str(script), "/news/post/", "--title", "T", "--out", str(out),
                             "--site", str(self.site)], capture_output=True, text=True)
        self.assertEqual(ok.returncode, 0, ok.stderr)
        self.assertTrue(out.read_text().startswith("<title>T</title>"))
        (self.site / "assets/img/a.webp").unlink()
        bad = subprocess.run([sys.executable, str(script), "/news/post/", "--title", "T", "--out", str(out),
                              "--site", str(self.site)], capture_output=True, text=True)
        self.assertNotEqual(bad.returncode, 0)
        self.assertIn("/assets/img/a.webp", bad.stderr)


if __name__ == "__main__":
    unittest.main()
