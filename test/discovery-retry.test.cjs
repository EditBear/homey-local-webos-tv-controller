'use strict';

const assert = require('node:assert/strict');
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
Module._load = load;

const tvId = 'saved-tv';
const ipAddress = '192.0.2.10';
const otherAddress = '192.0.2.11';

function setup(settings = {}, id = tvId) {
  const device = new Device();
  const calls = [];
  const client = {
    advanceReconnect(address) {
      assert.equal(this, client);
      assert.equal(address, ipAddress);
      calls.push('advance');
      return true;
    },
  };
  const currentSettings = {ipAddress, manualIpAddress: false, ...settings};
  device.lgtv = client;
  device.getSettings = () => ({...currentSettings});
  device.getData = () => ({id});
  device.setAvailable = async () => calls.push('available');
  device.setSettings = async values => {
    calls.push(['setSettings', values]);
    Object.assign(currentSettings, values);
  };
  device._connect = () => calls.push('connect');
  device.log = () => {};
  device.error = error => assert.fail(String(error));
  return {device, client, calls};
}

test('matching discovery has no side effects across two paired TVs', async () => {
  const first = setup();
  const second = setup({}, 'other-tv');
  const result = {id: 'uuid:' + tvId, address: ipAddress};

  assert.equal(first.device.onDiscoveryResult(result), true);
  assert.equal(second.device.onDiscoveryResult(result), false);
  assert.deepEqual(second.calls, []);
  assert.deepEqual(first.calls, []);
  assert.equal(result.id, 'uuid:' + tvId);

  await first.device.onDiscoveryAvailable(result);
  assert.deepEqual(first.calls, ['available', 'advance']);
  assert.deepEqual(second.calls, []);
});

test('discovery matching accepts unchanged bare and prefixed IDs on frozen results', () => {
  const {device, calls} = setup();
  for (const id of [tvId, 'uuid:' + tvId]) {
    assert.equal(device.onDiscoveryResult(Object.freeze({id, address: ipAddress})), true);
  }
  assert.deepEqual(calls, []);
});

test('discovery matching ignores missing and malformed IDs without changing availability', () => {
  const {device, calls} = setup();
  for (const result of [undefined, null, {}, {id: null}, {id: 5}, {id: ''}, {id: 'uuid:'}]) {
    assert.equal(device.onDiscoveryResult(result), false);
  }
  device.getData = () => ({id: ''});
  assert.equal(device.onDiscoveryResult({id: 'uuid:'}), false);
  assert.deepEqual(calls, []);
});

test('matching same-address discovery advances the original client in both address modes', async () => {
  for (const manualIpAddress of [false, true]) {
    const {device, client, calls} = setup({manualIpAddress});
    const result = {id: 'uuid:' + tvId, address: ipAddress};
    assert.equal(await device.onDiscoveryAvailable(result), true);
    assert.equal(device.lgtv, client);
    assert.deepEqual(calls, ['available', 'advance']);
    assert.equal(result.id, 'uuid:' + tvId);
  }
});

test('matching last-seen notifications use the same scheduler without opening a client', async () => {
  const {device, client, calls} = setup();
  const result = {id: tvId, address: ipAddress};
  assert.equal(await device.onDiscoveryLastSeenChanged(result), true);
  assert.equal(await device.onDiscoveryLastSeenChanged(result), true);
  assert.equal(device.lgtv, client);
  assert.deepEqual(calls, ['available', 'advance', 'available', 'advance']);
});

test('foreign and incomplete discoveries do not advance the saved client', async () => {
  const {device, calls} = setup({manualIpAddress: true});
  for (const result of [
    {id: 'uuid:other-tv', address: ipAddress},
    {id: 'prefixuuid:' + tvId, address: ipAddress},
    {address: ipAddress},
    {id: tvId, address: otherAddress},
    {id: tvId},
  ]) {
    assert.equal(await device.onDiscoveryAvailable(result), true);
    assert.equal(await device.onDiscoveryLastSeenChanged(result), true);
  }
  assert.equal(await device.onDiscoveryLastSeenChanged(undefined), true);
  assert.equal(calls.length, 11);
  assert.ok(calls.every(call => call === 'available'));
});

test('an unset or placeholder saved address does not advance the client', async () => {
  for (const address of [undefined, '', '0.0.0.0', '::', 'invalid-address']) {
    const {device, calls} = setup({ipAddress: address});
    const result = {id: tvId, address};
    assert.equal(await device.onDiscoveryAvailable(result), true);
    assert.equal(await device.onDiscoveryLastSeenChanged(result), true);
    assert.deepEqual(calls, ['available', 'available']);
  }
});

test('changed automatic addresses follow the existing update path in both callbacks', async () => {
  for (const callback of ['onDiscoveryAvailable', 'onDiscoveryAddressChanged']) {
    const {device, calls} = setup();
    assert.equal(await device[callback]({id: tvId, address: otherAddress}), true);
    assert.deepEqual(calls, ['available', ['setSettings', {ipAddress: otherAddress}], 'connect']);
  }
});

test('address-change callbacks leave a configured manual address alone', async () => {
  const {device, calls} = setup({manualIpAddress: true});
  assert.equal(await device.onDiscoveryAddressChanged({id: tvId, address: otherAddress}), true);
  assert.deepEqual(calls, ['available']);
});

test('stopped devices and devices without a client leave the scheduler alone', async () => {
  for (const stopped of [true, false]) {
    const {device, calls} = setup();
    if (stopped) device.onUninit();
    else device.lgtv = null;
    const result = {id: tvId, address: ipAddress};
    assert.equal(await device.onDiscoveryAvailable(result), true);
    assert.equal(await device.onDiscoveryLastSeenChanged(result), true);
    assert.deepEqual(calls, ['available', 'available']);
  }
  assert.deepEqual(attempts, []);
});
