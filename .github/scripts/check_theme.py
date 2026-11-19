#!/usr/bin/env python3
"""Fail if the built site dropped the theme contract.

The public homepage theme is data/themes.json default, overridden by
content/en/_index.md front matter theme: when set. Reveille is a look kept
as a preview (front matter theme: reveille) and via ?theme=, which swaps the
token layer only, not homepage layout. /home-reveille/ is no longer built
(build: render: never, #410); when it is built again, its page is checked.

A theme is tokens, CSS and layout partials that read the same data and
content. Reveille copy is the site's copy. The only approved per-theme
content file is content/en/home-reveille.md (today's homepage, kept as a
preview). A new home-signal.md or other theme-named page fails this check.

Activity and platform counts in copy must match supported rows in
data/integrations.json plus actions in data/platforms/<id>.yaml, and each
figure must be wrapped in a data-count-* span. The home page and
/integrations/ show the action count only and never a coming-soon count. The
home page links to /integrations/, which holds the platform map. That section
must ship JS that calls selectTab with defaultPlatTab when the URL has no
matching hash, so JS enhancement cannot leave all four panels stacked.

No platform-availability "Coming soon" label may return: the catalog, the
action matrix, the docs platform pages and the docs all-actions table are
scanned for it (check_platform_labels), and the showcase page's "Where it
works" section is scanned too. Other "coming soon" copy stays out of scope:
team invites, the Windows waitlist and /coming-soon/thanks/, the REST API,
Risk Profile, and compare pages about a competitor.

Usage: check_theme.py BUILD_DIR
"""

import json
import re
import subprocess
import sys
from html.parser import HTMLParser
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]

COUNT_ATTRS = ("platforms", "activities", "soon")
APPROVED_THEME_CONTENT = frozenset({"content/en/home-reveille.md"})


def front_matter_theme(path: Path):
    text = path.read_text(encoding="utf-8")
    if not text.startswith("---"):
        return None
    end = text.find("\n---", 3)
    if end < 0:
        return None
    for line in text[3:end].splitlines():
        stripped = line.strip()
        if stripped.startswith("theme:"):
            return stripped.split(":", 1)[1].strip().strip("\"'")
    return None


def expected_home_theme():
    themes = json.loads((ROOT / "data/themes.json").read_text(encoding="utf-8"))
    override = front_matter_theme(ROOT / "content/en/_index.md")
    return override or themes["default"]


def yaml_action_ids(platform_id: str):
    yaml_path = ROOT / "data" / "platforms" / f"{platform_id}.yaml"
    return [
        line.split("id:", 1)[1].strip()
        for line in yaml_path.read_text(encoding="utf-8").splitlines()
        if line.startswith("  - id:")
    ]


def theme_ids():
    data = json.loads((ROOT / "data/themes.json").read_text(encoding="utf-8"))
    return [theme["id"] for theme in data["themes"]]


HOME_SIGNAL_JS = ROOT / "assets/js/home-signal.js"
HOME_SIGNAL_HARNESS = Path(__file__).resolve().parent / "home_signal_harness.js"


def run_platforms_js(scenario: dict, script: Path = HOME_SIGNAL_JS) -> dict:
    """Run home-signal.js in home_signal_harness.js's fake DOM and return what
    the platforms section shows: selected tab, visible panels, aria-selected."""
    result = subprocess.run(
        ["node", str(HOME_SIGNAL_HARNESS), str(script), json.dumps(scenario)],
        capture_output=True,
        text=True,
        check=False,
    )
    if result.returncode != 0:
        raise RuntimeError(f"home-signal.js harness failed: {result.stderr.strip()}")
    return json.loads(result.stdout)


def platforms_scenario(**extra) -> dict:
    """The platforms tabs as data/integrations.json renders them."""
    data = json.loads((ROOT / "data/integrations.json").read_text(encoding="utf-8"))
    scenario = {
        "tabs": [t["id"] for t in data["treatments"]],
        "on": data["defaultTreatment"],
    }
    scenario.update(extra)
    return scenario


def platforms_default_problems(script: Path = HOME_SIGNAL_JS) -> list:
    """With no hash, the script must show exactly the default treatment's panel."""
    scenario = platforms_scenario()
    want = scenario["on"]
    try:
        got = run_platforms_js(scenario, script)
    except (OSError, RuntimeError) as err:
        return [str(err)]
    visible = sorted(k for k, v in got["panels"].items() if v)
    problems = []
    if got["tab"] != want or got["ariaSelected"] != [want]:
        problems.append(f"home-signal.js selects {got['tab']!r} with no hash, want {want!r}")
    if visible != [want]:
        problems.append(f"home-signal.js shows panels {visible} with no hash, want [{want!r}]")
    return problems


def extra_theme_content(root=ROOT):
    """Content files named for a theme, other than the approved Reveille preview."""
    ids = theme_ids()
    extras = []
    content = root / "content"
    if not content.is_dir():
        return extras
    for path in content.rglob("*"):
        if not path.is_file():
            continue
        rel = path.relative_to(root).as_posix()
        if rel in APPROVED_THEME_CONTENT:
            continue
        stem = path.stem
        parts = path.relative_to(content).parts
        for tid in ids:
            if stem == f"home-{tid}" or stem.endswith(f"-{tid}") or tid in parts:
                extras.append(rel)
                break
    return extras


def counts():
    data = json.loads((ROOT / "data/integrations.json").read_text(encoding="utf-8"))
    platforms = 0
    activities = 0
    for item in data["platforms"]:
        if item["status"] == "supported":
            platforms += 1
            yaml_path = ROOT / "data" / "platforms" / f"{item['id']}.yaml"
            if yaml_path.is_file():
                activities += len(yaml_action_ids(item["id"]))
    return platforms, activities


class AttrCollector(HTMLParser):
    def __init__(self):
        super().__init__()
        self.html_theme = None
        self.ids = set()
        self.text = []
        self.counts = {name: [] for name in COUNT_ATTRS}
        self._count_key = None
        self._count_depth = 0
        self._count_buf = []

    def handle_starttag(self, tag, attrs):
        attrs = dict(attrs)
        if tag == "html":
            self.html_theme = attrs.get("data-theme")
        if attrs.get("id"):
            self.ids.add(attrs["id"])
        key = None
        for name in COUNT_ATTRS:
            if f"data-count-{name}" in attrs:
                key = name
                break
        if key is not None:
            self._count_key = key
            self._count_depth = 1
            self._count_buf = []
        elif self._count_key is not None:
            self._count_depth += 1

    def handle_endtag(self, tag):
        if self._count_key is None:
            return
        self._count_depth -= 1
        if self._count_depth <= 0:
            self.counts[self._count_key].append("".join(self._count_buf).strip())
            self._count_key = None
            self._count_buf = []

    def handle_data(self, data):
        self.text.append(data)
        if self._count_key is not None:
            self._count_buf.append(data)


def parse(path: Path) -> AttrCollector:
    collector = AttrCollector()
    collector.feed(path.read_text(encoding="utf-8"))
    return collector


def check_counts(page: AttrCollector, want, label, problems, names=COUNT_ATTRS):
    platforms, activities = want
    expected = {
        "platforms": str(platforms),
        "activities": str(activities),
    }
    for name, value in expected.items():
        if name not in names:
            continue
        found = page.counts[name]
        if not found:
            problems.append(f"{label} is missing data-count-{name}")
            continue
        for text in found:
            if text != value:
                problems.append(
                    f"{label} data-count-{name} is {text!r}, want {value}"
                )


PLATFORM_LABEL_RE = re.compile(r"coming[ -]soon", re.I)
# The action-example tabs carry out-of-scope "coming soon" placeholders
# (the REST API note, "Screenshot coming soon"); strip them before
# scanning, so the guard only sees platform-availability labels.
TABS_SOON_RE = re.compile(r'<div class="tabs-soon">.*?</div>', re.S)


def without_example_placeholders(html: str) -> str:
    return TABS_SOON_RE.sub("", html)


def check_platform_labels(build_dir: Path, root: Path) -> list[str]:
    """Fail if a platform-availability "Coming soon" label returns on a
    platform surface. Scoped to the pages that list platforms, so the
    out-of-scope "coming soon" copy (team invites, the Windows waitlist,
    the REST API, compare pages) does not trip it."""
    problems: list[str] = []
    data = json.loads((root / "data/integrations.json").read_text(encoding="utf-8"))
    pages = [
        "integrations/index.html",
        "integrations/actions/index.html",
        "docs/index.html",
        "docs/reference/platforms/index.html",
        "docs/reference/platforms/actions/index.html",
    ]
    for item in data["platforms"]:
        pages.append(f"docs/reference/platforms/{item['id']}/index.html")
    for rel in pages:
        path = build_dir / rel
        if not path.is_file():
            problems.append(f"platform label guard: {rel} was not built")
            continue
        if PLATFORM_LABEL_RE.search(without_example_placeholders(path.read_text(encoding="utf-8"))):
            problems.append(f"/{rel} shows a platform-availability 'Coming soon' label")
    showcase = build_dir / "showcase/index.html"
    if showcase.is_file():
        html = showcase.read_text(encoding="utf-8")
        match = re.search(
            r'<section[^>]*aria-labelledby="works-title"[^>]*>(.*?)</section>',
            html,
            re.S,
        )
        if match is None:
            problems.append("/showcase/index.html lost its Where it works section")
        elif PLATFORM_LABEL_RE.search(match.group(1)):
            problems.append("/showcase/index.html splits supported from coming-soon platforms")
    return problems


def main(root: Path) -> int:
    problems = []
    want_theme = expected_home_theme()
    want_counts = counts()
    for rel in extra_theme_content():
        problems.append(
            f"theme-specific content file {rel}; themes differ by tokens, "
            "CSS and layout partials only. Approved exception: content/en/home-reveille.md"
        )

    index = root / "index.html"
    if not index.is_file():
        problems.append("/index.html is not published")
    else:
        page = parse(index)
        html = index.read_text(encoding="utf-8")
        if page.html_theme != want_theme:
            problems.append(
                f"/index.html data-theme is {page.html_theme!r}, want {want_theme}"
            )
        if "Priced per voice, not per channel." not in html:
            problems.append("/index.html is missing the pricing headline")
        # The home page never splits supported from planned platforms: it
        # shows the action count only, and no coming-soon figure.
        check_counts(page, want_counts, "/index.html", problems, names=("activities",))
        if page.counts["soon"]:
            problems.append("/index.html shows a coming-soon count (data-count-soon)")
        if 'data-demo-card="github"' in html:
            problems.append("/index.html demo posts to GitHub")
        if ">Say it once. Say it everywhere.<" in html:
            problems.append("/index.html still uses the old platforms headline")
        if "Write it once. Deploy to every front." not in html:
            problems.append("/index.html lost the Major card headline")
        if "Tab after tab. One post. Somebody call a medic." in html:
            problems.append("/index.html still uses the old Major card line")
        # The interactive platform map lives on /integrations/; the home
        # page keeps the clip and links there.
        if 'data-plat-panel="' in html:
            problems.append("/index.html still carries the platform map; it lives on /integrations/")
        if 'href="/integrations/"' not in html:
            problems.append("/index.html does not link to /integrations/")

    # The preview is unpublished (build: render: never); check it only when built.
    reveille = root / "home-reveille/index.html"
    if reveille.is_file():
        page = parse(reveille)
        html = reveille.read_text(encoding="utf-8")
        if page.html_theme != "reveille":
            problems.append(
                f"/home-reveille/index.html data-theme is {page.html_theme!r}, want reveille"
            )
        if "Say it once. Say it everywhere." not in html:
            problems.append("/home-reveille/index.html lost today's platforms headline")
        if 'id="how"' not in html or "army" not in html:
            problems.append("/home-reveille/index.html lost the army / how section")

    catalog = root / "integrations/index.html"
    if not catalog.is_file():
        problems.append("/integrations/index.html is not published")
    else:
        page = parse(catalog)
        if "integrations-title" not in page.ids:
            problems.append("/integrations/index.html#integrations-title is gone")
        if "action-filter" not in page.ids:
            problems.append("/integrations/index.html#action-filter is gone")
        html = catalog.read_text(encoding="utf-8")
        check_counts(page, want_counts, "/integrations/index.html", problems, names=("activities",))
        if page.counts["soon"]:
            problems.append("/integrations/index.html shows a coming-soon count (data-count-soon)")
        panels = html.count('data-plat-panel="')
        if panels != 4:
            problems.append(f"/integrations/index.html has {panels} platform panels, want 4")
        problems.extend(platforms_default_problems())

    problems.extend(check_platform_labels(root, ROOT))

    for item in problems:
        print(f"theme: {item}", file=sys.stderr)
    print(f"checked theme contract, {len(problems)} broken")
    return 1 if problems else 0


if __name__ == "__main__":
    if len(sys.argv) != 2:
        print("usage: check_theme.py BUILD_DIR", file=sys.stderr)
        sys.exit(2)
    sys.exit(main(Path(sys.argv[1])))
