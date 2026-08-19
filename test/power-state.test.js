'use strict';

const assert = require('assert');
const {
  classifyPowerState,
  normalisePowerStateTimeout,
} = require('../drivers/webos_plus/webos/utils/power-state');

for (const state of ['active', 'screen saver', 'screen off', ' ACTIVE ']) {
  assert.strictEqual(classifyPowerState({state}), true, `${state} must be on`);
}

for (const state of ['standby', 'suspend', 'off']) {
  assert.strictEqual(classifyPowerState({state}), false, `${state} must be off`);
}

for (const processing of ['power on', 'ready', 'resume', 'screen saver']) {
  assert.strictEqual(classifyPowerState({state: 'standby', processing}), true, `${processing} must be on`);
}

for (const processing of ['standby', 'suspend', 'power off']) {
  assert.strictEqual(classifyPowerState({state: 'active', processing}), false, `${processing} must be off`);
}

assert.strictEqual(classifyPowerState(null), null);
assert.strictEqual(classifyPowerState({}), null);
assert.strictEqual(classifyPowerState({state: ''}), null);
assert.strictEqual(classifyPowerState({state: 'active', processing: 'unknown transition'}), null);
assert.strictEqual(classifyPowerState({state: 'active', processing: 'transition to power off'}), false);

assert.strictEqual(normalisePowerStateTimeout(0), 0);
assert.strictEqual(normalisePowerStateTimeout(2000), 2000);
assert.strictEqual(normalisePowerStateTimeout('3000'), 3000);
assert.strictEqual(normalisePowerStateTimeout(-1), 2000);
assert.strictEqual(normalisePowerStateTimeout('invalid'), 2000);

console.log('Power-state tests passed');
