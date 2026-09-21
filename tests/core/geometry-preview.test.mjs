import assert from 'node:assert/strict';
import test from 'node:test';
import {
  geometryPreview,
  mapOutputToSource,
  mapSourceToOutput,
} from '../../dist-core/editing/geometry-preview.js';

const SOURCE = { width: 1920, height: 1080 };
const near = (value, expected, message) =>
  assert.ok(Math.abs(value - expected) < 1e-9, `${message}: ${value} != ${expected}`);

test('no geometry is the identity preview at the source aspect', () => {
  const preview = geometryPreview({}, SOURCE);
  assert.equal(preview.rotate, 0);
  assert.equal(preview.contentAspect, 1920 / 1080);
  assert.equal(preview.outputAspect, 1920 / 1080);
  assert.equal(preview.fit, 'contain');
  assert.deepEqual(preview.viewBox, { top: 0, right: 0, bottom: 0, left: 0 });
  assert.equal(preview.transform, 'rotate(0deg)');
  // Identity mapping: the centre maps to the centre both ways.
  assert.deepEqual(mapOutputToSource(preview, { x: 0.25, y: 0.75 }), { x: 0.25, y: 0.75 });
  assert.deepEqual(mapSourceToOutput(preview, { x: 0.25, y: 0.75 }), { x: 0.25, y: 0.75 });
});

test('a quarter turn swaps the content aspect and the rotator layout axes', () => {
  const preview = geometryPreview({ rotate: 90 }, SOURCE);
  near(preview.contentAspect, 1080 / 1920, 'rotated content aspect');
  // The rotated frame exactly fills the output frame (source aspect): the
  // content box is 100% of both axes, so the rotator's pre-rotation layout
  // swaps its width and height in the component.
  near(preview.contentWidth, 1, 'content width');
  near(preview.contentHeight, 1, 'content height');
  assert.equal(preview.transform, 'rotate(90deg)');
  // CSS/FFmpeg rotate is clockwise: source top-right lands at the rotated
  // frame's bottom-right, source bottom-left at the rotated top-left.
  assert.deepEqual(mapSourceToOutput(preview, { x: 1, y: 0 }), { x: 1, y: 1 });
  assert.deepEqual(mapSourceToOutput(preview, { x: 0, y: 1 }), { x: 0, y: 0 });
  assert.deepEqual(mapOutputToSource(preview, { x: 0, y: 0 }), { x: 0, y: 1 });
});

test('flips compose after the crop, in the rotated frame', () => {
  const horizontal = geometryPreview({ flip: 'horizontal' }, SOURCE);
  assert.equal(horizontal.transform, 'scaleX(-1) rotate(0deg)');
  assert.deepEqual(mapSourceToOutput(horizontal, { x: 0.2, y: 0.3 }), { x: 0.8, y: 0.3 });
  const vertical = geometryPreview({ flip: 'vertical' }, SOURCE);
  assert.equal(vertical.transform, 'scaleY(-1) rotate(0deg)');
  const both = geometryPreview({ flip: 'both' }, SOURCE);
  assert.equal(both.transform, 'scaleY(-1) scaleX(-1) rotate(0deg)');
  assert.deepEqual(mapSourceToOutput(both, { x: 0.2, y: 0.3 }), { x: 0.8, y: 0.7 });
});

test('crop is normalized in the rotated frame and view-box is its source rectangle', () => {
  const preview = geometryPreview(
    { rotate: 90, crop: { x: 0.25, y: 0.1, width: 0.5, height: 0.6 } },
    SOURCE,
  );
  // The source rectangle whose clockwise rotation is the crop, normalized.
  near(preview.viewBox.top, 25, 'view-box top');
  near(preview.viewBox.left, 10, 'view-box left');
  near(preview.viewBox.bottom, 25, 'view-box bottom');
  near(preview.viewBox.right, 30, 'view-box right');
  // The centre of that source rectangle maps to the crop's own centre.
  const centre = mapSourceToOutput(preview, { x: 0.4, y: 0.5 });
  near(centre.x, 0.5, 'crop centre x');
  near(centre.y, 0.5, 'crop centre y');
});

test('contain letterboxes and cover centre-crops, at the output aspect', () => {
  const contain = geometryPreview(
    { output: { aspect: '1:1', fit: 'contain', height: 1080 } },
    SOURCE,
  );
  assert.equal(contain.outputAspect, 1);
  // A 16:9 source inside a square: full width, bars top and bottom (56.25%).
  near(contain.contentWidth, 1, 'contain width');
  near(contain.contentHeight, 1 / (1920 / 1080), 'contain height');
  assert.equal(mapOutputToSource(contain, { x: 0.5, y: 0.05 }), null, 'letterbox is padding');

  const cover = geometryPreview({ output: { aspect: '1:1', fit: 'cover', height: 1080 } }, SOURCE);
  // Cover overflows the square: content is wider than the frame.
  near(cover.contentWidth, 1920 / 1080, 'cover width');
  near(cover.contentHeight, 1, 'cover height');
  assert.deepEqual(mapOutputToSource(cover, { x: 0.5, y: 0.5 }), { x: 0.5, y: 0.5 });
});

test('the output-to-source map inverts the source-to-output map', () => {
  for (const geometry of [
    { rotate: 90, crop: { x: 0.1, y: 0.2, width: 0.6, height: 0.5 } },
    { rotate: 270, flip: 'both', crop: { x: 0.2, y: 0.1, width: 0.5, height: 0.7 } },
    { rotate: 180, output: { aspect: '9:16', fit: 'cover', height: 1080 } },
    { output: { aspect: '4:5', fit: 'contain', height: 1080 } },
  ]) {
    const preview = geometryPreview(geometry, SOURCE);
    for (const point of [
      { x: 0.1, y: 0.1 },
      { x: 0.5, y: 0.5 },
      { x: 0.9, y: 0.8 },
    ]) {
      const forward = mapSourceToOutput(preview, point);
      if (!forward) continue;
      const back = mapOutputToSource(preview, forward);
      assert.ok(back, `${JSON.stringify(geometry)}: ${JSON.stringify(point)} must round trip`);
      near(back.x, point.x, `round-trip x for ${JSON.stringify(geometry)}`);
      near(back.y, point.y, `round-trip y for ${JSON.stringify(geometry)}`);
    }
  }
});
