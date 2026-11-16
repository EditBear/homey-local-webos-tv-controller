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

const id = 'saved-tv';
const IP = '192.0.2.10';
const NEXT = '192.0.2.11';
const NEWEST = '192.0.2.12';
const result = (address = IP) => ({id: 'uuid:' + id, address});

function setup(settings = {}) {
  const device = new Device();
  const calls = [];
  const state = {ipAddress: IP, manualIpAddress: false, ...settings};
  const client = {
    advanceReconnect(address) {
      assert.equal(this, client);
      calls.push(['advance', address]);
      return true;
    },
    disconnect() { calls.push('disconnect'); },
  };
  device.lgtv = client;
  device.getSettings = () => ({...state});
  device.getData = () => ({id});
  device.setSettings = async values => {
    calls.push(['setSettings', values]);
    Object.assign(state, values);
  };
  device.construct = () => { device.lgtv = null; };
  device._connect = () => {
    calls.push(['connect', state.ipAddress]);
    device.lgtv = {};
  };
  device.initDevice = () => calls.push('attach reporting');
  device.log = () => {};
  device.error = error => assert.fail(String(error));
  return {device, client, state, calls};
}

test('matching same-address discovery uses the existing scheduler in both address modes', () => {
  for (const manualIpAddress of [false, true]) {
    const {device, client, calls} = setup({manualIpAddress});
    device.handleDiscoveryResult(Object.freeze(result()));
    assert.equal(device.lgtv, client);
    assert.deepEqual(calls, [['advance', IP]]);
  }
});

test('foreign, malformed and placeholder discoveries have no side effects', () => {
  const {device, calls} = setup();
  for (const bad of [
    undefined, null, {},
    {id: 'uuid:other-tv', address: IP},
    {id: 'prefixuuid:' + id, address: IP},
    {id: null, address: IP},
    ...[null, '', 'bad-address', '0.0.0.0', '::'].map(address => ({id, address})),
  ]) device.handleDiscoveryResult(bad);
  assert.deepEqual(calls, []);
});

test('a confirmed IP change retires the old client and attaches reporting to the replacement', async () => {
  const {device, client, calls} = setup();
  const first = device.handleDiscoveryResult(result(NEXT));
  const duplicate = device.handleDiscoveryResult(result(NEXT));
  await Promise.all([first, duplicate]);
  assert.notEqual(device.lgtv, client);
  assert.deepEqual(calls, [['setSettings', {ipAddress: NEXT}], 'disconnect', ['connect', NEXT], 'attach reporting']);
});

test('automatic discovery never changes a fixed IP or advances a retry at another IP', () => {
  const {device, calls} = setup({manualIpAddress: true});
  device.handleDiscoveryResult(result(NEXT));
  assert.deepEqual(calls, []);
});

test('a queued second address replaces the first without opening a client at the obsolete address', async () => {
  const {device, calls} = setup();
  const first = device.handleDiscoveryResult(result(NEXT));
  const latest = device.handleDiscoveryResult(result(NEWEST));
  await Promise.all([first, latest]);
  assert.deepEqual(calls, [
    ['setSettings', {ipAddress: NEXT}], ['setSettings', {ipAddress: NEWEST}],
    'disconnect', ['connect', NEWEST], 'attach reporting',
  ]);
});

test('a stopped device ignores a fresh discovery and drops any queued address write', async () => {
  const {device, calls} = setup();
  const first = device.handleDiscoveryResult(result(NEXT));
  const latest = device.handleDiscoveryResult(result(NEWEST));
  device.onDeleted();
  device.handleDiscoveryResult(result());
  await Promise.all([first, latest]);
  assert.deepEqual(calls, [['setSettings', {ipAddress: NEXT}]]);
});

test('a queued automatic change respects a fixed IP override saved while it was waiting', async () => {
  const {device, state, calls} = setup();
  const first = device.handleDiscoveryResult(result(NEXT));
  const latest = device.handleDiscoveryResult(result(NEWEST));
  state.manualIpAddress = true;
  state.ipAddress = IP;
  await Promise.all([first, latest]);
  assert.equal(state.ipAddress, IP);
  assert.deepEqual(calls, [['setSettings', {ipAddress: NEXT}]]);
});
