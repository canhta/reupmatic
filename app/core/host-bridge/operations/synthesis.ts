import {
  parseSynthesisInput,
  type SynthesisInput,
  type SynthesisStatus,
} from '../../speech/synthesis/contracts.js';
import {
  type ClonedVoiceMeta,
  parseClonedVoiceId,
  parseVoiceCloneRequest,
  parseVoiceName,
  type VoiceCloneRequest,
} from '../../speech/voices.js';
import { operation } from '../operation-contract.js';
import { requestId, requestRecord } from '../validators.js';

export const synthesisOperations = {
  'synthesis-status': operation<undefined, SynthesisStatus>()({
    rendererMethod: 'synthesisStatus',
    validate: () => undefined,
    toRequest: () => undefined,
  }),
  'synthesis-start': operation<SynthesisInput, { request_id: string; revision: number }>()({
    rendererMethod: 'synthesisStart',
    validate: (input) => parseSynthesisInput(input),
    completesVia: 'synthesis-job',
  }),
  'synthesis-cancel': operation<{ request_id: string }, { requested: boolean }>()({
    rendererMethod: 'synthesisCancel',
    validate: (input) => ({
      request_id: requestId(requestRecord(input, ['request_id']).request_id),
    }),
    toRequest: (id: string) => ({ request_id: id }),
  }),
  'synthesis-configure': operation<undefined, SynthesisStatus | null>()({
    rendererMethod: 'synthesisConfigure',
    validate: () => undefined,
    toRequest: () => undefined,
  }),
  'synthesis-cancel-setup': operation<undefined, { requested: boolean }>()({
    rendererMethod: 'synthesisCancelSetup',
    validate: () => undefined,
    toRequest: () => undefined,
  }),
  'synthesis-preview': operation<{ artifact_id: string }, { url: string }>()({
    rendererMethod: 'synthesisPreview',
    validate: (input) => ({
      artifact_id: requestId(requestRecord(input, ['artifact_id']).artifact_id),
    }),
    toRequest: (id: string) => ({ artifact_id: id }),
  }),
  'synthesis-choose-export': operation<
    { artifact_id: string; kind: 'wav' | 'receipt' },
    { choice_id: string; name: string } | null
  >()({
    rendererMethod: 'synthesisChooseExport',
    validate: (input) => {
      const value = requestRecord(input, ['artifact_id', 'kind']);
      if (value.kind !== 'wav' && value.kind !== 'receipt') throw new Error('INVALID_REQUEST');
      return { artifact_id: requestId(value.artifact_id), kind: value.kind };
    },
    toRequest: (id: string, kind: 'wav' | 'receipt') => ({ artifact_id: id, kind }),
  }),
  'synthesis-save': operation<{ choice_id: string; artifact_id: string }, { name: string }>()({
    rendererMethod: 'synthesisSave',
    validate: (input) => {
      const value = requestRecord(input, ['choice_id', 'artifact_id']);
      return { choice_id: requestId(value.choice_id), artifact_id: requestId(value.artifact_id) };
    },
    toRequest: (choiceId: string, artifactId: string) => ({
      choice_id: choiceId,
      artifact_id: artifactId,
    }),
  }),
  'synthesis-cancel-export': operation<undefined, { requested: boolean }>()({
    rendererMethod: 'synthesisCancelExport',
    validate: () => undefined,
    toRequest: () => undefined,
  }),
  'synthesis-voice-list': operation<undefined, ClonedVoiceMeta[]>()({
    rendererMethod: 'synthesisVoiceList',
    validate: () => undefined,
    toRequest: () => undefined,
  }),
  // The native picker and attestation both gate creation; a cancelled picker returns null.
  'synthesis-voice-clone': operation<{ draft: VoiceCloneRequest }, ClonedVoiceMeta | null>()({
    rendererMethod: 'synthesisVoiceClone',
    validate: (input) => ({ draft: parseVoiceCloneRequest(requestRecord(input, ['draft']).draft) }),
    toRequest: (draft: VoiceCloneRequest) => ({ draft }),
  }),
  'synthesis-voice-rename': operation<{ id: string; name: string }, ClonedVoiceMeta>()({
    rendererMethod: 'synthesisVoiceRename',
    validate: (input) => {
      const value = requestRecord(input, ['id', 'name']);
      return { id: parseClonedVoiceId(value.id), name: parseVoiceName(value.name) };
    },
    toRequest: (id: string, name: string) => ({ id, name }),
  }),
  'synthesis-voice-remove': operation<{ id: string }, { removed: boolean }>()({
    rendererMethod: 'synthesisVoiceRemove',
    validate: (input) => ({ id: parseClonedVoiceId(requestRecord(input, ['id']).id) }),
    toRequest: (id: string) => ({ id }),
  }),
  // Null when no VieNeu key is stored; the UI then offers key entry instead of a list.
  'synthesis-cloud-voices': operation<
    undefined,
    { model_id: string; voices: { id: string; label: string }[] } | null
  >()({
    rendererMethod: 'synthesisCloudVoices',
    validate: () => undefined,
    toRequest: () => undefined,
  }),
  // A fixed, trusted URL; never a renderer-supplied address.
  'synthesis-open-studio': operation<undefined, { opened: boolean }>()({
    rendererMethod: 'synthesisOpenStudio',
    validate: () => undefined,
    toRequest: () => undefined,
  }),
} as const;
