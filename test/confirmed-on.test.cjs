'use strict';

const assert = require('node:assert/strict');
const {EventEmitter} = require('node:events');
const Module = require('node:module');
const test = require('node:test');
require(process.env.HOMEY_OFFLINE_BARRIER || './offline-barrier.cjs');

const load = Module._load;
Module._load = function(name, ...args) {
  if (name === 'homey') return {Device: class {}, Driver: class {}};
  return load.call(this, name, ...args);
};
const {resolve} = require('node:path');
const packageDir = process.env.HOMEY_TEST_PACKAGE || resolve(__dirname, '..');
const Device = require(resolve(packageDir, 'drivers/webos_plus/device'));
const Driver = require(resolve(packageDir, 'drivers/webos_plus/driver'));
const manifest = require(resolve(packageDir, 'app.json'));
const {endpoints} = require(resolve(packageDir, 'drivers/webos_plus/webos/utils/constants'));
Module._load = load;

const cardId = 'webos_power_on_confirmed';
const start = Date.parse('2026-11-12T14:44:48.414Z');
const active = {state: 'Active', returnValue: true, subscribed: true};

async function setup(t, usePoll = false) {
  t.mock.timers.enable({apis: ['Date', 'setTimeout'], now: start});
  const device = new Device();
  const client = new EventEmitter();
  const subscriptions = [];
  const reports = [];
  const writes = [];
  const errors = [];
  const settings = {usePoll};
  device.lgtv = client;
  device.log = () => {};
  device.error = (...args) => errors.push(args);
  device.hasCapability = () => false;
  device.getSettings = () => settings;
  device.setCapabilityValue = async (key, value) => writes.push({key, value, time: Date.now()});
  for (const name of ['volumeListener', 'channelListener', 'appListener', 'soundOutputListener', 'poll']) device[name] = () => {};
  client.subscribe = (uri, callback) => {
    assert.equal(uri, endpoints.powerState);
    subscriptions.push(callback);
  };

  const driver = new Driver();
  const genericCard = {
    registerRunListener() { return this; },
    getArgument() { return this; },
    registerAutocompleteListener() { return this; },
  };
  const powerCard = {trigger: async (target, tokens) => reports.push({target, tokens})};
  driver.homey = {flow: {getDeviceTriggerCard: id => id === cardId ? powerCard : genericCard}};
  driver.initTriggers();
  device._driver = driver;
  await device.initDevice();
  client.emit('connect');

  return {device, client, subscriptions, reports, writes, errors, powerCard, settings,
    reply: (payload, error = null) => subscriptions.at(-1)(error, payload)};
}

test('the device Flow carries the raw receipt time before the two-second ON debounce', async t => {
  const card = manifest.flow.triggers.find(entry => entry.id === cardId);
  assert.deepEqual(card.args, [{name: 'webosDevice', type: 'device', filter: 'driver_id=webos_plus'}]);
  assert.deepEqual(card.tokens.map(({name, type}) => ({name, type})), [{name: 'confirmedAt', type: 'number'}]);
  const f = await setup(t);
  assert.deepEqual(f.writes, [{key: 'onoff', value: true, time: start}]);
  assert.deepEqual(f.reports, []);

  t.mock.timers.tick(10);
  f.reply(active);
  assert.deepEqual(f.reports, [{target: f.device, tokens: {confirmedAt: start + 10}}]);
  t.mock.timers.tick(1999);
  assert.equal(f.writes.length, 1);
  t.mock.timers.tick(1);
  assert.deepEqual(f.writes.at(-1), {key: 'onoff', value: true, time: start + 2010});
});

test('standby, screen states and transition states keep legacy behavior without confirming ON', async t => {
  const f = await setup(t);
  for (const [payload, ordinaryOn] of [
    [{state: 'Active Standby'}, false],
    [{state: 'Screen Saver'}, true],
    [{state: 'Screen Off'}, true],
    [{state: 'Active', processing: 'Resume'}, true],
  ]) {
    const before = f.writes.length;
    f.reply({...active, ...payload});
    t.mock.timers.tick(2000);
    assert.equal(f.writes.length, before + 1);
    assert.equal(f.writes.at(-1).value, ordinaryOn);
  }
  assert.deepEqual(f.reports, []);
});

test('missing, malformed and contradictory replies cannot confirm ON', async t => {
  const f = await setup(t);
  for (const payload of [undefined, [], {subscribed: true}, {state: 'Active'},
    {...active, returnValue: false}, {...active, returnValue: 'true'},
    {...active, errorText: 'failure'}, {...active, errorCode: 500},
    {...active, state: 1}, {...active, processing: {}}, {...active, processing: false},
    {...active, processing: ' '}, {...active, errorText: 1}]) {
    f.reply(payload);
  }
  f.reply(active, new Error('not connected'));
  assert.deepEqual(f.reports, []);
  f.reply(active);
  assert.deepEqual(f.reports[0].tokens, {confirmedAt: start});
});

test('a close invalidates the old subscription when the same client reconnects', async t => {
  const f = await setup(t);
  const oldReply = f.subscriptions[0];
  oldReply(null, active);
  f.client.emit('close');
  f.client.emit('connect');
  t.mock.timers.tick(200);
  oldReply(null, active);
  assert.equal(f.reports.length, 1);
  f.reply({...active, processing: null});
  t.mock.timers.tick(50);
  f.reply({...active, processing: ''});
  assert.deepEqual(f.reports.map(report => report.tokens.confirmedAt), [start, start + 200, start + 250]);
});

test('client replacement, device stop and polling handoff suppress pending confirmations', async t => {
  const f = await setup(t);
  f.settings.usePoll = true;
  f.reply(active);
  f.settings.usePoll = false;
  f.device.lgtv = new EventEmitter();
  f.reply(active);
  f.device.lgtv = f.client;
  f.device.onUninit();
  f.reply(active);
  assert.deepEqual(f.reports, []);
});

test('Wake-on-LAN and polling mode do not produce a confirmation', async t => {
  const f = await setup(t, true);
  assert.equal(f.subscriptions.length, 0);
  f.device._turnOn = async () => true;
  await f.device.toggleOnOff(true);
  assert.equal(f.writes.at(-1).value, true);
  assert.deepEqual(f.reports, []);
});

test('throwing or rejecting Flow delivery does not block the ordinary ON update', async t => {
  const f = await setup(t);
  const failure = new Error('Flow dispatch failed');
  for (const trigger of [() => { throw failure; }, async () => { throw failure; }]) {
    f.powerCard.trigger = trigger;
    const before = f.writes.length;
    f.reply(active);
    await Promise.resolve();
    t.mock.timers.tick(2000);
    assert.equal(f.writes.length, before + 1);
    assert.equal(f.writes.at(-1).value, true);
  }
  assert.deepEqual(f.errors, [
    ['state report: confirmed power ON Flow', failure],
    ['state report: confirmed power ON Flow', failure],
  ]);
});
