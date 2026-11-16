'use strict';

const assert = require('node:assert/strict');
const {EventEmitter} = require('node:events');
const Module = require('node:module');
const {resolve} = require('node:path');
const test = require('node:test');
const {attempts} = require(process.env.HOMEY_OFFLINE_BARRIER || './offline-barrier.cjs');

const packageDir = process.env.HOMEY_TEST_PACKAGE || resolve(__dirname, '..');
const app = require(resolve(packageDir, 'app.json'));
const wol = {wake() { assert.fail('Unexpected Wake-on-LAN'); }};
const load = Module._load;
let Device;
let Driver;
Module._load = function (name, ...args) {
  if (name === 'homey') return {Device: class {}, Driver: class {}};
  if (name === 'node-wol') return wol;
  return load.call(this, name, ...args);
};
try {
  Device = require(resolve(packageDir, 'drivers/webos_plus/device.js'));
  Driver = require(resolve(packageDir, 'drivers/webos_plus/driver.js'));
} finally {
  Module._load = load;
}

const firstId = 'test-webos-one';
const secondId = 'test-webos-two';
const firstAddress = '192.0.2.10';
const secondAddress = '192.0.2.11';
const newAddress = '192.0.2.12';
const macAddress = '02:00:00:00:00:01';
const discoveryTarget = 'urn:lge-com:service:webos-second-screen:1';

function discoveryResult(id, address) {
  return Object.assign(new EventEmitter(), {
    id, address, headers: {location: `http://${address}/description.xml`},
  });
}

function driverFixture(cached = []) {
  const strategy = new EventEmitter();
  strategy.getDiscoveryResults = () => Object.fromEntries(cached.map(result => [result.id, result]));
  const driver = new Driver();
  driver.homey = {
    discovery: {getStrategy(id) { assert.equal(id, 'webos'); return strategy; }},
  };
  driver.getDiscoveryStrategy = () => assert.fail('Driver-bound discovery should not be used');
  driver.error = (...args) => assert.fail(args.map(String).join(' '));
  driver.initTriggers = () => {};
  driver.initActions = () => {};
  driver.initConditions = () => {};
  return {driver, strategy};
}

function deviceFixture(t, driver, driverId = 'webos_plus') {
  const calls = [];
  const listeners = new Map();
  const settings = {ipAddress: firstAddress, macAddress, usePoll: false, manualIpAddress: false};
  const readPairingKey = 'offline-pairing-key';
  const device = new Device();
  let available = false;
  let on = false;

  const realLoad = Module._load;
  t.mock.method(Module, '_load', function (name, ...args) {
    if (name !== '../lgtv2/lgtv2') return realLoad.call(this, name, ...args);
    return ({host, clientKey}) => {
      calls.push(['connect', host, clientKey]);
      const client = new EventEmitter();
      client.advanceReconnect = address => { calls.push(['advance', address]); return true; };
      client.disconnect = () => calls.push(['disconnect', host]);
      return client;
    };
  });
  device.driver = {manifest: {id: driverId}};
  device.homey = {
    images: {async createImage() { return {setUrl() {}}; }},
    drivers: {getDriver(id) { assert.equal(id, 'webos_plus'); return driver; }},
  };
  device.setAlbumArtImage = () => {};
  device.getSettings = () => ({...settings});
  device.getData = () => ({id: firstId});
  device.getStoreValue = key => key === 'pairingKey' ? readPairingKey : undefined;
  device.hasCapability = () => true;
  device.getCapabilityValue = id => id === 'onoff' ? on : null;
  device.updateReportingTitles = async () => {};
  device.prepareInputSelect = async () => false;
  device.registerCapabilityListener = (id, listener) => listeners.set(id, listener);
  device.setAvailable = async () => { calls.push('available'); available = true; };
  device.setUnavailable = async () => { calls.push('unavailable'); available = false; };
  device.setSettings = async values => {
    calls.push(['setSettings', values]);
    Object.assign(settings, values);
  };
  device.setCapabilityValue = async (id, value) => {
    if (id === 'onoff') {
      calls.push(['capability', id, value]);
      on = value;
    }
  };
  device.log = () => {};
  device.error = (...args) => assert.fail(args.map(String).join(' '));
  return {device, calls, settings, readPairingKey, isAvailable: () => available, isOn: () => on,
    turnOn() {
      assert.equal(available, true, 'The SDK stub must have seen setAvailable before offering Turn on');
      return listeners.get('onoff')(true);
    }};
}

test('the existing drivers are unbound from discovery and retain the original app SSDP strategy', () => {
  const auto = app.drivers.find(driver => driver.id === 'webos_plus');
  const manual = app.drivers.find(driver => driver.id === 'webos_plus_manual');
  for (const driver of [auto, manual]) {
    assert.equal(Object.hasOwn(driver, 'discovery'), false);
    assert.ok(driver.capabilities.includes('onoff'));
  }
  assert.deepEqual(app.discovery.webos, {
    type: 'ssdp', ssdp: {search: discoveryTarget}, id: '{{headers.usn}}',
    conditions: [[{field: 'headers.st', match: {type: 'string', value: discoveryTarget}}]],
  });
});

test('the original pairing list uses cached standalone discovery and preserves the saved device shape', async t => {
  const cached = [discoveryResult(`uuid:${firstId}`, firstAddress), discoveryResult(secondId, secondAddress)];
  const {driver, strategy} = driverFixture(cached);
  t.mock.method(Driver, '_getInfo', async location => {
    assert.ok(cached.some(result => result.headers.location === location));
    return location === cached[0].headers.location ? {friendlyName: 'Test Lounge TV'} : {};
  });
  driver.homey.arp = {async getMAC(address) {
    assert.ok(cached.some(result => result.address === address));
    return macAddress;
  }};

  assert.deepEqual(await driver.onPairListDevices(), [
    {name: 'Test Lounge TV', data: {id: firstId}, settings: {macAddress, ipAddress: firstAddress}},
    {name: secondAddress, data: {id: secondId}, settings: {macAddress, ipAddress: secondAddress}},
  ]);
  assert.equal(strategy.listenerCount('result'), 0);
  assert.equal(cached[0].id, `uuid:${firstId}`);
});

test('standalone discovery routes fresh events to matching devices and cleans up replaced results', () => {
  const firstCached = discoveryResult(`uuid:${firstId}`, firstAddress);
  const secondCached = discoveryResult(secondId, secondAddress);
  const {driver, strategy} = driverFixture([firstCached, secondCached]);
  const first = [];
  const second = [];
  const stopFirst = driver.watchDiscovery(firstId, result => first.push([result.id, result.address]));
  const stopSecond = driver.watchDiscovery(secondId, result => second.push([result.id, result.address]));

  assert.equal(strategy.listenerCount('result'), 1);
  assert.deepEqual(first, []);
  assert.deepEqual(second, []);

  // An event can carry a newer result snapshot than the object we subscribed to.
  firstCached.emit('addressChanged', discoveryResult(firstCached.id, newAddress));
  secondCached.emit('lastSeenChanged', secondCached);
  secondCached.emit('addressChanged', discoveryResult(firstCached.id, newAddress));
  strategy.emit('result', discoveryResult('uuid:unrelated-tv', firstAddress));
  assert.deepEqual(first, [[`uuid:${firstId}`, newAddress]]);
  assert.deepEqual(second, [[secondId, secondAddress]]);

  const replacement = discoveryResult(firstId, firstAddress);
  strategy.emit('result', replacement);
  assert.deepEqual(first, [[`uuid:${firstId}`, newAddress], [firstId, firstAddress]]);
  assert.equal(firstCached.listenerCount('addressChanged'), 0);
  assert.equal(firstCached.listenerCount('lastSeenChanged'), 0);
  firstCached.emit('lastSeenChanged', firstCached);
  replacement.emit('lastSeenChanged', replacement);
  assert.equal(first.length, 3);

  stopFirst();
  assert.equal(strategy.listenerCount('result'), 1);
  assert.equal(replacement.listenerCount('lastSeenChanged'), 0);
  strategy.emit('result', replacement);
  secondCached.emit('lastSeenChanged', secondCached);
  assert.equal(first.length, 3);
  assert.equal(second.length, 2);
  stopSecond();
  assert.equal(strategy.listenerCount('result'), 0);
  assert.equal(secondCached.listenerCount('addressChanged'), 0);
  assert.equal(secondCached.listenerCount('lastSeenChanged'), 0);
});

test('driver shutdown removes all discovery listeners even before devices unsubscribe', () => {
  const cached = discoveryResult(firstId, firstAddress);
  const {driver, strategy} = driverFixture([cached]);
  const stop = driver.watchDiscovery(firstId, () => assert.fail('Stopped watcher was called'));
  assert.equal(strategy.listenerCount('result'), 1);

  driver.onUninit();
  stop();
  assert.equal(strategy.listenerCount('result'), 0);
  assert.equal(cached.listenerCount('addressChanged'), 0);
  assert.equal(cached.listenerCount('lastSeenChanged'), 0);
  strategy.emit('result', cached);
  cached.emit('lastSeenChanged', cached);
});

test('an offline standby startup with no discovery results registers the usual Turn on capability', async t => {
  const {driver, strategy} = driverFixture();
  const f = deviceFixture(t, driver);
  t.mock.method(wol, 'wake', (mac, callback) => {
    f.calls.push(['wake', mac]);
    callback(null);
  });

  await f.device.onInit();
  f.device.lgtv.emit('close');
  assert.equal(strategy.listenerCount('result'), 1);
  assert.equal(f.isAvailable(), true);
  assert.equal(f.isOn(), false);
  assert.deepEqual(f.calls, ['available', ['connect', firstAddress, f.readPairingKey]]);

  await f.turnOn();
  assert.deepEqual(f.calls.slice(-2), [['wake', macAddress], ['capability', 'onoff', true]]);
  f.device.onUninit();
  assert.equal(strategy.listenerCount('result'), 0);
  assert.deepEqual(attempts, []);
});

test('an automatic device ignores a stale cached address and processes a fresh matching result', async t => {
  const cached = discoveryResult(`uuid:${firstId}`, newAddress);
  const {driver, strategy} = driverFixture([cached]);
  const f = deviceFixture(t, driver);

  await f.device.onInit();
  assert.deepEqual(f.calls, ['available', ['connect', firstAddress, f.readPairingKey]]);
  const current = discoveryResult(firstId, firstAddress);
  strategy.emit('result', current);
  assert.deepEqual(f.calls.slice(2), [['advance', firstAddress]]);
  current.address = newAddress;
  current.emit('addressChanged', current);
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(f.settings.ipAddress, newAddress);
  assert.deepEqual(f.calls.slice(3), [
    ['setSettings', {ipAddress: newAddress}], ['disconnect', firstAddress],
    'available', ['connect', newAddress, f.readPairingKey],
  ]);
  assert.equal(f.isOn(), false);
  f.device.onDeleted();
  assert.equal(strategy.listenerCount('result'), 0);
  assert.equal(current.listenerCount('lastSeenChanged'), 0);
});

test('a manually paired device starts without subscribing to standalone discovery', async t => {
  const {driver, strategy} = driverFixture([discoveryResult(firstId, newAddress)]);
  const f = deviceFixture(t, driver, 'webos_plus_manual');
  f.settings.manualIpAddress = true;
  await f.device.onInit();

  assert.equal(strategy.listenerCount('result'), 0);
  strategy.emit('result', discoveryResult(firstId, newAddress));
  assert.deepEqual(f.calls, ['available', ['connect', firstAddress, f.readPairingKey]]);
  assert.equal(f.settings.ipAddress, firstAddress);
  assert.equal(f.isOn(), false);
  f.device.onDeleted();
});
