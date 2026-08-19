'use strict';

const {store} = require('./constants');

/**
 * Keep the LG client credential in Homey's private per-device store.
 * App userdata is intentionally not used because Homey exposes that directory
 * over HTTP and warns against predictable filenames for sensitive data.
 *
 * @param {Homey.Device} device
 * @returns {{clientKey: string|null, saveKey: function(string, function): void}}
 */
function createPairingKeyConfig(device) {
  return {
    clientKey: device.getStoreValue(store.pairingKey) || null,
    saveKey(key, callback) {
      Promise.resolve()
        .then(() => device.setStoreValue(store.pairingKey, key))
        .then(() => callback(null))
        .catch(callback);
    },
  };
}

module.exports = {
  createPairingKeyConfig,
};
