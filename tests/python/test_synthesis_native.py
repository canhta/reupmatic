import hashlib
import json
import os
import tempfile
import time
import unittest
import wave
from pathlib import Path

from synthesis_fixture import bundle, clone_bundle, nano_bundle, nano_params, params, sdk
from test_worker import Session


class SynthesisNativeTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(prefix="synthesis-native-")
        self.root = Path(self.temp.name)
        self.workspace = self.root / "workspace"
        self.workspace.mkdir()
        self.manifest, self.model = bundle(self.root)
        self.nano_manifest, self.nano_model = nano_bundle(self.root)
        self.clone_manifest, self.clone_model = clone_bundle(self.root)
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
        s, p = self.nano_session()
        result = s.call("speech.synthesize", p, revision=42)
        self.assertEqual(result["sample_rate"], 24000)
        self.assertEqual(
            [(segment["end_frame"] - segment["start_frame"]) for segment in result["segments"]],
            [7200, 7200],
        )

    def reference(self, seconds=4):
        path = self.root / f"reference-{seconds}.wav"
        with wave.open(str(path), "wb") as audio:
            audio.setparams((1, 2, 44100, 44100 * seconds, "NONE", "not compressed"))
            audio.writeframes(bytes(44100 * seconds * 2))
        return path

    def register_audio(self, s, path):
        return s.call("asset.register", {"path": str(path), "kind": "audio"})["asset_id"]

    def configure_clone(self, s):
        self.assertEqual(
            s.call("synthesis.configure-clone", {"path": str(self.clone_manifest)}),
            {"available": True},
        )

    def test_cloning_is_unavailable_until_the_add_on_is_installed(self):
        s, _ = self.session()
        asset = self.register_audio(s, self.reference())
        with self.assertRaisesRegex(RuntimeError, "SYNTHESIS_CLONE_UNAVAILABLE"):
            s.call("synthesis.clone", {"asset_id": asset})
        self.assertFalse((self.workspace / "local-synthesis-clone.json").exists())

    def test_a_reference_clip_encodes_to_the_adapter_voice_shape_and_never_promotes_scratch(self):
        s, _ = self.session()
        self.configure_clone(s)
        asset = self.register_audio(s, self.reference())
        voice = s.call("synthesis.clone", {"asset_id": asset})
        self.assertEqual(
            voice, {"speaker_emb": [0.25] * 192, "ref_codes": [[1, 2, 3, 4, 5, 6, 7, 8]] * 2}
        )
        self.assertFalse(list((self.workspace / "speech").iterdir()))

    def test_a_cloned_voice_synthesizes_without_entering_the_receipt_or_artifact(self):
        s, p = self.session()
        self.configure_clone(s)
        asset = self.register_audio(s, self.reference())
        voice = s.call("synthesis.clone", {"asset_id": asset})
        result = s.call(
            "speech.synthesize", {**p, "voice_id": "cloned_aaaaaaaaaaaaaaaa", "voice": voice}
        )
        output = self.workspace / "speech" / result["artifact_id"]
        self.assertEqual({name.name for name in output.iterdir()}, {"speech.wav", "receipt.json"})
        receipt = json.loads((output / "receipt.json").read_text())
        self.assertNotIn("voice", receipt)
        self.assertEqual(receipt["voice_id"], "cloned_aaaaaaaaaaaaaaaa")
        self.assertEqual(result["frames"], 21600)

    def test_cloning_is_refused_on_an_engine_with_no_local_encode_graph(self):
        s, _ = self.nano_session()
        asset = self.register_audio(s, self.reference())
        with self.assertRaisesRegex(RuntimeError, "SYNTHESIS_CLONE_UNSUPPORTED_ENGINE"):
            s.call("synthesis.clone", {"asset_id": asset})

    def test_a_clip_outside_three_to_eight_seconds_is_refused(self):
        s, _ = self.session()
        self.configure_clone(s)
        asset = self.register_audio(s, self.reference(seconds=12))
        with self.assertRaisesRegex(RuntimeError, "SYNTHESIS_CLONE_AUDIO_INVALID"):
            s.call("synthesis.clone", {"asset_id": asset})

    def test_a_malformed_sdk_encoding_is_refused_not_stored(self):
        s, _ = self.session(SYNTH_TEST_CLONE_BAD="1")
        self.configure_clone(s)
        asset = self.register_audio(s, self.reference())
        with self.assertRaisesRegex(RuntimeError, "MODEL_OUTPUT_INVALID"):
            s.call("synthesis.clone", {"asset_id": asset})

    def test_a_clone_child_may_not_reach_the_network(self):
        s, _ = self.session(SYNTH_TEST_NETWORK="1")
        self.configure_clone(s)
        asset = self.register_audio(s, self.reference())
        with self.assertRaisesRegex(RuntimeError, "MODEL_NETWORK_DISABLED"):
            s.call("synthesis.clone", {"asset_id": asset})

    def test_a_tampered_clone_artifact_is_a_named_code_before_any_network(self):
        s, _ = self.session(SYNTH_TEST_NETWORK="1")
        self.configure_clone(s)
        asset = self.register_audio(s, self.reference())
        os.unlink(self.clone_model / "speaker_encoder.onnx")
        with self.assertRaisesRegex(RuntimeError, "MODEL_MISSING"):
            s.call("synthesis.clone", {"asset_id": asset})

    def test_a_missing_clone_bundle_is_unavailable_not_a_silent_download(self):
        s, _ = self.session(SYNTH_TEST_NETWORK="1")
        asset = self.register_audio(s, self.reference())
        with self.assertRaisesRegex(RuntimeError, "SYNTHESIS_CLONE_UNAVAILABLE"):
            s.call("synthesis.clone", {"asset_id": asset})

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
