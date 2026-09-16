"""Hash an already prepared, authorized local speech bundle; never acquire models."""
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'worker'))
from assets.registry import sha256  # noqa: E402
from runtime.errors import WorkerError  # noqa: E402
from speech.synthesis.models import ENGINE, FILES, inspect_files, read_voices  # noqa: E402


def create_manifest(directory: Path, output: Path, languages: list[str]) -> Path:
    if not languages or len(set(languages)) != len(languages) or any(v not in ('vi', 'en') for v in languages):
        raise ValueError('Choose vi and/or en once each.')
    if directory.is_symlink():
        raise ValueError('A symlink bundle is not accepted.')
    root = directory.resolve(strict=True)
    target = output.parent.resolve(strict=True) / output.name
    if target.is_relative_to(root):
        raise ValueError('Keep the manifest outside the strict runtime bundle.')
    inspect_files({'directory': str(root)})
    read_voices(root)
    value = {'version': 1, 'engine': ENGINE, 'directory': str(root), 'languages': languages,
             'files': {name: sha256(root / name) for name in sorted(FILES)}}
    with target.open('x', encoding='utf-8') as stream:
        json.dump(value, stream, ensure_ascii=False, indent=2)
        stream.write('\n')
    return target


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--directory', required=True, type=Path)
    parser.add_argument('--output', required=True, type=Path)
    parser.add_argument('--languages', required=True, nargs='+', choices=('vi', 'en'))
    args = parser.parse_args()
    try:
        print(create_manifest(args.directory, args.output, args.languages))
    except (OSError, ValueError, WorkerError) as error:
        print(f'Manifest not created: {error}', file=sys.stderr)
        return 1
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
