"""Atomic child progress/result publication shared by local text inference adapters."""
import json
from pathlib import Path


def atomic_json(path: Path, value: object) -> None:
    temporary = path.with_suffix('.tmp')
    temporary.write_text(json.dumps(value, ensure_ascii=False, allow_nan=False), encoding='utf-8')
    temporary.replace(path)
