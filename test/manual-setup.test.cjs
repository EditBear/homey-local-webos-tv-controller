'use strict';

const assert = require('node:assert/strict');
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
