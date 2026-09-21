import assert from 'node:assert/strict';
import test from 'node:test';
import { parseEditing } from '../../dist-core/editing/edit-recipe.js';
import { logoPreview } from '../../dist-core/editing/logo-preview.js';

const IMAGE = { width: 200, height: 100 };
const OUTPUT = { width: 1000, height: 1000 };

function placement(overrides = {}) {
  return { anchor: 'bottom-right', margin: 0.05, scale: 0.2, opacity: 1, ...overrides };
}

test('a logo placement round trips through the current recipe shape', () => {
  const edit = parseEditing({
    logo: {
      media_id: 'media_00000001',
      anchor: 'top-center',
      margin: 0.02,
      scale: 0.3,
      opacity: 0.5,
    },
  });
  assert.deepEqual(edit, {
    logo: {
      media_id: 'media_00000001',
      anchor: 'top-center',
      margin: 0.02,
      scale: 0.3,
      opacity: 0.5,
    },
  });
  // A profile's placement carries no project media id: the shape stays the same.
  assert.deepEqual(parseEditing({ logo: placement() }), {
    logo: { anchor: 'bottom-right', margin: 0.05, scale: 0.2, opacity: 1 },
  });
});

test('a logo placement rejects unknown anchors, out-of-range values and bad ids', () => {
  for (const logo of [
    { anchor: 'middle', margin: 0, scale: 0.2, opacity: 1 },
    { anchor: 'bottom-right', margin: -0.1, scale: 0.2, opacity: 1 },
    { anchor: 'bottom-right', margin: 0.6, scale: 0.2, opacity: 1 },
    { anchor: 'bottom-right', margin: 0.05, scale: 0, opacity: 1 },
    { anchor: 'bottom-right', margin: 0.05, scale: 1.5, opacity: 1 },
    { anchor: 'bottom-right', margin: 0.05, scale: 0.2, opacity: 2 },
    { anchor: 'bottom-right', margin: 0.05, scale: 0.2, opacity: 1, media_id: 'short' },
  ]) {
    assert.throws(() => parseEditing({ logo }), /INVALID_EDITING/);
  }
});

test('the preview box scales from the output width and keeps the image ratio', () => {
  const box = logoPreview(placement(), IMAGE, OUTPUT);
  // 20% of the output width is 200px wide and 100px tall (a 2:1 image).
  assert.deepEqual(box, { x: 0.75, y: 0.85, width: 0.2, height: 0.1 });
});

test('the nine anchors place the same box against each edge and centre', () => {
  const topLeft = logoPreview(placement({ anchor: 'top-left' }), IMAGE, OUTPUT);
  assert.deepEqual(topLeft, { x: 0.05, y: 0.05, width: 0.2, height: 0.1 });
  const center = logoPreview(placement({ anchor: 'center' }), IMAGE, OUTPUT);
  assert.deepEqual(center, { x: 0.4, y: 0.45, width: 0.2, height: 0.1 });
  const bottomCenter = logoPreview(placement({ anchor: 'bottom-center' }), IMAGE, OUTPUT);
  assert.deepEqual(bottomCenter, { x: 0.4, y: 0.85, width: 0.2, height: 0.1 });
  const middleRight = logoPreview(placement({ anchor: 'middle-right' }), IMAGE, OUTPUT);
  assert.deepEqual(middleRight, { x: 0.75, y: 0.45, width: 0.2, height: 0.1 });
});

test('the margin is the same inset on both axes, measured from the output width', () => {
  // A square output makes the two axes directly comparable; the margin is a
  // fraction of the width, so it is identical in pixels top and left.
  const box = logoPreview(
    placement({ anchor: 'top-left', margin: 0.1 }),
    { width: 100, height: 100 },
    { width: 500, height: 500 },
  );
  assert.equal(box.x, 0.1);
  assert.equal(box.y, 0.1);
  // On a 2:1 output the vertical inset is the same pixel distance, so half the
  // fractional height.
  const wide = logoPreview(
    placement({ anchor: 'top-left', margin: 0.1 }),
    { width: 100, height: 100 },
    { width: 500, height: 250 },
  );
  assert.equal(wide.x, 0.1);
  assert.equal(wide.y, 0.2);
});
