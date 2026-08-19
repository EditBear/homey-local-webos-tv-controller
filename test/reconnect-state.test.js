'use strict';

const assert = require('assert');
const ReconnectState = require('../drivers/webos_plus/lgtv2/reconnect-state');

const timers = [];
const cleared = [];
const state = new ReconnectState(5000, {
  setTimer(callback, delay) {
    const timer = {callback, delay};
    timers.push(timer);
    return timer;
  },
  clearTimer(timer) {
    cleared.push(timer);
  },
});

assert.strictEqual(state.beginConnection(), true);
assert.strictEqual(state.beginConnection(), false);
state.connectionSettled();
assert.strictEqual(state.schedule(() => {}), true);
assert.strictEqual(state.schedule(() => {}), false);
assert.strictEqual(state.scheduled, true);
assert.strictEqual(timers[0].delay, 5000);

state.connected();
assert.strictEqual(state.scheduled, false);
assert.strictEqual(cleared.length, 1);

let reconnects = 0;
assert.strictEqual(state.schedule(() => { reconnects += 1; }), true);
timers[1].callback();
assert.strictEqual(reconnects, 1);
assert.strictEqual(state.scheduled, false);

assert.strictEqual(state.beginConnection(), true);
state.stop();
assert.strictEqual(state.stopped, true);
assert.strictEqual(state.beginConnection(), false);
assert.strictEqual(state.schedule(() => { reconnects += 1; }), false);

state.start();
assert.strictEqual(state.stopped, false);
assert.strictEqual(state.beginConnection(), true);

const noRetry = new ReconnectState(0);
assert.strictEqual(noRetry.schedule(() => {}), false);

console.log('Reconnect-state tests passed');
