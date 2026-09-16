"""The public/worker speech contracts and project layers match their current owners."""
import copy
import importlib.util
import json
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


@unittest.skipUnless(importlib.util.find_spec('jsonschema'), 'test-only jsonschema required')
class SpeechContracts(unittest.TestCase):
    def setUp(self):
        from jsonschema import Draft202012Validator
        self.validator = Draft202012Validator
        self.speech = json.loads((ROOT / 'contracts/speech/recognition.schema.json').read_text())['$defs']
        self.layers = json.loads((ROOT / 'contracts/subtitles/text-layers.schema.json').read_text())
        self.worker = self.validator(json.loads((ROOT / 'contracts/worker-request.schema.json').read_text()))
        self.params = {'asset_id': 'registered-video', 'source_sha256': 'a' * 64, 'model_id': 'b' * 64,
                       'language': 'vi', 'start_ms': 1000, 'end_ms': 2000}

    def test_strict_worker_transport_does_not_accept_renderer_paths_or_auto_language(self):
        req = {'v': 1, 'id': 'request-id', 'revision': 4, 'method': 'speech.transcribe', 'params': self.params}
        self.worker.validate(req)
        for patch in [{'path': '/video.mp4'}, {'language': 'auto'}, {'model_id': 'unknown'}, {'start_ms': -1}]:
            self.assertFalse(self.worker.is_valid({**req, 'params': {**self.params, **patch}}))
        public = {'request_id': 'request-id', 'revision': 4,
                  'params': {key: value for key, value in self.params.items() if key != 'source_sha256'}}
        self.validator(self.speech['input']).validate(public)
        self.assertFalse(self.validator(self.speech['input']).is_valid({**public, 'params': self.params}))
        self.worker.validate({**req, 'method': 'speech.status', 'params': {}})
        self.worker.validate({**req, 'method': 'speech.configure', 'params': {'path': '/manifest.json'}})

    def test_result_uses_plain_timed_text_and_explicit_provenance(self):
        result = {'kind': 'stt', **self.params, 'runtime': 'controlled@1', 'clock': 'source', 'timing': 'segment',
                  'cues': [{'id': 'stt-1', 'start_ms': 1000, 'end_ms': 2000, 'text': 'Việt Nam'}]}
        validator = self.validator(self.speech['result'])
        validator.validate(result)
        result['cues'][0]['style'] = {}
        self.assertFalse(validator.is_valid(result))
        self.assertFalse(self.validator(self.speech['status']).is_valid({
            'available': True, 'code': None, 'model_id': None, 'languages': [], 'verified': False}))

    def test_project_has_one_display_track_and_rejects_old_schema(self):
        metadata = {'token': 'token-123', 'language': 'vi', 'origin': {'kind': 'manual'}, 'edited': False, 'stale': False}
        layers = {'version': 2, 'displayed': metadata,
                  **{name: {**metadata, 'cues': []} for name in ['transcript', 'translated', 'spoken']}}
        self.validator(self.layers).validate(layers)
        project = {'format': 'reupmatic.project', 'version': 5, 'source': {'path': '/source.mp4', 'sha256': 'a' * 64},
                   'cues': [], 'sample': {'start_ms': 0, 'end_ms': 1000}, 'text_layers': layers}
        validator = self.validator(json.loads((ROOT / 'contracts/project.schema.json').read_text()))
        validator.validate(project)
        self.assertFalse(validator.is_valid({**project, 'version': 3}))
        invalid = copy.deepcopy(project)
        invalid['text_layers']['displayed']['cues'] = []
        self.assertFalse(validator.is_valid(invalid))
        invalid = copy.deepcopy(project)
        invalid['text_layers']['spoken']['cues'] = [{'id': 'a', 'start_ms': 0, 'end_ms': 1000, 'text': 'a', 'style': {}}]
        self.assertFalse(validator.is_valid(invalid))

    def test_manifest_requires_hashes_tokenizer_and_local_paths(self):
        validator = self.validator(json.loads((ROOT / 'contracts/speech/model-manifest.schema.json').read_text()))
        manifest = {'version': 1, 'engine': 'faster-whisper', 'directory': 'model', 'languages': ['vi'],
                    'files': {name: 'a' * 64 for name in ['config.json', 'model.bin', 'tokenizer.json', 'vocabulary.json']}}
        validator.validate(manifest)
        for directory in ['https://host/model', '//host/model', '\\\\host\\model']:
            self.assertFalse(validator.is_valid({**manifest, 'directory': directory}))
        del manifest['files']['tokenizer.json']
        self.assertFalse(validator.is_valid(manifest))
