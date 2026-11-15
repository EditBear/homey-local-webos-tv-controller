'use strict';

const assert = require('node:assert/strict');
const {EventEmitter} = require('node:events');
const {test} = require('node:test');
const path = require('node:path');

const packageDir = process.env.HOMEY_TEST_PACKAGE || path.join(__dirname, '..');
const deviceDir = path.join(packageDir, 'drivers/webos_plus');
const Module = require('node:module');
const originalLoad = Module._load;
Module._load = function (name, ...args) {
  if (name === 'homey') return {Device: class {}};
  return originalLoad.call(this, name, ...args);
};
let Device;
try {
  Device = require(path.join(deviceDir, 'device.js'));
} finally {
  Module._load = originalLoad;
}
const {capabilities, endpoints, store} = require(path.join(deviceDir, 'webos/utils/constants'));
const {readArcVolume} = require(path.join(deviceDir, 'webos/utils/volume-steps'));
const {get: read, set, up, down, mute} = endpoints.volume;

function report(level, fields = {}) {
  return {returnValue: true, volumeStatus: {
    soundOutput: 'external_arc', volume: level, maxVolume: 100, muteStatus: false, ...fields,
  }};
}

function setup({enabled = true, output = 'external_arc', level = 20} = {}) {
  const device = new Device();
  const client = new EventEmitter();
  const calls = [];
  const writes = [];
  const state = {enabled, output, level, on: true, delta: 1};
  let readCount = 0;
  device.log = () => {};
  device.error = () => {};
  device.lgtv = client;
  device.getSettings = () => ({stepExternalArcVolume: state.enabled});
  device.getStoreValue = id => id === store.currentSoundOutput ? state.output : undefined;
  device.getCapabilityValue = id => id === capabilities.onOff ? state.on : null;
  device.setCapabilityValue = async (id, value) => writes.push({id, value});
  client.request = (uri, args, cb) => {
    if (typeof args === 'function') {
      cb = args;
      args = undefined;
    }
    calls.push([uri, args]);
    if (uri === read) {
      readCount += 1;
      return cb(null, state.customRead ? state.customRead(readCount) : report(state.level, {soundOutput: state.output}));
    }
    if (uri === up || uri === down) {
      if (state.stepError) return cb(state.stepError);
      state.level += (uri === up ? state.delta : -state.delta);
      if (state.afterStep) state.afterStep();
    }
    cb(null, {returnValue: true});
  };
  return {device, client, calls, writes, state};
}

function uris(calls) {
  return calls.map(([uri]) => uri);
}

test('the ARC setting defaults to off for the existing driver', () => {
  const manifest = require(path.join(packageDir, 'app.json'));
  const setting = manifest.drivers.find(driver => driver.id === 'webos_plus').settings
    .flatMap(group => group.children).find(item => item.id === 'stepExternalArcVolume');
  assert.equal(setting.type, 'checkbox');
  assert.equal(setting.value, false);
});

test('the existing absolute control stays in Homey units for current settings and other outputs', async () => {
  for (const config of [
    {enabled: false},
    {enabled: undefined, output: ''},
    {output: 'tv_speaker'},
    {output: 'external_optical'},
    {output: 'bt_soundbar'},
  ]) {
    const {device, calls, writes} = setup(config);
    await device.volumeSet(0.23);
    assert.deepEqual(calls, [[set, {volume: 23}]]);
    assert.deepEqual(writes, []);
  }
});

test('ARC volume steps use a fresh same-route measurement before and after each step', async () => {
  const {device, calls, writes, state} = setup();
  await device.volumeSet(0.22);
  assert.equal(state.level, 22);
  assert.deepEqual(uris(calls), [read, up, read, up, read]);
  assert.deepEqual(writes, []);

  calls.length = 0;
  await device.volumeSet(0.21);
  assert.equal(state.level, 21);
  assert.deepEqual(uris(calls), [read, down, read]);
});

test('matching target and measured zero are distinguished from unknown', async () => {
  const {device, calls, state} = setup({level: 0});
  await device.volumeSet(0);
  assert.deepEqual(uris(calls), [read]);
  calls.length = 0;
  await device.volumeSet(0.01);
  assert.deepEqual(uris(calls), [read, up, read]);
  assert.equal(state.level, 1);
});

test('missing, ambiguous, muted or non-ARC measurements prevent any external write', async () => {
  for (const invalid of [
    null,
    report(null),
    report(20, {maxVolume: undefined}),
    report(2, {maxVolume: 10}),
    report(20, {soundOutput: 'tv_speaker'}),
    {...report(20), soundOutput: 'tv_speaker'},
    {...report(20), volume: 21},
    report(20, {muteStatus: true}),
    report(20, {muteStatus: undefined}),
    report(20, {activeStatus: false}),
  ]) {
    const {device, calls, state} = setup();
    state.customRead = () => invalid;
    await assert.rejects(device.volumeSet(0.80), /volume unavailable/);
    assert.deepEqual(uris(calls), [read]);
  }
  assert.equal(readArcVolume({
    returnValue: true, soundOutput: 'external_arc', volume: 20, maxVolume: 100, muted: false,
  }), 20);
});

test('an ARC acknowledgement without measured progress stops after one adjustment', async () => {
  const {device, calls, writes, state} = setup();
  state.delta = 0;
  await assert.rejects(device.volumeSet(0.44), /did not change/);
  assert.deepEqual(uris(calls), [read, up, read]);
  assert.deepEqual(writes, []);
});

test('an overshoot fails without reversing the setting automatically', async () => {
  const {device, calls, state} = setup();
  state.delta = 3;
  await assert.rejects(device.volumeSet(0.21), /past the requested level/);
  assert.deepEqual(uris(calls), [read, up, read]);
});

test('an ARC command error propagates without an absolute fallback', async () => {
  const {device, calls, state} = setup();
  state.stepError = new Error('step refused');
  await assert.rejects(device.volumeSet(0.26), /step refused/);
  assert.deepEqual(uris(calls), [read, up]);
});

test('reconnection on the same adapter stops the in-flight ARC run', async () => {
  const {device, client, calls, state} = setup();
  state.afterStep = () => client.emit('close');
  await assert.rejects(device.volumeSet(0.26), /interrupted/);
  assert.deepEqual(uris(calls), [read, up]);
  assert.equal(client.listenerCount('close'), 0);
});

test('a changed setting or sound output stops the ARC run after its current command', async () => {
  for (const change of [state => { state.enabled = false; }, state => { state.output = 'tv_speaker'; }]) {
    const {device, calls, state} = setup();
    state.afterStep = () => change(state);
    await assert.rejects(device.volumeSet(0.26), /interrupted/);
    assert.deepEqual(uris(calls), [read, up]);
  }
});

test('a changed sound-output report stops the run before the cached output updates', async () => {
  const {device, calls, state} = setup();
  let reportOutput;
  device._soundOutputListener = callback => { reportOutput = callback; };
  device.checkOnOff = () => false;
  device.soundOutputListener();
  state.afterStep = () => reportOutput('tv_speaker');
  await assert.rejects(device.volumeSet(0.26), /interrupted/);
  assert.equal(state.output, 'external_arc');
  assert.deepEqual(uris(calls), [read, up]);
});

test('a new slider value replaces an in-flight target and both calls await its measurement', async () => {
  const {device, calls, state} = setup();
  let second;
  state.afterStep = () => {
    state.afterStep = null;
    second = device.volumeSet(0.20);
  };
  const first = device.volumeSet(0.28);
  await first;
  assert.ok(second);
  await second;
  assert.equal(state.level, 20);
  assert.deepEqual(uris(calls), [read, up, read, down, read]);
});

test('an explicit mute interrupts the ARC run and sends the existing mute command', async () => {
  const {device, calls, state} = setup();
  let explicit;
  state.afterStep = () => { explicit = device.volumeMute(true); };
  await assert.rejects(device.volumeSet(0.26), /interrupted/);
  await explicit;
  assert.deepEqual(uris(calls), [read, up, mute]);
});
