'use strict';

const assert = require('assert');
const EventEmitter = require('events');
const fs = require('fs');
const path = require('path');

const deviceSource = fs.readFileSync(
  path.join(__dirname, '..', 'drivers', 'webos_plus', 'device.js'),
  'utf8',
);
const clientSource = fs.readFileSync(
  path.join(__dirname, '..', 'drivers', 'webos_plus', 'lgtv2', 'lgtv2.js'),
  'utf8',
);

const startupStart = deviceSource.indexOf('await this._driver.initReady(async () => {');
const startupEnd = deviceSource.indexOf('\n  onDiscoveryResult(', startupStart);
assert(startupStart >= 0 && startupEnd > startupStart, 'Device startup block must exist');

const startup = deviceSource.slice(startupStart, startupEnd);
const migrateIndex = startup.indexOf('await this.registerCapabilities();');
const connectIndex = startup.indexOf('this._connect();');
const bindIndex = startup.indexOf('await this.initDevice();');

assert(migrateIndex >= 0, 'Startup must register and migrate capabilities');
assert(connectIndex > migrateIndex, 'Startup must finish capability migration before connecting');
assert(bindIndex > connectIndex, 'Startup must bind connection handlers immediately after connecting');
assert(
  /startupTimer\s*=\s*setTimeout\(function\s*\(\)\s*\{[\s\S]*?that\.connect\(config\.url\);[\s\S]*?\},\s*0\);/.test(clientSource),
  'LG client connection is expected to start from its zero-delay timer',
);

const delay = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds));

async function reproduce(order) {
  const client = new EventEmitter();
  let connectEventsSeen = 0;
  const migrate = () => delay(20);
  const connect = () => setTimeout(() => client.emit('connect'), 0);
  const bind = () => client.on('connect', () => { connectEventsSeen += 1; });

  if (order === 'unsafe') {
    connect();
    await migrate();
    bind();
  } else {
    await migrate();
    connect();
    bind();
  }
  await delay(10);
  return connectEventsSeen;
}

(async () => {
  assert.strictEqual(await reproduce('unsafe'), 0, 'Former startup order must reproduce the lost event');
  assert.strictEqual(await reproduce('safe'), 1, 'Corrected startup order must receive the event');
  console.log('Startup ordering tests passed');
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
