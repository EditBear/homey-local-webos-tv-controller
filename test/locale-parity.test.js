'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const english = JSON.parse(fs.readFileSync(path.join(root, 'locales', 'en.json'), 'utf8'));
const dutch = JSON.parse(fs.readFileSync(path.join(root, 'locales', 'nl.json'), 'utf8'));

function flatten(value, prefix = '') {
  const entries = [];
  for (const [key, child] of Object.entries(value)) {
    const name = prefix ? `${prefix}.${key}` : key;
    if (child && typeof child === 'object' && !Array.isArray(child)) {
      entries.push(...flatten(child, name));
    } else {
      entries.push([name, child]);
    }
  }
  return entries;
}

const englishEntries = new Map(flatten(english));
const dutchEntries = new Map(flatten(dutch));

assert.deepStrictEqual(
  [...englishEntries.keys()].sort(),
  [...dutchEntries.keys()].sort(),
  'English and Dutch locale files must contain the same keys',
);

for (const [key, value] of englishEntries) {
  assert(typeof value === 'string' && value.trim(), `English locale ${key} must be non-empty text`);
  const translated = dutchEntries.get(key);
  assert(typeof translated === 'string' && translated.trim(), `Dutch locale ${key} must be non-empty text`);
}

console.log('Locale parity tests passed');
