import assert from 'node:assert/strict';
import test from 'node:test';
import { colorPreviewMatrix } from '../../dist-core/editing/color-preview.js';

// The matrix is row-major: [a, b, c, d, e, ...] per output channel, where the
// result is a*R + b*G + c*B + d*A + e (offsets are in the 0..1 range, exactly
// like SVG feColorMatrix type="matrix").
const near = (value, expected, message) =>
  assert.ok(Math.abs(value - expected) < 1e-9, `${message}: ${value} != ${expected}`);

function rows(matrix) {
  return [0, 1, 2, 3].map((row) => matrix.slice(row * 5, row * 5 + 5));
}

test('default colour settings are the identity matrix', () => {
  assert.deepEqual(
    colorPreviewMatrix({ brightness: 0, contrast: 1, saturation: 1 }),
    [1, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 1, 0],
  );
});

test('brightness is an additive offset, not a multiplier', () => {
  // eq adds `brightness` to the luma and leaves the chroma alone — the whole
  // point of the ticket. CSS brightness() would have scaled each channel.
  const [r] = rows(colorPreviewMatrix({ brightness: 0.2, contrast: 1, saturation: 1 }));
  assert.deepEqual(r, [1, 0, 0, 0, 0.2]);
});

test('saturation zero collapses every channel to BT.709 luma', () => {
  const matrix = colorPreviewMatrix({ brightness: 0, contrast: 1, saturation: 0 });
  const [wr, wg, wb] = [0.2126, 0.7152, 0.0722];
  for (const row of rows(matrix).slice(0, 3)) {
    near(row[0], wr, 'red weight');
    near(row[1], wg, 'green weight');
    near(row[2], wb, 'blue weight');
    near(row[4], 0, 'no offset');
  }
});

test('contrast pivots at mid-grey and moves every channel by the luma delta', () => {
  const [wr, wg, wb] = [0.2126, 0.7152, 0.0722];
  const [r, g, b] = rows(colorPreviewMatrix({ brightness: 0, contrast: 0, saturation: 1 }));
  assert.deepEqual(r, [1 - wr, -wg, -wb, 0, 0.5]);
  assert.deepEqual(g, [-wr, 1 - wg, -wb, 0, 0.5]);
  assert.deepEqual(b, [-wr, -wg, 1 - wb, 0, 0.5]);
});

test('combined settings expand the closed form eq uses in YUV', () => {
  // brightness 0.2, contrast 0.7, saturation 1.8 => d = contrast - saturation.
  const matrix = colorPreviewMatrix({ brightness: 0.2, contrast: 0.7, saturation: 1.8 });
  const [wr, wg, wb] = [0.2126, 0.7152, 0.0722];
  const d = 0.7 - 1.8;
  const offset = 0.5 * (1 - 0.7) + 0.2;
  assert.deepEqual(matrix, [
    1.8 + wr * d,
    wg * d,
    wb * d,
    0,
    offset,
    wr * d,
    1.8 + wg * d,
    wb * d,
    0,
    offset,
    wr * d,
    wg * d,
    1.8 + wb * d,
    0,
    offset,
    0,
    0,
    0,
    1,
    0,
  ]);
  // A concrete pixel: mid blue 0x336699 under the setting above.
  const r =
    matrix[0] * (0x33 / 255) + matrix[1] * (0x66 / 255) + matrix[2] * (0x99 / 255) + matrix[4];
  near(r, 0.300888, 'red channel');
});
