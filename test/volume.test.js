'use strict';

const assert = require('assert');
const manifest = require('../app.json');
const {
  VOLUME_CAPABILITY_OPTIONS,
  homeyVolumeToLg,
  lgVolumeToHomey,
  normaliseStoredHomeyVolume,
  normaliseVolumeStatus,
  percentageToHomeyVolume,
  volumeCapabilityOptionsMatch,
} = require('../drivers/webos_plus/webos/utils/volume');

assert.strictEqual(homeyVolumeToLg(0), 0);
assert.strictEqual(homeyVolumeToLg(0.01), 1);
assert.strictEqual(homeyVolumeToLg(0.2), 20);
assert.strictEqual(homeyVolumeToLg(0.5), 50);
assert.strictEqual(homeyVolumeToLg(0.694), 69);
assert.strictEqual(homeyVolumeToLg(1), 100);
assert.throws(() => homeyVolumeToLg(-1), RangeError);
assert.throws(() => homeyVolumeToLg(2), RangeError);

assert.strictEqual(lgVolumeToHomey(0), 0);
assert.strictEqual(lgVolumeToHomey(1), 0.01);
assert.strictEqual(lgVolumeToHomey(20), 0.2);
assert.strictEqual(lgVolumeToHomey(50), 0.5);
assert.strictEqual(lgVolumeToHomey(69), 0.69);
assert.strictEqual(lgVolumeToHomey(100), 1);
assert.strictEqual(lgVolumeToHomey(-1), 0);
assert.strictEqual(lgVolumeToHomey(101), 1);

assert.strictEqual(percentageToHomeyVolume(25), 0.25);
assert.strictEqual(percentageToHomeyVolume(75), 0.75);

assert.strictEqual(normaliseStoredHomeyVolume(0.2), 0.2);
assert.strictEqual(normaliseStoredHomeyVolume(20), 0.2);
assert.strictEqual(normaliseStoredHomeyVolume(50), 0.5);
assert.strictEqual(normaliseStoredHomeyVolume(100), 1);
assert.strictEqual(normaliseStoredHomeyVolume(null), null);
assert.throws(() => normaliseStoredHomeyVolume(-1), RangeError);
assert.throws(() => normaliseStoredHomeyVolume(101), RangeError);

assert.deepStrictEqual(normaliseVolumeStatus({volume: 20, muted: true}), {
  volume: 0.2,
  muted: true,
});
assert.deepStrictEqual(normaliseVolumeStatus({volume: 0}), {volume: 0});
assert.deepStrictEqual(normaliseVolumeStatus({muted: false}), {muted: false});
assert.throws(() => normaliseVolumeStatus({}), TypeError);
assert.throws(() => normaliseVolumeStatus({volume: 101}), RangeError);
assert.throws(() => normaliseVolumeStatus({muted: 1}), TypeError);

assert.throws(() => homeyVolumeToLg('not-a-number'), TypeError);
assert.throws(() => lgVolumeToHomey(undefined), TypeError);

const volumeOptions = manifest.drivers[0].capabilitiesOptions.volume_set;
assert.deepStrictEqual(volumeOptions, VOLUME_CAPABILITY_OPTIONS);
assert.strictEqual(
  volumeOptions.decimals,
  2,
  'volume_set must retain Homey values such as 0.2 and 0.5 instead of rounding them to 0 or 1',
);
assert.strictEqual(volumeCapabilityOptionsMatch(volumeOptions), true);
assert.strictEqual(volumeCapabilityOptionsMatch({...volumeOptions, decimals: 0}), false);
assert.strictEqual(volumeCapabilityOptionsMatch(undefined), false);

console.log('Volume conversion tests passed');
