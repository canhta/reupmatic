import copy
import importlib.util
import json
import subprocess
import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[2] / "worker"))
from subtitles.style import DEFAULT_STYLE

ROOT = Path(__file__).resolve().parents[2]


@unittest.skipUnless(importlib.util.find_spec("jsonschema"), "jsonschema required")
class MediaContracts(unittest.TestCase):
    def setUp(self):
        from jsonschema import Draft202012Validator

        self.validate = Draft202012Validator
        self.worker = self.validate(
            json.loads((ROOT / "contracts/worker-request.schema.json").read_text())
        )
        self.soundtrack = {
            "source": {
                "path": "/music.wav",
                "name": "music.wav",
                "sha256": "a" * 64,
                "duration_ms": 3000,
            },
            "mode": "mix",
            "start_ms": 0,
            "end_ms": 2000,
            "offset_ms": 500,
            "gain_db": -6,
            "fade_in_ms": 100,
            "fade_out_ms": 100,
            "duck": {"enabled": True, "amount_db": 12, "release_ms": 250},
            "muted": False,
        }

    def request(self, method, params):
        return {"v": 1, "id": "sample", "revision": 0, "method": method, "params": params}

    def test_all_nested_schemas_and_generated_embeddings(self):
        for file in (ROOT / "contracts").rglob("*.schema.json"):
            self.validate.check_schema(json.loads(file.read_text()))
        subprocess.run(
            [sys.executable, str(ROOT / "scripts/sync-contracts.py"), "--check"],
            check=True,
            capture_output=True,
        )

    def test_project_and_recipe_accept_style_and_audio_without_ai(self):
        project = {
            "format": "reupmatic.project",
            "source": {"path": "/video.mp4", "sha256": "b" * 64},
            "cues": [
                {"id": "1", "start_ms": 0, "end_ms": 1000, "text": "Việt", "style": DEFAULT_STYLE}
            ],
            "sample": {"start_ms": 0, "end_ms": 1000},
            "soundtrack": self.soundtrack,
            "processing": {"subtitle_style": DEFAULT_STYLE},
        }
        validator = self.validate(json.loads((ROOT / "contracts/project.schema.json").read_text()))
        validator.validate(project)
        invalid = copy.deepcopy(project)
        invalid["soundtrack"]["command"] = "anything"
        self.assertFalse(validator.is_valid(invalid))
        invalid = copy.deepcopy(project)
        invalid["cues"][0]["style"]["position"] = 10
        self.assertFalse(validator.is_valid(invalid))
        invalid = copy.deepcopy(project)
        invalid["soundtrack"]["duck"]["amount_db"] = 0
        self.assertFalse(validator.is_valid(invalid))
        invalid = copy.deepcopy(project)
        del invalid["soundtrack"]["duck"]
        self.assertFalse(validator.is_valid(invalid))

    def voice(self, mode="mix"):
        return {
            "asset_id": "voice",
            "sha256": "a" * 64,
            "sample_rate": 24000,
            "mode": mode,
            "gain_db": -2,
            "fade_in_ms": 100,
            "fade_out_ms": 100,
            "muted": False,
            "lines": [
                {"offset_ms": 0, "rate": 1, "start_frame": 0, "end_frame": 12000},
                {"offset_ms": 1500, "rate": 1.25, "start_frame": 24000, "end_frame": 36000},
            ],
        }

    def test_worker_audio_uses_registration_not_renderer_paths(self):
        track = {key: value for key, value in self.soundtrack.items() if key != "source"}
        track.update(asset_id="audio", sha256="a" * 64)
        params = {"asset_id": "video", "mode": "full", "encoding": "review", "soundtrack": track}
        self.worker.validate(self.request("media.render", params))
        self.worker.validate(
            self.request(
                "media.process",
                {**params, "processing": {"subtitle_style": DEFAULT_STYLE}},
            )
        )
        self.assertFalse(
            self.worker.is_valid(
                self.request("media.render", {**params, "soundtrack": self.soundtrack})
            )
        )
        self.worker.validate(self.request("audio.probe", {"asset_id": "audio"}))
        self.worker.validate(
            self.request(
                "subtitles.prepare", {"asset_id": "video", "cues": [], "style": DEFAULT_STYLE}
            )
        )
        self.worker.validate(
            self.request("subtitles.save", {"cues": [], "format": "ass", "style": DEFAULT_STYLE})
        )

    def test_worker_carries_a_third_voice_branch_registered_not_by_path(self):
        track = {key: value for key, value in self.soundtrack.items() if key != "source"}
        track.update(asset_id="audio", sha256="a" * 64)
        for method, extra in (
            ("media.render", {}),
            ("media.process", {"processing": {"editing": {"speed": 1}}}),
        ):
            params = {
                "asset_id": "video",
                "mode": "full",
                "encoding": "review",
                "soundtrack": track,
                "voice": self.voice(),
                **extra,
            }
            self.worker.validate(self.request(method, params))
            for patch in (
                {"voice": {**self.voice(), "sample_rate": 12345}},
                {"voice": {**self.voice(), "gain_db": 40}},
                {"voice": {**self.voice(), "lines": []}},
                {
                    "voice": {
                        **self.voice(),
                        "lines": [{"offset_ms": 0, "rate": 0.5, "start_frame": 0, "end_frame": 5}],
                    }
                },
            ):
                self.assertFalse(
                    self.worker.is_valid(self.request(method, {**params, **patch})),
                    f"{method} accepted {patch}",
                )
            # The renderer's own file grant is still never admitted.
            self.assertFalse(
                self.worker.is_valid(self.request(method, {**params, "voice": self.soundtrack}))
            )
