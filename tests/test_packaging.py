import hashlib
import json
import subprocess
import sys
import tempfile
import unittest
import zipfile
from pathlib import Path

PACKAGER = Path(__file__).resolve().parents[1] / "scripts" / "package_source.py"


class SourcePackagingTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name) / "source"
        self.output = Path(self.temp.name) / "releases"
        self.root.mkdir()
        self.output.mkdir()
        self.write("package.json", json.dumps({"name": "reupmatic", "version": "0.6.0"}))
        self.write("README.md", "# Reupmatic — Integration Build 0.6.0\n")
        self.write("AGENTS.md", "# Project rules\n")
        self.write("CHANGELOG.md", "# Changelog\n\n## 0.6.0\n")
        self.write("app/core/example.ts", 'export const title = "Tiếng Việt";\n')
        self.write("research/integration-0.6/RESULTS.md", "Checks passed; UI blocked.\n")

    def write(self, name, value):
        target = self.root / name
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_text(value, encoding="utf-8")

    def package(self):
        return subprocess.run(
            [
                sys.executable,
                str(PACKAGER),
                "--root",
                str(self.root),
                "--output-dir",
                str(self.output),
            ],
            capture_output=True,
            text=True,
            check=False,
        )

    def test_archive_version_root_and_embedded_hashes_match_the_sources(self):
        (self.output / "reupmatic-v0.5.zip").write_bytes(b"prior release")
        result = self.package()
        self.assertEqual(result.returncode, 0, result.stderr)
        archive = self.output / "reupmatic-v0.6.zip"
        with zipfile.ZipFile(archive) as bundle:
            self.assertIsNone(bundle.testzip())
            self.assertTrue(all(name.startswith("reupmatic/") for name in bundle.namelist()))
            manifest = json.loads(bundle.read("reupmatic/RELEASE.json"))
            self.assertEqual(manifest["version"], "0.6.0")
            for name, digest in manifest["files"].items():
                self.assertEqual(
                    hashlib.sha256(bundle.read("reupmatic/" + name)).hexdigest(), digest
                )
        before = archive.read_bytes()
        self.assertNotEqual(self.package().returncode, 0)
        self.assertEqual(archive.read_bytes(), before)

    def test_public_brand_assets_survive_packaging_without_fonts_or_weights(self):
        assets = {
            "public/favicon.ico": b"icon fixture",
            "public/brand/logo.svg": b'<svg xmlns="http://www.w3.org/2000/svg"/>',
            "public/site.webmanifest": b'{"name":"Reupmatic"}',
            "public/icon-192.png": b"png fixture",
        }
        for name, data in assets.items():
            target = self.root / name
            target.parent.mkdir(parents=True, exist_ok=True)
            target.write_bytes(data)
        self.write("public/private-font.woff2", "not distributable")
        self.write("public/model.onnx", "not distributable")
        result = self.package()
        self.assertEqual(result.returncode, 0, result.stderr)
        with zipfile.ZipFile(self.output / "reupmatic-v0.6.zip") as bundle:
            for name, data in assets.items():
                self.assertEqual(bundle.read("reupmatic/" + name), data)
            self.assertNotIn("reupmatic/public/private-font.woff2", bundle.namelist())
            self.assertNotIn("reupmatic/public/model.onnx", bundle.namelist())

    def test_older_version_is_rejected_without_touching_newer_release(self):
        newer = self.output / "reupmatic-v0.7.zip"
        newer.write_bytes(b"newer release")
        self.assertNotEqual(self.package().returncode, 0)
        self.assertEqual(newer.read_bytes(), b"newer release")
        self.assertFalse((self.output / "reupmatic-v0.6.zip").exists())

    def test_dependencies_secrets_fonts_models_and_archives_are_excluded(self):
        excluded = [
            "node_modules/library/index.js",
            "dist-core/example.js",
            ".env",
            "app/.env.local",
            "worker/__pycache__/worker.pyc",
            "worker/model.onnx",
            "app/ui/font.woff2",
            "research/backup.zip",
            ".git/config",
            "workspace/private.mp4",
            "worker/local.pem",
        ]
        for name in excluded:
            self.write(name, "not distributable")
        result = self.package()
        self.assertEqual(result.returncode, 0, result.stderr)
        with zipfile.ZipFile(self.output / "reupmatic-v0.6.zip") as bundle:
            for name in excluded:
                self.assertNotIn("reupmatic/" + name, bundle.namelist())

    def test_conflicting_instruction_file_and_unsynced_readme_are_rejected(self):
        self.write("agent.md", "duplicate rules")
        self.assertNotEqual(self.package().returncode, 0)
        (self.root / "agent.md").unlink()
        self.write("README.md", "# Reupmatic — Integration Build 0.5\n")
        self.assertNotEqual(self.package().returncode, 0)

    def test_semver_comparison_is_numeric_and_patch_handoffs_keep_the_patch(self):
        self.write("package.json", json.dumps({"name": "reupmatic", "version": "0.10.1"}))
        self.write("README.md", "# Reupmatic — Integration Build 0.10.1\n")
        self.write("CHANGELOG.md", "# Changelog\n\n## 0.10.1\n")
        self.write("research/integration-0.10.1/RESULTS.md", "Evidence\n")
        (self.output / "reupmatic-v0.9.zip").write_bytes(b"older")
        self.assertEqual(self.package().returncode, 0)
        self.assertTrue((self.output / "reupmatic-v0.10.1.zip").exists())

    def test_symlinks_cannot_import_content_outside_the_repository(self):
        link = self.root / "app" / "external.txt"
        try:
            link.symlink_to(self.output)
        except (OSError, NotImplementedError):
            self.skipTest("symlinks unavailable")
        self.assertNotEqual(self.package().returncode, 0)

    def test_reserved_modules_and_future_cloud_delivery_boundaries_survive_packaging(self):
        markers = [
            "app/core/downloads/.gitkeep",
            "worker/speech/.gitkeep",
            "services/cloud/consent/.gitkeep",
            "packaging/windows/.gitkeep",
            "contracts/entitlements/.gitkeep",
            "tests/acceptance/publishing/.gitkeep",
        ]
        for name in markers:
            self.write(name, "")
        result = self.package()
        self.assertEqual(result.returncode, 0, result.stderr)
        with zipfile.ZipFile(self.output / "reupmatic-v0.6.zip") as bundle:
            for name in markers:
                self.assertEqual(bundle.read("reupmatic/" + name), b"")

    def declare_scope(self):
        self.write(
            "docs/architecture/system-map.json",
            json.dumps(
                {
                    "source_version": "0.6.0",
                    "modules": [{"reserved": ["app/core/downloads"]}],
                }
            ),
        )
        self.write(
            "docs/architecture/retained-paths.json",
            json.dumps(
                {
                    "paths": ["app/core/example.ts"],
                    "moves": {},
                }
            ),
        )
        self.write(
            "docs/planning/scope-traceability.json",
            json.dumps(
                {
                    "source_version": "0.6.0",
                    "features": [{"scope": f"SC-{index:02d}"} for index in range(1, 15)],
                }
            ),
        )
        self.write("app/core/downloads/.gitkeep", "")

    def test_direct_packager_refuses_missing_declared_markers(self):
        self.declare_scope()
        (self.root / "app/core/downloads/.gitkeep").unlink()
        result = self.package()
        self.assertNotEqual(result.returncode, 0)
        self.assertIn("Reserved boundary", result.stderr)
        self.assertFalse((self.output / "reupmatic-v0.6.zip").exists())

    def test_direct_packager_refuses_unrecorded_source_removal(self):
        self.declare_scope()
        (self.root / "app/core/example.ts").unlink()
        result = self.package()
        self.assertNotEqual(result.returncode, 0)
        self.assertIn("Delivered source", result.stderr)

    def test_current_system_map_versions_and_scope_must_match_release(self):
        self.declare_scope()
        self.write(
            "docs/planning/scope-traceability.json",
            json.dumps(
                {
                    "source_version": "0.6.0",
                    "features": [{"scope": "SC-01"}],
                }
            ),
        )
        self.assertIn("Scope coverage", self.package().stderr)


if __name__ == "__main__":
    unittest.main()
