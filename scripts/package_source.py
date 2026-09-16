"""Create a versioned source handoff without replacing an earlier archive."""

import argparse
import hashlib
import json
import re
import shutil
import sys
import tempfile
import zipfile
from datetime import datetime, timezone
from pathlib import Path

SOURCE_DIRECTORIES = {
    '.agents', '.github', '.vscode', 'app', 'contracts', 'docs', 'research',
    'scripts', 'specs', 'tests', 'worker', 'public', 'packaging', 'services',
}
ROOT_FILES = {
    '.editorconfig', '.gitattributes', '.gitignore', '.npmrc', '.nvmrc',
    '.python-version', 'package.json', 'package-lock.json', 'biome.json',
    'pyproject.toml', 'lefthook.yml', 'tsconfig.core.json', 'tsconfig.node.json',
    'tsconfig.ui.json', 'vite.config.ts',
}
SOURCE_EXTENSIONS = {
    '.ts', '.tsx', '.cts', '.mts', '.js', '.mjs', '.cjs', '.py', '.json',
    '.md', '.txt', '.yaml', '.yml', '.toml', '.css', '.html', '.svg', '.png',
    '.jpg', '.jpeg', '.webp', '.ico', '.webmanifest', '.tap', '.srt', '.ass', '.csv', '.sh', '.ps1',
}
EXCLUDED_DIRECTORIES = {
    'node_modules', '.git', '.venv', '__pycache__', '.pytest_cache', '.ruff_cache',
    '.cache', '.test-artifacts', 'coverage', 'dist-core', 'dist-node', 'dist-ui',
}
VERSION_PATTERN = r'(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)'
ARCHIVE_PATTERN = re.compile(r'reupmatic-v(\d+)\.(\d+)(?:\.(\d+))?\.zip')


class PackagingError(ValueError):
    pass


def version_details(root: Path) -> tuple[str, tuple[int, int, int], str]:
    manifest = json.loads((root / 'package.json').read_text(encoding='utf-8'))
    version = manifest.get('version', '')
    match = re.fullmatch(VERSION_PATTERN, version)
    if manifest.get('name') != 'reupmatic' or not match:
        raise PackagingError('Expected reupmatic with a numeric major.minor.patch version.')
    numeric = tuple(int(part) for part in match.groups())
    label = f'{numeric[0]}.{numeric[1]}' if numeric[2] == 0 else version
    readme = (root / 'README.md').read_text(encoding='utf-8').splitlines()[0]
    if not readme.endswith(f'Integration Build {version}'):
        raise PackagingError('README version is not synchronized with package.json.')
    changelog = (root / 'CHANGELOG.md').read_text(encoding='utf-8')
    if not re.search(rf'^## {re.escape(version)}(?:\s|$)', changelog, re.MULTILINE):
        raise PackagingError('CHANGELOG.md needs an entry for the current version.')
    evidence = root / 'research' / f'integration-{label}' / 'RESULTS.md'
    if not evidence.is_file():
        raise PackagingError(f'Missing versioned verification report: {evidence.name}.')
    lock = root / 'package-lock.json'
    if lock.exists():
        locked = json.loads(lock.read_text(encoding='utf-8'))
        if locked.get('version') != version or locked.get('packages', {}).get('', {}).get('version') != version:
            raise PackagingError('Existing package-lock.json has a different project version.')
    return version, numeric, label


def source_files(root: Path) -> list[Path]:
    selected = []

    def visit(directory: Path):
        for item in sorted(directory.iterdir()):
            relative = item.relative_to(root)
            if item.name in EXCLUDED_DIRECTORIES or item.name.startswith('.env'):
                continue
            if item.is_symlink():
                raise PackagingError(f'Symlinks are not allowed in source handoffs: {relative}')
            if item.is_dir():
                if directory != root or item.name in SOURCE_DIRECTORIES:
                    visit(item)
                continue
            if not item.is_file():
                continue
            if item.name.lower() in {'agent.md', 'agents.md', 'claude.md'} and relative.as_posix() != 'AGENTS.md':
                raise PackagingError(f'Only root AGENTS.md is allowed: {relative}')
            if directory == root:
                allowed = item.name in ROOT_FILES or item.suffix == '.md'
            else:
                allowed = item.name == '.gitkeep' or item.suffix.lower() in SOURCE_EXTENSIONS
            if allowed and item.name != 'RELEASE.json':
                selected.append(relative)

    visit(root)
    if Path('AGENTS.md') not in selected:
        raise PackagingError('Root AGENTS.md is required.')
    return sorted(selected)


def validate_declared_paths(root: Path, files: list[Path], version: str):
    declared = root / 'docs' / 'architecture' / 'system-map.json'
    if not declared.exists():
        return
    mapping = json.loads(declared.read_text(encoding='utf-8'))
    if mapping.get('source_version') != version:
        raise PackagingError('System map has a different project version.')
    selected = {name.as_posix() for name in files}
    for module in mapping['modules']:
        for directory in module['reserved']:
            marker = directory + '/.gitkeep'
            if marker not in selected:
                raise PackagingError(f'Reserved boundary missing from archive: {marker}')
    retained_file = root / 'docs' / 'architecture' / 'retained-paths.json'
    retained = json.loads(retained_file.read_text(encoding='utf-8'))
    for name in retained['paths']:
        actual = retained['moves'].get(name, name)
        if actual not in selected:
            raise PackagingError(f'Delivered source missing from archive: {name}')
    trace = json.loads((root / 'docs/planning/scope-traceability.json').read_text(encoding='utf-8'))
    if trace.get('source_version') != version:
        raise PackagingError('Scope traceability has a different project version.')
    if {item['scope'] for item in trace['features']} != {f'SC-{index:02d}' for index in range(1, 15)}:
        raise PackagingError('Scope coverage is incomplete.')


def require_newer(output: Path, version: tuple[int, int, int]):
    for entry in output.iterdir():
        match = ARCHIVE_PATTERN.fullmatch(entry.name)
        if match and tuple(int(part or 0) for part in match.groups()) >= version:
            raise PackagingError(f'Version must increase; existing archive: {entry.name}')


def build_archive(root: Path, output: Path) -> Path:
    root, output = root.resolve(), output.resolve()
    if output.is_relative_to(root):
        raise PackagingError('Place the release directory outside the source tree.')
    version, numeric, label = version_details(root)
    files = source_files(root)
    validate_declared_paths(root, files, version)
    output.mkdir(parents=True, exist_ok=True)
    require_newer(output, numeric)
    destination = output / f'reupmatic-v{label}.zip'
    metadata = {
        'format': 'reupmatic.source-release', 'version': version,
        'archive': destination.name, 'kind': 'source-only',
        'created_at': datetime.now(timezone.utc).isoformat(),
        'verification': f'research/integration-{label}/RESULTS.md', 'files': {},
    }
    with tempfile.TemporaryFile() as temporary:
        with zipfile.ZipFile(temporary, 'w', zipfile.ZIP_DEFLATED, compresslevel=9) as bundle:
            for relative in files:
                data = (root / relative).read_bytes()
                name = relative.as_posix()
                bundle.writestr('reupmatic/' + name, data)
                metadata['files'][name] = hashlib.sha256(data).hexdigest()
            bundle.writestr('reupmatic/RELEASE.json', json.dumps(metadata, indent=2) + '\n')
        temporary.seek(0)
        with zipfile.ZipFile(temporary) as bundle:
            if bundle.testzip() is not None:
                raise PackagingError('Archive integrity check failed.')
        temporary.seek(0)
        require_newer(output, numeric)
        with destination.open('xb') as target:
            try:
                shutil.copyfileobj(temporary, target)
            except BaseException:
                target.close()
                destination.unlink(missing_ok=True)
                raise
    return destination


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--root', type=Path, default=Path(__file__).resolve().parents[1])
    parser.add_argument('--output-dir', type=Path, required=True)
    args = parser.parse_args()
    try:
        archive = build_archive(args.root, args.output_dir)
    except (OSError, ValueError) as error:
        print(f'Packaging refused: {error}', file=sys.stderr)
        return 1
    print(archive)
    print('SHA-256:', hashlib.sha256(archive.read_bytes()).hexdigest())
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
