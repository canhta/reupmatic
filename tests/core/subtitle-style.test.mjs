import assert from 'node:assert/strict';
import test from 'node:test';
import { parseProcessingRecipe, requiredModels } from '../../dist-core/processing/recipe.js';
import { createProject } from '../../dist-core/projects/project.js';
import { assertCues, splitCue } from '../../dist-core/subtitles/cues.js';
import {
  bundledFontFiles,
  bundledFontUrl,
  defaultFontFamily,
  fontFamilies,
} from '../../dist-core/subtitles/fonts.js';
import {
  applyCueStyle,
  defaultSubtitleStyle,
  firstInvalidSubtitleStyleField,
  parseSubtitleStyle,
  subtitleStyleFieldInvalid,
} from '../../dist-core/subtitles/style.js';

const cue = { id: 'first', start_ms: 0, end_ms: 2000, text: 'Tiếng Việt {not markup}' };
test('one bundled font family is the default and the only selectable name', () => {
  assert.equal(defaultSubtitleStyle.font_family, 'Be Vietnam Pro');
  assert.equal(defaultFontFamily, 'Be Vietnam Pro');
  assert.deepEqual(fontFamilies, ['Be Vietnam Pro']);
  assert.equal(subtitleStyleFieldInvalid('font_family', 'Be Vietnam Pro'), false);
  for (const other of ['Arial', 'DejaVu Sans', 'Helvetica', 'Be Vietnam Pro Bold']) {
    assert.equal(subtitleStyleFieldInvalid('font_family', other), true, other);
  }
  assert.deepEqual(
    bundledFontFiles().map((font) => [font.id, font.file]),
    [
      ['font-be-vietnam-pro-regular', 'BeVietnamPro-Regular.ttf'],
      ['font-be-vietnam-pro-bold', 'BeVietnamPro-Bold.ttf'],
    ],
  );
  assert.equal(
    bundledFontUrl('font-be-vietnam-pro-regular'),
    'media://local/font-be-vietnam-pro-regular',
  );
});
test('global and cue-specific subtitle styles survive project, processing and split boundaries', () => {
  const style = parseSubtitleStyle({
    ...defaultSubtitleStyle,
    font_family: 'Be Vietnam Pro',
    position: 8,
  });
  const processing = parseProcessingRecipe({ subtitle_style: style });
  assert.deepEqual(requiredModels(processing), []);
  const cues = applyCueStyle([cue], ['first'], style);
  assert.equal(cue.style, undefined);
  assertCues(cues);
  const project = createProject(
    { path: '/video.mp4', sha256: 'a'.repeat(64) },
    {
      cues,
      processing,
    },
  );
  assert.deepEqual(project.cues[0].style, style);
  assert.deepEqual(splitCue(cues, 'first', 1000, 4, 'second')[1].style, style);
  assert.equal(applyCueStyle(cues, ['first'], undefined)[0].style, undefined);
});
test('style validation rejects ASS injection, invalid opacity, unsupported keys and non-finite numbers', () => {
  for (const patch of [
    { font_family: 'Arial\nStyle:bad' },
    { font_family: 'Arial,10' },
    { text_color: 'red' },
    { box_opacity: 1.1 },
    { position: 0 },
    { font_size_pct: NaN },
    { margin_x_pct: 50 },
    { bold: 1 },
    { command: 'anything' },
  ]) {
    assert.throws(
      () => parseSubtitleStyle({ ...defaultSubtitleStyle, ...patch }),
      /INVALID_SUBTITLE_STYLE/,
    );
  }
  assert.throws(() => assertCues([{ ...cue, style: {} }]), /INVALID_SUBTITLE_STYLE/);
  assert.throws(() => applyCueStyle([cue], ['missing'], defaultSubtitleStyle), /INVALID_CUES/);
});
test('each field names its own failure so the form can mark it inline', () => {
  assert.equal(subtitleStyleFieldInvalid('font_family', 'Be Vietnam Pro'), false);
  assert.equal(subtitleStyleFieldInvalid('font_family', 'DejaVu Sans'), true);
  assert.equal(subtitleStyleFieldInvalid('font_family', 'Arial,10'), true);
  assert.equal(subtitleStyleFieldInvalid('font_family', ''), true);
  assert.equal(subtitleStyleFieldInvalid('text_color', '#A1B2C3'), false);
  assert.equal(subtitleStyleFieldInvalid('text_color', 'A1B2C3'), true);
  assert.equal(subtitleStyleFieldInvalid('position', 9), false);
  assert.equal(subtitleStyleFieldInvalid('position', 2.5), true);
  assert.equal(subtitleStyleFieldInvalid('margin_x_pct', 40), false);
  assert.equal(subtitleStyleFieldInvalid('margin_x_pct', 50), true);
  assert.equal(firstInvalidSubtitleStyleField(defaultSubtitleStyle), null);
  assert.equal(
    firstInvalidSubtitleStyleField({ ...defaultSubtitleStyle, box_opacity: 2 }),
    'box_opacity',
  );
});
test('box padding is its own bounded, required field, independent of the outline', () => {
  assert.equal(typeof defaultSubtitleStyle.box_padding_pct, 'number');
  const padded = parseSubtitleStyle({
    ...defaultSubtitleStyle,
    outline_pct: 0,
    box_opacity: 1,
    box_padding_pct: 4,
  });
  assert.equal(padded.outline_pct, 0);
  assert.equal(padded.box_padding_pct, 4);
  assert.equal(subtitleStyleFieldInvalid('box_padding_pct', 0), false);
  for (const bad of [-0.1, 4.1, Number.POSITIVE_INFINITY, '1']) {
    assert.equal(subtitleStyleFieldInvalid('box_padding_pct', bad), true, String(bad));
  }
  const { box_padding_pct: _omitted, ...missing } = defaultSubtitleStyle;
  assert.throws(() => parseSubtitleStyle(missing), /INVALID_SUBTITLE_STYLE/);
});
