'use strict';

const assert = require('assert');
const {
  SpecializedSocket,
  SpecializedSocketPool,
} = require('../drivers/webos_plus/lgtv2/specialized-socket');

(async () => {
  const timers = [];
  const cleared = [];
  const pool = new SpecializedSocketPool(15000, {
    setTimer(callback, delay) {
      const timer = {callback, delay};
      timers.push(timer);
      return timer;
    },
    clearTimer(timer) {
      cleared.push(timer);
    },
  });

  const wire = {
    messages: [],
    closes: 0,
    send(message) {
      this.messages.push(message);
    },
    close() {
      this.closes += 1;
    },
  };

  let completes;
  let opens = 0;
  const firstPromise = pool.acquire('remote', complete => {
    opens += 1;
    completes = complete;
  });
  const secondPromise = pool.acquire('remote', () => {
    opens += 1;
  });
  assert.strictEqual(opens, 1);

  let removed = 0;
  const socket = new SpecializedSocket(wire, () => {
    if (pool.remove('remote', socket)) removed += 1;
  });
  assert.strictEqual(completes(null, socket), true);
  assert.strictEqual(await firstPromise, socket);
  assert.strictEqual(await secondPromise, socket);
  assert.strictEqual(cleared.length, 1);

  socket.send('button', {name: 'BACK'});
  assert.deepStrictEqual(wire.messages, ['type:button\nname:BACK\n\n']);
  socket.markClosed();
  assert.strictEqual(socket.isOpen, false);
  assert.strictEqual(removed, 1);
  assert.throws(() => socket.send('button', {name: 'HOME'}), /closed/);

  const timeoutPromise = pool.acquire('timeout', () => {});
  timers[1].callback();
  await assert.rejects(timeoutPromise, /connection timeout/);

  let failComplete;
  const pending = pool.acquire('pending', complete => {
    failComplete = complete;
  });
  pool.closeAll(new Error('client disconnected'));
  await assert.rejects(pending, /client disconnected/);
  assert.strictEqual(failComplete(null, socket), false);

  console.log('Specialized-socket tests passed');
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
