'use strict';

const assert = require('assert');
const {
  CallbackRegistry,
  createCorrelationIdFactory,
} = require('../drivers/webos_plus/lgtv2/request-state');

const scheduled = [];
const cleared = [];
const registry = new CallbackRegistry({
  setTimer(callback, delay) {
    const timer = {callback, delay};
    scheduled.push(timer);
    return timer;
  },
  clearTimer(timer) {
    cleared.push(timer);
  },
});

const events = [];
registry.addOneShot('request-1', (error, result) => events.push({error, result}), 15000, 'request');
assert.strictEqual(registry.size, 1);
assert.strictEqual(scheduled[0].delay, 15000);
assert.strictEqual(registry.dispatch('request-1', null, {ok: true}), true);
assert.strictEqual(registry.size, 0);
assert.strictEqual(cleared.length, 1);
assert.deepStrictEqual(events, [{error: null, result: {ok: true}}]);
assert.strictEqual(registry.dispatch('request-1', null, {late: true}), false);

registry.addOneShot('request-2', error => events.push({timeout: error.message}), 100, 'registration');
scheduled[1].callback();
assert.strictEqual(registry.size, 0);
assert.deepStrictEqual(events[1], {timeout: 'registration timeout'});

const registrationEvents = [];
registry.addUntil(
  'registration-1',
  (error, result) => registrationEvents.push({error, result}),
  60000,
  'registration',
  (error, result) => Boolean(error || (result && result['client-key'])),
);
assert.strictEqual(registry.dispatch('registration-1', null, {pairingType: 'PROMPT'}), true);
assert.strictEqual(registry.size, 1);
assert.strictEqual(cleared.length, 1);
assert.deepStrictEqual(registrationEvents, [{
  error: null,
  result: {pairingType: 'PROMPT'},
}]);
assert.strictEqual(registry.dispatch('registration-1', null, {'client-key': 'accepted-key'}), true);
assert.strictEqual(registry.size, 0);
assert.strictEqual(cleared.length, 2);
assert.deepStrictEqual(registrationEvents[1], {
  error: null,
  result: {'client-key': 'accepted-key'},
});
assert.strictEqual(registry.dispatch('registration-1', null, {'client-key': 'late-key'}), false);

registry.addPersistent('subscription-1', error => events.push({subscription: error && error.message}));
registry.addOneShot('request-3', error => events.push({request: error && error.message}), 500, 'request');
registry.failAll(new Error('connection closed'));
assert.strictEqual(registry.size, 0);
assert.deepStrictEqual(events.slice(2), [
  {subscription: 'connection closed'},
  {request: 'connection closed'},
]);

const getId = createCorrelationIdFactory('client-');
assert.strictEqual(getId(), 'client-0000');
assert.strictEqual(getId(), 'client-0001');
for (let index = 2; index <= 0x10000; index += 1) getId();
assert.strictEqual(getId(), 'client-10001');

console.log('Request-state tests passed');
