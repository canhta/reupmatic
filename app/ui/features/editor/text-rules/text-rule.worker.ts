import { previewTextRule } from '../../../../core/subtitles/text-rules';

self.onmessage = event => {
  try {
    const { cues, rule, ids } = event.data;
    self.postMessage({ ok: true, result: previewTextRule(cues, rule, ids) });
  } catch (error) {
    self.postMessage({ ok: false, error: error instanceof Error ? error.message : 'TEXT_RULE_INVALID' });
  }
};
