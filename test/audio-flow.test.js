'use strict';

const assert = require('assert');
const Module = require('module');
const manifest = require('../app.json');

const originalLoad = Module._load;
Module._load = function load(request, parent, isMain) {
  if (request === 'homey') {
    return {
      Device: class Device {},
      Driver: class Driver {},
    };
  }
  return originalLoad.call(this, request, parent, isMain);
};
const WebosPlusDevice = require('../drivers/webos_plus/device');
const WebosPlusDriver = require('../drivers/webos_plus/driver');
const WebOSTV = require('../drivers/webos_plus/webos/WebOSTV');
Module._load = originalLoad;

const {VOLUME_CAPABILITY_OPTIONS} = require('../drivers/webos_plus/webos/utils/volume');
const homeyVolumeCapability = require('homey-lib/assets/capability/capabilities/volume_set.json');

function registerCondition(methodName, cardName) {
  let listener;
  const driver = {
    [cardName]: {
      registerRunListener(callback) {
        listener = callback;
      },
    },
  };
  WebosPlusDriver.prototype[methodName].call(driver);
  return listener;
}

function registerAction(methodName, cardName) {
  let listener;
  const driver = {
    [cardName]: {
      registerRunListener(callback) {
        listener = callback;
      },
    },
  };
  WebosPlusDriver.prototype[methodName].call(driver);
  return listener;
}

function subscriptionResult(payload) {
  let callback;
  const seen = {volume: [], muted: []};
  const device = {
    log() {},
    error() {},
    subsSet: false,
    lgtv: {
      subscribe(_endpoint, handler) {
        callback = handler;
      },
    },
    _handleResponse(error, result, endpoint) {
      return {error, result, endpoint};
    },
  };
  WebOSTV.prototype._volumeListener.call(
    device,
    volume => seen.volume.push(volume),
    muted => seen.muted.push(muted),
  );
  callback(null, payload);
  return seen;
}

async function run() {
  const relativeCard = homeyVolumeCapability.$flow.actions
    .find(card => card.id === 'volume_set_relative');
  assert(relativeCard, 'Homey volume_set must expose its generated relative action');
  assert.deepStrictEqual(relativeCard.args[0], {
    name: 'volume_set',
    type: 'range',
    min: -1,
    max: 1,
    step: 0.01,
    value: 0.5,
    label: '%',
    labelMultiplier: 100,
    labelDecimals: 0,
  });

  const declaredCapabilities = manifest.drivers[0].capabilities;
  assert(!declaredCapabilities.includes('speaker_playing'));
  assert(!declaredCapabilities.includes('speaker_next'));
  assert(!declaredCapabilities.includes('speaker_prev'));
  const actionIds = manifest.flow.actions.map(card => card.id);
  assert(actionIds.includes('webos_media_play'));
  assert(actionIds.includes('webos_media_pause'));
  assert(actionIds.includes('webos_media_toggle'));
  assert(actionIds.includes('webos_media_fast_forward'));
  assert(actionIds.includes('webos_media_rewind'));

  const capabilityValues = {
    volume_set: 20,
    speaker_playing: true,
  };
  const removed = [];
  const setValues = [];
  const registrationDevice = {
    mediaCommandPlaying: false,
    migrateDisplayCapabilities: WebosPlusDevice.prototype.migrateDisplayCapabilities,
    hasCapability: capability => [
      'speaker_playing',
      'speaker_next',
      'speaker_prev',
    ].includes(capability) || declaredCapabilities.includes(capability),
    addCapability: async () => {},
    removeCapability: async capability => removed.push(capability),
    getCapabilityOptions: () => VOLUME_CAPABILITY_OPTIONS,
    setCapabilityOptions: async () => {},
    getCapabilityValue: capability => capabilityValues[capability],
    setCapabilityValue: async (capability, value) => {
      capabilityValues[capability] = value;
      setValues.push([capability, value]);
    },
    registerCapabilityListener: () => {},
    log: () => {},
    toggleOnOff() {},
    volumeSet() {},
    volumeMute() {},
    volumeUp() {},
    volumeDown() {},
    _channelUp() {},
    _channelDown() {},
    _mediaTogglePlayPause() {},
  };
  await WebosPlusDevice.prototype.registerCapabilities.call(registrationDevice);
  assert.deepStrictEqual(removed, ['speaker_playing', 'speaker_next', 'speaker_prev']);
  assert.strictEqual(registrationDevice.mediaCommandPlaying, true);
  assert(setValues.some(([capability, value]) => capability === 'volume_set' && value === 0.2));

  let sentVolume;
  const commandDevice = {
    log() {},
    _volumeSet: async volume => {
      sentVolume = volume;
      return {volume};
    },
    setCapabilityValue: async () => {},
  };
  await WebosPlusDevice.prototype.volumeSet.call(commandDevice, 0.2 + 0.1);
  assert.strictEqual(sentVolume, 30, '20% plus 10% must send LG volume 30');
  await assert.rejects(
    WebosPlusDevice.prototype.volumeSet.call(commandDevice, 20.1),
    RangeError,
    'a legacy 20 plus relative 10% must be rejected instead of clamped to 100',
  );

  assert.deepStrictEqual(subscriptionResult({volume: 20, muted: true}), {
    volume: [20],
    muted: [true],
  });
  assert.deepStrictEqual(subscriptionResult({volume: 20, muted: false, changed: []}), {
    volume: [20],
    muted: [false],
  });
  assert.deepStrictEqual(subscriptionResult({
    returnValue: true,
    volumeStatus: {volume: 8, muteStatus: false, soundOutput: 'tv_speaker'},
  }), {
    volume: [8],
    muted: [false],
  });

  let requestedEndpoint;
  const currentStatusDevice = {
    log() {},
    error() {},
    lgtv: {
      request(endpoint, callback) {
        requestedEndpoint = endpoint;
        callback(null, {returnValue: true, volume: 20, muted: true});
      },
    },
    _handleResponse(error, result, endpoint) {
      return {error, result, endpoint};
    },
  };
  assert.deepStrictEqual(
    await WebOSTV.prototype._volumeCurrent.call(currentStatusDevice),
    {returnValue: true, volume: 20, muted: true},
  );
  assert.strictEqual(requestedEndpoint, 'ssap://audio/getVolume');

  const refreshedValues = {volume_set: 1, volume_mute: false};
  const refreshDevice = {
    _volumeCurrent: async () => ({volume: 20, muted: true}),
    getCapabilityValue: capability => refreshedValues[capability],
    setCapabilityValue: async (capability, value) => {
      refreshedValues[capability] = value;
    },
  };
  const freshStatus = await WebosPlusDevice.prototype.refreshVolumeStatus.call(refreshDevice);
  assert.deepStrictEqual(freshStatus, {volume: 0.2, muted: true});
  assert.deepStrictEqual(refreshedValues, {volume_set: 0.2, volume_mute: true});

  const nestedValues = {volume_set: 1, volume_mute: true};
  const nestedRefreshDevice = {
    _volumeCurrent: async () => ({
      returnValue: true,
      volumeStatus: {volume: 8, muteStatus: false, soundOutput: 'tv_speaker'},
    }),
    getCapabilityValue: capability => nestedValues[capability],
    setCapabilityValue: async (capability, value) => {
      nestedValues[capability] = value;
    },
  };
  assert.deepStrictEqual(
    await WebosPlusDevice.prototype.refreshVolumeStatus.call(nestedRefreshDevice),
    {volume: 0.08, muted: false},
  );
  assert.deepStrictEqual(nestedValues, {volume_set: 0.08, volume_mute: false});

  const flowDevice = {
    log() {},
    getCapabilityValue: () => 1,
    refreshVolumeStatus: async () => ({volume: 0.2, muted: true}),
  };
  assert.strictEqual(await registerCondition('conditionVolumeEquals', '_conditionVolumeEquals')({webosDevice: flowDevice, volume: 20}, {}), true);
  assert.strictEqual(await registerCondition('conditionVolumeSmaller', '_conditionVolumeSmaller')({webosDevice: flowDevice, volume: 21}, {}), true);
  assert.strictEqual(await registerCondition('conditionVolumeLarger', '_conditionVolumeLarger')({webosDevice: flowDevice, volume: 21}, {}), false);
  assert.strictEqual(await registerCondition('conditionMuted', '_conditionMuted')({webosDevice: flowDevice}, {}), true);

  const missingVolume = {log() {}, refreshVolumeStatus: async () => ({muted: false})};
  await assert.rejects(
    registerCondition('conditionVolumeEquals', '_conditionVolumeEquals')({webosDevice: missingVolume, volume: 20}, {}),
    /did not include volume/,
  );
  const missingMute = {log() {}, refreshVolumeStatus: async () => ({volume: 0.2})};
  await assert.rejects(
    registerCondition('conditionMuted', '_conditionMuted')({webosDevice: missingMute}, {}),
    /did not include muted state/,
  );

  const mediaCommands = [];
  const mediaDevice = {
    mediaCommandPlaying: false,
    _mediaTogglePlayPause: async playing => mediaCommands.push(playing),
    mediaPlay: WebosPlusDevice.prototype.mediaPlay,
    mediaPause: WebosPlusDevice.prototype.mediaPause,
  };
  mediaDevice.mediaTogglePlayPause = WebosPlusDevice.prototype.mediaTogglePlayPause;
  await mediaDevice.mediaPlay();
  await mediaDevice.mediaPause();
  await mediaDevice.mediaTogglePlayPause();
  await mediaDevice.mediaTogglePlayPause();
  assert.deepStrictEqual(mediaCommands, [true, false, true, false]);

  const actionCommands = [];
  const flowTransportDevice = {
    mediaFastForward: async () => actionCommands.push('fastForward'),
    mediaRewind: async () => actionCommands.push('rewind'),
  };
  assert.strictEqual(
    await registerAction('actionMediaFastForward', '_actionMediaFastForward')({webosDevice: flowTransportDevice}),
    true,
  );
  assert.strictEqual(
    await registerAction('actionMediaRewind', '_actionMediaRewind')({webosDevice: flowTransportDevice}),
    true,
  );
  assert.deepStrictEqual(actionCommands, ['fastForward', 'rewind']);

  const requestedMediaEndpoints = [];
  const mediaTransport = {
    log() {},
    error() {},
    lgtv: {
      request(endpoint, callback) {
        requestedMediaEndpoints.push(endpoint);
        callback(null, {returnValue: true});
      },
    },
    _handleResponse(error, result, endpoint) {
      return {error, result, endpoint};
    },
  };
  await WebOSTV.prototype.mediaFastForward.call(mediaTransport);
  await WebOSTV.prototype.mediaRewind.call(mediaTransport);
  assert.deepStrictEqual(requestedMediaEndpoints, [
    'ssap://media.controls/fastForward',
    'ssap://media.controls/rewind',
  ]);

  console.log('Audio Flow regression tests passed');
}

run().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
