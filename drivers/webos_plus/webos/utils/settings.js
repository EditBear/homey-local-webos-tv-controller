'use strict';

const net = require('net');

function validateDeviceSettings(settings) {
  if (settings.manualIpAddress === true) {
    if (settings.ipAddress === '0.0.0.0' || net.isIP(settings.ipAddress) === 0) {
      throw new Error('Enter a valid television IP address before enabling manual addressing');
    }
  }

  if (settings.usePoll === true) {
    const interval = Number(settings.pollInterval);
    const timeout = Number(settings.pollTimeout);
    if (!Number.isFinite(interval) || interval <= 0) {
      throw new Error('Polling interval must be greater than zero');
    }
    if (!Number.isFinite(timeout) || timeout < 0 || timeout >= interval) {
      throw new Error('Polling timeout must be zero or greater and shorter than the polling interval');
    }
  }

  return true;
}

module.exports = {
  validateDeviceSettings,
};
