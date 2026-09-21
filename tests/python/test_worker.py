from __future__ import annotations

import hashlib
import importlib.util
import json
import os
import queue
import shutil
import subprocess
import sys
import tempfile
import threading
import unittest
import uuid
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]


def resolve_binary(env_name, default):
    """The worker resolves ffmpeg/ffprobe from the environment (`FFMPEG_PATH`/`FFPROBE_PATH`).
    The suite is normally launched through npm, which loads `.env.local`; a direct
    `python -m unittest` does not. Read the same file here so a test module behaves
    identically alone and in the full run instead of silently falling back to a PATH
    build without the `subtitles` filter."""
    value = os.environ.get(env_name)
    if value:
        return value
    env_file = ROOT / ".env.local"
    if env_file.exists():
        for line in env_file.read_text(encoding="utf-8").splitlines():
            key, separator, candidate = line.partition("=")
            if separator and key.strip() == env_name and candidate.strip():
                return candidate.strip()
    return default


def sha(path):
    return hashlib.sha256(Path(path).read_bytes()).hexdigest()


class Session:
    def __init__(self, workspace, env=None):
        resolved = {
            **os.environ,
            "FFMPEG_PATH": resolve_binary("FFMPEG_PATH", "ffmpeg"),
            "FFPROBE_PATH": resolve_binary("FFPROBE_PATH", "ffprobe"),
            **(env or {}),
        }
        self.proc = subprocess.Popen(
            [sys.executable, "-u", str(ROOT / "worker/main.py"), "--workspace", str(workspace)],
            stdin=subprocess.PIPE,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True,
            encoding="utf-8",
            env=resolved,
        )
        self.messages = queue.Queue()
        self.events = []
        self.replies = {}

        def read():
            for line in self.proc.stdout:
                self.messages.put(json.loads(line))

        self.reader = threading.Thread(target=read, daemon=True)
        self.reader.start()

    def send(self, method, params, revision=0):
        rid = str(uuid.uuid4())
        self.proc.stdin.write(
            json.dumps(
                {"v": 1, "id": rid, "revision": revision, "method": method, "params": params},
                ensure_ascii=False,
            )
            + "\n"
        )
        self.proc.stdin.flush()
        return rid

    def wait(self, rid):
        if rid in self.replies:
            return self.replies.pop(rid)
        while True:
            msg = self.messages.get(timeout=40)
            self.events.append(msg)
            if msg["event"] != "progress":
                if msg["id"] == rid:
                    return msg
                self.replies[msg["id"]] = msg

    def call(self, method, params, revision=0):
        msg = self.wait(self.send(method, params, revision))
        if msg["event"] == "error":
            raise RuntimeError(msg["data"]["code"])
        return msg["data"]

    def close(self):
        self.proc.stdin.close()
        try:
            self.proc.wait(timeout=15)
        except subprocess.TimeoutExpired:
            self.proc.kill()
            self.proc.wait()
        self.reader.join(timeout=2)
        self.proc.stdout.close()
        self.proc.stderr.close()


@unittest.skipUnless(shutil.which("ffmpeg") and shutil.which("ffprobe"), "FFmpeg/ffprobe required")
class NativeWorkerTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.temp = tempfile.TemporaryDirectory(prefix="workbench-tests-")
        cls.root = Path(cls.temp.name)
        cls.source = cls.root / "nguồn ' video.mp4"
        subprocess.run(
            [
                "ffmpeg",
                "-v",
                "error",
                "-f",
                "lavfi",
                "-i",
                "testsrc2=size=320x180:rate=30:duration=4",
                "-f",
                "lavfi",
                "-i",
                "sine=frequency=440:sample_rate=48000:duration=4",
                "-c:v",
                "libx264",
                "-threads",
                "2",
                "-pix_fmt",
                "yuv420p",
                "-c:a",
                "aac",
                "-shortest",
                "-n",
                str(cls.source),
            ],
            check=True,
        )
        cls.srt = cls.root / "phụ đề.srt"
        cls.srt.write_text(
            "1\n00:00:00,200 --> 00:00:01,800\nTiếng Việt: chỉnh phụ đề.\n\n"
            "2\n00:00:02,000 --> 00:00:03,800\nEnglish — actual render.\n",
            encoding="utf-8",
        )
        cls.before = hashlib.sha256(cls.source.read_bytes()).hexdigest()

    @classmethod
    def tearDownClass(cls):
        cls.temp.cleanup()

    def setUp(self):
        self.work = Path(tempfile.mkdtemp(dir=self.root))
        self.s = Session(self.work)
        self.video = self.s.call("asset.register", {"path": str(self.source), "kind": "video"})[
            "asset_id"
        ]
        self.subtitle = self.s.call("asset.register", {"path": str(self.srt), "kind": "subtitle"})[
            "asset_id"
        ]

    def tearDown(self):
        self.s.close()

    def render(self, mode="sample", **kwargs):
        params = {
            "asset_id": self.video,
            "subtitle_id": self.subtitle,
            "mode": mode,
            "encoding": "lossless",
        }
        if mode == "sample":
            params.update(start_ms=1000, end_ms=3000)
        params.update(kwargs)
        return self.s.call("media.render", params, revision=7)

    def test_probe_and_unicode_reference(self):
        info = self.s.call("media.probe", {"asset_id": self.video})
        self.assertEqual(info["width"], 320)
        self.assertEqual(info["duration_ms"], 4000)
        self.assertTrue(info["has_audio"])

    def test_sample_equals_full_interval(self):
        full = self.render("full")
        sample = self.render()

        def hashes(path, start=None, duration=None):
            command = ["ffmpeg", "-v", "error", "-i", path]
            if start is not None:
                command += ["-ss", str(start), "-t", str(duration)]
            data = subprocess.check_output(command + ["-map", "0:v:0", "-f", "framemd5", "-"])
            return [
                line.rsplit(b",", 1)[-1].strip()
                for line in data.splitlines()
                if line and not line.startswith(b"#")
            ]

        self.assertEqual(hashes(full["path"], 1, 2), hashes(sample["path"]))
        self.assertEqual(len(hashes(sample["path"])), 60)
        self.assertTrue(sample["has_audio"])
        self.assertEqual(sample["duration_ms"], 2000)

    def test_cache_and_revision_echo(self):
        first = self.render()
        second = self.render()
        self.assertFalse(first["cache_hit"])
        self.assertTrue(second["cache_hit"])
        self.assertEqual(first["path"], second["path"])
        results = [
            m for m in self.s.events if m["event"] == "result" and m["data"].get("artifact_id")
        ]
        self.assertTrue(all(m["revision"] == 7 for m in results))

    def test_changed_subtitle_changes_output(self):
        a = self.render()
        edited = self.work / "edited.srt"
        edited.write_text(
            self.srt.read_text().replace("chỉnh phụ đề.", "NỘI DUNG ĐÃ SỬA"), encoding="utf-8"
        )
        b_id = self.s.call("asset.register", {"path": str(edited), "kind": "subtitle"})["asset_id"]
        b = self.render(subtitle_id=b_id)
        self.assertNotEqual(a["sha256"], b["sha256"])
        self.assertNotEqual(a["artifact_id"], b["artifact_id"])

    def test_corrupt_cached_output_is_not_reused(self):
        a = self.render()
        Path(a["path"]).write_bytes(b"broken cache")
        b = self.render()
        self.assertFalse(b["cache_hit"])
        self.assertEqual(b["duration_ms"], 2000)
        self.assertEqual(sha(b["path"]), b["sha256"])

    def test_input_never_overwritten(self):
        self.render()
        self.assertEqual(self.before, hashlib.sha256(self.source.read_bytes()).hexdigest())

    def test_invalid_range_does_not_kill_worker(self):
        msg = self.s.wait(
            self.s.send(
                "media.render",
                {
                    "asset_id": self.video,
                    "mode": "sample",
                    "encoding": "lossless",
                    "start_ms": 3000,
                    "end_ms": 1000,
                },
            )
        )
        self.assertEqual(msg["event"], "error")
        self.assertTrue(self.s.call("hello", {})["ffmpeg"])

    def test_unknown_method_is_rejected(self):
        with self.assertRaisesRegex(RuntimeError, "METHOD_UNAVAILABLE"):
            self.s.call("media.transcode", {})

    def test_unknown_asset_and_invalid_extra_arguments(self):
        with self.assertRaisesRegex(RuntimeError, "UNKNOWN_ASSET"):
            self.s.call("media.probe", {"asset_id": "not-registered"})
        with self.assertRaisesRegex(RuntimeError, "INVALID_REQUEST"):
            self.s.call(
                "media.render",
                {
                    "asset_id": self.video,
                    "mode": "full",
                    "encoding": "lossless",
                    "ffmpeg_args": ["-y"],
                },
            )

    def test_changed_source_requires_registration(self):
        local = self.work / "copy.mp4"
        shutil.copyfile(self.source, local)
        aid = self.s.call("asset.register", {"path": str(local), "kind": "video"})["asset_id"]
        with local.open("ab") as f:
            f.write(b"changed")
        with self.assertRaisesRegex(RuntimeError, "SOURCE_CHANGED"):
            self.s.call("media.probe", {"asset_id": aid})

    def test_bad_batch_item_does_not_block_following_item(self):
        bad = self.work / "bad.mp4"
        bad.write_text("not a video")
        aid = self.s.call("asset.register", {"path": str(bad), "kind": "video"})["asset_id"]
        bad_id = self.s.send(
            "media.render", {"asset_id": aid, "mode": "full", "encoding": "lossless"}
        )
        good_id = self.s.send(
            "media.render", {"asset_id": self.video, "mode": "full", "encoding": "lossless"}
        )
        self.assertEqual(self.s.wait(bad_id)["event"], "error")
        self.assertEqual(self.s.wait(good_id)["event"], "result")

    def test_cancel_queued_or_running_request(self):
        request_id = self.s.send(
            "media.render",
            {
                "asset_id": self.video,
                "subtitle_id": self.subtitle,
                "mode": "full",
                "encoding": "lossless",
            },
        )
        reply = self.s.call("cancel", {"request_id": request_id})
        self.assertTrue(reply["requested"])
        self.assertEqual(self.s.wait(request_id)["data"]["code"], "CANCELLED")
        self.assertTrue(self.s.call("hello", {})["ffmpeg"])

    def test_waveform_is_bounded(self):
        data = self.s.call("media.peaks", {"asset_id": self.video})
        self.assertGreater(len(data["peaks"]), 0)
        self.assertLessEqual(len(data["peaks"]), 1000)
        self.assertTrue(all(0 <= x <= 1 for x in data["peaks"]))

    def test_review_output_is_actual_mp4(self):
        result = self.render(encoding="review")
        self.assertTrue(result["path"].endswith(".mp4"))
        self.assertTrue(Path(result["path"]).stat().st_size > 1000)

    def test_optional_subtitle_component_is_reported_honestly(self):
        available = importlib.util.find_spec("pysubs2") is not None
        self.assertEqual(self.s.call("hello", {})["pysubs2"], available)
        if not available:
            with self.assertRaisesRegex(RuntimeError, "COMPONENT_MISSING"):
                self.s.call("subtitles.load", {"asset_id": self.subtitle})

    @unittest.skipUnless(
        importlib.util.find_spec("pysubs2"), "pysubs2 unavailable; no substitute parser"
    )
    def test_library_subtitle_edit_round_trip(self):
        data = self.s.call("subtitles.load", {"asset_id": self.subtitle})
        data["cues"][0]["text"] = "Sửa câu tiếng Việt\nEnglish second line"
        saved = self.s.call("subtitles.save", data)
        reread = self.s.call("subtitles.load", {"asset_id": saved["asset_id"]})
        self.assertEqual(reread["cues"][0]["text"], data["cues"][0]["text"])


if __name__ == "__main__":
    unittest.main(verbosity=2)
