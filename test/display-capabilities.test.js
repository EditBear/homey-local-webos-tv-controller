'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const Module = require('module');
const manifest = require('../app.json');

const originalLoad = Module._load;
Module._load = function load(request, parent, isMain) {
  if (request === 'homey') {
    return {
      Device: class Device {},
      Driver: class Driver {},
    };
  }
  return originalLoad.call(this, request, parent, isMain);
};
const WebosPlusDevice = require('../drivers/webos_plus/device');
Module._load = originalLoad;

const LEGACY_CAPABILITIES = [
  'speaker_artist',
  'speaker_track',
  'speaker_album',
];
const DISPLAY_APP = 'webos_display.app';
const DISPLAY_CHANNEL = 'webos_display.channel';
const EXPECTED_CARD_TOTALS = {
  triggers: 14,
  conditions: 9,
  actions: 25,
};

function migrationDevice(initialCapabilities, initialValues = {}, failSetCapability = null) {
  const installed = new Set(initialCapabilities);
  const values = {...initialValues};
  const added = [];
  const removed = [];
  const setValues = [];

  return {
    installed,
    values,
    added,
    removed,
    setValues,
    hasCapability: capability => installed.has(capability),
    getCapabilityValue: capability => values[capability],
    addCapability: async capability => {
      added.push(capability);
      installed.add(capability);
    },
    setCapabilityValue: async (capability, value) => {
      if (capability === failSetCapability) throw new Error(`Cannot set ${capability}`);
      setValues.push([capability, value]);
      values[capability] = value;
    },
    removeCapability: async capability => {
      removed.push(capability);
      installed.delete(capability);
      delete values[capability];
    },
    log() {},
  };
}

async function run() {
  const driver = manifest.drivers.find(candidate => candidate.id === 'webos_plus');
  assert(driver, 'webos_plus driver must exist');
  assert.deepStrictEqual(driver.capabilities, [
    'onoff',
    'volume_set',
    'channel_up',
    'volume_up',
    'channel_down',
    'volume_down',
    'volume_mute',
    DISPLAY_APP,
    DISPLAY_CHANNEL,
  ]);
  assert.deepStrictEqual(manifest.capabilities.webos_display, {
    type: 'string',
    title: {
      en: 'TV information',
      nl: 'TV-informatie',
    },
    getable: true,
    setable: false,
    uiComponent: 'sensor',
  });
  assert(driver.capabilities.includes(DISPLAY_APP));
  assert(driver.capabilities.includes(DISPLAY_CHANNEL));
  for (const legacyCapability of LEGACY_CAPABILITIES) {
    assert(!driver.capabilities.includes(legacyCapability));
  }
  assert.deepStrictEqual(driver.capabilitiesOptions[DISPLAY_APP], {
    title: {
      en: 'App or input',
      nl: 'App of ingang',
    },
    preventInsights: true,
    preventTag: true,
  });
  assert.deepStrictEqual(driver.capabilitiesOptions[DISPLAY_CHANNEL], {
    title: {
      en: 'Channel',
      nl: 'Kanaal',
    },
    preventInsights: true,
    preventTag: true,
  });

  const generatedCounts = {
    triggers: 0,
    conditions: 0,
    actions: 0,
  };
  for (const capability of driver.capabilities.filter(id => !id.includes('.'))) {
    const definition = require(`homey-lib/assets/capability/capabilities/${capability}.json`);
    for (const section of Object.keys(generatedCounts)) {
      generatedCounts[section] += (definition.$flow?.[section] || [])
        .filter(card => !card.$filter)
        .length;
    }
  }
  const finalCounts = {
    // Homey adds the two Advanced-Flow duration variants for onoff true/false.
    triggers: manifest.flow.triggers.length + generatedCounts.triggers + 2,
    conditions: manifest.flow.conditions.length + generatedCounts.conditions,
    actions: manifest.flow.actions.length + generatedCounts.actions,
  };
  assert.deepStrictEqual(finalCounts, EXPECTED_CARD_TOTALS);

  const legacy = migrationDevice(LEGACY_CAPABILITIES, {
    speaker_artist: 'YouTube',
    speaker_track: '232 | BBC Parliament',
    speaker_album: null,
  });
  await WebosPlusDevice.prototype.migrateDisplayCapabilities.call(legacy);
  assert.deepStrictEqual(legacy.added, [DISPLAY_APP, DISPLAY_CHANNEL]);
  assert.deepStrictEqual(legacy.setValues, [
    [DISPLAY_APP, 'YouTube'],
    [DISPLAY_CHANNEL, '232 | BBC Parliament'],
  ]);
  assert.deepStrictEqual(legacy.removed, LEGACY_CAPABILITIES);
  assert.strictEqual(legacy.values[DISPLAY_APP], 'YouTube');
  assert.strictEqual(legacy.values[DISPLAY_CHANNEL], '232 | BBC Parliament');

  const existing = migrationDevice(
    [...LEGACY_CAPABILITIES, DISPLAY_APP, DISPLAY_CHANNEL],
    {
      speaker_artist: 'Legacy app',
      speaker_track: 'Legacy channel',
      [DISPLAY_APP]: 'Current app',
      [DISPLAY_CHANNEL]: 'Current channel',
    },
  );
  await WebosPlusDevice.prototype.migrateDisplayCapabilities.call(existing);
  assert.deepStrictEqual(existing.added, []);
  assert.deepStrictEqual(existing.setValues, []);
  assert.deepStrictEqual(existing.removed, LEGACY_CAPABILITIES);
  assert.strictEqual(existing.values[DISPLAY_APP], 'Current app');
  assert.strictEqual(existing.values[DISPLAY_CHANNEL], 'Current channel');

  const failed = migrationDevice(
    LEGACY_CAPABILITIES,
    {
      speaker_artist: 'YouTube',
      speaker_track: '232 | BBC Parliament',
    },
    DISPLAY_APP,
  );
  await assert.rejects(
    WebosPlusDevice.prototype.migrateDisplayCapabilities.call(failed),
    /Cannot set webos_display\.app/,
  );
  assert.deepStrictEqual(failed.removed, [], 'legacy capabilities must remain if seeding fails');
  for (const legacyCapability of LEGACY_CAPABILITIES) {
    assert(failed.installed.has(legacyCapability));
  }

  const current = migrationDevice([DISPLAY_APP, DISPLAY_CHANNEL], {
    [DISPLAY_APP]: 'Live TV',
    [DISPLAY_CHANNEL]: '231 | BBC News',
  });
  await WebosPlusDevice.prototype.migrateDisplayCapabilities.call(current);
  assert.deepStrictEqual(current.added, []);
  assert.deepStrictEqual(current.setValues, []);
  assert.deepStrictEqual(current.removed, []);

  const deviceSource = fs.readFileSync(
    path.join(__dirname, '../drivers/webos_plus/device.js'),
    'utf8',
  );
  assert(!deviceSource.includes('this.setAlbumArtImage('));
  assert(!deviceSource.includes('this.homey.images.createImage('));
  assert(deviceSource.includes('this.setCapabilityValue(capabilities.displayApp, app.name)'));
  assert(deviceSource.includes("this.setCapabilityValue(capabilities.displayChannel, '')"));
  assert(deviceSource.includes('this.setCapabilityValue(capabilities.displayChannel, channelDisplay)'));
  assert(!deviceSource.includes('capabilities.speakerArtist'));
  assert(!deviceSource.includes('capabilities.speakerTrack'));
  assert(!deviceSource.includes('capabilities.speakerAlbum'));

  console.log('Display-capability migration tests passed');
}

run().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
