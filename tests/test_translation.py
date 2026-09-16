"""Pure adapter and manifest validation; no model quality claim."""
import copy
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
from speech.translation.contracts import parse_options, apply_rules, validate_output
from speech.translation.models import TranslationRegistry, configure_translation


def options():
    return {'source_layer': 'transcript', 'source_token': 'source-12345', 'source_language': 'en',
            'target_language': 'vi', 'model_id': 'a' * 64, 'rules': [],
            'cues': [{'id': 'one', 'start_ms': 1000, 'end_ms': 2000, 'text': 'Hello'}]}


class TranslationValidationTests(unittest.TestCase):
    def test_bounded_explicit_language_options(self):
        self.assertEqual(parse_options(options()), options())
        for change in [{'source_language': ['en']}, {'target_language': 'en'}, {'cues': []},
                       {'model_id': 'online'}, {'source_token': 'bad'}, {'source_layer': 'translated'},
                       {'rules': [{'find': '', 'replace': 'x'}]}, {'path': '/unowned'}]:
            with self.subTest(change=change), self.assertRaises(WorkerError):
                parse_options({**options(), **change})
        bad = options()
        bad['cues'][0]['text'] = '😀' * 2001
        with self.assertRaisesRegex(WorkerError, 'TRANSLATION_LIMIT'):
            parse_options(bad)

    def test_rules_are_literal_ordered_target_edits_with_expansion_bounds(self):
        self.assertEqual(apply_rules('a.b aXb', [{'find': 'a.b', 'replace': '$1'},
                                                {'find': '$1', 'replace': 'Tên'}]), 'Tên aXb')
        with self.assertRaisesRegex(WorkerError, 'TRANSLATION_RESULT_TOO_LARGE'):
            apply_rules('a' * 1000, [{'find': 'a', 'replace': 'b' * 100}])
        with self.assertRaisesRegex(WorkerError, 'MODEL_OUTPUT_INVALID'):
            apply_rules('all', [{'find': 'all', 'replace': ''}])

    def test_response_preserves_segment_identity_and_timing(self):
        request = options()
        output = {'cues': [{**request['cues'][0], 'text': 'Xin chào'}], 'runtime': 'controlled-test'}
        self.assertEqual(validate_output(output, request), output)
        for change in [{'cues': []}, {'runtime': ''}, {'cues': [{**output['cues'][0], 'id': 'foreign'}]},
                       {'cues': [{**output['cues'][0], 'end_ms': 2001}]}, {'remote': True}]:
            with self.assertRaises(WorkerError):
                validate_output({**output, **change}, request)


class TranslationManifestTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.root = Path(self.temp.name)
        self.model = self.root / 'model'
        self.model.mkdir()
        files = {}
        for name in ('model.bin', 'config.json', 'source.spm', 'target.spm', 'shared_vocabulary.json'):
            content = b'CONTROLLED TEST FILE; NOT A TRANSLATION MODEL'
            (self.model / name).write_bytes(content)
            files[name] = hashlib.sha256(content).hexdigest()
        self.value = {'version': 1, 'engine': 'ctranslate2-sentencepiece', 'directory': 'model',
                      'source_language': 'en', 'target_language': 'vi', 'files': files}
        self.manifest = self.root / 'manifest.json'
        self.save()
        self.registry = TranslationRegistry(self.manifest)

    def save(self):
        self.manifest.write_text(json.dumps(self.value), encoding='utf-8')

    def tearDown(self):
        self.temp.cleanup()

    def test_discovery_is_lightweight_and_never_claims_verified(self):
        with patch('speech.translation.models.runtime_available', return_value=True):
            status = self.registry.status()
        self.assertTrue(status['available'])
        self.assertFalse(status['verified'])
        self.assertEqual((status['source_language'], status['target_language']), ('en', 'vi'))
        self.assertEqual(len(status['model_id']), 64)
        with patch('speech.translation.models.runtime_available', return_value=False):
            self.assertEqual(self.registry.status()['code'], 'MODEL_RUNTIME_MISSING')

    def test_require_rehashes_and_correlates_pair_and_model(self):
        bundle = self.registry.require('en', 'vi', runtime=False)
        self.assertEqual(Path(bundle['directory']), self.model)
        with self.assertRaisesRegex(WorkerError, 'MODEL_LANGUAGE_UNAVAILABLE'):
            self.registry.require('vi', 'en', runtime=False)
        with self.assertRaisesRegex(WorkerError, 'TRANSLATION_MODEL_CHANGED'):
            self.registry.require('en', 'vi', expected_id='b' * 64, runtime=False)
        (self.model / 'model.bin').write_bytes(b'changed')
        with self.assertRaisesRegex(WorkerError, 'MODEL_HASH_MISMATCH'):
            self.registry.require('en', 'vi', runtime=False)

    def test_unhashed_runtime_files_and_path_escape_are_refused(self):
        (self.model / 'source_vocabulary.json').write_text('[]')
        self.assertEqual(self.registry.status()['code'], 'TRANSLATION_MANIFEST_INVALID')
        (self.model / 'source_vocabulary.json').unlink()
        outside = self.root / 'outside.spm'
        outside.write_bytes((self.model / 'source.spm').read_bytes())
        (self.model / 'source.spm').unlink()
        (self.model / 'source.spm').symlink_to(outside)
        self.assertEqual(self.registry.status()['code'], 'TRANSLATION_MANIFEST_INVALID')

    def test_extra_fields_invalid_pairs_and_network_directories_fail(self):
        original = copy.deepcopy(self.value)
        for patch_value in [{'url': 'https://example.invalid'}, {'directory': '//server/share'},
                            {'source_language': ['en']}, {'target_language': 'en'}, {'version': True}]:
            self.value = {**original, **patch_value}
            self.save()
            self.assertEqual(self.registry.status()['code'], 'TRANSLATION_MANIFEST_INVALID')

    def test_failed_or_cancelled_configuration_keeps_previous_config(self):
        workspace = self.root / 'workspace'
        workspace.mkdir()
        target = workspace / 'local-translation.json'
        target.write_text('previous-owner-config')
        def cancel(_):
            raise WorkerError('CANCELLED')
        host = SimpleNamespace(workspace=workspace, cancelled=cancel)
        with self.assertRaisesRegex(WorkerError, 'CANCELLED'):
            configure_translation(host, {'id': 'configure', 'params': {'path': str(self.manifest)}})
        self.assertEqual(target.read_text(), 'previous-owner-config')
        self.assertEqual(list(workspace.glob('.*.tmp')), [])

    def test_configuration_normalizes_local_paths_without_loading_runtime(self):
        workspace = self.root / 'workspace'
        workspace.mkdir()
        host = SimpleNamespace(workspace=workspace, cancelled=lambda _: None)
        with patch('speech.translation.models.runtime_available', return_value=False):
            status = configure_translation(host, {'id': 'configure', 'params': {'path': str(self.manifest)}})
        self.assertEqual(status['code'], 'MODEL_RUNTIME_MISSING')
        saved = json.loads((workspace / 'local-translation.json').read_text())
        self.assertEqual(saved['directory'], str(self.model))
        self.assertEqual(list(workspace.glob('.*.tmp')), [])
