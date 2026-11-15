'use strict';

const assert = require('node:assert/strict');
const {EventEmitter} = require('node:events');
const Module = require('node:module');
const {isIPv4} = require('node:net');
const path = require('node:path');
const test = require('node:test');

const packageDir = process.env.HOMEY_TEST_PACKAGE || path.join(__dirname, '..');
const {normalizeMacAddress, isUsableIpv4, parseManualInput} =
  require(path.join(packageDir, 'drivers/webos_plus/webos/utils/manual-setup.js'));

test('MAC addresses are normalised or rejected', () => {
  assert.equal(normalizeMacAddress(''), '');
  assert.equal(normalizeMacAddress(undefined), '');
  assert.equal(normalizeMacAddress('aa-bb-cc-dd-ee-ff'), 'AA:BB:CC:DD:EE:FF');
  assert.equal(normalizeMacAddress('aabb.ccdd.eeff'), 'AA:BB:CC:DD:EE:FF');
  assert.equal(normalizeMacAddress('AA:BB:CC:DD:EE'), null);
  assert.equal(normalizeMacAddress('AA:BB:CC:DD:EE:GG'), null);
});

test('IP addresses must be usable IPv4', () => {
  assert.equal(isUsableIpv4('192.168.1.50'), true);
  for (const bad of ['0.0.0.0', '127.0.0.1', '::1', 'tv.local', '192.168.1', '']) {
    assert.equal(isUsableIpv4(bad), false, bad);
  }
});

test('manual input parsing', () => {
  assert.equal(parseManualInput({ipAddress: '  '}), null);
  assert.deepEqual(parseManualInput({ipAddress: ' 192.168.1.50 ', macAddress: ''}),
    {ipAddress: '192.168.1.50', macAddress: ''});
  assert.deepEqual(parseManualInput({ipAddress: '192.168.1.50', macAddress: 'aa:bb:cc:dd:ee:ff'}),
    {ipAddress: '192.168.1.50', macAddress: 'AA:BB:CC:DD:EE:FF'});
  assert.throws(() => parseManualInput({ipAddress: 'nope'}), /valid IPv4/);
  assert.throws(() => parseManualInput({ipAddress: '192.168.1.50', macAddress: '12'}), /MAC address/);
});

function setupManualPairing(reachablePort) {
  const attempts = [];
  class MockSocket extends EventEmitter {
    setTimeout(timeout) { this.timeout = timeout; }
    connect(port, host) {
      attempts.push({port, host, timeout: this.timeout});
      if (port === reachablePort) this.emit('connect');
      else this.emit('timeout');
    }
    destroy() {}
  }
  const driverPath = path.join(packageDir, 'drivers/webos_plus_manual/driver.js');
  const setupPath = path.join(packageDir, 'drivers/webos_plus/webos/utils/manual-setup.js');
  delete require.cache[require.resolve(driverPath)];
  delete require.cache[require.resolve(setupPath)];
  const load = Module._load;
  Module._load = function(name, ...args) {
    if (name === 'homey') return {Driver: class {}};
    if (name === 'net') return {isIPv4, Socket: MockSocket};
    return load.call(this, name, ...args);
  };
  let Driver;
  try {
    Driver = require(driverPath);
  } finally {
    Module._load = load;
  }
  return {driver: new Driver(), attempts};
}

test('manual pairing prefers 3001 with a bounded 3000 fallback on the explicitly entered address', async () => {
  for (const reachablePort of [3001, 3000, null]) {
    const {driver, attempts} = setupManualPairing(reachablePort);
    const handlers = new Map();
    await driver.onPair({setHandler(name, handler) { handlers.set(name, handler); }});
    await handlers.get('manual_ip')({ipAddress: '192.0.2.10'});

    if (reachablePort === null) {
      await assert.rejects(handlers.get('list_devices')(), /ports 3001 or 3000/);
    } else {
      assert.deepEqual(await handlers.get('list_devices')(), [{
        name: 'LG webOS TV (192.0.2.10)',
        data: {id: 'manual-192.0.2.10'},
        settings: {macAddress: '', ipAddress: '192.0.2.10', manualIpAddress: true},
      }]);
    }
    assert.deepEqual(attempts, (reachablePort === 3001 ? [3001] : [3001, 3000])
      .map(port => ({port, host: '192.0.2.10', timeout: 2000})));
  }
});
