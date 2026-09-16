"""Bounded timed-text translation contract; target rules are literal, not regex."""
from __future__ import annotations

import copy
import json
import re

from runtime.errors import WorkerError
from runtime.protocol import exact
from subtitles.validation import validate_cues

KEYS = {'source_layer', 'source_token', 'source_language', 'target_language', 'model_id', 'cues', 'rules'}
LANGUAGES = ('en', 'vi', 'zh')
MAX_RESULT = 1000000


def units(text: str) -> int:
    # Match JavaScript string limits, including astral characters. Lone surrogates fail.
    try:
        return len(text.encode('utf-16-le')) // 2
    except UnicodeError:
        raise WorkerError('INVALID_REQUEST') from None


def parse_rules(value: object) -> list[dict]:
    if not isinstance(value, list) or len(value) > 50:
        raise WorkerError('INVALID_REQUEST')
    for rule in value:
        exact(rule, {'find', 'replace'})
        if (any(not isinstance(rule[key], str) or '\x00' in rule[key] or units(rule[key]) > 256
                for key in ('find', 'replace')) or not rule['find'].strip()):
            raise WorkerError('INVALID_REQUEST')
    return copy.deepcopy(value)


def parse_options(value: object) -> dict:
    p = exact(value, KEYS)
    if (p['source_layer'] not in ('transcript', 'displayed')
            or any(not isinstance(p[key], str) or p[key] not in LANGUAGES
                   for key in ('source_language', 'target_language'))
            or p['source_language'] == p['target_language']
            or not isinstance(p['source_token'], str) or not re.fullmatch('[a-zA-Z0-9_-]{8,128}', p['source_token'])
            or not isinstance(p['model_id'], str) or not re.fullmatch('[a-f0-9]{64}', p['model_id'])):
        raise WorkerError('INVALID_REQUEST')
    validate_cues(p['cues'])
    parse_rules(p['rules'])
    if (not 1 <= len(p['cues']) <= 500
            or any('style' in c or not c['text'].strip() or units(c['text']) > 4000 for c in p['cues'])
            or sum(len(c['text'].encode('utf-8')) for c in p['cues']) > 100000
            or len(json.dumps(p, ensure_ascii=False, separators=(',', ':')).encode()) > 511000):
        raise WorkerError('TRANSLATION_LIMIT')
    return copy.deepcopy(p)


def apply_rules(text: str, rules: list[dict]) -> str:
    if not isinstance(text, str) or '\x00' in text or units(text) > 10000:
        raise WorkerError('MODEL_OUTPUT_INVALID')
    for rule in rules:
        count = text.count(rule['find'])
        if units(text) + count * (units(rule['replace']) - units(rule['find'])) > 10000:
            raise WorkerError('TRANSLATION_RESULT_TOO_LARGE')
        text = text.replace(rule['find'], rule['replace'])
    if not text.strip():
        raise WorkerError('MODEL_OUTPUT_INVALID')
    return text


def validate_output(value: object, params: dict) -> dict:
    if (not isinstance(value, dict) or set(value) != {'cues', 'runtime'}
            or not isinstance(value['runtime'], str) or not 0 < units(value['runtime']) <= 128
            or '\x00' in value['runtime']):
        raise WorkerError('MODEL_OUTPUT_INVALID')
    try:
        validate_cues(value['cues'])
    except WorkerError:
        raise WorkerError('MODEL_OUTPUT_INVALID') from None
    if len(value['cues']) != len(params['cues']):
        raise WorkerError('MODEL_OUTPUT_INVALID')
    for source, cue in zip(params['cues'], value['cues']):
        if (any(cue[key] != source[key] for key in ('id', 'start_ms', 'end_ms'))
                or 'style' in cue or not cue['text'].strip() or units(cue['text']) > 10000):
            raise WorkerError('MODEL_OUTPUT_INVALID')
    if len(json.dumps(value, ensure_ascii=False).encode()) > MAX_RESULT:
        raise WorkerError('TRANSLATION_RESULT_TOO_LARGE')
    return copy.deepcopy(value)
