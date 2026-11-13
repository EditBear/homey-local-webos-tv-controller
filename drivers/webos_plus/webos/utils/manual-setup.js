'use strict';

const net = require('net');

function normalizeMacAddress(value) {
  const raw = String(value ?? '').trim();
  if (!raw) return '';
  if (/[^0-9a-fA-F:.\-\s]/.test(raw)) return null;
  const hex = raw.replace(/[^0-9a-fA-F]/g, '');
  if (hex.length !== 12) return null;
  return hex.toUpperCase().match(/.{2}/g).join(':');
}

function isUsableIpv4(value) {
  return net.isIPv4(value) && value !== '0.0.0.0' && !value.startsWith('127.') && value !== '255.255.255.255';
}

function parseManualInput(data) {
  const ipAddress = String(data?.ipAddress ?? '').trim();
  if (!ipAddress) return null;
  if (!isUsableIpv4(ipAddress)) {
    throw new Error('Please enter a valid IPv4 address, for example 192.168.1.50.');
  }
  const macAddress = normalizeMacAddress(data?.macAddress);
  if (macAddress === null) {
    throw new Error('The MAC address should look like AA:BB:CC:DD:EE:FF.');
  }
  return {ipAddress, macAddress};
}

function canConnect(host, port, timeout) {
  return new Promise((resolve, reject) => {
    const socket = new net.Socket();
    const finish = (error) => {
      socket.destroy();
      if (error) reject(error); else resolve(true);
    };
    socket.setTimeout(timeout);
    socket.once('connect', () => finish());
    socket.once('timeout', () => finish(new Error('timeout')));
    socket.once('error', finish);
    socket.connect(port, host);
  });
}

module.exports = {normalizeMacAddress, isUsableIpv4, parseManualInput, canConnect};
