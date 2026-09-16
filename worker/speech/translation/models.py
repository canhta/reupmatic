"""Explicit local bilingual CTranslate2/SentencePiece bundle and atomic setup."""
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
from speech.translation.contracts import LANGUAGES

REQUIRED = {'model.bin', 'config.json', 'source.spm', 'target.spm'}
VOCABULARIES = {'shared_vocabulary.json', 'source_vocabulary.json', 'target_vocabulary.json'}
ALLOWED = REQUIRED | VOCABULARIES | {'vmap.txt'}
FIELDS = {'version', 'engine', 'directory', 'source_language', 'target_language', 'files'}


def runtime_available() -> bool:
    try:
        return all(importlib.util.find_spec(name) is not None for name in ('ctranslate2', 'sentencepiece'))
    except (ImportError, ValueError):
        return False


def inspect_files(bundle: dict) -> Path:
    root = Path(bundle['directory']).resolve(strict=True)
    if not root.is_dir():
        raise WorkerError('MODEL_MISSING')
    for name in ALLOWED:
        file = root / name
        if name not in bundle['files']:
            if file.exists() or file.is_symlink():
                raise WorkerError('TRANSLATION_MANIFEST_INVALID')
            continue
        if file.is_symlink() or file.resolve().parent != root:
            raise WorkerError('TRANSLATION_MANIFEST_INVALID')
        if not file.is_file():
            raise WorkerError('MODEL_MISSING')
        if not 0 < file.stat().st_size <= (4 * 1024**3 if name == 'model.bin' else 16 * 1024**2):
            raise WorkerError('TRANSLATION_MANIFEST_INVALID')
    return root


def verify_bundle(bundle: dict, check: Callable[[], None] = lambda: None) -> None:
    root = inspect_files(bundle)
    for name, expected in bundle['files'].items():
        check()
        if file_hash(root / name, check) != expected:
            raise WorkerError('MODEL_HASH_MISMATCH')


class TranslationRegistry:
    def __init__(self, manifest: Path):
        self.manifest = manifest

    def _read(self) -> dict:
        try:
            with self.manifest.open('rb') as stream:
                raw = stream.read(65537)
            if len(raw) > 65536:
                raise ValueError
            value = json.loads(raw)
            if (not isinstance(value, dict) or set(value) != FIELDS
                    or type(value['version']) is not int or value['version'] != 1
                    or value['engine'] != 'ctranslate2-sentencepiece'
                    or any(not isinstance(value[key], str) or value[key] not in LANGUAGES
                           for key in ('source_language', 'target_language'))
                    or value['source_language'] == value['target_language']):
                raise ValueError
            directory = value['directory']
            if (not isinstance(directory, str) or not directory or len(directory) > 4096
                    or '\x00' in directory or '://' in directory or directory.startswith(('\\\\', '//'))):
                raise ValueError
            files = value['files']
            if (not isinstance(files, dict) or not REQUIRED <= files.keys() or files.keys() - ALLOWED
                    or files.keys() & VOCABULARIES not in ({'shared_vocabulary.json'},
                                                         {'source_vocabulary.json', 'target_vocabulary.json'})
                    or any(not isinstance(v, str) or not re.fullmatch('[a-f0-9]{64}', v) for v in files.values())):
                raise ValueError
            root = Path(directory)
            if not root.is_absolute():
                root = self.manifest.parent / root
            bundle = {**value, 'directory': str(root.resolve(strict=True))}
            inspect_files(bundle)
            identity = {key: bundle[key] for key in ('engine', 'source_language', 'target_language', 'files')}
            identity.update(adapter=1, device='cpu', compute_type='int8')
            bundle['model_id'] = hashlib.sha256(json.dumps(identity, sort_keys=True).encode()).hexdigest()
            return bundle
        except FileNotFoundError:
            raise WorkerError('MODEL_MISSING') from None
        except (OSError, ValueError, TypeError):
            raise WorkerError('TRANSLATION_MANIFEST_INVALID') from None

    def require(self, source: str, target: str, *, expected_id: str | None = None,
                runtime: bool = True, check: Callable[[], None] = lambda: None) -> dict:
        check()
        bundle = self._read()
        if (source, target) != (bundle['source_language'], bundle['target_language']):
            raise WorkerError('MODEL_LANGUAGE_UNAVAILABLE')
        if expected_id is not None and expected_id != bundle['model_id']:
            raise WorkerError('TRANSLATION_MODEL_CHANGED')
        verify_bundle(bundle, check)
        if runtime and not runtime_available():
            raise WorkerError('MODEL_RUNTIME_MISSING')
        return bundle

    def status(self) -> dict:
        value = {'available': False, 'code': None, 'model_id': None,
                 'source_language': None, 'target_language': None, 'verified': False}
        try:
            bundle = self._read()
            value.update({key: bundle[key] for key in ('model_id', 'source_language', 'target_language')})
            if not runtime_available():
                raise WorkerError('MODEL_RUNTIME_MISSING')
            value['available'] = True
        except WorkerError as error:
            value['code'] = error.code
        return value


def configure_translation(host, req: dict) -> dict:
    params = exact(req['params'], {'path'})
    candidate = TranslationRegistry(Path(string(params['path'])))
    bundle = candidate._read()
    check = lambda: host.cancelled(req)
    verify_bundle(bundle, check)
    target = host.workspace / 'local-translation.json'
    temporary = target.with_name(f'.local-translation-{uuid.uuid4()}.tmp')
    try:
        with temporary.open('x', encoding='utf-8') as stream:
            json.dump({key: bundle[key] for key in FIELDS}, stream, ensure_ascii=False, indent=2)
            stream.flush()
            os.fsync(stream.fileno())
        check()
        temporary.replace(target)
        host.translation_models = TranslationRegistry(target)
    finally:
        temporary.unlink(missing_ok=True)
    return host.translation_models.status()
