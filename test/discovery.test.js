'use strict';

const assert = require('assert');
const {
  validateDescriptionUrl,
  createPairingDevice,
} = require('../drivers/webos_plus/webos/utils/discovery');

assert.strictEqual(validateDescriptionUrl('http://192.168.1.20/description.xml').protocol, 'http:');
assert.strictEqual(validateDescriptionUrl('https://192.168.1.20/description.xml').protocol, 'https:');
assert.throws(() => validateDescriptionUrl('file:///tmp/description.xml'), /HTTP or HTTPS/);
assert.throws(() => validateDescriptionUrl('not a URL'), /Invalid URL/);

assert.deepStrictEqual(
  createPairingDevice(
    {id: 'uuid:television-id', address: '192.168.1.20'},
    {friendlyName: '  Lounge TV  '},
    'aa:bb:cc:dd:ee:ff',
  ),
  {
    name: 'Lounge TV',
    data: {id: 'television-id'},
    settings: {
      macAddress: 'AA:BB:CC:DD:EE:FF',
      ipAddress: '192.168.1.20',
    },
  },
);
assert.throws(
  () => createPairingDevice({id: 'uuid:tv', address: 'bad-address'}, {}, 'AA:BB:CC:DD:EE:FF'),
  /invalid IP address/,
);
assert.throws(
  () => createPairingDevice({id: '', address: '192.168.1.20'}, {}, 'AA:BB:CC:DD:EE:FF'),
  /stable identifier/,
);
assert.throws(
  () => createPairingDevice({id: 'uuid:tv', address: '192.168.1.20'}, {}, null),
  /Could not determine the MAC address/,
);

console.log('Pairing discovery tests passed');
