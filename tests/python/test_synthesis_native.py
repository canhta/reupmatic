"""Real queue/child/filesystem/WAV tests, using explicitly CONTROLLED SDK/weights."""

import hashlib
import json
import os
import tempfile
import time
import unittest
import wave
from pathlib import Path

from synthesis_fixture import bundle, nano_bundle, nano_params, params, sdk
from test_worker import Session


class SynthesisNativeTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(prefix="synthesis-native-")
        self.root = Path(self.temp.name)
        self.workspace = self.root / "workspace"
        self.workspace.mkdir()
        self.manifest, self.model = bundle(self.root)
        self.nano_manifest, self.nano_model = nano_bundle(self.root)
        self.sdk = sdk(self.root)
        self.sessions = []
        self.original = self.root / "original.srt"
        self.original.write_bytes(b"1\n00:00:00,000 --> 00:00:01,000\nProtected\n")
        self.original_hash = hashlib.sha256(self.original.read_bytes()).hexdigest()

    def tearDown(self):
        for session in self.sessions:
            session.close()
        self.assertFalse(list(self.workspace.glob("speech/.synthesis-*")))
        self.assertEqual(hashlib.sha256(self.original.read_bytes()).hexdigest(), self.original_hash)
        self.temp.cleanup()

    def session(self, **environment):
        s = Session(
            self.workspace,
            env={
                **os.environ,
                "PYTHONPATH": str(self.sdk),
                "SYNTH_TEST_PID": str(self.root / "child.pid"),
                **environment,
            },
        )
        self.sessions.append(s)
        status = s.call("synthesis.configure", {"path": str(self.manifest)})
        self.assertTrue(status["available"], status)
        self.assertFalse(status["verified"])
        return s, params(status["model_id"])

    def nano_session(self, **environment):
        s = Session(
            self.workspace,
            env={
                **os.environ,
                "PYTHONPATH": str(self.sdk),
                "SYNTH_TEST_PID": str(self.root / "child.pid"),
                **environment,
            },
        )
        self.sessions.append(s)
        status = s.call("synthesis.configure", {"path": str(self.nano_manifest)})
        self.assertTrue(status["available"], status)
        self.assertFalse(status["verified"])
        return s, nano_params(status["model_id"])

    def test_the_nano_engine_runs_at_24000_and_fits_lines_without_host_compression(self):
        # 96,000 controlled frames at 24 kHz is 4 s of natural speech against 2 s slots, so the
        # engine's own duration predictor has to compress; the host applies no rate factor.
        s, p = self.nano_session(SYNTH_TEST_NANO_NATURAL="96000")
        result = s.call("speech.synthesize", p, revision=41)
        self.assertEqual(result["sample_rate"], 24000)
        self.assertEqual(result["frames"], 102000)
        self.assertEqual(result["duration_ms"], 4250)
        self.assertEqual(
            result["segments"],
            [
                {"cue_id": "cue-1", "start_frame": 0, "end_frame": 48000, "lead_silence_frames": 0},
                {
                    "cue_id": "cue-2",
                    "start_frame": 54000,
                    "end_frame": 102000,
                    "lead_silence_frames": 6000,
                },
            ],
        )
        # The plan's slot ends where the next line begins, not where this cue ends.
        for index, (cue, segment) in enumerate(zip(p["cues"], result["segments"])):
            end_ms = (
                p["cues"][index + 1]["start_ms"] if index + 1 < len(p["cues"]) else cue["end_ms"]
            )
            speech_ms = (segment["end_frame"] - segment["start_frame"]) * 1000 // 24000
            self.assertLessEqual(speech_ms, end_ms - cue["start_ms"])
        output = self.workspace / "speech" / result["artifact_id"]
        with wave.open(str(output / "speech.wav"), "rb") as audio:
            self.assertEqual(audio.getparams()[:4], (1, 2, 24000, 102000))

    def test_the_nano_engine_leaves_speech_that_already_fits_at_its_natural_length(self):
        # 7,200 controlled frames is 300 ms against 2 s slots: the engine is never slowed to pad
        # the gap, so the recorded span stays the natural one rather than the slot length.
        s, p = self.nano_session()
        result = s.call("speech.synthesize", p, revision=42)
        self.assertEqual(result["sample_rate"], 24000)
        self.assertEqual(
            [(segment["end_frame"] - segment["start_frame"]) for segment in result["segments"]],
            [7200, 7200],
        )

    def test_a_nano_job_for_a_language_the_engine_does_not_serve_is_refused(self):
        s, p = self.nano_session()
        with self.assertRaisesRegex(RuntimeError, "MODEL_LANGUAGE_UNAVAILABLE"):
            s.call("speech.synthesize", {**p, "language": "en"})

    def test_a_nano_hash_change_during_inference_never_promotes(self):
        s, p = self.nano_session(SYNTH_TEST_HASH="1")
        with self.assertRaisesRegex(RuntimeError, "MODEL_HASH_MISMATCH"):
            s.call("speech.synthesize", p)
        self.assertFalse(list((self.workspace / "speech").iterdir()))

    def test_real_child_promotes_correlated_natural_wave_and_receipt(self):
        s, p = self.session()
        result = s.call("speech.synthesize", p, revision=17)
        for key in p:
            self.assertEqual(result[key], p[key])
        self.assertEqual(result["frames"], 21600)
        self.assertEqual(result["duration_ms"], 450)
        self.assertEqual(result["sample_rate"], 48000)
        self.assertEqual(
            result["segments"],
            [
                {"cue_id": "cue-1", "start_frame": 0, "end_frame": 4800, "lead_silence_frames": 0},
                {
                    "cue_id": "cue-2",
                    "start_frame": 16800,
                    "end_frame": 21600,
                    "lead_silence_frames": 12000,
                },
            ],
        )
        output = self.workspace / "speech" / result["artifact_id"]
        self.assertEqual({p.name for p in output.iterdir()}, {"speech.wav", "receipt.json"})
        self.assertEqual(json.loads((output / "receipt.json").read_text()), result)
        self.assertEqual(
            hashlib.sha256((output / "speech.wav").read_bytes()).hexdigest(), result["sha256"]
        )
        with wave.open(str(output / "speech.wav"), "rb") as audio:
            self.assertEqual(audio.getparams()[:4], (1, 2, 48000, 21600))
            audio.setpos(4800)
            self.assertEqual(audio.readframes(12000), bytes(24000))
        self.assertTrue(
            any(e["revision"] == 17 and e["data"].get("kind") == "synthesis" for e in s.events)
        )
        self.assertFalse(list((self.workspace / "renders").iterdir()))

    def test_a_result_reports_another_supported_rate_and_its_own_spacing(self):
        s, p = self.session(SYNTH_TEST_RATE="24000")
        result = s.call("speech.synthesize", p, revision=18)
        self.assertEqual(result["sample_rate"], 24000)
        self.assertEqual(result["frames"], 15600)
        self.assertEqual(result["duration_ms"], 650)
        self.assertEqual(
            result["segments"],
            [
                {"cue_id": "cue-1", "start_frame": 0, "end_frame": 4800, "lead_silence_frames": 0},
                {
                    "cue_id": "cue-2",
                    "start_frame": 10800,
                    "end_frame": 15600,
                    "lead_silence_frames": 6000,
                },
            ],
        )
        output = self.workspace / "speech" / result["artifact_id"]
        with wave.open(str(output / "speech.wav"), "rb") as audio:
            self.assertEqual(audio.getparams()[:4], (1, 2, 24000, 15600))

    def test_an_engine_rate_this_build_cannot_produce_has_its_own_named_failure(self):
        s, p = self.session(SYNTH_TEST_RATE="12345")
        with self.assertRaisesRegex(RuntimeError, "SYNTHESIS_SAMPLE_RATE_UNSUPPORTED"):
            s.call("speech.synthesize", p)
        self.assertEqual(s.call("hello", {})["protocol"], 1)
        self.assertFalse(list((self.workspace / "speech").iterdir()))

    def test_cancel_reaps_child_and_releases_existing_queue(self):
        s, p = self.session(SYNTH_TEST_SLOW="1")
        request = s.send("speech.synthesize", p)
        next_job = s.send("asset.register", {"path": str(self.original), "kind": "subtitle"})
        deadline = time.monotonic() + 10
        while not (self.root / "child.pid").exists() and time.monotonic() < deadline:
            time.sleep(0.025)
        self.assertTrue((self.root / "child.pid").exists())
        self.assertTrue(s.call("cancel", {"request_id": request})["requested"])
        self.assertEqual(s.wait(request)["data"]["code"], "CANCELLED")
        self.assertEqual(s.wait(next_job)["event"], "result")
        self.assertFalse(list((self.workspace / "speech").iterdir()))
        if os.name != "nt":
            with self.assertRaises(ProcessLookupError):
                os.kill(int((self.root / "child.pid").read_text()), 0)

    def test_network_is_refused_without_fallback(self):
        s, p = self.session(SYNTH_TEST_NETWORK="1")
        with self.assertRaisesRegex(RuntimeError, "MODEL_NETWORK_DISABLED"):
            s.call("speech.synthesize", p)
        self.assertEqual(s.call("hello", {})["protocol"], 1)

    def test_sdk_cannot_start_another_child(self):
        s, p = self.session(SYNTH_TEST_CHILD="1")
        with self.assertRaisesRegex(RuntimeError, "MODEL_NETWORK_DISABLED"):
            s.call("speech.synthesize", p)

    def test_hash_change_during_inference_never_promotes(self):
        s, p = self.session(SYNTH_TEST_HASH="1")
        with self.assertRaisesRegex(RuntimeError, "MODEL_HASH_MISMATCH"):
            s.call("speech.synthesize", p)
        self.assertFalse(list((self.workspace / "speech").iterdir()))

    def test_token_limit_is_not_silent_input_truncation(self):
        s, p = self.session(SYNTH_TEST_TOKEN="1")
        with self.assertRaisesRegex(RuntimeError, "SYNTHESIS_TOKEN_LIMIT"):
            s.call("speech.synthesize", p)

    def test_empty_silent_nonfinite_multichannel_and_overlong_audio_fail(self):
        for mode in ("empty", "silent", "quiet", "nan", "shape", "long"):
            with self.subTest(mode=mode):
                s, p = self.session(SYNTH_TEST_AUDIO=mode)
                with self.assertRaisesRegex(RuntimeError, "MODEL_OUTPUT_INVALID"):
                    s.call("speech.synthesize", p)
                s.close()
                self.sessions.remove(s)
                self.assertFalse(list((self.workspace / "speech").iterdir()))

    def test_model_and_voice_changes_require_new_input(self):
        s, p = self.session()
        for patch, code in [
            ({"model_id": "b" * 64}, "SYNTHESIS_MODEL_CHANGED"),
            ({"voice_id": "unknown"}, "SYNTHESIS_VOICE_UNAVAILABLE"),
        ]:
            with self.assertRaisesRegex(RuntimeError, code):
                s.call("speech.synthesize", {**p, **patch})

    def test_failed_setup_keeps_previous_configuration(self):
        s, _ = self.session()
        before = (self.workspace / "local-synthesis.json").read_bytes()
        invalid = self.root / "bad.json"
        invalid.write_text("{}")
        with self.assertRaisesRegex(RuntimeError, "SYNTHESIS_MANIFEST_INVALID"):
            s.call("synthesis.configure", {"path": str(invalid)})
        self.assertEqual((self.workspace / "local-synthesis.json").read_bytes(), before)
        self.assertTrue(s.call("synthesis.status", {})["available"])

    def test_close_cleans_inflight_partial(self):
        s, p = self.session(SYNTH_TEST_SLOW="1")
        s.send("speech.synthesize", p)
        deadline = time.monotonic() + 10
        while not (self.root / "child.pid").exists() and time.monotonic() < deadline:
            time.sleep(0.025)
        self.assertTrue((self.root / "child.pid").exists())
        s.close()
        self.sessions.remove(s)
        self.assertFalse(list((self.workspace / "speech").iterdir()))

    def test_configure_completes_a_downloaded_bundle_from_the_sdk_presets(self):
        # What the catalogue install leaves behind: the declared weights, no derived voices.
        (self.root / "downloaded").mkdir()
        manifest, directory = bundle(self.root / "downloaded")
        (directory / "voices.json").unlink()
        value = json.loads(manifest.read_text())
        del value["files"]["voices.json"]
        manifest.write_text(json.dumps(value))
        s = Session(
            self.workspace,
            env={
                **os.environ,
                "PYTHONPATH": str(self.sdk),
                "SYNTH_TEST_PID": str(self.root / "child.pid"),
            },
        )
        self.sessions.append(s)
        status = s.call("synthesis.configure", {"path": str(manifest)})
        self.assertTrue(status["available"], status)
        self.assertTrue((directory / "voices.json").is_file())
        self.assertEqual(
            status["voices"], [{"id": "Controlled voice", "label": "Controlled voice"}]
        )
