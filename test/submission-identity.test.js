'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const manifest = JSON.parse(fs.readFileSync(path.join(root, 'app.json'), 'utf8'));
const packageJson = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
const notice = fs.readFileSync(path.join(root, 'NOTICE'), 'utf8');
const appIcon = fs.readFileSync(path.join(root, 'assets', 'icon.svg'), 'utf8');
const driverIcon = fs.readFileSync(path.join(root, 'drivers', 'webos_plus', 'assets', 'icon.svg'), 'utf8');
const contributing = fs.readFileSync(path.join(root, 'CONTRIBUTING.md'), 'utf8');
const codeOfConduct = fs.readFileSync(path.join(root, 'CODE_OF_CONDUCT.md'), 'utf8');
const security = fs.readFileSync(path.join(root, 'SECURITY.md'), 'utf8');
const bugTemplate = fs.readFileSync(path.join(root, '.github', 'ISSUE_TEMPLATE', 'bug_report.md'), 'utf8');
const featureTemplate = fs.readFileSync(path.join(root, '.github', 'ISSUE_TEMPLATE', 'feature_request.md'), 'utf8');
const gitignore = fs.readFileSync(path.join(root, '.gitignore'), 'utf8');

assert.strictEqual(manifest.id, 'com.rompa.webos-plus-g4');
assert.strictEqual(manifest.version, '1.0.43');
assert.strictEqual(manifest.name.en, 'Local webOS TV Controller');
assert.strictEqual(manifest.name.nl, 'Lokale webOS-tv-controller');
assert.strictEqual(manifest.author.name, 'John Bear');
assert.strictEqual(manifest.support, 'mailto:wakeful.issue_8i@icloud.com');
assert.strictEqual(manifest.source, 'https://github.com/EditBear/homey-local-webos-tv-controller');
assert.deepStrictEqual(manifest.bugs, {
  url: 'https://github.com/EditBear/homey-local-webos-tv-controller/issues',
});
assert.strictEqual(manifest.brandColor, '#123C4A');
assert.strictEqual(packageJson.author, 'John Bear');
assert.strictEqual(packageJson.version, manifest.version);

const creditedDevelopers = manifest.contributors.developers.map(contributor => contributor.name);
assert.deepStrictEqual(creditedDevelopers, [
  'Max van de Laar',
  'Dominic Vonk',
  'Paul Molensky',
]);

for (const staleField of ['contributing', 'homepage', 'homeyCommunityTopicId']) {
  assert(!Object.prototype.hasOwnProperty.call(manifest, staleField), `${staleField} must not point users to the upstream maintainer`);
}
assert(!Object.prototype.hasOwnProperty.call(packageJson, 'repository'), 'Package repository must not claim the upstream repository as the fork repository');

for (const expectedCredit of ['Max van de Laar', 'Dominic Vonk', 'Paul Molensky', 'Sebastian Raff']) {
  assert(notice.includes(expectedCredit), `NOTICE must credit ${expectedCredit}`);
}

assert(appIcon.includes('<title>Local webOS TV Controller</title>'));
assert(driverIcon.includes('<title>Television</title>'));
assert(!appIcon.includes('Combined Shape'), 'Inherited app icon must not remain');
assert(!driverIcon.includes('WebOS Plus'), 'Inherited driver icon must not remain');

assert(!fs.existsSync(path.join(root, '.github', 'FUNDING.yml')), 'The independent fork must not publish the upstream maintainer donation link');
assert(!fs.existsSync(path.join(root, 'release.sh')), 'The inherited release script must not be presented as the independent release process');
for (const repositoryFile of [contributing, codeOfConduct, security, bugTemplate, featureTemplate]) {
  assert(!repositoryFile.includes('MaxvandeLaar'), 'Repository operations must not be assigned to the upstream maintainer');
  assert(!repositoryFile.includes('support@athom.com'), 'Repository support must not be directed to Athom');
}
assert(contributing.includes('Local webOS TV Controller'));
assert(security.includes('wakeful.issue_8i@icloud.com'));
assert(bugTemplate.includes("assignees: ''"));
assert(featureTemplate.includes("assignees: ''"));
assert(gitignore.includes('/*.md'), 'Private root engineering records must be ignored by the public repository');
for (const publicDocument of ['README.md', 'CONTRIBUTING.md', 'CODE_OF_CONDUCT.md', 'SECURITY.md', 'MAX-TO-JOHN-BEAR-REVISION-LOG-1.0.43.md', 'RECOVERY.md']) {
  assert(gitignore.includes(`!/${publicDocument}`), `${publicDocument} must remain available to the public repository`);
}
for (const privatePath of ['/config/', '/evidence/', '/pnpm-lock.yaml', '/pnpm-workspace.yaml']) {
  assert(gitignore.includes(privatePath), `${privatePath} must be excluded from the maintained public source tree`);
}

console.log('Submission identity tests passed');
