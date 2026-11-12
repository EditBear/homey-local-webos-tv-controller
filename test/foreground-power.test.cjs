'use strict';

const assert = require('node:assert/strict');
const {EventEmitter} = require('node:events');
const Module = require('node:module');
const path = require('node:path');
const test = require('node:test');
const {attempts} = require(process.env.HOMEY_OFFLINE_BARRIER || './offline-barrier.cjs');

const packageDir = process.env.HOMEY_TEST_PACKAGE || path.join(__dirname, '..');
const load = Module._load;
Module._load = function(name, ...args) {
  if (name === 'homey') return {Device: class {}};
  return load.call(this, name, ...args);
};
const Device = require(path.join(packageDir, 'drivers/webos_plus/device.js'));
const {endpoints} = require(path.join(packageDir, 'drivers/webos_plus/webos/utils/constants.js'));
Module._load = load;

const start = Date.parse('2026-11-12T14:39:55.575Z');
const hdmi3 = 'com.webos.app.hdmi3';
const hdmi4 = 'com.webos.app.hdmi4';
const home = 'com.webos.app.home';
const active = {returnValue: true, state: 'Active'};
const standby = {returnValue: true, state: 'Active Standby'};
const parent = process.env.HOMEY_EXPECT_FOREGROUND_POWER_BUG === '1';

async function setup(t, usePoll = false) {
  t.mock.timers.enable({apis: ['Date', 'setTimeout'], now: start});
  const device = new Device();
  const client = new EventEmitter();
  const values = new Map([['onoff', true], ['speaker_artist', 'Netflix']]);
  const store = new Map([['currentApp', 'netflix']]);
  const subscriptions = new Map();
  const writes = [];
  const edges = [];
  const sources = [];
  const confirmations = [];
  const errors = [];
  let pollCount = 0;

  device.construct();
  device.lgtv = client;
  device.log = () => {};
  device.error = (...args) => errors.push(args);
  device.hasCapability = id => values.has(id);
  device.getCapabilityValue = id => values.get(id);
  device.getSettings = () => ({usePoll, powerStateTimeout: 2000});
  device.getStoreValue = id => store.get(id);
  device.setStoreValue = async (id, value) => store.set(id, value);
  device.setCapabilityValue = async (id, value) => {
    if (id === 'onoff') {
      writes.push({value, at: Date.now() - start});
      if (values.get(id) !== value) edges.push(value);
    }
    values.set(id, value);
  };
  device.channelListener = () => {};
  device.poll = () => { pollCount++; };
  device._driver = {
    triggerSourceReported: async (target, tokens) => {
      assert.equal(target, device);
      sources.push(tokens);
    },
    triggerAppChanged: () => {},
    triggerVolumeMuteChanged: () => {},
    triggerSoundOutputChanged: () => {},
    triggerPowerOnConfirmed: async (target, confirmedAt) => {
      assert.equal(target, device);
      confirmations.push(confirmedAt);
    },
  };

  client.subscribe = (uri, callback) => subscriptions.set(uri, callback);
  client.request = (uri, callback) => {
    if (uri === endpoints.system.off) return callback(null, {returnValue: true});
    assert.equal(uri, endpoints.app.getAll);
    return callback(null, {returnValue: true, launchPoints: [
      {id: home, title: 'Home'},
      {id: hdmi3, title: 'HDMI 3'},
      {id: hdmi4, title: 'HDMI 4'},
    ]});
  };

  await device.initDevice();
  client.emit('connect');
  const reply = (uri, payload, err = null) => subscriptions.get(uri)(err, payload);
  return {device, client, values, writes, edges, sources, confirmations, errors, subscriptions,
    power: (payload, err) => reply(endpoints.powerState, payload, err),
    source: appId => reply(endpoints.app.getForegroundApp, {appId, returnValue: true}),
    volume: payload => reply(endpoints.volume.get, payload),
    output: payload => reply(endpoints.audio.getOutput, payload),
    pollCount: () => pollCount,
  };
}

// Recorded order with the original 2 s debounce. Local addresses and serials
// are absent. Remote variant uses the same shutdown reports without the app's
// local write, exercising a remote-started power transition independently.
async function replayShutdown(t, f, tile) {
  f.power(active);
  t.mock.timers.tick(2000);
  f.writes.length = 0;
  f.edges.length = 0;
  f.confirmations.length = 0;
  if (tile) await f.device.toggleOnOff(false);

  let last = 0;
  const at = (time, fn) => {
    t.mock.timers.tick(time - last);
    last = time;
    fn();
  };
  const stopping = {returnValue: true, state: 'Screen Saver', onOff: 'off', reason: 'remoteKey'};
  at(263, () => f.power({...stopping, processing: 'Request Power Off'}));
  at(354, () => f.power({...stopping, processing: 'Request Power Off Logo'}));
  at(717, () => f.source(''));
  at(1863, () => f.source(home));
  at(2354, () => assert.deepEqual(f.confirmations, []));
  at(3511, () => f.power({...stopping, processing: 'Request Active Standby'}));
  at(3538, () => f.power({...stopping, processing: 'Prepare Active Standby'}));
  at(3651, () => f.source(''));
  at(3703, () => f.power(standby));
  t.mock.timers.tick(2000);
  await Promise.resolve();
}

for (const tile of [true, false]) {
  test(`${tile ? 'Homey OFF' : 'physical remote OFF'} plus blank → Home → blank reports`, async t => {
    const f = await setup(t);
    await replayShutdown(t, f, tile);
    assert.deepEqual(f.edges, parent ? [false, true, false] : [false], JSON.stringify(f.writes));
    if (!parent) {
      assert.equal(f.writes.some(write => write.value), false);
      assert.deepEqual(f.writes[0], {value: false, at: tile ? 2000 : 4354});
    }
    assert.equal(f.values.get('onoff'), false);
    assert.deepEqual(f.confirmations, []);
    assert.deepEqual(attempts, []);
  });
}

test('genuine wake preserves confirmedAt timing and publishes the raw HDMI source', async t => {
  const f = await setup(t);
  await replayShutdown(t, f, true);
  const wakeAt = Date.now();
  f.power(active);
  assert.deepEqual(f.confirmations, [wakeAt]);
  f.source(hdmi3);
  assert.deepEqual(f.sources.at(-1), {source: hdmi3, reportedAt: wakeAt});
  if (!parent) {
    t.mock.timers.tick(1999);
    assert.equal(f.values.get('onoff'), false);
    t.mock.timers.tick(1);
  } else {
    t.mock.timers.tick(2000);
  }
  assert.equal(f.values.get('onoff'), true);

  f.source(hdmi4);
  f.source(hdmi4);
  assert.deepEqual(f.sources.slice(-2).map(report => report.source), [hdmi4, hdmi4]);
  assert.deepEqual(f.confirmations, [wakeAt]);
  assert.deepEqual(attempts, []);
});

test('a blank or invalid source ID while awake produces no source or power event', async t => {
  const f = await setup(t);
  f.power(active);
  t.mock.timers.tick(2000);
  f.writes.length = 0;
  f.edges.length = 0;
  f.source('');
  f.source('   ');
  f.source(42);
  assert.deepEqual(f.sources, []);
  assert.deepEqual(f.edges, parent ? [false, true] : []);
  if (!parent) assert.deepEqual(f.writes, []);
  assert.equal(f.values.get('onoff'), true);
  assert.deepEqual(attempts, []);
});

for (const usePoll of [true, false]) {
  test(`${usePoll ? 'legacy polling' : 'unsupported LG power subscription'} keeps source reports independent of confirmed ON`, async t => {
    const f = await setup(t, usePoll);
    assert.equal(f.pollCount(), usePoll ? 1 : 0);
    assert.equal(f.subscriptions.has(endpoints.powerState), !usePoll);
    if (!usePoll) f.power({returnValue: false, errorText: 'No such service'});
    f.values.set('onoff', false);
    f.writes.length = 0;
    f.source(hdmi4);
    assert.deepEqual(f.sources, [{source: hdmi4, reportedAt: start}]);
    assert.equal(f.values.get('onoff'), parent);
    assert.deepEqual(f.confirmations, []);
    assert.deepEqual(attempts, []);
  });
}
