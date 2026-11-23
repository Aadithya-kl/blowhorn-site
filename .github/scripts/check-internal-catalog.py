#!/usr/bin/env python3
# SPDX-License-Identifier: Apache-2.0
"""Fail if the built internal catalog points at a marketing-assets file that is not in public-internal/.

Usage (after `make site-internal-build`):

    python3 .github/scripts/check-internal-catalog.py
    make site-internal-catalog-check

In CI, print counts only (this repository is public). Locally, list the missing paths.
"""
from __future__ import annotations

import os
import re
import sys
from pathlib import Path
from urllib.parse import unquote, urlparse

ROOT = Path(__file__).resolve().parents[2]
PUBLIC = ROOT / "public-internal"
CATALOG = PUBLIC / "internal" / "assets" / "catalog" / "index.html"
MEDIA_PREFIX = "/internal/marketing-assets/"
IMG_SRC = re.compile(r"""(?is)<img\b[^>]*?\bsrc=["']([^"']+)["']""")
HREF = re.compile(r"""(?is)<a\b[^>]*?\bhref=["']([^"']+)["']""")


def media_path(url: str) -> str | None:
    raw = unquote(url.strip())
    if raw.startswith("http://") or raw.startswith("https://") or raw.startswith("data:"):
        raw = urlparse(raw).path or raw
    if not raw.startswith(MEDIA_PREFIX):
        return None
    rel = raw[len(MEDIA_PREFIX) :].lstrip("/")
    if not rel or rel.endswith("/"):
        return None
    return rel


def main() -> int:
    if not CATALOG.is_file():
        print(
            f"check-internal-catalog: {CATALOG.relative_to(ROOT)} is missing; run make site-internal-build first",
            file=sys.stderr,
        )
        return 1
    html = CATALOG.read_text(encoding="utf-8", errors="replace")
    needed = []
    seen = set()
    for url in IMG_SRC.findall(html) + HREF.findall(html):
        rel = media_path(url)
        if rel is None or rel in seen:
            continue
        seen.add(rel)
        needed.append(rel)

    missing = [
        rel
        for rel in needed
        if not (PUBLIC / "internal" / "marketing-assets" / rel).is_file()
    ]
    broken_imgs = [
        media_path(url)
        for url in IMG_SRC.findall(html)
        if media_path(url) and not (PUBLIC / "internal" / "marketing-assets" / media_path(url)).is_file()
    ]

    print(
        f"check-internal-catalog: {len(needed)} unique marketing-assets URLs, "
        f"{len(broken_imgs)} broken image srcs, {len(missing)} missing files"
    )
    if missing:
        if os.environ.get("CI"):
            print(
                f"check-internal-catalog: {len(missing)} catalog media files are missing from the internal build",
                file=sys.stderr,
            )
        else:
            print("missing:", file=sys.stderr)
            for rel in missing[:40]:
                print(f"  {rel}", file=sys.stderr)
            if len(missing) > 40:
                print(f"  ... and {len(missing) - 40} more", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
