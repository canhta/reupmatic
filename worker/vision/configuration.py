"""Validate a native-selected manifest and atomically persist local configuration."""
from __future__ import annotations

import json
import os
import uuid
from pathlib import Path

from runtime.errors import WorkerError
from runtime.protocol import exact, string
from vision.models import ModelRegistry


def configure_models(host, req: dict) -> dict:
    exact(req['params'], {'path'})
    filename = string(req['params']['path'], 4096)
    candidate_path = Path(filename)
    if (not candidate_path.is_absolute() or '://' in filename
            or filename.startswith(('\\\\', '//')) or '\x00' in filename):
        raise WorkerError('INVALID_REQUEST')
    if os.environ.get('REUPMATIC_MODEL_MANIFEST'):
        raise WorkerError('MODEL_CONFIG_OVERRIDE')
    check = lambda: host.cancelled(req)
    check()
    candidate = ModelRegistry(candidate_path)
    normalized = candidate.validated_manifest(check)
    destination = host.workspace / 'local-models.json'
    temporary = host.workspace / f'.local-models.{uuid.uuid4()}.tmp'
    try:
        with temporary.open('x', encoding='utf-8') as stream:
            os.chmod(temporary, 0o600)
            json.dump(normalized, stream, ensure_ascii=False, indent=2)
            stream.write('\n')
            stream.flush()
            os.fsync(stream.fileno())
        check()
        os.replace(temporary, destination)
        host.models = ModelRegistry(destination)
        return {'configured': True, 'models': host.models.status()}
    finally:
        temporary.unlink(missing_ok=True)
