'use strict';

const assert = require('assert');
const {
  buildLaunchableAppList,
  filterLaunchableApps,
} = require('../drivers/webos_plus/webos/utils/launch-apps');

const launchPoints = [
  {id: 'netflix', name: 'Netflix'},
  {id: 'bbc', name: 'BBC iPlayer'},
  {id: 'duplicate', name: 'Old title'},
  {id: 'duplicate', name: 'Current title'},
  {id: 'internal-name', name: 'com.webos.exampleapp.qmlapp.client'},
  {id: 'example-name', name: 'Live exampleapp launcher'},
  {id: '', name: 'Missing ID'},
];
const allApps = [
  {id: 'com.webos.app.livetv', name: 'Live TV', image: 'live.png'},
  {id: 'com.webos.app.lgchannels', name: 'LG Channels'},
  {id: 'com.webos.internal', name: 'System Settings'},
  {id: 'hidden-streamer', name: 'Hidden Streamer'},
];

const choices = buildLaunchableAppList(launchPoints, allApps);
assert.deepStrictEqual(
  choices.map(app => app.id),
  [
    'netflix',
    'bbc',
    'duplicate',
    'com.webos.app.livetv',
    'com.webos.app.lgchannels',
  ],
);
assert.strictEqual(choices.find(app => app.id === 'duplicate').name, 'Current title');
assert.strictEqual(choices.find(app => app.id === 'com.webos.app.livetv').image, 'live.png');
assert(!choices.some(app => app.id === 'com.webos.internal'));
assert(!choices.some(app => app.id === 'internal-name'));
assert(!choices.some(app => app.id === 'example-name'));

assert.deepStrictEqual(
  filterLaunchableApps(choices, 'live').map(app => app.name),
  ['Live TV'],
);
assert.deepStrictEqual(
  filterLaunchableApps(choices).map(app => app.name),
  ['BBC iPlayer', 'Current title', 'LG Channels', 'Live TV', 'Netflix'],
);

assert.throws(() => buildLaunchableAppList(null, []), /Launch points must be an array/);
assert.throws(() => buildLaunchableAppList([], null), /Application list must be an array/);

console.log('Launch-app picker tests passed');
