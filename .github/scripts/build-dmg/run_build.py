"""Run the product's --build-dmg-only entry and print only a public summary.

Build and tool output goes to a log under RUNNER_TEMP that is never printed,
uploaded or cached. The only stdout is fixed labels, the exit status, the
duration, and (on success) the manifest sha256 and size. Commands run without
the runner's file-command variables.
"""

from __future__ import annotations

import argparse
import os
import subprocess
import sys
import time
from pathlib import Path

FILE_COMMANDS = frozenset({"GITHUB_ENV", "GITHUB_OUTPUT", "GITHUB_PATH", "GITHUB_STATE", "GITHUB_STEP_SUMMARY"})
MAKE_STATE = frozenset({"MAKEFLAGS", "MAKELEVEL", "MFLAGS", "MAKEOVERRIDES"})


def child_env(src: dict[str, str] | None = None) -> dict[str, str]:
    env = dict(os.environ if src is None else src)
    for name in FILE_COMMANDS | MAKE_STATE:
        env.pop(name, None)
    env["BLOWHORN_BUILD_CLEANUP"] = "1"
    return env


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--product", required=True, type=Path)
    parser.add_argument("--log", required=True, type=Path)
    parser.add_argument("--version", required=True)
    parser.add_argument("--mode", required=True, choices=("adhoc", "developer-id"))
    args = parser.parse_args(argv)

    product = args.product.resolve()
    log = args.log
    log.parent.mkdir(parents=True, exist_ok=True)

    script = product / "desktop" / "scripts" / "release-mac.mjs"
    if not script.is_file():
        print("build-dmg: release-mac.mjs is missing from the product checkout", file=sys.stderr)
        return 1

    cmd = [
        "node",
        str(script),
        "--build-dmg-only",
        "--version",
        args.version,
        "--skip-checks",
    ]
    print(f"build-dmg: starting ({args.mode})", flush=True)
    started = time.monotonic()
    with log.open("wb") as sink:
        result = subprocess.run(cmd, cwd=product / "desktop", env=child_env(), stdout=sink, stderr=subprocess.STDOUT)
    elapsed = int(time.monotonic() - started)
    if result.returncode != 0:
        print(f"build-dmg: failed (exit {result.returncode}, {elapsed}s). Run the same --build-dmg-only command in a local checkout to see why.", flush=True)
        return result.returncode

    manifest_path = product / "desktop" / "release-prod" / "build-dmg-manifest.json"
    if not manifest_path.is_file():
        print("build-dmg: succeeded but the result manifest is missing", flush=True)
        return 1
    sys.path.insert(0, str(Path(__file__).resolve().parent))
    from manifest import parse_manifest

    manifest = parse_manifest(manifest_path.read_text())
    print(
        f"build-dmg: ok ({elapsed}s) sha256 {manifest['sha256']} size {manifest['size_bytes']} {manifest['dmg_name']}",
        flush=True,
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
