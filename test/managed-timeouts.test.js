'use strict';

const assert = require('assert');
const ManagedTimeouts = require('../drivers/webos_plus/webos/utils/managed-timeouts');

const scheduled = [];
const cleared = [];
const timeouts = new ManagedTimeouts({
  setTimer(callback, delay) {
    const timer = {callback, delay};
    scheduled.push(timer);
    return timer;
  },
  clearTimer(timer) {
    cleared.push(timer);
  },
});

let calls = 0;
timeouts.schedule(() => { calls += 1; }, 1000);
timeouts.schedule(() => { calls += 1; }, 2000);
assert.strictEqual(timeouts.size, 2);
assert.deepStrictEqual(scheduled.map(timer => timer.delay), [1000, 2000]);

scheduled[0].callback();
assert.strictEqual(calls, 1);
assert.strictEqual(timeouts.size, 1);

timeouts.clearAll();
assert.strictEqual(timeouts.size, 0);
assert.deepStrictEqual(cleared, [scheduled[1]]);

console.log('Managed-timeout tests passed');
