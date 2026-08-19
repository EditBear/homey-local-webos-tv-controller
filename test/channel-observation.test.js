'use strict';

const assert = require('assert');
const Module = require('module');
const {SerialTaskQueue} = require('../drivers/webos_plus/webos/utils/lifecycle');
const {ChannelObservationState} = require('../drivers/webos_plus/webos/utils/channel-reliability');

const originalLoad = Module._load;
Module._load = function load(request, parent, isMain) {
  if (request === 'homey') {
    return {
      Device: class Device {},
    };
  }
  return originalLoad.call(this, request, parent, isMain);
};
const WebosPlusDevice = require('../drivers/webos_plus/device');
Module._load = originalLoad;

(async () => {
  const capabilityValues = [];
  const storedValues = [];
  const triggered = [];
  const logs = [];
  const device = {
    channelObservationQueue: new SerialTaskQueue(),
    channelObservation: new ChannelObservationState('101'),
    setCapabilityValue: async (capability, value) => {
      await new Promise(resolve => setImmediate(resolve));
      capabilityValues.push([capability, value]);
    },
    setStoreValue: async (key, value) => {
      storedValues.push([key, value]);
    },
    _driver: {
      triggerChannelChanged: async (_device, tokens) => {
        triggered.push(tokens);
      },
    },
    _formatChannelDisplay: WebosPlusDevice.prototype._formatChannelDisplay,
    _applyChannelObservation: WebosPlusDevice.prototype._applyChannelObservation,
    applyChannelObservation: WebosPlusDevice.prototype.applyChannelObservation,
    log: (...args) => logs.push(args),
  };

  await Promise.all([
    device.applyChannelObservation({channelNumber: 231, channelName: 'BBC NEWS'}, 'test'),
    device.applyChannelObservation({channelNumber: 231, channelName: 'BBC NEWS'}, 'test'),
  ]);

  assert.strictEqual(capabilityValues.length, 2);
  assert.deepStrictEqual(capabilityValues[0], [
    'webos_display.channel',
    '231 | BBC NEWS',
  ]);
  assert.deepStrictEqual(capabilityValues[1], [
    'webos_display.channel',
    '231 | BBC NEWS',
  ]);
  assert.strictEqual(storedValues.length, 1);
  assert.strictEqual(triggered.length, 1);
  assert.deepStrictEqual(triggered[0], {
    oldChannel: '101',
    newChannel: '231',
  });

  let currentReads = 0;
  let applied = 0;
  let scheduled = 0;
  const client = {};
  const reconciliationDevice = {
    channelReconcileRunning: false,
    currentForegroundApp: 'com.webos.app.livetv',
    lgtv: client,
    lifecycle: {
      isCurrent: (candidate, current, generation) => (
        candidate === client && current === client && generation === 7
      ),
    },
    _channelCurrent: async () => {
      currentReads += 1;
      return {channelNumber: 101, channelName: 'BBC ONE Lon HD'};
    },
    applyChannelObservation: async () => {
      applied += 1;
    },
    scheduleChannelReconciliation: () => {
      scheduled += 1;
    },
    error: () => {
      throw new Error('Unexpected reconciliation error');
    },
    runChannelReconciliation: WebosPlusDevice.prototype.runChannelReconciliation,
  };

  await reconciliationDevice.runChannelReconciliation(client, 7);
  assert.strictEqual(currentReads, 1);
  assert.strictEqual(applied, 1);
  assert.strictEqual(scheduled, 1);
  assert.strictEqual(reconciliationDevice.channelReconcileRunning, false);

  reconciliationDevice.currentForegroundApp = 'com.webos.app.hdmi1';
  await reconciliationDevice.runChannelReconciliation(client, 7);
  assert.strictEqual(currentReads, 1);
  assert.strictEqual(applied, 1);
  assert.strictEqual(scheduled, 1);

  console.log('Channel observation and reconciliation tests passed');
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
