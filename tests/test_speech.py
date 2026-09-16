import hashlib
import json
import sys
import tempfile
import unittest
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'worker'))
from runtime.errors import WorkerError
from speech.recognition.models import SpeechRegistry, configure_speech
from speech.recognition.timestamps import timed_segments
from speech.recognition.service import parse_options


class SpeechTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.root = Path(self.tmp.name)
        self.directory = self.root / 'model'
        self.directory.mkdir()
        self.files = {}
        for name in ('config.json', 'model.bin', 'tokenizer.json', 'vocabulary.json'):
            data = b'controlled-test-model-file'
            (self.directory / name).write_bytes(data)
            self.files[name] = hashlib.sha256(data).hexdigest()
        self.value = {'version': 1, 'engine': 'faster-whisper', 'directory': 'model',
                      'languages': ['en', 'vi', 'zh'], 'files': self.files}
        self.manifest = self.root / 'manifest.json'
        self.manifest.write_text(json.dumps(self.value))
        self.registry = SpeechRegistry(self.manifest)

    def test_manifest_is_strict_and_resolves_local_files(self):
        bundle = self.registry.require('vi', runtime=False)
        self.assertEqual(bundle['directory'], str(self.directory))
        self.assertEqual(len(bundle['model_id']), 64)
        self.assertEqual(bundle['files'], self.files)
        for changes in ({'version': True}, {'version': 2}, {'command': 'execute'},
                        {'directory': 'https://example.com/model'}, {'languages': ['auto']},
                        {'languages': ['vi', 'vi']}, {'files': {'../model.bin': 'a' * 64}}):
            self.manifest.write_text(json.dumps({**self.value, **changes}))
            with self.assertRaises(WorkerError):
                self.registry.require('vi', runtime=False)

    def test_changed_or_unlisted_runtime_files_are_not_trusted(self):
        (self.directory / 'model.bin').write_bytes(b'changed')
        with self.assertRaisesRegex(WorkerError, 'MODEL_HASH_MISMATCH'):
            self.registry.require('vi', runtime=False)
        (self.directory / 'model.bin').write_bytes(b'controlled-test-model-file')
        (self.directory / 'preprocessor_config.json').write_text('{}')
        with self.assertRaisesRegex(WorkerError, 'SPEECH_MANIFEST_INVALID'):
            self.registry.require('vi', runtime=False)

    def test_symlink_escape_is_rejected(self):
        outside = self.root / 'outside.bin'
        outside.write_bytes(b'controlled-test-model-file')
        (self.directory / 'model.bin').unlink()
        (self.directory / 'model.bin').symlink_to(outside)
        with self.assertRaisesRegex(WorkerError, 'SPEECH_MANIFEST_INVALID'):
            self.registry.require('vi', runtime=False)

    def test_status_does_not_hash_or_load_model_and_does_not_claim_verified(self):
        with patch('speech.recognition.models.file_hash', side_effect=AssertionError('unexpected hash')):
            with patch('speech.recognition.models.runtime_available', return_value=False):
                status = self.registry.status()
        self.assertFalse(status['available'])
        self.assertFalse(status['verified'])
        self.assertEqual(status['code'], 'MODEL_RUNTIME_MISSING')
        self.assertEqual(status['languages'], ['en', 'vi', 'zh'])

    def test_wrong_expected_model_and_unsupported_language_fail(self):
        with self.assertRaisesRegex(WorkerError, 'SPEECH_MODEL_CHANGED'):
            self.registry.require('vi', expected_id='a' * 64, runtime=False)
        self.value['languages'] = ['en']
        self.manifest.write_text(json.dumps(self.value))
        with self.assertRaisesRegex(WorkerError, 'MODEL_LANGUAGE_UNAVAILABLE'):
            self.registry.require('vi', runtime=False)

    def test_model_checks_are_cancellable(self):
        def cancel():
            raise WorkerError('CANCELLED')
        with self.assertRaisesRegex(WorkerError, 'CANCELLED'):
            self.registry.require('vi', check=cancel, runtime=False)

    def test_configuration_is_explicit_atomic_and_does_not_install_anything(self):
        workspace = self.root / 'workspace'
        workspace.mkdir()
        target = workspace / 'local-speech.json'
        target.write_text('keep until verified')
        host = SimpleNamespace(workspace=workspace, speech_models=SpeechRegistry(target),
                               cancelled=lambda _: None)
        req = {'params': {'path': str(self.manifest)}}
        (self.directory / 'model.bin').write_bytes(b'bad')
        with self.assertRaisesRegex(WorkerError, 'MODEL_HASH_MISMATCH'):
            configure_speech(host, req)
        self.assertEqual(target.read_text(), 'keep until verified')
        (self.directory / 'model.bin').write_bytes(b'controlled-test-model-file')
        with patch('speech.recognition.models.runtime_available', return_value=False):
            status = configure_speech(host, req)
        self.assertFalse(status['available'])
        self.assertEqual(json.loads(target.read_text())['directory'], str(self.directory))
        self.assertEqual(list(workspace.glob('*.tmp')), [])

    def test_timed_segments_use_source_clock_and_preserve_unicode(self):
        segments = [SimpleNamespace(start=.1, end=.8, text='  Xin chào thế giới  '),
                    SimpleNamespace(start=.9, end=1.3, text='你好')]
        result = timed_segments(segments, 5000, 7000, lambda _: None)
        self.assertEqual(result[0], {'id': 'stt-1', 'start_ms': 5100, 'end_ms': 5800,
                                     'text': 'Xin chào thế giới'})
        self.assertEqual(result[1]['text'], '你好')

    def test_empty_speech_is_a_valid_empty_result(self):
        self.assertEqual(timed_segments([], 0, 1000, lambda _: None), [])
        self.assertEqual(timed_segments([SimpleNamespace(start=0, end=1, text='  ')],
                                       0, 1000, lambda _: None), [])

    def test_segment_validation_rejects_invalid_or_overlapping_timing(self):
        cases = [SimpleNamespace(start=float('nan'), end=1, text='bad'),
                 SimpleNamespace(start=-1, end=1, text='bad'),
                 SimpleNamespace(start=0, end=20, text='bad'),
                 SimpleNamespace(start=1, end=.5, text='bad'),
                 SimpleNamespace(start=0, end=1, text='bad\x00')]
        for segment in cases:
            with self.assertRaises(WorkerError):
                timed_segments([segment], 0, 2000, lambda _: None)
        with self.assertRaises(WorkerError):
            timed_segments([SimpleNamespace(start=0, end=1, text='a'),
                            SimpleNamespace(start=.5, end=1.5, text='b')], 0, 2000, lambda _: None)

    def test_request_bounds_and_unknown_fields(self):
        params = {'asset_id': 'source', 'source_sha256': 'a' * 64, 'model_id': 'b' * 64,
                  'language': 'vi', 'start_ms': 0, 'end_ms': 1000}
        self.assertEqual(parse_options(params), params)
        for changes in ({'language': 'auto'}, {'start_ms': True}, {'end_ms': 7200001},
                        {'source_sha256': 'bad'}, {'path': '/unowned'}):
            with self.assertRaises(WorkerError):
                parse_options({**params, **changes})


if __name__ == '__main__':
    unittest.main()
