import type { MessageKey } from '../../../locales/message-key';

export function synthesisErrorKey(code: string): MessageKey {
  if (code === 'CANCELLED') return 'cancelled';
  if (code === 'MODEL_MISSING') return 'synthesisMissing';
  if (code === 'RUNTIME_PACK_MISSING') return 'settingsModelRuntimePackMissing';
  if (['MODEL_RUNTIME_MISSING', 'SYNTHESIS_RUNTIME_VERSION'].includes(code))
    return 'synthesisRuntime';
  if (['MODEL_HASH_MISMATCH', 'SYNTHESIS_MODEL_CHANGED'].includes(code))
    return 'synthesisModelChanged';
  if (
    [
      'MODEL_LANGUAGE_UNAVAILABLE',
      'SYNTHESIS_VOICE_UNAVAILABLE',
      'SYNTHESIS_VOICES_UNAVAILABLE',
    ].includes(code)
  )
    return 'synthesisVoiceMissing';
  if (code === 'SYNTHESIS_SAMPLE_RATE_UNSUPPORTED') return 'synthesisSampleRate';
  if (code === 'SYNTHESIS_ARTIFACT_MISSING') return 'synthesisArtifactMissing';
  if (code === 'SYNTHESIS_ARTIFACT_ALTERED') return 'synthesisArtifactAltered';
  if (code === 'SYNTHESIS_VOICE_MODEL_MISSING') return 'synthesisVoiceModelMissing';
  if (code === 'VOICE_TRACK_STALE') return 'synthesisVoiceStale';
  if (code === 'SYNTHESIS_LANGUAGE_MISMATCH') return 'synthesisLanguageMismatch';
  if (['STALE_OPERATION', 'TEXT_LAYER_STALE'].includes(code)) return 'synthesisStale';
  if (code === 'TEXT_LAYER_EMPTY') return 'textLayerEmpty';
  if (code.includes('LIMIT')) return 'synthesisLimit';
  if (code === 'SYNTHESIS_DISK_LOW') return 'synthesisDisk';
  if (code === 'SOURCE_OVERWRITE' || code.startsWith('OUTPUT_')) return 'synthesisProtected';
  if (code === 'SYNTHESIS_EXPORT_EXTENSION') return 'synthesisExtension';
  if (code === 'MODEL_NETWORK_DISABLED') return 'synthesisNetwork';
  if (code === 'VIENEU_KEY_INVALID') return 'synthesisCloudKey';
  if (code === 'VIENEU_OUT_OF_CREDITS') return 'synthesisCloudCredits';
  if (code === 'VIENEU_TEXT_REFUSED') return 'synthesisCloudRefused';
  if (code === 'VIENEU_RATE_LIMITED') return 'synthesisCloudRateLimited';
  if (code === 'VIENEU_UNAVAILABLE' || code === 'VIENEU_CLONE_WEB_ONLY')
    return 'synthesisCloudUnavailable';
  if (code === 'SYNTHESIS_CLONE_UNAVAILABLE') return 'synthesisCloneUnavailable';
  if (code === 'SYNTHESIS_CLONE_UNSUPPORTED_ENGINE') return 'synthesisCloneEngine';
  if (code === 'SYNTHESIS_CLONE_AUDIO_INVALID') return 'synthesisCloneAudio';
  if (code === 'SYNTHESIS_CLONE_INVALID') return 'synthesisCloneInvalid';
  if (code.includes('INVALID') || code === 'UNKNOWN_ARTIFACT') return 'synthesisInvalid';
  return 'synthesisFailed';
}
