'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const packageManifest = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
const packageLock = JSON.parse(fs.readFileSync(path.join(root, 'package-lock.json'), 'utf8'));
const rules = new Set(
  fs.readFileSync(path.join(root, '.homeyignore'), 'utf8')
    .split(/\r?\n/)
    .map(line => line.trim())
    .filter(Boolean),
);

assert(
  !Object.prototype.hasOwnProperty.call(packageManifest.dependencies || {}, 'npm'),
  'npm must remain a development-only build tool, not a runtime dependency',
);
assert(
  packageManifest.devDependencies?.npm === '11.19.0',
  'package.json must pin the approved project-local npm development dependency',
);
assert(
  packageLock.packages?.['']?.devDependencies?.npm === '11.19.0',
  'The lockfile root must preserve the approved npm development dependency',
);
assert(
  packageLock.packages?.['node_modules/npm']?.version === '11.19.0',
  'The lockfile must resolve the approved project-local npm version',
);

const requiredRules = [
  '.homeybuild',
  'dist',
  '.pnpm-store',
  'pnpm-lock.yaml',
  'pnpm-workspace.yaml',
  '.github',
  '.codex',
  'config',
  'env.json',
  '.env',
  '.env.*',
  '*keyfile*',
  'release.sh',
  'test',
  'evidence',
  'coverage',
  '.nyc_output',
  '*.log',
  '.DS_Store',
  'Thumbs.db',
  '*.md',
];

for (const rule of requiredRules) {
  assert(rules.has(rule), `.homeyignore must exclude ${rule}`);
}

for (const requiredFile of [
  'app.js',
  'app.json',
  'package.json',
  'package-lock.json',
  'README.txt',
  'README.nl.txt',
  'LICENSE',
  'drivers/webos_plus/assets/icon.svg',
]) {
  assert(fs.existsSync(path.join(root, requiredFile)), `Required package source ${requiredFile} is missing`);
  assert(!rules.has(requiredFile), `Required package source ${requiredFile} must not be excluded`);
}

const sensitivePatterns = [
  /^env\.json$/,
  /^\.env(?:\.|$)/,
  /keyfile/i,
  /\.(?:pem|key)$/i,
];
const rootFiles = fs.readdirSync(root, {withFileTypes: true})
  .filter(entry => entry.isFile())
  .map(entry => entry.name);

for (const filename of rootFiles) {
  assert(
    !sensitivePatterns.some(pattern => pattern.test(filename)),
    `Sensitive-looking root file must not be present: ${filename}`,
  );
}

console.log('Package-boundary tests passed');
