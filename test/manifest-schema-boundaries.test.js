'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const manifest = JSON.parse(fs.readFileSync(path.join(root, 'app.json'), 'utf8'));

function assertUnique(items, context) {
  const duplicates = items.filter((item, index) => items.indexOf(item) !== index);
  assert.deepStrictEqual([...new Set(duplicates)], [], `${context} must be unique`);
}

function assertExampleType(token, context) {
  if (!Object.prototype.hasOwnProperty.call(token, 'example')) return;

  const expectedType = {
    string: 'string',
    number: 'number',
    boolean: 'boolean',
  }[token.type];

  if (expectedType) {
    assert.strictEqual(typeof token.example, expectedType, `${context} example must match its declared type`);
  }
}

function assertNumberBoundary(item, context) {
  for (const property of ['min', 'max', 'step']) {
    if (Object.prototype.hasOwnProperty.call(item, property)) {
      assert(Number.isFinite(item[property]), `${context} ${property} must be finite`);
    }
  }

  if (item.min !== undefined && item.max !== undefined) {
    assert(item.min <= item.max, `${context} min must not exceed max`);
  }
  if (item.step !== undefined) {
    assert(item.step > 0, `${context} step must be positive`);
  }
  if (item.value !== undefined && typeof item.value === 'number') {
    if (item.min !== undefined) assert(item.value >= item.min, `${context} default must meet min`);
    if (item.max !== undefined) assert(item.value <= item.max, `${context} default must meet max`);
  }
}

for (const section of ['triggers', 'conditions', 'actions']) {
  const cards = manifest.flow[section] || [];
  assertUnique(cards.map(card => card.id), `${section} card IDs`);

  for (const card of cards) {
    const context = `${section} card ${card.id}`;
    const args = card.args || [];
    const tokens = card.tokens || [];

    assertUnique(args.map(argument => argument.name), `${context} argument names`);
    assertUnique(tokens.map(token => token.name), `${context} token names`);

    for (const argument of args) {
      if (argument.type !== 'device') {
        for (const language of ['en', 'nl']) {
          assert(
            card.titleFormatted?.[language]?.includes(`[[${argument.name}]]`),
            `${context} ${language} formatted title must include [[${argument.name}]]`,
          );
        }
      }
      if (argument.type === 'device') {
        assert.strictEqual(argument.filter, 'driver_id=webos_plus', `${context} device filter`);
      }
      if (argument.type === 'number') assertNumberBoundary(argument, `${context} argument ${argument.name}`);
      if (argument.type === 'dropdown') {
        assert(Array.isArray(argument.values) && argument.values.length > 0, `${context} dropdown ${argument.name} needs values`);
        assertUnique(argument.values.map(value => value.id), `${context} dropdown ${argument.name} IDs`);
        for (const value of argument.values) {
          assert(value.label?.en?.trim(), `${context} dropdown ${argument.name}/${value.id} needs English text`);
          assert(value.label?.nl?.trim(), `${context} dropdown ${argument.name}/${value.id} needs Dutch text`);
        }
      }
    }

    if (card.droptoken) {
      for (const language of ['en', 'nl']) {
        assert(
          card.titleFormatted?.[language]?.includes('[[droptoken]]'),
          `${context} ${language} formatted title must include [[droptoken]]`,
        );
      }
    }

    for (const token of tokens) assertExampleType(token, `${context} token ${token.name}`);
  }
}

assertUnique((manifest.drivers || []).map(driver => driver.id), 'Driver IDs');
const discoveryIds = Object.keys(manifest.discovery || {});
assertUnique(discoveryIds, 'Discovery IDs');

for (const [id, discovery] of Object.entries(manifest.discovery || {})) {
  assert(typeof discovery.type === 'string' && discovery.type.trim(), `Discovery ${id} needs a type`);
  assert(typeof discovery.id === 'string' && discovery.id.trim(), `Discovery ${id} needs an identity expression`);
}

for (const driver of manifest.drivers || []) {
  assertUnique(driver.capabilities || [], `Driver ${driver.id} capabilities`);

  const settings = (driver.settings || []).flatMap(group => group.children || []);
  assertUnique(settings.map(setting => setting.id), `Driver ${driver.id} setting IDs`);
  for (const setting of settings) {
    if (setting.type === 'number') assertNumberBoundary(setting, `Driver ${driver.id} setting ${setting.id}`);
  }

  assert(
    discoveryIds.includes(driver.discovery),
    `Driver ${driver.id} must reference a declared discovery strategy`,
  );
}

console.log('Manifest schema-boundary tests passed');
