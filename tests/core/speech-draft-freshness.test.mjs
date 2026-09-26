import assert from 'node:assert/strict';
import test from 'node:test';
import { speechDraftFresh } from '../../dist-core/speech/draft-freshness.js';

const draft = {
  documentId: 'doc-1',
  assetId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  targetCues: '[{"id":"a","start_ms":0,"end_ms":1000,"text":"hi"}]',
};
const current = {
  documentId: 'doc-1',
  assetId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  composed: false,
  targetCues: draft.targetCues,
};

test('a draft stays fresh when unrelated document edits change the revision', () => {
  // The revision is deliberately absent from the check: style, audio and other layers move on.
  assert.equal(speechDraftFresh(draft, { ...current }), true);
});

test('editing the target layer, the source or composing invalidates the draft', () => {
  assert.equal(
    speechDraftFresh(draft, { ...current, targetCues: `${draft.targetCues} ` }),
    false,
    'a target-layer edit invalidates it',
  );
  assert.equal(speechDraftFresh(draft, { ...current, assetId: 'other-asset' }), false);
  assert.equal(speechDraftFresh(draft, { ...current, documentId: 'doc-2' }), false);
  assert.equal(speechDraftFresh(draft, { ...current, composed: true }), false);
});
