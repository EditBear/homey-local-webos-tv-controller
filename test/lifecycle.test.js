'use strict';

const assert = require('assert');
const {
  LifecycleState,
  SerialTaskQueue,
} = require('../drivers/webos_plus/webos/utils/lifecycle');

async function run() {
  const lifecycle = new LifecycleState();
  const firstClient = {};
  const secondClient = {};
  const firstGeneration = lifecycle.begin();

  assert.strictEqual(lifecycle.isCurrent(firstClient, firstClient, firstGeneration), true);
  assert.strictEqual(lifecycle.isGeneration(firstGeneration), true);
  const secondGeneration = lifecycle.begin();
  assert.strictEqual(lifecycle.isCurrent(firstClient, secondClient, firstGeneration), false);
  assert.strictEqual(lifecycle.isGeneration(firstGeneration), false);
  assert.strictEqual(lifecycle.isCurrent(secondClient, secondClient, secondGeneration), true);

  lifecycle.stop();
  assert.strictEqual(lifecycle.isGeneration(secondGeneration), false);
  assert.strictEqual(lifecycle.isCurrent(secondClient, secondClient, secondGeneration), false);
  assert.strictEqual(lifecycle.begin(), null);

  const queue = new SerialTaskQueue();
  const order = [];
  const first = queue.run(async () => {
    order.push('first-start');
    await new Promise(resolve => setImmediate(resolve));
    order.push('first-end');
  });
  const second = queue.run(async () => {
    order.push('second');
  });
  await Promise.all([first, second]);
  assert.deepStrictEqual(order, ['first-start', 'first-end', 'second']);

  const recovered = new SerialTaskQueue();
  await assert.rejects(recovered.run(async () => {
    throw new Error('expected');
  }), /expected/);
  await recovered.run(async () => {
    order.push('after-failure');
  });
  assert.strictEqual(order.at(-1), 'after-failure');

  console.log('Lifecycle and reconnect-queue tests passed');
}

run().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
