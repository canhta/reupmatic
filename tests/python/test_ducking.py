import math
import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[2] / "worker"))
from media.audio.mixing import audio_arguments, duck_filter, duck_parameters  # noqa: E402


def music(*, duck=True, amount_db=12, release_ms=300, mode="mix"):
    return {
        "mode": mode,
        "start_ms": 0,
        "end_ms": 2000,
        "offset_ms": 0,
        "gain_db": 0,
        "fade_in_ms": 0,
        "fade_out_ms": 0,
        "duck": {"enabled": duck, "amount_db": amount_db, "release_ms": release_ms},
    }


def speech(*, mode="mix", sample_rate=24000):
    return {
        "mode": mode,
        "sample_rate": sample_rate,
        "gain_db": 0,
        "fade_in_ms": 0,
        "fade_out_ms": 0,
        "lines": [{"offset_ms": 500, "rate": 1, "start_frame": 0, "end_frame": 24000}],
    }


def graph(*, track=None, voice=None, voice_index=None, has_source=True, edit=None):
    args = audio_arguments(
        0,
        1,
        track,
        has_source,
        edit or {},
        0,
        4000,
        4000,
        voice=voice,
        voice_index=voice_index,
    )
    if args == ["-an"]:
        return None
    return args[args.index("-filter_complex") + 1]


class DuckParameters(unittest.TestCase):
    """threshold/ratio/attack/release are derived from the two user settings in one function."""

    def test_the_derived_threshold_puts_the_reference_speech_level_at_the_requested_reduction(self):
        for amount in (6, 12, 18, 24):
            value = duck_parameters(amount, 250)
            self.assertEqual(value["ratio"], 8)
            self.assertEqual(value["attack"], 20)
            self.assertEqual(value["release"], 250)
            # The threshold is the level a -18 dBFS reference sidechain would be reduced by
            # exactly `amount` at ratio 8: reduction = (reference - threshold) * (1 - 1/ratio).
            reduction = -18.0 - 20 * math.log10(value["threshold"])
            self.assertAlmostEqual(reduction * (1 - 1 / 8), amount, places=6)

    def test_the_threshold_respects_the_filter_floor_for_deep_amounts(self):
        self.assertGreaterEqual(duck_parameters(24, 250)["threshold"], 0.000976563)

    def test_the_filter_string_carries_every_derived_parameter(self):
        value = duck_filter(12, 400)
        self.assertIn("sidechaincompress=", value)
        self.assertIn("ratio=8", value)
        self.assertIn("attack=20", value)
        self.assertIn("release=400", value)
        self.assertIn(f"threshold={duck_parameters(12, 400)['threshold']:.9f}", value)


class DuckGraph(unittest.TestCase):
    """Ducking rides on the music branch and is keyed by the voice, or by source audio when there
    is no voice track. The key is split so it still reaches the mix while also driving the duck."""

    def test_voice_keys_the_music_and_still_sums_into_the_mix(self):
        value = graph(track=music(), voice=speech(), voice_index=2)
        self.assertIn("[voice]asplit=2[voice_duck_mix][voice_duck_key]", value)
        self.assertIn("[music_raw][voice_duck_key]sidechaincompress=", value)
        self.assertIn("[original][music][voice_duck_mix]amix=inputs=3", value)

    def test_source_audio_keys_the_music_when_no_voice_track_exists(self):
        value = graph(track=music(), has_source=True)
        self.assertIn("[original]asplit=2[original_duck_mix][original_duck_key]", value)
        self.assertIn("[music_raw][original_duck_key]sidechaincompress=", value)
        self.assertIn("[original_duck_mix][music]amix=inputs=2", value)
        self.assertNotIn("[voice", value)

    def test_the_user_release_and_derived_threshold_reach_the_filter(self):
        value = graph(track=music(amount_db=18, release_ms=650), voice=speech(), voice_index=2)
        self.assertIn("release=650", value)
        expected = duck_parameters(18, 650)["threshold"]
        self.assertIn(f"threshold={expected:.9f}", value)

    def test_disabled_ducking_leaves_the_plain_mix(self):
        value = graph(track=music(duck=False), voice=speech(), voice_index=2)
        self.assertNotIn("sidechaincompress", value)
        self.assertIn("[original][music][voice]amix=inputs=3", value)

    def test_music_without_a_key_is_not_ducked(self):
        # Muted source and no voice: there is nothing to key on, so the music is left alone.
        value = graph(track=music(), has_source=False)
        self.assertNotIn("sidechaincompress", value)
        self.assertIn("[music]alimiter", value)

    def test_a_deeper_amount_lowers_the_threshold(self):
        shallow = duck_parameters(6, 250)["threshold"]
        deep = duck_parameters(24, 250)["threshold"]
        self.assertLess(deep, shallow)

    def test_a_track_missing_the_required_duck_field_fails_loudly(self):
        # `duck` is a required part of the one current soundtrack shape: the graph builder reads it
        # strictly rather than defaulting a missing field to ducking off.
        track = music()
        del track["duck"]
        with self.assertRaises(KeyError):
            audio_arguments(0, 1, track, True, {}, 0, 4000, 4000)


if __name__ == "__main__":
    unittest.main()
