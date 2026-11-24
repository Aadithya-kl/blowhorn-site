#!/usr/bin/env python3
"""Download and decrypt a failed Product CI suite's log (`make product-ci-log`).

product-ci.yml uploads a failed suite's full log only as age ciphertext
(run.py encrypts it to LOG_RECIPIENT), as the artifact
product-ci-<suite>-log-attempt<n>. This script downloads that artifact with
`gh run download` into a new private temporary directory outside the
repository, decrypts it with the maintainers' private key, deletes the
ciphertext and prints the plaintext file's path. It never prints the log's
contents: the log holds private product code and must not reach a terminal
transcript, an issue, a pull request or this public repository.

The private key never leaves the machine that holds it. This script only
reads it, through `age -d -i KEY`.

Usage: fetch_log.py --run RUN_ID --suite python|desktop|rust --key FILE
                    [--attempt N] [--repo OWNER/NAME]
Exit status: 0 with the decrypted file's path printed, 2 on a refused
request (no key, bad run id, missing tool), 1 when a download or decryption
fails.
"""

from __future__ import annotations

import argparse
import re
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
SUITES = ("python", "desktop", "rust")
DEFAULT_REPO = "blowhorn-ai/blowhorn-site"
DOWNLOAD_TIMEOUT_S = 300
DECRYPT_TIMEOUT_S = 120


class Refused(Exception):
    """A request this script will not carry out; exit 2."""


class Failed(Exception):
    """A download or decryption that did not work; exit 1."""


def artifact_dir_attempt(name: str, suite: str) -> int | None:
    """The run attempt in a downloaded artifact directory's name, or None."""
    match = re.fullmatch(rf"product-ci-{re.escape(suite)}-log-attempt(\d+)", name)
    return int(match.group(1)) if match else None


def fetch(run: str, suite: str, key: Path, *, attempt: str = "", repo: str = DEFAULT_REPO,
          workdir: Path | None = None) -> Path:
    """Download and decrypt one suite's log; return the plaintext file's path."""
    if not run.isdigit():
        raise Refused(f"RUN must be a workflow run id (digits), not {run!r}.")
    if suite not in SUITES:
        raise Refused(f"SUITE must be one of {', '.join(SUITES)}.")
    if attempt and not attempt.isdigit():
        raise Refused("ATTEMPT must be a run attempt number.")
    if not key.is_file():
        raise Refused(f"No private key at {key}. Pass KEY=<path to the age identity file>.")
    for tool in ("gh", "age"):
        if shutil.which(tool) is None:
            raise Refused(f"{tool} is not installed.")

    out_dir = Path(tempfile.mkdtemp(prefix="product-ci-log-", dir=workdir)).resolve()
    if out_dir.is_relative_to(ROOT):
        shutil.rmtree(out_dir)
        raise Refused("The temporary directory is inside the repository; set TMPDIR elsewhere.")
    try:
        download = out_dir / "download"
        pattern = f"product-ci-{suite}-log-attempt{attempt or '*'}"
        try:
            done = subprocess.run(("gh", "run", "download", run, "-R", repo, "-p", pattern, "-D", str(download)),
                                  stdin=subprocess.DEVNULL, capture_output=True, text=True,
                                  timeout=DOWNLOAD_TIMEOUT_S)
        except subprocess.TimeoutExpired:
            raise Failed(f"gh run download timed out after {DOWNLOAD_TIMEOUT_S} s.") from None
        if done.returncode != 0:
            raise Failed(f"gh run download found no {pattern} artifact on run {run} "
                         f"(it is kept 3 days, and only a failed suite uploads one): {done.stderr.strip()}")
        found = {}
        for child in download.iterdir() if download.is_dir() else ():
            number = artifact_dir_attempt(child.name, suite)
            if number is not None and child.is_dir():
                found[number] = child
        if not found:
            raise Failed(f"Run {run} has no {pattern} artifact.")
        latest = max(found)
        ciphertext = found[latest] / f"{suite}.log.age"
        if not ciphertext.is_file():
            raise Failed(f"The artifact holds no {suite}.log.age.")
        plaintext = out_dir / f"{suite}-run{run}-attempt{latest}.log"
        try:
            done = subprocess.run(("age", "--decrypt", "--identity", str(key), "--output", str(plaintext),
                                   str(ciphertext)), stdin=subprocess.DEVNULL, capture_output=True, text=True,
                                  timeout=DECRYPT_TIMEOUT_S)
        except subprocess.TimeoutExpired:
            raise Failed(f"age timed out after {DECRYPT_TIMEOUT_S} s.") from None
        if done.returncode != 0:
            raise Failed(f"age could not decrypt the log (is KEY the right identity?): {done.stderr.strip()}")
        shutil.rmtree(download)
        plaintext.chmod(0o600)
        return plaintext
    except BaseException:
        shutil.rmtree(out_dir, ignore_errors=True)
        raise


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--run", required=True, help="the Product CI (or Build DMG) workflow run id")
    parser.add_argument("--suite", required=True, choices=SUITES)
    parser.add_argument("--key", required=True, type=Path, help="the age identity file (private key)")
    parser.add_argument("--attempt", default="", help="run attempt (default: the latest one with a log)")
    parser.add_argument("--repo", default=DEFAULT_REPO)
    args = parser.parse_args(argv)
    try:
        path = fetch(args.run, args.suite, args.key.expanduser(), attempt=args.attempt, repo=args.repo)
    except Refused as exc:
        print(f"product-ci-log: {exc}", file=sys.stderr)
        return 2
    except Failed as exc:
        print(f"product-ci-log: {exc}", file=sys.stderr)
        return 1
    print(f"Decrypted log: {path}")
    print("It holds private product code: read it here, never paste it anywhere public, "
          f"and delete it when done (rm -r {path.parent}).")
    return 0


if __name__ == "__main__":
    sys.exit(main())
