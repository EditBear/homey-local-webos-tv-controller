'use strict';

const assert = require('node:assert/strict');
const {EventEmitter} = require('node:events');
const Module = require('node:module');
const test = require('node:test');
const {attempts} = require(process.env.HOMEY_OFFLINE_BARRIER || './offline-barrier.cjs');
const load = Module._load;
Module._load = function (name, ...args) {
  if (name === 'homey') return {Device: class {}, Driver: class {}};
  return load.call(this, name, ...args);
};

const {resolve} = require('node:path');
const packageDir = process.env.HOMEY_TEST_PACKAGE || resolve(__dirname, '..');
const Device = require(resolve(packageDir, 'drivers/webos_plus/device'));
const Driver = require(resolve(packageDir, 'drivers/webos_plus/driver'));
const {SourceNameReport} = require(resolve(packageDir, 'drivers/webos_plus/webos/utils/source-name-report'));
const {endpoints} = require(resolve(packageDir, 'drivers/webos_plus/webos/utils/constants'));
const manifest = require(resolve(packageDir, 'app.json'));
Module._load = load;

const cardId = 'webos_request_current_source';
const live = 'com.webos.app.livetv';
const receipt = 1794329600123;

function setup(t) {
  const device = new Device();
  const client = new EventEmitter();
  const replies = [];
  const events = [];
  device.log = () => {};
  device.error = () => {};
  device.lgtv = client;
  device.hasCapability = () => false;
  device.getSettings = () => ({});
  device.getStoreValue = () => live;
  device.setStoreValue = () => assert.fail('Action wrote a device store value');
  device.setCapabilityValue = () => assert.fail('Action wrote a capability');
  device._appListLaunchPoints = () => assert.fail('Action requested the source catalogue');
  device._sourceNameReport = new SourceNameReport(() => assert.fail('Action wrote a source label'), assert.fail, '');
  client.request = (uri, reply) => {
    assert.equal(uri, endpoints.app.getForegroundApp);
    replies.push(reply);
  };
  const driver = new Driver();
  const handlers = new Map();
  for (const key of ['ChangeChannelList', 'ChangeChannelNumber', 'LaunchApp', 'SimulateButton',
    'SendToast', 'SendToastWithImage', 'ChangeSoundOutput', 'SwitchInput', 'SendAlert']) driver['action' + key] = () => {};
  driver.homey = {flow: {
    getActionCard: id => ({registerRunListener: handler => handlers.set(id, handler)}),
    getDeviceTriggerCard: id => {
      assert.equal(id, 'webos_source_reported');
      return {trigger: (target, tokens, state) => {
        assert.equal(target, device);
        events.push({tokens, state});
        return Promise.resolve();
      }};
    },
  }};
  driver._triggerSourceReported = driver.homey.flow.getDeviceTriggerCard('webos_source_reported');
  driver.initActions();
  device._driver = driver;
  let now = receipt - 500;
  t.mock.method(Date, 'now', () => now);
  return {
    device, driver, client, events, replies,
    call: () => handlers.get(cardId)({webosDevice: device}),
    report: (payload, error = null) => {
      assert.ok(replies.length);
      now = receipt;
      replies.shift()(error, payload);
      now += 500;
    },
  };
}

test('action registration and one reply for the unchanged raw source', async t => {
  assert.deepEqual(manifest.flow.actions.filter(card => card.id === cardId).map(card => card.args),
    [[{name: 'webosDevice', type: 'device', filter: 'driver_id=webos_plus|webos_plus_manual'}]]);
  const f = setup(t);
  await f.device.initDevice();
  f.device._sourceNameReport.sourceId = live;
  const run = f.call();
  assert.equal(f.replies.length, 1);
  f.report({appId: live, returnValue: true});
  assert.equal(await run, true);
  assert.deepEqual(f.events, [{tokens: {source: live, reportedAt: receipt}, state: {source: live, reportedAt: receipt}}]);
  assert.deepEqual(attempts, []);
});

test('the original current-app enquiry still returns the unmodified LG payload', async t => {
  const f = setup(t);
  const enquiry = f.device._appCurrent();
  const payload = {appId: 'com.webos.app.hdmi4', returnValue: true, windowId: 'optional'};
  f.report(payload);
  assert.strictEqual(await enquiry, payload);
  assert.deepEqual(f.events, []);
});

test('unavailable, timed-out and invalid replies fail without publishing', async t => {
  const f = setup(t);
  await assert.rejects(f.call(), /unavailable/);
  assert.equal(f.replies.length, 0);
  await f.device.initDevice();
  for (const error of ['not connected', 'timeout', 'connection closed']) {
    const run = f.call();
    f.report(undefined, new Error(error));
    await assert.rejects(run, new RegExp(error));
  }
  for (const payload of [undefined, {}, {returnValue: false, appId: live}, {errorText: 'LG failure', appId: live},
    {appId: 3}, {appId: ''}, {appId: ' '}, {appId: live + '|fake'}, {appId: live + '\nother'}]) {
    const run = f.call();
    f.report(payload);
    await assert.rejects(run);
  }
  assert.deepEqual(f.events, []);
  const run = f.call();
  f.report({appId: 'com.webos.app.future'});
  assert.equal(await run, true);
  assert.equal(f.events[0].tokens.source, 'com.webos.app.future');
});

test('a newer push, same-client close, client replacement and stopped device each supersede an old reply', async t => {
  for (const invalidate of [
    f => f.device._sourceNameReport.begin(f.device._sourceNameReport.generation, live),
    f => f.client.emit('close'),
    f => { f.device.lgtv = new EventEmitter(); },
    f => f.device.onUninit(),
    f => f.device.onDeleted(),
  ]) {
    const f = setup(t);
    await f.device.initDevice();
    f.device._sourceNameReport.sourceId = live;
    const run = f.call();
    invalidate(f);
    f.report({appId: live});
    await assert.rejects(run, /superseded/);
    assert.deepEqual(f.events, []);
    t.mock.restoreAll();
  }
});

test('an overlapping action sends no second request and a Flow delivery error releases the request', async t => {
  const f = setup(t);
  await f.device.initDevice();
  const run = f.call();
  await assert.rejects(f.call(), /already pending/);
  assert.equal(f.replies.length, 1);
  const deliver = f.driver._triggerSourceReported.trigger;
  f.driver._triggerSourceReported.trigger = () => Promise.reject(new Error('Flow delivery failed'));
  f.report({appId: live});
  await assert.rejects(run, /Flow delivery failed/);
  f.driver._triggerSourceReported.trigger = deliver;
  const next = f.call();
  assert.equal(f.replies.length, 1);
  f.report({appId: live});
  assert.equal(await next, true);
  assert.equal(f.events.length, 1);
});
