'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const deviceSource = fs.readFileSync(path.join(root, 'drivers/webos_plus/device.js'), 'utf8');
const packageJson = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
const appJson = JSON.parse(fs.readFileSync(path.join(root, 'app.json'), 'utf8'));

assert(!deviceSource.includes("require('node-fetch')"));
assert(!deviceSource.includes('this.homey.images.createImage('));
assert(!deviceSource.includes('this.setAlbumArtImage('));
assert(!deviceSource.includes('this.image.setStream('));
assert(!deviceSource.includes('this.image.update('));
assert(!Object.prototype.hasOwnProperty.call(packageJson.dependencies, 'node-fetch'));

const driver = appJson.drivers.find(candidate => candidate.id === 'webos_plus');
assert(driver, 'webos_plus driver must remain present');
assert.strictEqual(appJson.flow.triggers.length, 9, 'explicit WHEN cards must remain unchanged');
assert.strictEqual(appJson.flow.conditions.length, 8, 'explicit AND cards must remain unchanged');
assert.strictEqual(appJson.flow.actions.length, 13, 'explicit THEN cards must remain unchanged');
assert.deepStrictEqual(driver.capabilities, [
  'onoff',
  'volume_set',
  'channel_up',
  'volume_up',
  'channel_down',
  'volume_down',
  'volume_mute',
  'webos_display.app',
  'webos_display.channel',
], 'capability-generated Flow-card contributors must remain unchanged');

console.log('Artwork-removal boundary tests passed');
