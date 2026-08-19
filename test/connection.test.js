'use strict';

const assert = require('assert');
const EventEmitter = require('events');
const {
  DEFAULT_DISCONNECT_OFF_GRACE_MS,
  DisconnectOffGuard,
  bindCurrentConnection,
} = require('../drivers/webos_plus/webos/utils/connection');

const firstClient = new EventEmitter();
const secondClient = new EventEmitter();
let currentClient = firstClient;
const received = [];

function bind(client) {
  bindCurrentConnection(client, {
    isCurrent: candidate => candidate === currentClient,
    onConnect: () => received.push(`${client.name}:connect`),
    onClose: () => received.push(`${client.name}:close`),
    onError: error => received.push(`${client.name}:error:${error.message}`),
  });
}

firstClient.name = 'first';
secondClient.name = 'second';
bind(firstClient);
bind(secondClient);

firstClient.emit('connect');
assert.deepStrictEqual(received, ['first:connect']);

currentClient = secondClient;
firstClient.emit('close');
firstClient.emit('error', new Error('stale'));
assert.deepStrictEqual(received, ['first:connect']);

secondClient.emit('connect');
secondClient.emit('error', new Error('current'));
secondClient.emit('close');
assert.deepStrictEqual(received, [
  'first:connect',
  'second:connect',
  'second:error:current',
  'second:close',
]);

const scheduled = [];
const cleared = [];
const guard = new DisconnectOffGuard({
  setTimer(callback, delay) {
    const timer = {callback, delay};
    scheduled.push(timer);
    return timer;
  },
  clearTimer(timer) {
    cleared.push(timer);
  },
});
let inferredOffs = 0;

assert.strictEqual(guard.pending, false);
assert.strictEqual(guard.schedule(() => { inferredOffs += 1; }), true);
assert.strictEqual(guard.schedule(() => { inferredOffs += 100; }), false);
assert.strictEqual(guard.pending, true);
assert.strictEqual(scheduled.length, 1);
assert.strictEqual(scheduled[0].delay, DEFAULT_DISCONNECT_OFF_GRACE_MS);

// An authoritative LG power response inside the grace period must preserve the
// last known state and suppress the inferred off. A socket connection alone is
// deliberately not sufficient proof of television power.
assert.strictEqual(guard.cancel(), true);
assert.strictEqual(guard.pending, false);
assert.deepStrictEqual(cleared, [scheduled[0]]);
assert.strictEqual(inferredOffs, 0);
assert.strictEqual(guard.cancel(), false);

// A connection that remains down beyond the grace period infers off once.
assert.strictEqual(guard.schedule(() => { inferredOffs += 1; }), true);
assert.strictEqual(scheduled.length, 2);
scheduled[1].callback();
assert.strictEqual(inferredOffs, 1);
assert.strictEqual(guard.pending, false);

// A callback captured by an obsolete connection generation must not infer an
// off state after the client has been replaced.
let currentGeneration = 1;
assert.strictEqual(guard.schedule(() => {
  if (currentGeneration === 1) inferredOffs += 1;
}), true);
currentGeneration = 2;
scheduled[2].callback();
assert.strictEqual(inferredOffs, 1);
assert.strictEqual(guard.pending, false);

assert.throws(() => new DisconnectOffGuard({delayMs: -1}), /non-negative/);
assert.throws(() => guard.schedule(null), /must be a function/);

console.log('Connection lifecycle tests passed');
