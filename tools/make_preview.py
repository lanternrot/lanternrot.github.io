#!/usr/bin/env python3
"""Turn a built news post into one self-contained preview file for review.

Reads the post from the built site (_site/<url>/index.html), inlines site.css and every local
image (img src, inline url(), CSS url()) as data: URIs, drops scripts, and points site links at
https://lanternrot.com. Google Fonts stay as links. The output starts with <title> then <style>
and has no doctype, html, head or body tags: the Artifact publisher wraps it.

Anything that would make the preview lie fails loudly: a missing image, an image from another
host, a leftover document or script tag, or an output over the size limit (8 MB).

Run from the site root after `bundle exec jekyll build`:
    python3 tools/make_preview.py /news/2026/10/12/dorf-4-9-0/ --title "Dorf 4.9.0 Patch Notes" \\
        --out /path/to/dorf-4-9-0.html
"""
import argparse
import base64
import mimetypes
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
LIVE = "https://lanternrot.com"
LIMIT_BYTES = 8 * 1024 * 1024
FORBIDDEN = (r"<!doctype", r"</?html[\s>]", r"</?head[\s>]", r"</?body[\s>]", r"<script[\s>]")
MIME = {".webp": "image/webp", ".svg": "image/svg+xml"}


class PreviewError(Exception):
    pass


def data_uri(site, path):
    f = site / path.lstrip("/")
    if not f.is_file():
        raise PreviewError(f"{path} is referenced by the page but missing from {site}")
    mime = MIME.get(f.suffix) or mimetypes.guess_type(f.name)[0]
    if not mime:
        raise PreviewError(f"don't know the type of {path}")
    return f"data:{mime};base64,{base64.b64encode(f.read_bytes()).decode()}"


def build_preview(site, url, title, limit_bytes=LIMIT_BYTES):
    """The preview page for the post at `url` in the built `site`, as a string."""
    page_file = site / url.strip("/") / "index.html"
    if not page_file.is_file():
        raise PreviewError(f"no built page at {page_file}; run bundle exec jekyll build first")
    html = page_file.read_text()
    css = (site / "assets/css/site.css").read_text()

    fonts = re.search(r'<link rel="stylesheet" href="(https://fonts\.googleapis\.com/[^"]+)">', html)
    body = re.search(r"<body[^>]*>(.*)</body>", html, re.S)
    if not body:
        raise PreviewError(f"{page_file} has no <body>")
    body = re.sub(r"<script\b.*?</script>", "", body.group(1), flags=re.S)

    remote = re.findall(r'src="(https?://[^"]+)"', body)
    if remote:
        raise PreviewError(f"images from other hosts would load at review time: {remote}")

    def inline(m):
        return m.group(1) + data_uri(site, m.group(2)) + m.group(3)

    body = re.sub(r'(src=")(/[^"]+)(")', inline, body)
    body = re.sub(r"(url\(')(/[^']+)('\))", inline, body)
    body = re.sub(r'href="/', f'href="{LIVE}/', body)
    css = re.sub(r"url\((['\"]?)(/[^)'\"]+)\1\)", lambda m: f"url('{data_uri(site, m.group(2))}')", css)

    head = [f"<title>{title}</title>", f"<style>\n{css}</style>"]
    if fonts:
        head += ['<link rel="preconnect" href="https://fonts.googleapis.com">',
                 '<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>',
                 f'<link rel="stylesheet" href="{fonts.group(1)}">']
    page = "\n".join(head) + "\n" + body.strip() + "\n"

    for tag in FORBIDDEN:
        if re.search(tag, page, re.I):
            raise PreviewError(f"{tag} is left in the preview")
    size = len(page.encode())
    if size > limit_bytes:
        raise PreviewError(f"preview is {size / 1024 / 1024:.2f} MB, over the {limit_bytes / 1024 / 1024:.2f} MB limit")
    return page


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    parser.add_argument("url", help="the post's URL path, e.g. /news/2026/10/12/dorf-4-9-0/")
    parser.add_argument("--title", required=True, help='e.g. "Dorf 4.9.0 Patch Notes"')
    parser.add_argument("--out", type=Path, required=True, help="where to write the preview")
    parser.add_argument("--site", type=Path, default=ROOT / "_site", help="the built site")
    args = parser.parse_args(argv)
    try:
        page = build_preview(args.site, args.url, args.title)
        args.out.parent.mkdir(parents=True, exist_ok=True)
        args.out.write_text(page)
    except (PreviewError, OSError) as err:
        sys.exit(f"make_preview: {err}")
    print(f"{args.out}  {args.out.stat().st_size / 1024 / 1024:.2f} MB")


if __name__ == "__main__":
    main()
