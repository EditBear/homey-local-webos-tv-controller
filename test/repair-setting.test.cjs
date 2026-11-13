'use strict';

const assert = require('node:assert/strict');
const Module = require('node:module');
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

function setup() {
  const device = new Device();
  const calls = [];
  const timers = [];
  device.homey = {setTimeout: callback => timers.push(callback)};
  device.lgtv = {disconnect: () => calls.push('disconnect')};
  device.log = () => {};
  device.error = error => assert.fail(String(error));
  device.setSettings = async values => calls.push(['setSettings', values]);
  device._forgetPairingKey = async () => calls.push('forget');
  device.construct = () => calls.push('construct');
  device._connect = () => calls.push('connect');
  device.initDevice = () => calls.push('init');
  const run = async () => { for (const timer of timers.splice(0)) await timer(); };
  return {device, calls, run};
}

const base = {ipAddress: '192.0.2.10', macAddress: 'AA:BB:CC:DD:EE:FF', usePoll: false, resetPairing: false};

test('ticking Re-pair forgets the key, unticks the box and reconnects', async () => {
  const {device, calls, run} = setup();
  await device.onSettings({oldSettings: base, newSettings: {...base, resetPairing: true}, changedKeys: ['resetPairing']});
  await run();
  assert.deepEqual(calls, ['disconnect', 'forget', ['setSettings', {resetPairing: false}], 'construct', 'connect', 'init']);
});

test('a new MAC address forgets the key, a re-formatted one does not', async () => {
  const changed = setup();
  await changed.device.onSettings({
    oldSettings: base, newSettings: {...base, macAddress: '11:22:33:44:55:66'}, changedKeys: ['macAddress']});
  await changed.run();
  assert.ok(changed.calls.includes('forget'));
  assert.ok(changed.calls.includes('connect'));

  const first = setup();
  await first.device.onSettings({
    oldSettings: {...base, macAddress: ''}, newSettings: {...base, macAddress: 'aa-bb-cc-dd-ee-ff'}, changedKeys: ['macAddress']});
  await first.run();
  assert.ok(first.calls.includes('forget'));

  const same = setup();
  await same.device.onSettings({
    oldSettings: base, newSettings: {...base, macAddress: 'aa:bb:cc:dd:ee:ff'}, changedKeys: ['macAddress']});
  await same.run();
  assert.deepEqual(same.calls.filter(call => call === 'forget' || call === 'connect'), []);

  const cleared = setup();
  await cleared.device.onSettings({
    oldSettings: base, newSettings: {...base, macAddress: ''}, changedKeys: ['macAddress']});
  await cleared.run();
  assert.deepEqual(cleared.calls, []);
});

test('an IP change reconnects without forgetting the key', async () => {
  const {device, calls, run} = setup();
  await device.onSettings({oldSettings: base, newSettings: {...base, ipAddress: '192.0.2.11'}, changedKeys: ['ipAddress']});
  await run();
  assert.deepEqual(calls, ['disconnect', 'construct', 'connect', 'init']);
});
