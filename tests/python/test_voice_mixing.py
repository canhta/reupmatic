import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[2] / "worker"))
from media.audio.mixing import audio_arguments  # noqa: E402
from media.audio.voice import resolve_voice  # noqa: E402
from runtime.errors import WorkerError  # noqa: E402


def mix(*, track=None, voice=None, voice_index=None, has_source=True, edit=None, start=0):
    args = audio_arguments(
        0,
        1,
        track,
        has_source,
        edit or {},
        start,
        4000,
        4000,
        voice=voice,
        voice_index=voice_index,
    )
    return args


def graph(*, track=None, voice=None, voice_index=None, has_source=True, edit=None, start=0):
    args = mix(
        track=track,
        voice=voice,
        voice_index=voice_index,
        has_source=has_source,
        edit=edit,
        start=start,
    )
    if args == ["-an"]:
        return None
    return args[args.index("-filter_complex") + 1]


def music(mode="replace"):
    return {
        "mode": mode,
        "start_ms": 0,
        "end_ms": 2000,
        "offset_ms": 1000,
        "gain_db": 0,
        "fade_in_ms": 0,
        "fade_out_ms": 0,
        "duck": {"enabled": False, "amount_db": 12, "release_ms": 250},
    }


def speech(*, mode="mix", sample_rate=24000, rate=1, gain_db=0, fade_in_ms=0, fade_out_ms=0):
    return {
        "mode": mode,
        "sample_rate": sample_rate,
        "gain_db": gain_db,
        "fade_in_ms": fade_in_ms,
        "fade_out_ms": fade_out_ms,
        "lines": [
            {"offset_ms": 500, "rate": rate, "start_frame": 0, "end_frame": 24000},
        ],
    }


class VoiceMixingArguments(unittest.TestCase):
    def test_voice_alone_is_its_own_branch_through_the_same_limiter(self):
        value = graph(voice=speech(), voice_index=1, has_source=False)
        self.assertIn("[1:a:0]", value)
        self.assertIn("atrim=start=0.000000000:end=1.000000000", value)
        self.assertIn("adelay=500:all=1", value)
        self.assertIn("alimiter=limit=0.95", value)
        self.assertNotIn("amix", value)
        self.assertIn("[voice]alimiter", value)

    def test_voice_and_music_sum_without_the_user_choosing_between_them(self):
        value = graph(track=music(), voice=speech(), voice_index=2)
        self.assertIn("[1:a:0]", value)
        self.assertIn("[music]", value)
        self.assertIn("[2:a:0]", value)
        self.assertIn("[music][voice]amix=inputs=2", value)
        self.assertIn("[mixed]alimiter", value)

    def test_voice_with_original_audio_mixes_both_branches(self):
        value = graph(voice=speech(mode="mix", sample_rate=16000), voice_index=1)
        self.assertIn("[original][voice]amix=inputs=2", value)
        value = graph(track=music(mode="mix"), voice=speech(mode="mix"), voice_index=2)
        self.assertIn("[original][music][voice]amix=inputs=3", value)

    def test_voice_replaces_original_audio_while_music_still_sums(self):
        value = graph(track=music(mode="replace"), voice=speech(mode="replace"), voice_index=2)
        self.assertNotIn("[original]", value)
        self.assertIn("[music][voice]amix", value)

    def test_voice_alone_replace_still_plays(self):
        value = graph(voice=speech(mode="replace"), voice_index=1, has_source=False)
        self.assertIn("[voice]alimiter", value)

    def test_a_rate_factor_other_than_unity_emits_atempo(self):
        value = graph(voice=speech(rate=1.25), voice_index=1, has_source=False)
        self.assertIn("atempo=1.250000000", value)

    def test_unity_rate_emits_no_atempo(self):
        value = graph(voice=speech(rate=1), voice_index=1, has_source=False)
        self.assertNotIn("atempo", value)

    def test_every_source_combination_carries_the_rate_factor_it_was_given(self):
        for rate in (1, 1.5, 2):
            for track in (None, music()):
                value = graph(track=track, voice=speech(rate=rate), voice_index=2)
                if rate == 1:
                    self.assertNotIn("atempo", value)
                else:
                    self.assertIn(f"atempo={rate:.9f}", value)

    def test_voice_level_and_fades_are_adjustable_on_the_track(self):
        value = graph(
            voice=speech(gain_db=-6, fade_in_ms=200, fade_out_ms=300),
            voice_index=1,
            has_source=False,
        )
        self.assertIn("volume=-6dB", value)
        self.assertIn("afade=t=in:st=0.500000:d=0.200", value)
        self.assertIn("afade=t=out:st=1.200000:d=0.300", value)

    def test_no_voice_means_no_voice_branch(self):
        value = graph(track=music())
        self.assertNotIn("[voice]", value)

    def test_sample_rate_is_never_assumed_to_be_the_mix_rate(self):
        value = graph(voice=speech(sample_rate=16000), voice_index=1, has_source=False)
        self.assertIn("atrim=start=0.000000000:end=1.500000000", value)


class VoicePlacementExecutesThePlan(unittest.TestCase):
    def test_two_lines_are_placed_independently_not_concatenated(self):
        voice = {
            "mode": "mix",
            "sample_rate": 24000,
            "gain_db": 0,
            "fade_in_ms": 0,
            "fade_out_ms": 0,
            "lines": [
                {"offset_ms": 0, "rate": 1, "start_frame": 0, "end_frame": 24000},
                {"offset_ms": 3000, "rate": 1, "start_frame": 30000, "end_frame": 48000},
            ],
        }
        value = graph(voice=voice, voice_index=1, has_source=False)
        self.assertIn("atrim=start=0.000000000:end=1.000000000", value)
        self.assertIn("atrim=start=1.250000000:end=2.000000000", value)
        self.assertIn("adelay=0:all=1", value)
        self.assertIn("adelay=3000:all=1", value)
        self.assertIn("amix=inputs=2", value)

    def test_a_compressed_line_is_placed_at_the_slot_length_the_rate_was_computed_for(self):
        voice = {
            "mode": "mix",
            "sample_rate": 24000,
            "gain_db": 0,
            "fade_in_ms": 0,
            "fade_out_ms": 100,
            "lines": [
                {"offset_ms": 500, "rate": 2, "start_frame": 0, "end_frame": 24000},
            ],
        }
        value = graph(voice=voice, voice_index=1, has_source=False)
        self.assertIn("atempo=2.000000000", value)
        self.assertIn("afade=t=out:st=0.900000:d=0.100", value)

    def test_planned_offsets_are_the_only_thing_that_positions_a_line(self):
        voice = {
            "mode": "mix",
            "sample_rate": 16000,
            "gain_db": 0,
            "fade_in_ms": 0,
            "fade_out_ms": 0,
            "lines": [
                {"offset_ms": 120, "rate": 1, "start_frame": 0, "end_frame": 8000},
            ],
        }
        value = graph(voice=voice, voice_index=1, has_source=False)
        self.assertIn("adelay=120:all=1", value)
        self.assertIn("atrim=start=0.000000000:end=0.500000000", value)


class _Assets:
    def verify(self, asset_id, kind, check):
        return {"path": "/tmp/voice.wav", "sha256": "a" * 64}


class _Host:
    assets = _Assets()

    def cancelled(self, req):
        return False


def voice_value(lines, **overrides):
    value = {
        "asset_id": "asset-12345678",
        "sha256": "a" * 64,
        "sample_rate": 48000,
        "mode": "mix",
        "gain_db": 0,
        "fade_in_ms": 0,
        "fade_out_ms": 0,
        "lines": lines,
        "muted": False,
    }
    value.update(overrides)
    return value


class VoiceResolution(unittest.TestCase):
    def test_plan_order_need_not_match_the_recording_frame_order(self):
        value = resolve_voice(
            _Host(),
            {},
            voice_value(
                [
                    {"offset_ms": 2500, "rate": 1, "start_frame": 0, "end_frame": 38400},
                    {"offset_ms": 500, "rate": 1, "start_frame": 38400, "end_frame": 57600},
                ]
            ),
        )
        self.assertEqual(value["lines"][0]["offset_ms"], 2500)

    def test_overlapping_spans_are_refused_whatever_order_they_arrive(self):
        for lines in (
            [
                {"offset_ms": 0, "rate": 1, "start_frame": 0, "end_frame": 38400},
                {"offset_ms": 500, "rate": 1, "start_frame": 1000, "end_frame": 20000},
            ],
            [
                {"offset_ms": 500, "rate": 1, "start_frame": 1000, "end_frame": 20000},
                {"offset_ms": 0, "rate": 1, "start_frame": 0, "end_frame": 38400},
            ],
        ):
            with self.assertRaises(WorkerError) as caught:
                resolve_voice(_Host(), {}, voice_value(lines))
            self.assertEqual(caught.exception.code, "INVALID_VOICE")

    def test_muted_voice_is_absent_without_verifying_its_asset(self):
        self.assertIsNone(resolve_voice(_Host(), {}, voice_value([], muted=True)))

    def test_a_trim_and_speed_place_the_line_on_the_output_clock(self):
        voice = {
            "mode": "mix",
            "sample_rate": 24000,
            "gain_db": 0,
            "fade_in_ms": 0,
            "fade_out_ms": 0,
            "lines": [{"offset_ms": 6000, "rate": 1, "start_frame": 0, "end_frame": 24000}],
        }
        value = graph(voice=voice, voice_index=1, has_source=False, start=5000, edit={"speed": 2})
        self.assertIn("adelay=500:all=1", value)

    def test_a_line_before_the_trim_start_is_clamped_to_zero(self):
        voice = {
            "mode": "mix",
            "sample_rate": 24000,
            "gain_db": 0,
            "fade_in_ms": 0,
            "fade_out_ms": 0,
            "lines": [{"offset_ms": 1000, "rate": 1, "start_frame": 0, "end_frame": 24000}],
        }
        value = graph(voice=voice, voice_index=1, has_source=False, start=5000, edit={"speed": 2})
        self.assertIn("adelay=0:all=1", value)


if __name__ == "__main__":
    unittest.main()
