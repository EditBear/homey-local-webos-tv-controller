'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const manifest = JSON.parse(fs.readFileSync(path.join(root, 'app.json'), 'utf8'));
const allowedCategories = new Set([
  'lights',
  'video',
  'music',
  'appliances',
  'security',
  'climate',
  'tools',
  'internet',
  'localization',
  'energy',
]);

function assertTranslation(value, context) {
  assert(value && typeof value.en === 'string' && value.en.trim(), `${context} needs English text`);
  assert(value && typeof value.nl === 'string' && value.nl.trim(), `${context} needs Dutch text`);
}

assertTranslation(manifest.name, 'App name');
assertTranslation(manifest.description, 'App description');
assert(manifest.name.en.trim().split(/\s+/).length <= 4, 'App name must use no more than four words');
assert(!/\b(?:Homey|Athom)\b/i.test(manifest.name.en), 'App name must not use Homey or Athom trademarks');
assert(!manifest.description.en.toLowerCase().includes(manifest.name.en.toLowerCase()), 'Description must not repeat the app name');
assert.strictEqual(manifest.runtime, 'nodejs');
assert.strictEqual(manifest.sdk, 3);
assert.deepStrictEqual(manifest.platforms, ['local']);
assert(allowedCategories.has(manifest.category), 'App category must be currently supported');
assert(/^#[0-9a-f]{6}$/i.test(manifest.brandColor), 'Brand colour must be a six-digit HEX value');
assert(manifest.author && typeof manifest.author.name === 'string' && manifest.author.name.trim(), 'Author name is required');

for (const image of ['small', 'large', 'xlarge']) {
  assert(typeof manifest.images?.[image] === 'string', `App ${image} image path is required`);
  assert(fs.existsSync(path.join(root, manifest.images[image])), `App ${image} image must exist`);
}

function pngDimensions(filename) {
  const buffer = fs.readFileSync(filename);
  assert.strictEqual(buffer.toString('ascii', 1, 4), 'PNG', `${filename} must be PNG`);
  return {
    width: buffer.readUInt32BE(16),
    height: buffer.readUInt32BE(20),
  };
}

assert.deepStrictEqual(pngDimensions(path.join(root, manifest.images.small)), {width: 250, height: 175});
assert.deepStrictEqual(pngDimensions(path.join(root, manifest.images.large)), {width: 500, height: 350});
assert.deepStrictEqual(pngDimensions(path.join(root, manifest.images.xlarge)), {width: 1000, height: 700});

for (const section of ['triggers', 'conditions', 'actions']) {
  for (const card of manifest.flow[section]) {
    const context = `${section} card ${card.id}`;
    assertTranslation(card.title, `${context} title`);
    assert(!/[()]/.test(card.title.en), `${context} English title must not use parentheses`);
    assert(!/[()]/.test(card.title.nl), `${context} Dutch title must not use parentheses`);

    const userArguments = (card.args || []).filter(argument => argument.type !== 'device');
    if (userArguments.length > 0) {
      assertTranslation(card.titleFormatted, `${context} formatted title`);
    }

    for (const token of card.tokens || []) {
      assertTranslation(token.title, `${context} token ${token.name}`);
    }
  }
}

const channelNumberAction = manifest.flow.actions.find(card => card.id === 'change_channel_number');
const channelListAction = manifest.flow.actions.find(card => card.id === 'change_channel_list');
const actionIds = manifest.flow.actions.map(card => card.id);
assert(channelNumberAction, 'Numeric channel action is required');
assert(channelListAction, 'List-based channel action is required');
assert(actionIds.includes('send_toast'), 'Working notification action must be retained');
assert(!actionIds.includes('send_toast_with_image'), 'Unsupported image-token notification action must be removed');
assert.strictEqual(
  channelNumberAction.titleFormatted.en,
  'Change channel number to [[channel]]',
);
assert.strictEqual(
  channelListAction.titleFormatted.en,
  'Change channel from list to [[channel]]',
);
assert.notStrictEqual(
  channelNumberAction.titleFormatted.en,
  channelListAction.titleFormatted.en,
  'Channel actions must remain visibly distinct',
);

for (const driver of manifest.drivers) {
  assertTranslation(driver.name, `Driver ${driver.id} name`);
  assert.deepStrictEqual(driver.platforms, ['local'], `Driver ${driver.id} must target local Homey`);
  assert.deepStrictEqual(driver.connectivity, ['lan'], `Driver ${driver.id} must declare LAN connectivity`);
  assert(fs.existsSync(path.join(root, 'drivers', driver.id, 'assets', 'icon.svg')), `Driver ${driver.id} icon is required`);

  for (const image of ['small', 'large', 'xlarge']) {
    assert(typeof driver.images?.[image] === 'string', `Driver ${driver.id} ${image} image path is required`);
    assert(fs.existsSync(path.join(root, driver.images[image])), `Driver ${driver.id} ${image} image must exist`);
  }
  assert.deepStrictEqual(pngDimensions(path.join(root, driver.images.small)), {width: 75, height: 75});
  assert.deepStrictEqual(pngDimensions(path.join(root, driver.images.large)), {width: 500, height: 500});
  assert.deepStrictEqual(pngDimensions(path.join(root, driver.images.xlarge)), {width: 1000, height: 1000});

  for (const group of driver.settings || []) {
    assertTranslation(group.label, `Driver ${driver.id} settings group`);

    for (const setting of group.children || []) {
      assertTranslation(setting.label, `Driver ${driver.id} setting ${setting.id} label`);
      if (setting.hint) assertTranslation(setting.hint, `Driver ${driver.id} setting ${setting.id} hint`);
      if (setting.units) assertTranslation(setting.units, `Driver ${driver.id} setting ${setting.id} units`);
    }
  }
}

for (const filename of ['README.txt', 'README.nl.txt']) {
  const contents = fs.readFileSync(path.join(root, filename), 'utf8').trim();
  const paragraphs = contents.split(/\n\s*\n/);

  assert(paragraphs.length >= 1 && paragraphs.length <= 2, `${filename} must contain one or two paragraphs`);
  assert(!/(^|\n)\s*(?:[-*#]|```)/.test(contents), `${filename} must use plain text without Markdown lists or headings`);
  assert(!/https?:\/\//i.test(contents), `${filename} must not contain URLs`);
}

console.log('Manifest presentation tests passed');
