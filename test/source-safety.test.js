'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const runtimeFiles = [
  path.join(root, 'app.js'),
  ...walk(path.join(root, 'drivers')),
].filter(filename => filename.endsWith('.js'));

function walk(directory) {
  return fs.readdirSync(directory, {withFileTypes: true}).flatMap(entry => {
    const filename = path.join(directory, entry.name);
    return entry.isDirectory() ? walk(filename) : [filename];
  });
}

const forbidden = [
  {pattern: /new\s+Promise\s*\(\s*async\b/, reason: 'async Promise executor'},
  {pattern: /setTimeout\s*\(\s*async\b/, reason: 'async setTimeout callback'},
  {pattern: /setInterval\s*\(\s*async\b/, reason: 'async setInterval callback'},
  {pattern: /new\s+Buffer\s*\(/, reason: 'deprecated Buffer constructor'},
  {pattern: /\/userdata\/com\.rompa\.webos-plus-g4-keyfile-/, reason: 'predictable public pairing-key path'},
  {pattern: /\bkeyFile\b/, reason: 'filesystem pairing-key fallback'},
  {pattern: /\bfs\.(?:readFileSync|writeFile|writeFileSync)\b/, reason: 'runtime filesystem credential access'},
];

for (const filename of runtimeFiles) {
  const source = fs.readFileSync(filename, 'utf8');
  for (const check of forbidden) {
    assert(!check.pattern.test(source), `${path.relative(root, filename)} contains ${check.reason}`);
  }
}

console.log('Source safety tests passed');
