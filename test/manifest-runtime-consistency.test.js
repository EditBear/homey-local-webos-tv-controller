'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const manifest = require('../app.json');
const {capabilities} = require('../drivers/webos_plus/webos/utils/constants');

const driverSource = fs.readFileSync(path.join(__dirname, '../drivers/webos_plus/driver.js'), 'utf8');
const deviceSource = fs.readFileSync(path.join(__dirname, '../drivers/webos_plus/device.js'), 'utf8');

function matches(pattern, source) {
  return [...source.matchAll(pattern)].map(match => match[1]);
}

const cardPatterns = {
  triggers: /getDeviceTriggerCard\('([^']+)'\)/g,
  conditions: /getConditionCard\('([^']+)'\)/g,
  actions: /getActionCard\('([^']+)'\)/g,
};

for (const [section, pattern] of Object.entries(cardPatterns)) {
  const declared = manifest.flow[section].map(card => card.id).sort();
  const registered = matches(pattern, driverSource).sort();
  assert.deepStrictEqual(registered, declared, `${section} manifest IDs must match runtime registrations`);
  assert.strictEqual(new Set(declared).size, declared.length, `${section} IDs must be unique`);
}

const declaredCapabilities = new Set(manifest.drivers[0].capabilities);
for (const capability of Object.values(capabilities)) {
  assert(
    declaredCapabilities.has(capability),
    `Runtime capability ${capability} must be declared in the driver manifest`,
  );
}

const registeredListeners = matches(/registerCapabilityListener\(capabilities\.([A-Za-z0-9_]+)/g, deviceSource);
for (const key of registeredListeners) {
  assert(capabilities[key], `Capability listener references unknown constant ${key}`);
  assert(
    declaredCapabilities.has(capabilities[key]),
    `Capability listener ${capabilities[key]} must be declared in the driver manifest`,
  );
}

console.log('Manifest and runtime consistency tests passed');
