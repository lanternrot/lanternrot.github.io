"""Acceptance tests for the machine-readable pages: sitemap.xml, robots.txt and the JSON-LD summary.
Run: python3 -m unittest discover -s tests -p 'test_*.py'
They build the whole site once into a temp directory, so they need `bundle exec jekyll` to work."""
import json
import re
import subprocess
import tempfile
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SITE_URL = "https://lanternrot.com"
LD_JSON = re.compile(r'<script type="application/ld\+json">(.*?)</script>', re.S)
FOOTER_LINK = re.compile(r'<a href="([^"]+)">([^<]+)</a>')


def post_urls():
    """The /news/YYYY/MM/DD/slug/ URL of every file in _posts/."""
    urls = set()
    for post in (ROOT / "_posts").glob("*.md"):
        year, month, day, slug = re.match(r"(\d{4})-(\d\d)-(\d\d)-(.+)\.md$", post.name).groups()
        urls.add(f"{SITE_URL}/news/{year}/{month}/{day}/{slug}/")
    return urls


SITE = {}


def setUpModule():
    tmp = tempfile.TemporaryDirectory()
    subprocess.run(
        ["bundle", "exec", "jekyll", "build", "-d", tmp.name],
        cwd=ROOT, check=True, capture_output=True, text=True,
    )
    SITE["tmp"] = tmp
    SITE["dir"] = Path(tmp.name)


def tearDownModule():
    SITE["tmp"].cleanup()


class BuiltSite(unittest.TestCase):
    """Base for tests that read the one shared build."""

    @classmethod
    def setUpClass(cls):
        cls.site = SITE["dir"]
        cls.home = (cls.site / "index.html").read_text()

    def graph(self, html=None):
        blocks = LD_JSON.findall(html or self.home)
        self.assertEqual(len(blocks), 1, "expected exactly one JSON-LD block")
        return json.loads(blocks[0])["@graph"]

    def entity(self, kind, html=None):
        found = [e for e in self.graph(html) if e["@type"] == kind]
        self.assertEqual(len(found), 1, f"expected one {kind}")
        return found[0]

    def footer_profiles(self):
        footer = re.search(r"<nav aria-label=\"Elsewhere\">(.*?)</nav>", self.home, re.S).group(1)
        return FOOTER_LINK.findall(footer)


class TestSitemap(BuiltSite):
    def test_lists_home_news_and_every_post_and_nothing_else(self):
        sitemap = (self.site / "sitemap.xml").read_text()
        urls = set(re.findall(r"<loc>([^<]+)</loc>", sitemap))
        self.assertEqual(urls, {f"{SITE_URL}/", f"{SITE_URL}/news/"} | post_urls())

    def test_robots_points_at_the_sitemap_and_blocks_nothing(self):
        robots = (self.site / "robots.txt").read_text()
        self.assertIn(f"Sitemap: {SITE_URL}/sitemap.xml", robots)
        self.assertNotRegex(robots, r"(?im)^\s*disallow:\s*\S")


class TestJsonLd(BuiltSite):
    def test_organization_website_and_dorf_are_linked_by_id(self):
        org = self.entity("Organization")
        site = self.entity("WebSite")
        dorf = self.entity("VideoGame")
        self.assertEqual(org["name"], "Lantern Rot Software")
        self.assertEqual(org["url"], SITE_URL)
        self.assertTrue(org["logo"].startswith(SITE_URL + "/assets/img/icon-512.png"))
        self.assertEqual(site["publisher"], {"@id": org["@id"]})
        self.assertEqual(dorf["author"], {"@id": org["@id"]})
        self.assertEqual(dorf["publisher"], {"@id": org["@id"]})
        self.assertEqual(dorf["alternateName"], "Domains of Relentless Fighting")
        self.assertEqual(dorf["url"], f"{SITE_URL}/#dorf")

    def test_same_as_matches_the_footer_profiles(self):
        profiles = [url for url, name in self.footer_profiles() if name != "RSS"]
        self.assertEqual(self.entity("Organization")["sameAs"], profiles)

    def test_footer_keeps_its_links_and_order(self):
        self.assertEqual(
            self.footer_profiles(),
            [
                ("https://www.youtube.com/@lanternrotsoftware", "YouTube"),
                ("https://bsky.app/profile/lanternrot.com", "Bluesky"),
                ("https://lanternrot.itch.io", "itch.io"),
                ("/feed.xml", "RSS"),
            ],
        )

    def test_dorf_is_only_described_on_the_homepage(self):
        news = (self.site / "news" / "index.html").read_text()
        self.assertEqual([e["@type"] for e in self.graph(news)], ["Organization", "WebSite"])


if __name__ == "__main__":
    unittest.main()
