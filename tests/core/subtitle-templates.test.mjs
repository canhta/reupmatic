import assert from 'node:assert/strict';
import test from 'node:test';
import { defaultSubtitleStyle, parseSubtitleStyle } from '../../dist-core/subtitles/style.js';
import {
  applySubtitleTemplate,
  matchingSubtitleTemplate,
  subtitleTemplates,
} from '../../dist-core/subtitles/templates.js';

test('every template applies valid style fields and is recognised afterwards', () => {
  for (const template of subtitleTemplates) {
    const style = parseSubtitleStyle(applySubtitleTemplate(defaultSubtitleStyle, template));
    assert.deepEqual(style.animation, template.animation);
    assert.equal(style.uppercase, template.uppercase);
    assert.equal(style.bold, template.bold);
    assert.equal(style.outline_pct, template.outline_pct);
    assert.equal(style.accent_color, template.accent_color);
    assert.equal(matchingSubtitleTemplate(style)?.id, template.id);
  }
});

test('a template only overrides its own fields and an adjusted style stops matching', () => {
  const base = { ...defaultSubtitleStyle, font_family: 'DejaVu Sans', position: 8 };
  const applied = applySubtitleTemplate(base, subtitleTemplates[0]);
  assert.equal(applied.font_family, 'DejaVu Sans');
  assert.equal(applied.position, 8);
  assert.equal(matchingSubtitleTemplate({ ...applied, outline_pct: 1 })?.id, undefined);
  assert.equal(matchingSubtitleTemplate(defaultSubtitleStyle), undefined);
});
