'use strict';

const assert = require('node:assert/strict');
const {EventEmitter} = require('node:events');
const Module = require('node:module');
const path = require('node:path');
const test = require('node:test');
const {setImmediate: settle} = require('node:timers/promises');
const {attempts} = require(process.env.HOMEY_OFFLINE_BARRIER || './offline-barrier.cjs');

const packageDir = process.env.HOMEY_TEST_PACKAGE || path.join(__dirname, '..');
const load = Module._load;
let Device;
try {
  Module._load = function(name, ...args) {
    if (name === 'homey') return {Device: class {}};
    return load.call(this, name, ...args);
  };
  Device = require(path.join(packageDir, 'drivers/webos_plus/device'));
} finally {
  Module._load = load;
}
const {capabilities, endpoints} = require(path.join(packageDir, 'drivers/webos_plus/webos/utils/constants'));
const picker = capabilities.inputSelect;
const hdmi1 = 'com.webos.app.hdmi1';
const hdmi3 = 'com.webos.app.hdmi3';
const hdmi4 = 'com.webos.app.hdmi4';
const apple = {id: 'HDMI_1', name: 'Apple TV', appId: hdmi1};
const movie = {id: 'HDMI_3', name: 'Movie', appId: hdmi3};

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((done, fail) => {
    resolve = done;
    reject = fail;
  });
  return {promise, resolve, reject};
}

function setup({
  hasPicker = true,
  addPicker,
  fetchInputs = async () => [apple, movie],
  beforeOptionWrite,
  rejectMissingPickerOptions = false,
} = {}) {
  const device = new Device();
  const client = new EventEmitter();
  const declared = new Set(Object.values(capabilities));
  if (!hasPicker) declared.delete(picker);
  const values = new Map([[capabilities.onOff, false]]);
  const options = new Map();
  const store = new Map([['currentApp', hdmi4]]);
  const listeners = new Map();
  const subscriptions = new Map();
  const sourceReports = [];
  const pickerOptions = [];
  const pickerValues = [];
  const registered = [];
  const added = [];
  const commands = [];
  const unavailable = [];
  let connectionStarts = 0;
  let inputQueries = 0;

  const driver = {
    manifest: {id: 'webos_plus'},
    initReady: callback => callback(),
    watchDiscovery: () => () => {},
    triggerSourceReported: async (target, tokens) => {
      assert.equal(target, device);
      sourceReports.push(tokens);
    },
    triggerAppChanged: () => {},
  };
  device.driver = driver;
  device.homey = {
    images: {createImage: async () => ({setUrl: () => {}})},
    drivers: {getDriver: () => driver},
  };
  device.setAlbumArtImage = () => {};
  device.log = () => {};
  device.error = () => {};
  device.getSettings = () => ({usePoll: false});
  device.getData = () => ({id: 'picker-fixture-tv'});
  device.getStoreValue = id => store.get(id);
  device.setStoreValue = async (id, value) => store.set(id, value);
  device.setUnavailable = async (reason) => unavailable.push(reason);
  device.hasCapability = id => declared.has(id);
  device.addCapability = async id => {
    assert.equal(id, picker);
    added.push(id);
    if (addPicker) await addPicker();
    declared.add(id);
  };
  device.registerCapabilityListener = (id, callback) => {
    if (id === picker) registered.push(id);
    listeners.set(id, callback);
  };
  device.getCapabilityOptions = id => {
    if (id === picker && rejectMissingPickerOptions && !options.has(id)) {
      throw new Error('Invalid capability "webos_input"');
    }
    return options.get(id) || {};
  };
  device.setCapabilityOptions = async (id, value) => {
    assert.ok(declared.has(id));
    if (id === picker && beforeOptionWrite) await beforeOptionWrite(value);
    options.set(id, structuredClone(value));
    if (id === picker) pickerOptions.push(structuredClone(value.values));
  };
  device.getCapabilityValue = id => values.get(id);
  device.setCapabilityValue = async (id, value) => {
    assert.ok(declared.has(id));
    values.set(id, value);
    if (id === picker) pickerValues.push(value);
  };
  device._connect = () => {
    connectionStarts++;
    device.lgtv = client;
  };
  for (const name of ['powerStateListener', 'volumeListener', 'channelListener', 'soundOutputListener']) {
    device[name] = () => {};
  }
  device._appListLaunchPoints = async () => [];
  device._externalInputList = () => fetchInputs(++inputQueries);
  device._switchInput = async id => commands.push({method: 'switch', id});
  device._appLaunch = async id => commands.push({method: 'launch', id});

  client.subscribe = (uri, callback) => subscriptions.set(uri, callback);
  function source(appId) {
    const callback = subscriptions.get(endpoints.app.getForegroundApp);
    assert.equal(typeof callback, 'function');
    callback(null, {returnValue: true, appId});
  }

  return {
    device, client, values, added, registered, unavailable, commands, sourceReports,
    pickerOptions, pickerValues, source,
    connectionStarts: () => connectionStarts,
    inputQueries: () => inputQueries,
    choose: id => listeners.get(picker)(id),
  };
}

async function connect(f) {
  await f.device.onInit();
  f.client.emit('connect');
  await settle();
}

test('a slow picker capability addition does not delay device startup or raw source reports', async () => {
  const addition = deferred();
  const f = setup({hasPicker: false, addPicker: () => addition.promise});
  const started = f.device.onInit();
  try {
    assert.equal(await Promise.race([started.then(() => true), settle(false)]), true);
    assert.equal(f.connectionStarts(), 1);
    f.client.emit('connect');
    f.source(hdmi3);
    await settle();
    assert.deepEqual(f.added, [picker]);
    assert.deepEqual(f.sourceReports.map(report => report.source), [hdmi3]);
    assert.equal(typeof f.sourceReports[0].reportedAt, 'number');
    assert.equal(f.values.get(capabilities.onOff), true);
    assert.deepEqual(f.pickerValues, []);
  } finally {
    addition.resolve();
    await started;
  }
  await settle();
  assert.deepEqual(f.registered, [picker]);
  assert.deepEqual(f.pickerValues, ['HDMI_3']);
  assert.deepEqual(f.unavailable, []);
});

test('a rejected picker capability addition leaves connected source reporting available', async () => {
  const f = setup({
    hasPicker: false,
    addPicker: async () => { throw new Error('picker capability unavailable'); },
  });
  await connect(f);
  f.source(hdmi1);
  await settle();
  assert.equal(f.connectionStarts(), 1);
  assert.deepEqual(f.added, [picker]);
  assert.deepEqual(f.registered, []);
  assert.deepEqual(f.sourceReports.map(report => report.source), [hdmi1]);
  assert.equal(f.values.get(capabilities.onOff), true);
  assert.deepEqual(f.unavailable, []);
});

test('when foreground arrives before the input list, only the latest picker selection is applied', async () => {
  const inputs = deferred();
  const f = setup({fetchInputs: () => inputs.promise});
  await connect(f);
  f.source(hdmi3);
  f.source(hdmi1);
  f.source(hdmi1);
  await settle();
  assert.deepEqual(f.sourceReports.map(report => report.source), [hdmi3, hdmi1, hdmi1]);
  assert.deepEqual(f.pickerValues, []);

  inputs.resolve([apple, movie]);
  await settle();
  assert.deepEqual(f.pickerOptions, [[
    {id: 'HDMI_1', title: {en: 'Apple TV'}},
    {id: 'HDMI_3', title: {en: 'Movie'}},
  ]]);
  assert.deepEqual(f.pickerValues, ['HDMI_1']);

  f.source('netflix');
  await settle();
  assert.equal(f.sourceReports.at(-1).source, 'netflix');
  assert.deepEqual(f.pickerValues, ['HDMI_1']);
});

test('a newly added picker publishes options even if Homey cannot read absent device overrides', async () => {
  const f = setup({
    hasPicker: false,
    rejectMissingPickerOptions: true,
    fetchInputs: async () => [{...movie, name: ''}],
  });
  await connect(f);
  f.source(hdmi3);
  await settle();

  assert.deepEqual(f.added, [picker]);
  assert.deepEqual(f.pickerOptions, [[{id: 'HDMI_3', title: {en: 'HDMI3'}}]]);
  assert.deepEqual(f.pickerValues, ['HDMI_3']);
  assert.deepEqual(f.sourceReports.map(report => report.source), [hdmi3]);
  await f.choose('HDMI_3');
  assert.deepEqual(f.commands, [{method: 'switch', id: 'HDMI_3'}]);
});

test('a rejected options write retries on the next connection and only changed options are sent again', async () => {
  let writeAttempts = 0;
  const f = setup({
    fetchInputs: async count => count < 4 ? [movie] : [{...movie, name: 'LG DVD Player'}],
    beforeOptionWrite: () => {
      if (++writeAttempts === 1) throw new Error('Homey rejected the first options write');
    },
  });
  const reconnect = async () => {
    f.client.emit('close');
    f.client.emit('connect');
    await settle();
  };
  await connect(f);
  assert.equal(writeAttempts, 1);
  assert.deepEqual(f.pickerOptions, []);

  await reconnect();
  await reconnect();
  assert.equal(writeAttempts, 2);
  assert.deepEqual(f.pickerOptions, [[{id: 'HDMI_3', title: {en: 'Movie'}}]]);

  await reconnect();
  assert.equal(writeAttempts, 3);
  assert.deepEqual(f.pickerOptions.at(-1), [{id: 'HDMI_3', title: {en: 'LG DVD Player'}}]);
});

test('a closed session cannot overwrite the next connection’s picker options or selection', async () => {
  const oldInputs = deferred();
  const f = setup({
    fetchInputs: count => count === 1 ? oldInputs.promise : Promise.resolve([movie]),
  });
  await connect(f);
  assert.equal(f.inputQueries(), 1);
  f.source(hdmi1);
  f.client.emit('close');
  f.client.emit('connect');
  f.source(hdmi3);
  await settle();
  assert.equal(f.inputQueries(), 2);
  assert.deepEqual(f.registered, [picker]);
  assert.equal(f.values.get(picker), 'HDMI_3');
  const options = structuredClone(f.pickerOptions);
  const writes = [...f.pickerValues];

  oldInputs.resolve([apple]);
  await settle();
  assert.deepEqual(f.pickerOptions, options);
  assert.deepEqual(f.pickerValues, writes);
  assert.deepEqual(f.sourceReports.map(report => report.source), [hdmi1, hdmi3]);
});

test('the picker sends the selected record’s original LG ID and rejects unknown IDs', async () => {
  const f = setup({fetchInputs: async () => [{id: 7, name: 'Auxiliary', appId: 'webos.input.aux'}]});
  await connect(f);

  await f.choose('7');
  await assert.rejects(async () => f.choose('none'));
  await assert.rejects(async () => f.choose('HDMI_9'));
  assert.deepEqual(f.commands, [{method: 'switch', id: 7}]);
  assert.deepEqual(f.sourceReports, []);
});

test('only an explicit LG refusal triggers app launch on the current connection', async () => {
  const f = setup();
  await connect(f);
  for (const details of [
    {lgResponseType: 'error'},
    {lgResponseType: 'response', lgReturnValue: false},
  ]) {
    f.commands.length = 0;
    f.device._switchInput = async id => {
      f.commands.push({method: 'switch', id});
      throw Object.assign(new Error('LG refused input switching'), {
        isLGResponseFailure: true,
        ...details,
      });
    };
    await f.choose('HDMI_3');
    assert.deepEqual(f.commands, [
      {method: 'switch', id: 'HDMI_3'},
      {method: 'launch', id: hdmi3},
    ]);
  }

  for (const error of [
    new Error('timeout'),
    Object.assign(new Error('malformed LG payload'), {
      isLGResponseFailure: true,
      lgResponseType: 'response',
    }),
  ]) {
    f.commands.length = 0;
    f.device._switchInput = async id => {
      f.commands.push({method: 'switch', id});
      throw error;
    };
    await assert.rejects(async () => f.choose('HDMI_3'));
    assert.deepEqual(f.commands, [{method: 'switch', id: 'HDMI_3'}]);
  }
});

test('a refusal after the connection closes cannot launch an input app', async () => {
  const response = deferred();
  const f = setup();
  await connect(f);
  f.device._switchInput = async id => {
    f.commands.push({method: 'switch', id});
    return response.promise;
  };

  const choice = f.choose('HDMI_3');
  const rejected = assert.rejects(choice);
  f.client.emit('close');
  response.reject(Object.assign(new Error('LG refused late'), {
    isLGResponseFailure: true,
    lgResponseType: 'error',
  }));
  await rejected;
  assert.deepEqual(f.commands, [{method: 'switch', id: 'HDMI_3'}]);
});

test('a newer selection supersedes the fallback from an older refused switch', async () => {
  const response = deferred();
  const f = setup();
  await connect(f);
  f.device._switchInput = async id => {
    f.commands.push({method: 'switch', id});
    if (id === 'HDMI_3') return response.promise;
  };

  const oldChoice = assert.rejects(f.choose('HDMI_3'));
  await f.choose('HDMI_1');
  response.reject(Object.assign(new Error('LG refused the earlier selection'), {
    isLGResponseFailure: true,
    lgResponseType: 'error',
  }));
  await oldChoice;
  assert.deepEqual(f.commands, [
    {method: 'switch', id: 'HDMI_3'},
    {method: 'switch', id: 'HDMI_1'},
  ]);
});

test.after(() => assert.deepEqual(attempts, []));
