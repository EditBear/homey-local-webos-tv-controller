'use strict';

const assert = require('assert');
const SubscriptionState = require('../drivers/webos_plus/webos/utils/subscription-state');

const state = new SubscriptionState(3);
assert.strictEqual(state.status, 'idle');

const first = state.begin();
assert.strictEqual(state.status, 'subscribing');
assert.strictEqual(state.begin(), null);
assert.strictEqual(state.fail(first), true);
assert.strictEqual(state.status, 'failed');
assert.strictEqual(state.canRetry(), true);

const second = state.begin();
assert.notStrictEqual(second, first);
assert.strictEqual(state.succeed(first), false);
assert.strictEqual(state.status, 'subscribing');
assert.strictEqual(state.succeed(second), true);
assert.strictEqual(state.status, 'active');
assert.strictEqual(state.begin(), null);

state.reset();
const retryOne = state.begin();
state.fail(retryOne);
const retryTwo = state.begin();
state.fail(retryTwo);
const retryThree = state.begin();
state.fail(retryThree);
assert.strictEqual(state.canRetry(), false);
assert.strictEqual(state.begin(), null);

state.resetFailures();
assert.strictEqual(state.canRetry(), true);
assert.notStrictEqual(state.begin(), null);

state.reset();
assert.strictEqual(state.status, 'idle');
assert.strictEqual(state.attempts, 0);

console.log('Subscription state tests passed');
