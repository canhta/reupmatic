"""Explicit local CTranslate2 bundle ownership; discovery never downloads or infers."""
from __future__ import annotations

import hashlib
import importlib.util
import json
import os
import re
import uuid
from pathlib import Path
from typing import Callable

from assets.registry import sha256 as file_hash
from runtime.errors import WorkerError
from runtime.protocol import exact, string

REQUIRED = {'config.json', 'model.bin', 'tokenizer.json'}
ALLOWED = REQUIRED | {'vocabulary.json', 'vocabulary.txt', 'preprocessor_config.json'}
LANGUAGES = {'en', 'vi', 'zh'}


def runtime_available() -> bool:
    try:
        return all(importlib.util.find_spec(name) is not None
                   for name in ('faster_whisper', 'ctranslate2', 'tokenizers', 'numpy', 'av'))
    except (ImportError, ValueError):
        return False


def bundle_id(files: dict, languages: list[str]) -> str:
    identity = {'engine': 'faster-whisper', 'adapter': 1, 'device': 'cpu', 'compute_type': 'int8',
                'files': files, 'languages': sorted(languages)}
    return hashlib.sha256(json.dumps(identity, sort_keys=True).encode()).hexdigest()


def verify_bundle(bundle: dict, check: Callable[[], None] = lambda: None) -> None:
    directory = Path(bundle['directory'])
    for name, expected in bundle['files'].items():
        check()
        if file_hash(directory / name, check) != expected:
            raise WorkerError('MODEL_HASH_MISMATCH')


class SpeechRegistry:
    def __init__(self, manifest: Path):
        self.manifest = manifest

    def _read(self) -> dict:
        try:
            with self.manifest.open('rb') as stream:
                raw = stream.read(65537)
            if len(raw) > 65536:
                raise ValueError
            value = json.loads(raw)
            if (not isinstance(value, dict)
                    or set(value) != {'version', 'engine', 'directory', 'languages', 'files'}
                    or type(value['version']) is not int or value['version'] != 1
                    or value['engine'] != 'faster-whisper'):
                raise ValueError
            directory = value['directory']
            if (not isinstance(directory, str) or not directory or len(directory) > 4096
                    or '\x00' in directory or '://' in directory or directory.startswith(('\\\\', '//'))):
                raise ValueError
            languages = value['languages']
            if (not isinstance(languages, list) or not 1 <= len(languages) <= 3
                    or any(not isinstance(lang, str) or lang not in LANGUAGES for lang in languages)
                    or len(set(languages)) != len(languages)):
                raise ValueError
            files = value['files']
            if (not isinstance(files, dict) or not REQUIRED <= files.keys() or files.keys() - ALLOWED
                    or not {'vocabulary.json', 'vocabulary.txt'} & files.keys()
                    or any(not isinstance(v, str) or not re.fullmatch('[a-f0-9]{64}', v)
                           for v in files.values())):
                raise ValueError
            root = Path(directory)
            if not root.is_absolute():
                root = self.manifest.parent / root
            root = root.resolve(strict=True)
            if not root.is_dir():
                raise WorkerError('MODEL_MISSING')
            for name in ALLOWED:
                file = root / name
                if name not in files:
                    if file.exists():
                        raise ValueError
                    continue
                if not file.is_file():
                    raise WorkerError('MODEL_MISSING')
                if file.resolve().parent != root or not 0 < file.stat().st_size <= (
                        4 * 1024**3 if name == 'model.bin' else 16 * 1024**2):
                    raise ValueError
            return {**value, 'directory': str(root), 'model_id': bundle_id(files, languages)}
        except FileNotFoundError:
            raise WorkerError('MODEL_MISSING') from None
        except (OSError, ValueError, TypeError):
            raise WorkerError('SPEECH_MANIFEST_INVALID') from None

    def require(self, language: str, *, expected_id: str | None = None, verify: bool = True,
                runtime: bool = True, check: Callable[[], None] = lambda: None) -> dict:
        check()
        bundle = self._read()
        if language not in bundle['languages']:
            raise WorkerError('MODEL_LANGUAGE_UNAVAILABLE')
        if expected_id is not None and expected_id != bundle['model_id']:
            raise WorkerError('SPEECH_MODEL_CHANGED')
        if verify:
            verify_bundle(bundle, check)
        if runtime and not runtime_available():
            raise WorkerError('MODEL_RUNTIME_MISSING')
        return bundle

    def status(self) -> dict:
        value = {'available': False, 'code': None, 'model_id': None,
                 'languages': [], 'verified': False}
        try:
            bundle = self._read()
            value.update(model_id=bundle['model_id'], languages=bundle['languages'])
            if not runtime_available():
                raise WorkerError('MODEL_RUNTIME_MISSING')
            value['available'] = True
        except WorkerError as error:
            value['code'] = error.code
        return value


def configure_speech(host, req: dict) -> dict:
    params = exact(req['params'], {'path'})
    source = Path(string(params['path']))
    candidate = SpeechRegistry(source)
    bundle = candidate._read()
    check = lambda: host.cancelled(req)
    verify_bundle(bundle, check)
    target = host.workspace / 'local-speech.json'
    temporary = target.with_name(f'.local-speech-{uuid.uuid4()}.tmp')
    value = {key: bundle[key] for key in ('version', 'engine', 'directory', 'languages', 'files')}
    try:
        with temporary.open('x', encoding='utf-8') as stream:
            json.dump(value, stream, ensure_ascii=False, indent=2)
            stream.flush()
            os.fsync(stream.fileno())
        check()
        temporary.replace(target)
        host.speech_models = SpeechRegistry(target)
    finally:
        temporary.unlink(missing_ok=True)
    return host.speech_models.status()
