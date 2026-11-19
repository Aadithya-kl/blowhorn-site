#!/usr/bin/env python3
"""Home #how computers designs (assets/js/machines.js, #143): on every design
"Enlist a computer" stays on the page and each click adds another computer
to the fleet visual, up to 23. Muster grows its formation; Battalion Map,
One Thunder and Call to Arms grow the shared recruit strip
(layouts/_partials/home/machines/recruits.html). Reduced motion still adds,
without the pop.

Runs the real script in machines_harness.js's fake DOM, built from the real
partials. Run with `make test-scripts` (CI runs it too).
"""

import json
import re
import subprocess
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
SCRIPT = ROOT / "assets/js/machines.js"
PARTIALS = ROOT / "layouts/_partials/home/machines"
HARNESS = Path(__file__).resolve().parent / "machines_harness.js"

CAP = 23
# Computers each design shows before any click, outside the recruit strip.
BASE = {"muster": 0, "battalion-map": 5, "one-thunder": 4, "call-to-arms": 1}
FILES = {"muster": "muster.html", "battalion-map": "battalion-map.html",
         "one-thunder": "one-thunder.html", "call-to-arms": "call-to-arms.html"}
STRIP = ("battalion-map", "one-thunder", "call-to-arms")


def run(variant: str, reduce: bool, clicks: int = 30) -> dict:
    scenario = {"variant": variant, "reduce": reduce, "clicks": clicks}
    result = subprocess.run(
        ["node", str(HARNESS), str(SCRIPT), str(PARTIALS), json.dumps(scenario)],
        capture_output=True, text=True, check=False,
    )
    if result.returncode != 0:
        raise RuntimeError(f"machines.js harness failed: {result.stderr.strip()}")
    return json.loads(result.stdout)


class EnlistTest(unittest.TestCase):
    def test_every_click_adds_a_computer_up_to_the_cap(self):
        for variant in FILES:
            for reduce in (False, True):
                with self.subTest(variant=variant, reduce=reduce):
                    out = run(variant, reduce)
                    btn = out["button"]
                    self.assertEqual((btn["tag"], btn["type"], btn["href"]), ("button", "button", None))
                    self.assertFalse(btn["hidden"], "Enlist shows once the script runs")
                    self.assertEqual(out["location"], "https://blowhorn.test/", "Enlist never navigates")
                    shown = out["start"]["recruits"]
                    if variant in STRIP:
                        self.assertEqual(shown, 0)
                        self.assertTrue(out["start"]["stripHidden"], "the strip starts hidden")
                    for i, step in enumerate(out["steps"], 1):
                        fleet = BASE[variant] + step["recruits"]
                        want = min(BASE[variant] + shown + i, CAP)
                        self.assertEqual(fleet, want, f"click {i}")
                        self.assertIn(str(fleet), step["count"], f"click {i} count text")
                        self.assertEqual(step["disabled"], fleet >= CAP, f"click {i} aria-disabled")
                        if variant in STRIP:
                            self.assertFalse(step["stripHidden"], f"click {i} shows the strip")
                        if reduce:
                            self.assertEqual(step["isNew"], 0, f"click {i} pops under reduced motion")
                    self.assertEqual(BASE[variant] + out["steps"][-1]["recruits"], CAP)
                    if not reduce:
                        self.assertGreater(out["steps"][0]["isNew"], 0, "a click pops what it added")
                    for other in out["others"]:
                        if other["strip"] is not None:
                            self.assertEqual(other["strip"], 0, f"{other['id']} strip touched")
                            self.assertTrue(other["stripHidden"], f"{other['id']} strip shown")

    def test_recruit_picture_is_the_template_clone(self):
        for variant in STRIP:
            with self.subTest(variant=variant):
                pic = run(variant, False, 1)["pics"][0]
                self.assertEqual(pic["tag"], "img")
                self.assertEqual(pic["alt"], "New computer")
                self.assertTrue(pic["width"] and pic["height"])
                self.assertFalse(pic["hidden"])
                self.assertFalse(pic["template"], "the clone drops the template hook")

    def test_muster_count_up_never_overwrites_a_click(self):
        # The first click lands mid count-up; the harness then runs the
        # remaining frames, which must leave the clicked count alone.
        first = run("muster", False, 1)["steps"][0]
        self.assertEqual(first["count"], "12")


class TemplateTest(unittest.TestCase):
    def test_strip_partial_is_in_each_panel_once(self):
        for variant in STRIP:
            src = (PARTIALS / FILES[variant]).read_text()
            self.assertEqual(src.count('{{ partial "home/machines/recruits.html" . }}'), 1, variant)
        self.assertNotIn("recruits.html", (PARTIALS / "muster.html").read_text())

    def test_strip_partial_copy_and_hooks(self):
        src = (PARTIALS / "recruits.html").read_text()
        self.assertRegex(src, r'<div class="machines-recruits" data-recruits hidden>')
        self.assertIn("data-enlisted-computers", src)
        tpl = re.search(r"<img data-recruit-template[^>]*>", src)
        self.assertIsNotNone(tpl)
        for part in ('alt="New computer"', 'width="', 'height="', "| relURL", " hidden"):
            self.assertIn(part, tpl.group(0))
        self.assertIn(">New recruits<", src)
        self.assertIn("Bring your whole team. This preview shows up to 23.", src)

    def test_muster_count_is_announced(self):
        src = (PARTIALS / "muster.html").read_text()
        self.assertRegex(src, r'<span aria-live="polite"[^>]*><span data-muster="count">')


if __name__ == "__main__":
    unittest.main()
