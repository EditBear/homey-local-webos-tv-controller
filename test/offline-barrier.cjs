'use strict';
// External test-process barrier. Not part of, or loaded by, the Homey app.
const Module = require('node:module');
const attempts = [];
function deny(name) { attempts.push(name); throw new Error('OFFLINE ONLY: ' + name); }
for (const name of ['node:http', 'node:https']) {
  for (const method of ['request', 'get']) require(name)[method] = () => deny(name + '.' + method);
}
require('node:net').Socket.prototype.connect = () => deny('net.connect');
require('node:tls').connect = () => deny('tls.connect');
for (const method of ['createSocket']) require('node:dgram')[method] = () => deny('dgram.' + method);
for (const method of ['lookup', 'resolve', 'resolve4', 'resolve6', 'reverse']) {
  require('node:dns')[method] = () => deny('dns.' + method);
  require('node:dns').promises[method] = () => deny('dns.promises.' + method);
}
for (const method of ['exec', 'execSync', 'execFile', 'execFileSync', 'spawn', 'spawnSync', 'fork']) {
  require('node:child_process')[method] = () => deny('child_process.' + method);
}
global.fetch = () => deny('fetch');
global.WebSocket = class { constructor() { deny('WebSocket'); } };
const originalLoad = Module._load;
Module._load = function(name, ...rest) {
  // CLI's packer imports API class definitions; importing them is not a call.
  // Credential services and every transport/subprocess entry point stay denied.
  if (/services\/(AthomApi|Settings)(\.js)?$/.test(name)) {
    return new Proxy({}, {get: (_, property) => () => deny('credential service ' + name + '.' + String(property))});
  }
  return originalLoad.call(this, name, ...rest);
};
process.on('exit', () => { if (attempts.length) process.exitCode = 1; });
module.exports = {attempts, deny};
