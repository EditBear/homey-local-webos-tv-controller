'use strict';

// Simulate HTTP upgrade and wire I/O below the installed lgtv2 and ws packages.
// Their actual timers, registration, frame processing and callbacks still run.
const assert = require('node:assert/strict');
const { createHash } = require('node:crypto');
const { EventEmitter, once } = require('node:events');
const { readFileSync } = require('node:fs');
const http = require('node:http');
const https = require('node:https');
const net = require('node:net');
const path = require('node:path');
const { Duplex } = require('node:stream');
const test = require('node:test');
const { setImmediate: nextTurn, setTimeout: delay } = require('node:timers/promises');
const tls = require('node:tls');

const candidate = path.resolve(__dirname, '..');
const LGTV = require(path.join(candidate, 'drivers/webos_plus/lgtv2/lgtv2.js'));
const guid = '258EAFA5-E914-47DA-95CA-C5AB0DC85B11';
const url = 'wss://127.0.0.1:3001';
const power = 'ssap://com.webos.service.tvpower/power/getPowerState';
const source = 'ssap://com.webos.applicationManager/getForegroundAppInfo';
const channel = 'ssap://tv/getCurrentChannel';
const volume = 'ssap://audio/getVolume';
const pointer = 'ssap://com.webos.service.networkinput/getPointerInputSocket';
const play = 'ssap://media.controls/play';
const pause = 'ssap://media.controls/pause';
const bounds = { timeout: 3000 };

class FixtureWire extends Duplex {
  constructor() {
    super();
    this.writes = [];
    this.connecting = false;
  }

  _read() {}

  _write(chunk, _encoding, done) {
    this.writes.push(Buffer.from(chunk));
    done();
  }

  _final(done) {
    this.push(null);
    done();
  }

  setNoDelay() { return this; }
  setTimeout() { return this; }
}

function fixturePeer(t, modes) {
  const requests = [];
  t.mock.method(net.Socket.prototype, 'connect', () => assert.fail('Fixture attempted real network access'));
  t.mock.method(tls, 'connect', () => assert.fail('Fixture attempted real TLS access'));

  function request(options) {
    assert.equal(options.host, '127.0.0.1');
    const mode = modes[requests.length];
    assert.ok(mode, 'fixture received an unexpected HTTP request');
    const req = new EventEmitter();
    const wire = new FixtureWire();
    const headers = { ...options.headers };
    const record = { req, wire, options, aborts: 0 };
    requests.push(record);
    let timer;

    req.getHeader = name => headers[name];
    req.setHeader = (name, value) => { headers[name] = value; };
    req.abort = () => {
      record.aborts++;
      clearTimeout(timer);
      wire.destroy();
    };
    req.end = () => process.nextTick(() => {
      if (record.aborts) return;
      req.socket = wire;
      req.emit('socket', wire);
      if (mode === 'withheld') {
        assert.ok(options.timeout > 0, 'ws must configure its native upgrade timeout');
        timer = setTimeout(() => req.emit('timeout'), options.timeout);
        return;
      }
      assert.equal(mode, 'upgraded');
      const accept = createHash('sha1').update(headers['Sec-WebSocket-Key'] + guid).digest('base64');
      req.emit('upgrade', {
        statusCode: 101,
        headers: { upgrade: 'websocket', 'sec-websocket-accept': accept },
      }, wire, Buffer.alloc(0));
    });
    return req;
  }

  t.mock.method(http, 'request', request);
  t.mock.method(https, 'request', request);
  t.after(() => {
    for (const { req, wire } of requests) {
      if (!wire.destroyed) req.abort();
    }
  });
  return requests;
}

function clientFrames(wire) {
  let data = Buffer.concat(wire.writes);
  const frames = [];
  while (data.length >= 2) {
    const opcode = data[0] & 0xf;
    assert.ok(data[1] & 0x80, 'client frames must be masked');
    let size = data[1] & 0x7f;
    let headerSize = 2;
    if (size === 126) {
      if (data.length < 4) break;
      size = data.readUInt16BE(2);
      headerSize = 4;
    } else {
      assert.notEqual(size, 127, 'unexpectedly large test frame');
    }
    const end = headerSize + 4 + size;
    if (data.length < end) break;
    const mask = data.subarray(headerSize, headerSize + 4);
    const body = data.subarray(headerSize + 4, end).map((byte, i) => byte ^ mask[i % 4]);
    frames.push({ opcode, body });
    data = data.subarray(end);
  }
  return frames;
}

function clientTextFrames(wire) {
  return clientFrames(wire).filter(frame => frame.opcode === 1).map(frame => frame.body.toString('utf8'));
}

function clientMessages(wire) {
  return clientTextFrames(wire).map(JSON.parse);
}

function sendEnvelope(wire, envelope) {
  const body = Buffer.from(JSON.stringify(envelope));
  const header = body.length < 126 ? Buffer.from([0x81, body.length]) : Buffer.from([0x81, 126, 0, 0]);
  if (header.length === 4) header.writeUInt16BE(body.length, 2);
  wire.push(Buffer.concat([header, body]));
}

function response(wire, id, payload) {
  sendEnvelope(wire, { id, type: 'response', payload });
}

async function waitFor(predicate, description) {
  for (let i = 0; i < 100; i++) {
    const value = predicate();
    if (value) return value;
    await delay(5);
  }
  assert.fail(`Missing fixture evidence: ${description}`);
}

function waitForFrame(wire, type, uri) {
  return waitFor(
    () => clientMessages(wire).find(frame => frame.type === type && (uri === undefined || frame.uri === uri)),
    uri ? `${type} ${uri}` : type,
  );
}

function createClient(t, options = {}) {
  const errors = [];
  const client = new LGTV({
    url,
    clientKey: 'fixture-paired-key',
    saveKey: (_key, done) => done(null),
    reconnect: false,
    timeout: 250,
    handshakeTimeout: 30,
    keepalive: false,
    ...options,
  });
  client.on('error', error => errors.push(error));
  t.after(() => client.disconnect());
  return { client, errors };
}

async function registration(requests, attempt = 0) {
  const { wire } = await waitFor(() => requests[attempt], `socket attempt ${attempt + 1}`);
  return { wire, request: await waitForFrame(wire, 'register') };
}

async function finishRegistration(client, requests, attempt = 0) {
  const { wire, request } = await registration(requests, attempt);
  assert.equal(request.payload['client-key'], 'fixture-paired-key');
  const connected = once(client, 'connect');
  sendEnvelope(wire, { id: request.id, type: 'registered', payload: { 'client-key': 'fixture-paired-key' } });
  await connected;
  return wire;
}

test('the installed transport is pinned to upstream lgtv2 and ws', () => {
  function version(name) {
    return JSON.parse(readFileSync(path.join(candidate, 'node_modules', name, 'package.json'), 'utf8')).version;
  }
  assert.equal(version('lgtv2'), '2.1.0');
  assert.equal(version('ws'), '8.22.2');
});

test('a native upgrade timeout retries once, then paired power, source and channel reports arrive', bounds, async t => {
  const requests = fixturePeer(t, ['withheld', 'upgraded']);
  const { client, errors } = createClient(t, { reconnect: 20 });
  const wire = await finishRegistration(client, requests, 1);
  const reports = [
    [power, { subscribed: true, state: 'Active' }],
    [source, { subscribed: true, appId: 'com.webos.app.livetv' }],
    [channel, { subscribed: true, channelNumber: '231' }],
  ];
  const received = new Map();
  for (const [uri, payload] of reports) {
    const callback = (error, value) => {
      assert.ifError(error);
      received.set(uri, value);
    };
    if (uri === channel) client.subscribeWithCancel(uri, callback);
    else client.subscribe(uri, {}, callback);
    const frame = await waitForFrame(wire, 'subscribe', uri);
    response(wire, frame.id, payload);
  }
  await waitFor(() => received.size === reports.length, 'all fresh reports after registration');
  assert.deepEqual(received, new Map(reports));
  assert.deepEqual(requests.map(request => String(request.options.port)), ['3001', '3001']);
  assert.equal(requests[0].options.timeout, 30);
  assert.equal(requests[0].aborts, 1);
  assert.equal(errors.length, 1);
  assert.match(errors[0].message, /timed out|timeout/i);
});

test('native host selection tries secure 3001 before falling back to 3000', bounds, async t => {
  const requests = fixturePeer(t, ['withheld', 'upgraded']);
  const { client, errors } = createClient(t, { url: undefined, host: '127.0.0.1' });
  const wire = await finishRegistration(client, requests, 1);
  assert.deepEqual(requests.map(request => String(request.options.port)), ['3001', '3000']);
  assert.equal(requests[0].aborts, 1);
  assert.equal(requests[1].wire, wire);
  assert.deepEqual(errors, []);
});

test('a missing pong retires the open connection and the next registration delivers fresh state', bounds, async t => {
  const requests = fixturePeer(t, ['upgraded', 'upgraded']);
  const { client, errors } = createClient(t, {
    reconnect: 20,
    keepalive: true,
    keepaliveInterval: 40,
    keepaliveGracePeriod: 35,
  });
  const firstWire = await finishRegistration(client, requests);
  const lost = once(client, 'close');
  const ping = await waitFor(() => clientFrames(firstWire).find(frame => frame.opcode === 9), 'a native keepalive ping');
  assert.equal(ping.body.length, 0);
  // Deliberately leave the ping unanswered. The peer does not send a close frame.
  const [code] = await lost;
  assert.equal(code, 1006);
  assert.equal(firstWire.destroyed, true);
  const unavailable = await new Promise(resolve => client.request(power, resolve));
  assert.match(unavailable?.message ?? '', /not connected/i);

  const freshWire = await finishRegistration(client, requests, 1);
  const received = new Promise((resolve, reject) => client.subscribe(source, (error, payload) => {
    if (error) reject(error);
    else resolve(payload);
  }));
  const subscription = await waitForFrame(freshWire, 'subscribe', source);
  const reported = { subscribed: true, appId: 'com.webos.app.livetv' };
  response(freshWire, subscription.id, reported);
  assert.deepEqual(await received, reported);
  assert.deepEqual(errors, []);
});

test('twelve failed openings still allow recovery, and retirement clears the next queued attempt', bounds, async t => {
  const failureCount = 12;
  const requests = fixturePeer(t, [...Array(failureCount).fill('withheld'), 'upgraded']);
  const { client } = createClient(t, { reconnect: 12, handshakeTimeout: 8 });
  const recoveredWire = await finishRegistration(client, requests, failureCount);
  assert.equal(requests.length, failureCount + 1);
  for (const { aborts, wire } of requests.slice(0, failureCount)) {
    assert.equal(aborts, 1);
    assert.equal(wire.destroyed, true);
  }

  const closed = once(client, 'close');
  recoveredWire.push(Buffer.from([0x88, 2, 0x03, 0xe8]));
  await closed;
  await client.disconnect();
  await delay(50);
  assert.equal(requests.length, failureCount + 1);
});

test('pairing stays unavailable until the signed registration key has been saved', bounds, async t => {
  const requests = fixturePeer(t, ['upgraded']);
  const saved = [];
  let completeSave;
  const { client, errors } = createClient(t, {
    clientKey: null,
    saveKey(key, done) {
      saved.push(key);
      completeSave = done;
    },
  });
  let connected = 0;
  client.on('connect', () => connected++);
  const { wire, request } = await registration(requests);
  assert.equal(request.payload['client-key'], undefined);
  assert.ok(request.payload.manifest.signed);
  assert.ok(request.payload.manifest.signatures.length > 0);

  const prompt = once(client, 'prompt');
  response(wire, request.id, { pairingType: 'PROMPT', returnValue: true });
  await prompt;
  const rejected = await new Promise(resolve => client.request(power, resolve));
  assert.ok(rejected instanceof Error);
  assert.equal(clientMessages(wire).filter(frame => frame.type === 'request').length, 0);
  sendEnvelope(wire, { id: request.id, type: 'registered', payload: { 'client-key': 'fixture-new-key' } });
  await waitFor(() => completeSave, 'Homey key store callback');
  assert.equal(connected, 0);
  assert.deepEqual(saved, ['fixture-new-key']);
  const ready = once(client, 'connect');
  completeSave(null);
  await ready;
  assert.equal(connected, 1);
  assert.deepEqual(errors, []);
});

test('a pending registration and a failed key save both leave commands blocked', bounds, async t => {
  const requests = fixturePeer(t, ['upgraded']);
  const storageFailure = new Error('Fixture Homey key storage failed');
  let saveCount = 0;
  const { client, errors } = createClient(t, {
    clientKey: null,
    saveKey(_key, done) {
      saveCount++;
      setImmediate(() => done(storageFailure));
    },
  });
  let connected = 0;
  client.on('connect', () => connected++);
  const { wire, request } = await registration(requests);
  await delay(30);
  assert.equal(connected, 0);
  assert.equal(saveCount, 0);
  const pending = await new Promise(resolve => client.request(power, resolve));
  assert.match(pending?.message ?? '', /not connected/i);

  sendEnvelope(wire, { id: request.id, type: 'registered', payload: { 'client-key': 'fixture-unsaved-key' } });
  await waitFor(() => errors.length > 0, 'the asynchronous key-storage failure');
  const unsaved = await new Promise(resolve => client.request(power, resolve));
  assert.match(unsaved?.message ?? '', /not connected/i);
  assert.equal(connected, 0);
  assert.equal(saveCount, 1);
  assert.deepEqual(errors, [storageFailure]);
  assert.deepEqual(clientMessages(wire), [request]);
});

test('the exact blacklist response does not send an unsigned register frame', bounds, async t => {
  const requests = fixturePeer(t, ['upgraded']);
  const { client, errors } = createClient(t, { clientKey: null });
  let connected = false;
  client.once('connect', () => { connected = true; });
  const { wire, request } = await registration(requests);
  const errorText = '403 Pairing rejected: blacklisted certificate detected';
  sendEnvelope(wire, { id: request.id, type: 'error', error: errorText });
  await waitFor(() => errors.length > 0, 'signed registration rejection');
  await nextTurn();
  assert.deepEqual(errors.map(error => error.message), [errorText]);
  assert.deepEqual(clientMessages(wire).filter(frame => frame.type === 'register'), [request]);
  assert.equal(connected, false);
});

test('concurrent playback replies keep the matching original LG envelope and settle once', bounds, async t => {
  const requests = fixturePeer(t, ['upgraded']);
  const { client, errors } = createClient(t);
  const wire = await finishRegistration(client, requests);
  const calls = [];
  client.requestPlayback(play, (...args) => calls.push({ name: 'play', args }));
  client.requestPlayback(pause, (...args) => calls.push({ name: 'pause', args }));
  const playFrame = await waitForFrame(wire, 'request', play);
  const pauseFrame = await waitForFrame(wire, 'request', pause);
  assert.notEqual(playFrame.id, pauseFrame.id);
  const failure = {
    id: pauseFrame.id,
    type: 'error',
    error: '500 Application error',
    errorCode: 500,
    payload: { returnValue: false, errorText: 'Playback state unavailable' },
  };
  response(wire, 'unknown-fixture-id', { returnValue: true });
  sendEnvelope(wire, failure);
  sendEnvelope(wire, failure);
  const success = { id: playFrame.id, type: 'response', payload: { returnValue: true } };
  sendEnvelope(wire, success);
  await waitFor(() => calls.length >= 2, 'matching playback replies');
  await nextTurn();
  assert.deepEqual(calls, [
    { name: 'pause', args: [null, failure.payload, failure] },
    { name: 'play', args: [null, success.payload, success] },
  ]);
  assert.deepEqual(errors, []);
});

test('channel cancellation retires its own id and ignores a late frame after resubscription', bounds, async t => {
  const requests = fixturePeer(t, ['upgraded']);
  const { client, errors } = createClient(t);
  const wire = await finishRegistration(client, requests);
  const before = [];
  const after = [];
  const readChannel = into => (error, payload) => {
    assert.ifError(error);
    into.push(payload.channelNumber);
  };
  const cancel = client.subscribeWithCancel(channel, readChannel(before));
  const original = await waitForFrame(wire, 'subscribe', channel);
  response(wire, original.id, { subscribed: true, channelNumber: '101' });
  await waitFor(() => before.length === 1, 'first channel delivery');
  cancel();
  cancel();
  const unsubscribe = await waitForFrame(wire, 'unsubscribe');
  assert.equal(unsubscribe.id, original.id);
  client.subscribeWithCancel(channel, readChannel(after));
  const replacement = await waitFor(
    () => clientMessages(wire).find(frame => frame.type === 'subscribe' && frame.uri === channel && frame.id !== original.id),
    'replacement channel subscription',
  );
  response(wire, original.id, { channelNumber: '999' });
  response(wire, replacement.id, { subscribed: true, channelNumber: '231' });
  await waitFor(() => after.length === 1, 'replacement channel delivery');
  await nextTurn();
  assert.deepEqual(before, ['101']);
  assert.deepEqual(after, ['231']);
  assert.equal(clientMessages(wire).filter(frame => frame.type === 'unsubscribe').length, 1);
  assert.deepEqual(errors, []);
});

test('background channel 500 is identifiable and a nested volume report stays unchanged', bounds, async t => {
  const requests = fixturePeer(t, ['upgraded']);
  const { client, errors } = createClient(t);
  const wire = await finishRegistration(client, requests);
  const observed = [];
  client.subscribeWithCancel(channel, (error, payload) => observed.push({ error, payload }));
  const channelFrame = await waitForFrame(wire, 'subscribe', channel);
  sendEnvelope(wire, { id: channelFrame.id, type: 'error', error: '500 Application error', errorCode: 500 });
  const [channelError] = await waitFor(() => observed.length && observed, 'marked channel error');
  assert.equal(channelError.error.message, '500 Application error');
  assert.equal(channelError.error.isLGResponseFailure, true);
  assert.equal(channelError.error.lgErrorCode, 500);
  assert.equal(channelError.payload, undefined);

  const nested = { subscribed: true, volumeStatus: { volume: 23, muteStatus: false } };
  client.subscribe(volume, {}, (error, payload) => observed.push({ error, payload }));
  const volumeFrame = await waitForFrame(wire, 'subscribe', volume);
  response(wire, volumeFrame.id, nested);
  await waitFor(() => observed.length === 2, 'nested volume payload');
  assert.ifError(observed[1].error);
  assert.deepEqual(observed[1].payload, nested);
  assert.deepEqual(errors, []);
});

test('the button socket writes the legacy frame and closes with its main connection', bounds, async t => {
  const requests = fixturePeer(t, ['upgraded', 'upgraded']);
  const { client, errors } = createClient(t);
  const wire = await finishRegistration(client, requests);
  const opened = new Promise((resolve, reject) => client.getSocket(pointer,
    (error, button) => error ? reject(error) : resolve(button)));
  const input = await waitForFrame(wire, 'request', pointer);
  response(wire, input.id, { returnValue: true, socketPath: url + '/fixture-pointer' });
  const button = await opened;
  const buttonWire = requests[1].wire;
  assert.equal(button.isOpen(), true);
  await button.send('button', { name: 'BACK' });
  assert.deepEqual(clientTextFrames(buttonWire), ['type:button\nname:BACK\n\n']);

  const buttonClosed = once(button, 'close');
  const mainClosed = once(client, 'close');
  wire.push(Buffer.from([0x88, 2, 0x03, 0xe8]));
  await Promise.all([buttonClosed, mainClosed]);
  assert.equal(button.isOpen(), false);
  await assert.rejects(button.send('button', { name: 'BACK' }), /not open/);
  assert.deepEqual(errors, []);
});
