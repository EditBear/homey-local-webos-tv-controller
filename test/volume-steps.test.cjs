'use strict';

const assert = require('node:assert/strict');
const path = require('node:path');
const test = require('node:test');

const packageDir = process.env.HOMEY_TEST_PACKAGE || path.join(__dirname, '..');
const {planVolumeSteps} = require(path.join(packageDir, 'drivers/webos_plus/webos/utils/volume-steps.js'));

test('TV speakers and an unknown output keep using setVolume', () => {
  assert.equal(planVolumeSteps('tv_speaker', 20, 40), null);
  assert.equal(planVolumeSteps(undefined, 20, 40), null);
  assert.equal(planVolumeSteps('', 20, 40), null);
});

test('external outputs step towards the target', () => {
  assert.deepEqual(planVolumeSteps('external_arc', 20, 25), {direction: 'up', count: 5});
  assert.deepEqual(planVolumeSteps('external_arc', 40, 31), {direction: 'down', count: 9});
  assert.deepEqual(planVolumeSteps('bt_soundbar', 30, 30), {direction: 'up', count: 0});
  assert.deepEqual(planVolumeSteps('external_arc', 0, 100), {direction: 'up', count: 100});
});

test('an unknown starting volume falls back to setVolume', () => {
  assert.equal(planVolumeSteps('external_arc', null, 30), null);
  assert.equal(planVolumeSteps('external_arc', NaN, 30), null);
});
