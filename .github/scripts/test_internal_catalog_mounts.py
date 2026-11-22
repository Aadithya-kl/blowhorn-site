# SPDX-License-Identifier: Apache-2.0
"""The internal-site deploy sparse-checkout and the auto-deploy poll path list stay in lockstep
and include every blowhorn folder the catalog's image mounts need (#704)."""

import re
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
WORKFLOW = ROOT / ".github" / "workflows" / "internal-site.yml"
POLL = ROOT / ".github" / "scripts" / "internal-poll.sh"
HUGO = ROOT / "config" / "internal" / "hugo.toml"

REQUIRED = {
    "marketing/strategy",
    "marketing/capability-comparison",
    "marketing/brand",
    "marketing/cast",
    "marketing/store",
    "marketing/press",
    "marketing/scenes",
    "marketing/video",
    "marketing/archive",
    "marketing/assets.manifest.json",
    "desktop/assets",
    "desktop/src/renderer/assets",
    "extension",
    "internal/engineering",
    "internal/design",
    "internal/specs",
    "internal/plans",
    "internal/research",
    "internal/features",
}


def workflow_paths(text: str) -> list[str]:
    match = re.search(r"sparse-checkout:\s*\|\n((?:[ \t]+\S.*\n)+)", text)
    if not match:
        raise AssertionError("internal-site.yml has no sparse-checkout block")
    return [line.strip() for line in match.group(1).splitlines() if line.strip()]


def poll_paths(text: str) -> list[str]:
    match = re.search(r"paths=\(\n(.*?)\)", text, flags=re.S)
    if not match:
        raise AssertionError("internal-poll.sh has no paths=(...) list")
    return [
        line.strip()
        for line in match.group(1).splitlines()
        if line.strip() and not line.strip().startswith("#")
    ]


class TestInternalCatalogMounts(unittest.TestCase):
    def test_the_sparse_checkout_and_the_poll_list_are_the_same(self):
        wf = workflow_paths(WORKFLOW.read_text(encoding="utf-8"))
        poll = poll_paths(POLL.read_text(encoding="utf-8"))
        self.assertEqual(
            wf,
            poll,
            "internal-site.yml sparse-checkout and internal-poll.sh paths drifted:\n"
            f"  only in workflow: {sorted(set(wf) - set(poll))}\n"
            f"  only in poll: {sorted(set(poll) - set(wf))}",
        )

    def test_the_sparse_checkout_covers_every_catalog_image_root(self):
        wf = set(workflow_paths(WORKFLOW.read_text(encoding="utf-8")))
        missing = REQUIRED - wf
        self.assertFalse(missing, f"internal-site.yml sparse-checkout is missing catalog/image roots: {sorted(missing)}")

    def test_hugo_still_mounts_the_catalog_image_roots(self):
        text = HUGO.read_text(encoding="utf-8")
        for needle in (
            'source = "marketing"',
            'target = "static/internal/marketing-assets"',
            'source = "desktop/assets"',
            'source = "desktop/src/renderer/assets"',
            'source = "extension"',
        ):
            self.assertIn(needle, text, f"config/internal/hugo.toml no longer mounts {needle}")


if __name__ == "__main__":
    unittest.main()
