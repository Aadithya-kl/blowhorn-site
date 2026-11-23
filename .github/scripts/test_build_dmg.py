#!/usr/bin/env python3
"""Tests for the build-dmg payload, manifest, checkout guard and public log."""

import importlib.util
import io
import json
import os
import sys
import tempfile
import unittest
from pathlib import Path
from unittest import mock

HERE = Path(__file__).resolve().parent
ROOT = HERE.parent.parent
sys.path.insert(0, str(HERE / "build-dmg"))
import checkout_guard  # noqa: E402
import manifest as manifest_mod  # noqa: E402
import payload as payload_mod  # noqa: E402

SPEC = importlib.util.spec_from_file_location("build_dmg_run", HERE / "build-dmg" / "run_build.py")
run_build = importlib.util.module_from_spec(SPEC)
sys.modules["build_dmg_run"] = run_build
SPEC.loader.exec_module(run_build)

REF = "0123456789abcdef0123456789abcdef01234567"
SHA = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
SECRET = "private source token=hunter2 and a stack trace"


class PayloadTest(unittest.TestCase):
    def test_accepts_a_complete_payload(self):
        parsed = payload_mod.parse_inputs(REF, "2.14.1", "adhoc")
        self.assertEqual(parsed["event_type"], "build-dmg")
        self.assertEqual(parsed["client_payload"]["mode"], "adhoc")

    def test_refuses_a_short_sha_a_leading_v_and_an_unknown_mode(self):
        with self.assertRaises(payload_mod.PayloadError):
            payload_mod.parse_inputs("abc", "2.14.1", "adhoc")
        with self.assertRaises(payload_mod.PayloadError):
            payload_mod.parse_inputs(REF, "v2.14.1", "adhoc")
        with self.assertRaises(payload_mod.PayloadError):
            payload_mod.parse_inputs(REF, "2.14.1", "signed")


class ManifestTest(unittest.TestCase):
    def test_accepts_a_complete_manifest(self):
        data = {
            "version": "2.14.1",
            "ref": REF,
            "signing_mode": "developer-id",
            "sha256": SHA,
            "size_bytes": 12,
            "dmg_name": "Blowhorn-2.14.1-universal.dmg",
        }
        self.assertEqual(manifest_mod.parse_manifest(data), data)
        self.assertEqual(manifest_mod.parse_manifest(json.dumps(data)), data)

    def test_refuses_extra_fields_and_a_zero_size(self):
        base = {
            "version": "2.14.1",
            "ref": REF,
            "signing_mode": "adhoc",
            "sha256": SHA,
            "size_bytes": 12,
            "dmg_name": "Blowhorn-2.14.1-universal.dmg",
        }
        with self.assertRaises(manifest_mod.ManifestError):
            manifest_mod.parse_manifest({**base, "extra": 1})
        with self.assertRaises(manifest_mod.ManifestError):
            manifest_mod.parse_manifest({**base, "size_bytes": 0})


class CheckoutGuardTest(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.product = Path(self.tmp.name) / "product"
        self.product.mkdir()

    def tearDown(self):
        self.tmp.cleanup()

    def test_ok_when_internal_paths_are_absent(self):
        (self.product / "desktop").mkdir()
        (self.product / "release").mkdir()
        (self.product / "release" / "internal-paths.txt").write_text("release/signing/\ninternal/\n")
        self.assertEqual(checkout_guard.main([str(self.product)]), 0)

    def test_refuses_a_signing_tree(self):
        signing = self.product / "release" / "signing"
        signing.mkdir(parents=True)
        (signing / "README.md").write_text("no")
        buf = io.StringIO()
        with mock.patch("sys.stderr", buf):
            status = checkout_guard.main([str(self.product)])
        self.assertEqual(status, 1)
        self.assertIn("release/signing/", buf.getvalue())
        self.assertNotIn("no", buf.getvalue())  # never print the file contents
        self.assertFalse(signing.exists())

    def test_excludes_start_with_signing(self):
        paths = checkout_guard.read_excludes()
        self.assertEqual(paths[0], "release/signing/")


class RunBuildTest(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.product = Path(self.tmp.name) / "product"
        desktop = self.product / "desktop" / "scripts"
        desktop.mkdir(parents=True)
        (desktop / "release-mac.mjs").write_text("// stub\n")
        self.log = Path(self.tmp.name) / "private" / "build.log"

    def tearDown(self):
        self.tmp.cleanup()

    def test_a_failure_does_not_print_private_output(self):
        def fake_run(cmd, cwd, env, stdout, stderr):
            stdout.write(SECRET.encode())
            return type("R", (), {"returncode": 1})()

        buf = io.StringIO()
        with mock.patch.object(run_build.subprocess, "run", fake_run), mock.patch("sys.stdout", buf):
            status = run_build.main([
                "--product", str(self.product),
                "--log", str(self.log),
                "--version", "2.14.1",
                "--mode", "adhoc",
            ])
        self.assertEqual(status, 1)
        self.assertIn("build-dmg: failed", buf.getvalue())
        self.assertNotIn("hunter2", buf.getvalue())
        self.assertIn(SECRET, self.log.read_text())

    def test_child_env_drops_github_file_commands(self):
        env = run_build.child_env({"GITHUB_STEP_SUMMARY": "/tmp/sum", "PATH": "/bin", "MAKELEVEL": "1"})
        self.assertNotIn("GITHUB_STEP_SUMMARY", env)
        self.assertNotIn("MAKELEVEL", env)
        self.assertEqual(env["BLOWHORN_BUILD_CLEANUP"], "1")
        self.assertEqual(env["PATH"], "/bin")


class SchemaSyncTest(unittest.TestCase):
    def test_schema_files_exist_and_name_the_same_required_fields(self):
        dispatch = json.loads((ROOT / ".github" / "schemas" / "build-dmg-dispatch.schema.json").read_text())
        result = json.loads((ROOT / ".github" / "schemas" / "build-dmg-manifest.schema.json").read_text())
        self.assertEqual(dispatch["properties"]["event_type"]["const"], "build-dmg")
        self.assertEqual(set(result["required"]), {"version", "ref", "signing_mode", "sha256", "size_bytes", "dmg_name"})


if __name__ == "__main__":
    unittest.main()
