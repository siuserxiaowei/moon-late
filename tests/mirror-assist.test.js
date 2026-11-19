import { test } from 'node:test';
import assert from 'node:assert/strict';
import { snapMirrorAngle, withinMirrorTarget } from '../src/mirror-assist.js';

test('powered mirror snaps near the target, including across the angle boundary', () => {
  assert.ok(Math.abs(snapMirrorAngle(Math.PI - 0.1, -Math.PI + 0.1, 0.4, true) - (Math.PI + 0.1)) < 1e-9);
  assert.equal(snapMirrorAngle(1, 1.2, 0.4, true), 1.2);
});
test('unpowered and distant angles remain under player control', () => {
  assert.equal(snapMirrorAngle(1, 1.2, 0.4, false), 1);
  assert.equal(snapMirrorAngle(1, 2, 0.4, true), 1);
});
test('enlarged hit target accepts nearby visible points only', () => {
  assert.equal(withinMirrorTarget(35, 0, 0, 0, 0, 42), true);
  assert.equal(withinMirrorTarget(43, 0, 0, 0, 0, 42), false);
  assert.equal(withinMirrorTarget(0, 0, 0, 0, 2, 42), false);
});
