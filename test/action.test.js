'use strict';

const assert = require('assert');
const {runDeviceAction} = require('../drivers/webos_plus/webos/utils/action');

(async () => {
  let completed = false;
  const result = await runDeviceAction(async () => {
    completed = true;
  });
  assert.strictEqual(completed, true);
  assert.strictEqual(result, true);

  const expectedError = new Error('LG command failed');
  await assert.rejects(
    runDeviceAction(async () => {
      throw expectedError;
    }),
    error => error === expectedError,
  );

  console.log('Action propagation tests passed');
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
