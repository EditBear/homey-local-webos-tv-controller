'use strict';

const assert = require('assert');
const {validateDeviceSettings} = require('../drivers/webos_plus/webos/utils/settings');

const defaults = {
  manualIpAddress: false,
  ipAddress: '0.0.0.0',
  usePoll: false,
  pollInterval: 10,
  pollTimeout: 8,
};

assert.strictEqual(validateDeviceSettings(defaults), true);
assert.strictEqual(validateDeviceSettings({
  ...defaults,
  manualIpAddress: true,
  ipAddress: '192.168.1.8',
}), true);
assert.throws(() => validateDeviceSettings({
  ...defaults,
  manualIpAddress: true,
  ipAddress: 'not-an-ip',
}), /valid television IP address/);
assert.throws(() => validateDeviceSettings({
  ...defaults,
  manualIpAddress: true,
}), /valid television IP address/);
assert.strictEqual(validateDeviceSettings({
  ...defaults,
  usePoll: true,
}), true);
assert.throws(() => validateDeviceSettings({
  ...defaults,
  usePoll: true,
  pollTimeout: 10,
}), /shorter than the polling interval/);
assert.throws(() => validateDeviceSettings({
  ...defaults,
  usePoll: true,
  pollTimeout: -1,
}), /zero or greater/);

console.log('Device-settings boundary tests passed');
