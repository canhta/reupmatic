"""Local bilingual OPUS-style SentencePiece translation in one cancellable child."""
from __future__ import annotations

import importlib.metadata
import json
import os
import sys
from pathlib import Path

from runtime.errors import WorkerError
from runtime.model_result import atomic_json
from runtime.offline import deny_network_and_children
from speech.translation.contracts import MAX_RESULT, apply_rules, parse_options, validate_output
from speech.translation.models import verify_bundle

MAX_TOKENS = 512
BATCH_SIZE = 8


def run(job: dict, progress: Path) -> dict:
    p = parse_options(job['params'])
    bundle = job['model']
    verify_bundle(bundle)
    import ctranslate2
    import sentencepiece as spm

    directory = Path(bundle['directory'])
    source = spm.SentencePieceProcessor(model_file=str(directory / 'source.spm'))
    target = spm.SentencePieceProcessor(model_file=str(directory / 'target.spm'))
    translator = ctranslate2.Translator(str(directory), device='cpu', compute_type='int8',
                                        inter_threads=1, intra_threads=2, max_queued_batches=1)
    cues = []
    for offset in range(0, len(p['cues']), BATCH_SIZE):
        batch = p['cues'][offset:offset + BATCH_SIZE]
        tokens = [source.encode(cue['text'], out_type=str) for cue in batch]
        if any(not value or len(value) > MAX_TOKENS for value in tokens):
            raise WorkerError('TRANSLATION_TOKEN_LIMIT')
        results = translator.translate_batch(tokens, beam_size=4, num_hypotheses=1,
            max_batch_size=BATCH_SIZE, max_input_length=0, max_decoding_length=MAX_TOKENS,
            return_end_token=True, end_token='</s>', replace_unknowns=False)
        if len(results) != len(batch):
            raise WorkerError('MODEL_OUTPUT_INVALID')
        for cue, result in zip(batch, results):
            if len(result.hypotheses) != 1:
                raise WorkerError('MODEL_OUTPUT_INVALID')
            hypothesis = result.hypotheses[0]
            if not hypothesis or hypothesis[-1] != '</s>':
                # Do not treat a max-length partial hypothesis as a complete translation.
                raise WorkerError('TRANSLATION_TRUNCATED')
            text = apply_rules(target.decode(hypothesis[:-1]), p['rules'])
            cues.append({**cue, 'text': text})
        if len(json.dumps(cues, ensure_ascii=False).encode()) > MAX_RESULT - 10000:
            raise WorkerError('TRANSLATION_RESULT_TOO_LARGE')
        atomic_json(progress, {'completed': len(cues), 'total': len(p['cues'])})
    verify_bundle(bundle)
    runtime = ';'.join(f'{name}@{importlib.metadata.version(name)}' for name in ('ctranslate2', 'sentencepiece'))
    return validate_output({'cues': cues, 'runtime': runtime}, p)


def main() -> None:
    path = Path(sys.argv[1])
    try:
        os.environ.update(HF_HUB_OFFLINE='1', HF_HUB_DISABLE_TELEMETRY='1', TRANSFORMERS_OFFLINE='1',
                          OMP_NUM_THREADS='2', OPENBLAS_NUM_THREADS='2', MKL_NUM_THREADS='2')
        sys.addaudithook(deny_network_and_children)
        with path.open('rb') as stream:
            raw = stream.read(600001)
        if len(raw) > 600000:
            raise WorkerError('TRANSLATION_LIMIT')
        job = json.loads(raw)
        result = {'ok': True, 'data': run(job, path.parent / 'progress.json')}
        if len(json.dumps(result, ensure_ascii=False).encode()) > MAX_RESULT:
            raise WorkerError('TRANSLATION_RESULT_TOO_LARGE')
    except WorkerError as error:
        result = {'ok': False, 'code': error.code}
    except (ImportError, ModuleNotFoundError, importlib.metadata.PackageNotFoundError):
        result = {'ok': False, 'code': 'MODEL_RUNTIME_MISSING'}
    except Exception:
        result = {'ok': False, 'code': 'MODEL_INFERENCE_FAILED'}
    atomic_json(path.parent / 'result.json', result)


if __name__ == '__main__':
    main()
