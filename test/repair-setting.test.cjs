'use strict';

const assert = require('node:assert/strict');
const Module = require('node:module');
const net = require('node:net');
const path = require('node:path');
const test = require('node:test');

const packageDir = process.env.HOMEY_TEST_PACKAGE || path.join(__dirname, '..');
const load = Module._load;
Module._load = function(name, ...args) {
  if (name === 'homey') return {Device: class {}};
  return load.call(this, name, ...args);
};
const Device = require(path.join(packageDir, 'drivers/webos_plus/device.js'));
Module._load = load;

const base = {ipAddress: '192.0.2.10', macAddress: 'AA:BB:CC:DD:EE:FF', usePoll: false, resetPairing: false};

function setup(settings = base) {
  const device = new Device();
  const calls = [];
  const timers = [];
  let saved = {...settings};
  device.homey = {setTimeout: callback => timers.push(callback)};
  device.lgtv = {disconnect: () => calls.push('disconnect')};
  device.log = () => {};
  device.error = error => assert.fail(String(error));
  device.getSettings = () => saved;
  device.setSettings = async values => {
    calls.push(['setSettings', values]);
    saved = {...saved, ...values};
  };
  device._forgetPairingKey = async () => calls.push('forget');
  device.construct = () => calls.push('construct');
  device._connect = () => calls.push('connect');
  device.initDevice = () => calls.push('init');
  const save = async (changes, changedKeys = Object.keys(changes)) => {
    const newSettings = {...saved, ...changes};
    await device.onSettings({oldSettings: saved, newSettings, changedKeys});
    saved = newSettings;
  };
  const run = async () => { for (const timer of timers.splice(0)) await timer(); };
  return {device, calls, save, run};
}

function deferred() {
  let resolve;
  const promise = new Promise(done => { resolve = done; });
  return {promise, resolve};
}

test('explicitly ticking Re-pair consumes the checkbox, forgets the key and reconnects once', async () => {
  const {device, calls, save, run} = setup();
  await save({resetPairing: true});
  assert.deepEqual(calls, []);
  await run();
  assert.equal(device.getSettings().resetPairing, false);
  assert.deepEqual(calls, [['setSettings', {resetPairing: false}], 'disconnect', 'forget', 'construct', 'connect', 'init']);
  await save({macAddress: '11:22:33:44:55:66'});
  await run();
  assert.equal(calls.filter(call => call === 'forget').length, 1);
});

test('adding, replacing, reformatting and clearing a Wake-on-LAN MAC preserve pairing', async () => {
  const {calls, save, run} = setup({...base, macAddress: ''});
  for (const macAddress of ['aa-bb-cc-dd-ee-ff', 'aa:bb:cc:dd:ee:ff', '11:22:33:44:55:66', '']) {
    await save({macAddress});
    await run();
  }
  await assert.rejects(save({macAddress: 'broken'}), /MAC address/);
  assert.deepEqual(calls, []);
});

test('an old checked value or a withdrawn request cannot delete a key', async () => {
  const stale = setup({...base, resetPairing: true});
  await stale.save({ipAddress: '192.0.2.11'});
  await stale.run();
  assert.deepEqual(stale.calls, ['disconnect', 'construct', 'connect', 'init']);

  const withdrawn = setup();
  await withdrawn.save({resetPairing: true});
  await withdrawn.save({resetPairing: false});
  await withdrawn.run();
  assert.deepEqual(withdrawn.calls, []);
});

test('an IP or unsigned opt-in edit reconnects without forgetting the key', async () => {
  const {calls, save, run} = setup();
  await assert.rejects(save({ipAddress: 'tv.local'}), /valid IPv4/);
  await save({ipAddress: '192.0.2.11'});
  await run();
  await save({allowUnsignedPairing: true});
  await run();
  assert.deepEqual(calls, ['disconnect', 'construct', 'connect', 'init', 'disconnect', 'construct', 'connect', 'init']);
});

test('re-pair waits for an in-flight key write before unsetting the existing key', async () => {
  const device = new Device();
  const calls = [];
  let wroteKey;
  device._pairingKeyWrite = new Promise(resolve => { wroteKey = resolve; });
  device.log = () => {};
  device.unsetStoreValue = async key => calls.push(key);
  const forgetting = device._forgetPairingKey();
  await Promise.resolve();
  assert.deepEqual(calls, []);
  wroteKey();
  await forgetting;
  assert.deepEqual(calls, ['pairingKey']);
});

test('failed checkbox save leaves the current connection and key intact', async () => {
  const {device, calls, save, run} = setup();
  const failure = new Error('settings write failed');
  device.setSettings = async () => { throw failure; };
  device.error = (...args) => calls.push(args);
  await save({resetPairing: true});
  await run();
  assert.deepEqual(calls, [['onSettings: could not apply the connection settings', failure]]);
});

test('discovery writes crossing re-pair preserve the latest address and open only after removing the key', async () => {
  const {device, calls, save, run} = setup();
  const startedDeleting = deferred();
  const allowDelete = deferred();
  const firstWrite = deferred();
  const startedLatestWrite = deferred();
  const latestWrite = deferred();
  const firstAddress = '192.0.2.11';
  const latestAddress = base.ipAddress;
  const originalSetSettings = device.setSettings;
  let key = 'old key';
  device.setAvailable = () => {};
  device.getData = () => ({id: 'fixture-tv'});
  device.setSettings = async values => {
    if (values.ipAddress === firstAddress) await firstWrite.promise;
    if (values.ipAddress === latestAddress) {
      startedLatestWrite.resolve();
      await latestWrite.promise;
    }
    await originalSetSettings(values);
  };
  device._forgetPairingKey = async () => {
    calls.push('start forget');
    startedDeleting.resolve();
    await allowDelete.promise;
    key = null;
    calls.push('finish forget');
  };
  device._connect = () => calls.push(['connect', device.getSettings().ipAddress, key]);

  await device.onDiscoveryAvailable({id: 'fixture-tv', address: firstAddress});
  await save({resetPairing: true});
  const repaired = run();
  await startedDeleting.promise;
  await device.onDiscoveryAddressChanged({id: 'fixture-tv', address: latestAddress});

  allowDelete.resolve();
  firstWrite.resolve();
  await startedLatestWrite.promise;
  assert.ok(calls.every(call => !Array.isArray(call) || call[0] !== 'connect'));
  latestWrite.resolve();
  await repaired;
  assert.deepEqual(calls, [
    ['setSettings', {resetPairing: false}], 'disconnect', 'start forget',
    'finish forget', ['setSettings', {ipAddress: firstAddress}],
    ['setSettings', {ipAddress: latestAddress}], 'construct', ['connect', latestAddress, null], 'init',
  ]);
});

test('old poll callbacks and an overlapping poll setting cannot replace the re-pair connection', async t => {
  const {device, calls, save, run} = setup({...base, usePoll: true, pollTimeout: 1});
  const probes = [];
  t.mock.method(net.Socket.prototype, 'connect', (_port, _host, onConnect) => { probes.push(onConnect); });
  let pollTick;
  t.mock.method(global, 'setInterval', callback => { pollTick = callback; });
  device.getCapabilityValue = () => false;
  device.setCapabilityValue = async () => calls.push('publish power');
  const startedDeleting = deferred();
  const allowDelete = deferred();
  device._forgetPairingKey = async () => {
    calls.push('start forget');
    startedDeleting.resolve();
    await allowDelete.promise;
    calls.push('finish forget');
  };
  device._connect = () => {
    device.lgtv = {disconnect: () => calls.push('disconnect replacement')};
    calls.push('connect');
  };
  device.poll();
  pollTick();
  pollTick();
  assert.equal(probes.length, 2);

  await save({resetPairing: true});
  const repaired = run();
  await startedDeleting.promise;
  pollTick();
  assert.equal(probes.length, 2);
  probes[0]();
  await save({usePoll: false});
  assert.deepEqual(calls, [['setSettings', {resetPairing: false}], 'disconnect', 'start forget']);

  allowDelete.resolve();
  await repaired;
  probes[1]();
  assert.deepEqual(calls, [
    ['setSettings', {resetPairing: false}], 'disconnect', 'start forget',
    'finish forget', 'construct', 'connect', 'init',
  ]);
});
