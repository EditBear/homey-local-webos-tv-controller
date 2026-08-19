'use strict';

const net = require('net');

const MAC_ADDRESS = /^([0-9a-f]{2}:){5}[0-9a-f]{2}$/i;

function validateDescriptionUrl(location) {
  const parsed = new URL(location);
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new Error('TV description URL must use HTTP or HTTPS');
  }
  return parsed;
}

function createPairingDevice(result, info, macAddress) {
  if (!result || typeof result !== 'object') throw new TypeError('Invalid television discovery result');
  if (net.isIP(result.address) === 0) throw new Error('Discovered television has an invalid IP address');
  if (typeof result.id !== 'string' || !result.id.trim()) {
    throw new Error('Discovered television has no stable identifier');
  }
  if (typeof macAddress !== 'string' || !MAC_ADDRESS.test(macAddress)) {
    throw new Error(`Could not determine the MAC address for television ${ result.address }`);
  }

  const friendlyName = info && typeof info.friendlyName === 'string'
    ? info.friendlyName.trim()
    : '';

  return {
    name: friendlyName || result.address,
    data: {
      id: result.id.replace(/^uuid:/i, ''),
    },
    settings: {
      macAddress: macAddress.toUpperCase(),
      ipAddress: result.address,
    },
  };
}

module.exports = {
  validateDescriptionUrl,
  createPairingDevice,
};
