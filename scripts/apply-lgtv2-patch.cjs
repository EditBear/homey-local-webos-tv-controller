'use strict';

const { createHash } = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

const upstreamHash = '5b4df85d4bad3da7c036c2b8053da2edc01d4b091f69bb2a3075f0c09cd51680';
const releaseHash = 'a53fda72a73a72e51c3df1d6259c239fc4d25309b67c0649ecf479b8111eb579';
const filename = path.join(__dirname, '../node_modules/lgtv2/index.js');
const hash = contents => createHash('sha256').update(contents).digest('hex');

const retry = [
  '    // Rediscovery may bring forward one idle retry until registration succeeds.',
  '    // Keep this in the scheduler so it can consume the existing timer.',
  '    this.advanceReconnect = function () {',
  '        if (stopped || !autoReconnect || !reconnectTimer || ws || connection || advancedReconnect) return false;',
  '        clearTimeout(reconnectTimer);',
  '        reconnectTimer = null;',
  '        advancedReconnect = true;',
  '        that.connect(config.url);',
  '        return true;',
  '    };',
  '',
  '',
].join('\n');

function applyPatch() {
  const upstream = fs.readFileSync(filename, 'utf8');
  const installedHash = hash(upstream);
  if (installedHash === releaseHash) return;
  if (installedHash !== upstreamHash) {
    throw new Error('Unexpected lgtv2 source. Run npm ci --omit=dev before applying the Test Build 12 patch.');
  }

  const patched = upstream
    .replace('    let reconnectTimer = null;\n', '    let reconnectTimer = null;\n    let advancedReconnect = false;\n')
    .replace('    function stopKeepalive() {', retry + '    function stopKeepalive() {')
    .replace('                    isPaired = true;\n', '                    isPaired = true;\n                    advancedReconnect = false;\n');
  if (hash(patched) !== releaseHash) {
    throw new Error('Patched lgtv2 does not match Test Build 12.');
  }
  fs.writeFileSync(filename, patched);
}

applyPatch();
