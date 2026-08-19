'use strict';

const assert = require('assert');
const {createPairingKeyConfig} = require('../drivers/webos_plus/webos/utils/pairing-key');
const {store} = require('../drivers/webos_plus/webos/utils/constants');

async function save(config, key) {
  await new Promise((resolve, reject) => {
    config.saveKey(key, error => error ? reject(error) : resolve());
  });
}

async function run() {
  const writes = [];
  const device = {
    getStoreValue(name) {
      assert.strictEqual(name, store.pairingKey);
      return 'existing-key';
    },
    async setStoreValue(name, value) {
      writes.push({name, value});
    },
  };

  const config = createPairingKeyConfig(device);
  assert.strictEqual(config.clientKey, 'existing-key');

  await save(config, 'replacement-key');
  assert.deepStrictEqual(writes, [{
    name: store.pairingKey,
    value: 'replacement-key',
  }]);

  const expectedError = new Error('store failed');
  const failingConfig = createPairingKeyConfig({
    getStoreValue() {
      return undefined;
    },
    async setStoreValue() {
      throw expectedError;
    },
  });

  assert.strictEqual(failingConfig.clientKey, null);
  await assert.rejects(() => save(failingConfig, 'new-key'), error => error === expectedError);

  console.log('Pairing-key storage tests passed');
}

run().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
