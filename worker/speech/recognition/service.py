"""Source-clock audio extraction and local recognition through the shared worker queue."""
from __future__ import annotations

import json
import re
import shutil
import sys
import tempfile
import wave
from pathlib import Path

from media.probe import probe_file
from runtime.errors import WorkerError
from runtime.protocol import bounded_int, exact, string
from subtitles.validation import validate_cues

MAX_RESULT = 1000000
MAX_DURATION = 7200000


def parse_options(value: object) -> dict:
    p = exact(value, {'asset_id', 'source_sha256', 'model_id', 'start_ms', 'end_ms', 'language'})
    string(p['asset_id'], 128)
    start = bounded_int(p['start_ms'], 0, 86400000)
    end = bounded_int(p['end_ms'], 1, 86400000)
    if (end <= start or p['language'] not in ('en', 'vi', 'zh')
            or any(not isinstance(p[key], str) or not re.fullmatch('[a-f0-9]{64}', p[key])
                   for key in ('source_sha256', 'model_id'))):
        raise WorkerError('INVALID_REQUEST')
    if end - start > MAX_DURATION:
        raise WorkerError('SPEECH_LIMIT')
    return dict(p)


def decode_audio(host, req: dict, source: Path, start_ms: int, end_ms: int, target: Path) -> None:
    duration = (end_ms - start_ms) / 1000
    # Normalize the original audio clock before trimming. first_pts preserves delayed
    # audio as silence; seeking straight to its first packet would shift every cue.
    filters = (f'aresample=16000:async=1:first_pts=0,apad,'
               f'atrim=start={start_ms / 1000}:end={end_ms / 1000},asetpts=PTS-STARTPTS')
    host.process.run(req, [host.ffmpeg, '-v', 'error', '-nostdin', '-threads', '2',
        '-i', str(source), '-map', '0:a:0', '-vn', '-sn', '-dn', '-af', filters,
        '-ar', '16000', '-ac', '1', '-c:a', 'pcm_s16le', '-t', str(duration),
        '-map_metadata', '-1', '-threads', '1', '-n', str(target)], timeout=3600)
    with wave.open(str(target), 'rb') as audio:
        if (audio.getnchannels() != 1 or audio.getsampwidth() != 2 or audio.getframerate() != 16000
                or abs(audio.getnframes() - round(duration * 16000)) > 32):
            raise WorkerError('SPEECH_AUDIO_INVALID')


def read_result(filename: Path, start_ms: int, end_ms: int) -> dict:
    with filename.open('rb') as stream:
        raw = stream.read(MAX_RESULT + 1)
    if len(raw) > MAX_RESULT:
        raise WorkerError('SPEECH_RESULT_TOO_LARGE')
    try:
        response = json.loads(raw)
    except ValueError:
        raise WorkerError('MODEL_OUTPUT_INVALID') from None
    if not isinstance(response, dict):
        raise WorkerError('MODEL_OUTPUT_INVALID')
    if response.get('ok') is not True:
        known = {'MODEL_HASH_MISMATCH', 'MODEL_RUNTIME_MISSING', 'MODEL_INFERENCE_FAILED',
                 'MODEL_NETWORK_DISABLED', 'MODEL_LANGUAGE_UNAVAILABLE',
                 'SPEECH_RESULT_TOO_LARGE', 'SPEECH_TIMING_INVALID'}
        code = response.get('code')
        raise WorkerError(code if isinstance(code, str) and code in known else 'MODEL_INFERENCE_FAILED')
    data = response.get('data')
    if not isinstance(data, dict) or set(data) != {'cues', 'runtime'}:
        raise WorkerError('MODEL_OUTPUT_INVALID')
    validate_cues(data['cues'])
    if (not isinstance(data['runtime'], str) or not 0 < len(data['runtime']) <= 128
            or '\x00' in data['runtime']):
        raise WorkerError('MODEL_OUTPUT_INVALID')
    previous = start_ms
    for cue in data['cues']:
        if ('style' in cue or not cue['text'].strip()
                or cue['start_ms'] < previous or cue['end_ms'] > end_ms):
            raise WorkerError('SPEECH_TIMING_INVALID')
        previous = cue['end_ms']
    return data


def transcribe(host, req: dict) -> dict:
    p = parse_options(req['params'])
    check = lambda: host.cancelled(req)
    source = host.assets.verify(p['asset_id'], 'video', check)
    if source['sha256'] != p['source_sha256']:
        raise WorkerError('SOURCE_CHANGED')
    info = probe_file(host, req, source['path'])
    if p['end_ms'] > info['duration_ms']:
        raise WorkerError('INVALID_REQUEST')
    if not info['has_audio']:
        raise WorkerError('NO_AUDIO')
    model = host.speech_models.require(p['language'], expected_id=p['model_id'], check=check)
    duration = p['end_ms'] - p['start_ms']
    if shutil.disk_usage(host.workspace).free < duration * 32 + 64 * 1024**2:
        raise WorkerError('SPEECH_DISK_LOW')
    emit = lambda phase, fraction: host.emit(req, 'progress', {'phase': phase, 'fraction': fraction})
    with tempfile.TemporaryDirectory(dir=host.workspace, prefix='speech-') as directory:
        tmp = Path(directory)
        audio = tmp / 'input.wav'
        emit('speechDecoding', None)
        decode_audio(host, req, source['path'], p['start_ms'], p['end_ms'], audio)
        check()
        job = {**p, 'model': model, 'audio': str(audio)}
        job_path = tmp / 'request.json'
        job_path.write_text(json.dumps(job, ensure_ascii=False), encoding='utf-8')
        emit('speechRecognizing', None)
        last = -1

        def progress():
            nonlocal last
            try:
                with (tmp / 'progress.json').open('rb') as stream:
                    value = json.loads(stream.read(1024))
                completed = value.get('completed_ms')
                if (type(completed) is int and last < completed <= duration
                        and value.get('duration_ms') == duration):
                    last = completed
                    emit('speechRecognizing', completed / duration)
            except (OSError, ValueError, AttributeError):
                pass

        host.process.run(req, [sys.executable, '-u', '-m', 'speech.recognition.runner', str(job_path)],
                         cwd=Path(__file__).resolve().parents[2], timeout=7200, on_poll=progress)
        progress()
        check()
        data = read_result(tmp / 'result.json', p['start_ms'], p['end_ms'])
        host.assets.verify(p['asset_id'], 'video', check)
        result = {'kind': 'stt', **p, **data, 'clock': 'source', 'timing': 'segment'}
        if len(json.dumps(result, ensure_ascii=False).encode('utf-8')) > MAX_RESULT:
            raise WorkerError('SPEECH_RESULT_TOO_LARGE')
        check()
        return result
