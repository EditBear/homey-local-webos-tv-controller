'use strict';

const assert = require('assert');
const pairingTemplate = require('../drivers/webos_plus/lgtv2/pairing.json');
const {createPairingPayload} = require('../drivers/webos_plus/lgtv2/pairing-payload');

const originalTemplate = JSON.parse(JSON.stringify(pairingTemplate));
const first = createPairingPayload(pairingTemplate, 'first-tv-key');
const second = createPairingPayload(pairingTemplate, 'second-tv-key');
const unpaired = createPairingPayload(pairingTemplate, null);

assert.notStrictEqual(first, second);
assert.notStrictEqual(first.manifest, second.manifest);
assert.strictEqual(first['client-key'], 'first-tv-key');
assert.strictEqual(second['client-key'], 'second-tv-key');
assert.strictEqual(Object.prototype.hasOwnProperty.call(unpaired, 'client-key'), false);

first.manifest.permissions.push('test-only-mutation');
assert.strictEqual(second.manifest.permissions.includes('test-only-mutation'), false);
assert.deepStrictEqual(pairingTemplate, originalTemplate);

console.log('Pairing-payload isolation tests passed');
