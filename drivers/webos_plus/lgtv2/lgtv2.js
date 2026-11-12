'use strict';

const { EventEmitter } = require('node:events');
const UpstreamLGTV = require('lgtv2');
const pairing = require('./pairing.json');
const openButtonSocket = require('./button-socket');

function lgFailure(reply) {
  const payload = reply.payload || {};
  const detail = reply.type === 'error'
    ? reply.error || payload.errorText || 'LG returned an error response'
    : payload.errorText || (payload.returnValue === false
      ? 'LG response reported failure' : 'LG response did not include a payload');
  const error = new Error(detail);
  error.isLGResponseFailure = true;
  error.lgResponseType = reply.type;
  if (reply.error !== undefined) error.lgError = reply.error;
  const code = reply.errorCode ?? payload.errorCode;
  if (code !== undefined) error.code = error.lgErrorCode = code;
  return error;
}

function legacySubscriptionPayload(payload) {
  if (!payload?.subscribed) return payload;
  const reported = ['muted', 'volume'].filter(name => payload[name] !== undefined);
  return reported.length
    ? { ...payload, changed: [...new Set([...(Array.isArray(payload.changed) ? payload.changed : []), ...reported])] }
    : payload;
}

// Keep the accepted Homey-facing API while delegating the main connection,
// reconnects, registration and SSAP request dispatch to lgtv2.
module.exports = function createLGTV(options) {
  const client = new EventEmitter();
  const operations = new Map();
  const closeButtons = new Set();
  const timeout = options.timeout ?? 15000;
  let ready = false;
  let retired = false;
  let session = 0;
  let persisted = Promise.resolve(true);
  let savedClientKey = options.clientKey ?? null;

  const upstream = new UpstreamLGTV({
    url: options.url,
    host: options.host,
    timeout,
    reconnect: options.reconnect,
    handshakeTimeout: options.handshakeTimeout,
    keepalive: options.keepalive ?? true,
    ...(options.keepaliveInterval === undefined ? {} : { keepaliveInterval: options.keepaliveInterval }),
    ...(options.keepaliveGracePeriod === undefined ? {} : { keepaliveGracePeriod: options.keepaliveGracePeriod }),
    clientKey: options.clientKey ?? null,
    learnMac: false,
    rejectUnauthorized: false,
    wsOptions: { agent: false, perMessageDeflate: false, maxPayload: 8 * 1024 * 1024 },
    saveKey(key, done) {
      persisted = new Promise(resolve => {
        if (retired) {
          resolve(false);
          return;
        }
        const complete = error => {
          if (!error && !retired) savedClientKey = key;
          resolve(!error);
          if (!retired) done(error);
        };
        try { options.saveKey(key, complete); } catch (error) { complete(error); }
      });
    },
  });

  Object.defineProperty(client, 'clientKey', {
    get: () => upstream.clientKey,
    set: key => { upstream.clientKey = key; },
  });

  // Preserve the approved signed permissions. Upstream's internal unsigned
  // fallback would otherwise widen this private test to unaccepted webOS 26 pairing.
  const send = upstream.send.bind(upstream);
  let rejectedRegistration;
  upstream.send = (type, uri, payload, callback) => {
    if (type !== 'register') return send(type, uri, payload, callback);
    if (!payload?.manifest?.signed) {
      callback(rejectedRegistration || new Error('LG refused signed registration'));
      return;
    }
    rejectedRegistration = undefined;
    const approved = JSON.parse(JSON.stringify(pairing));
    if (payload['client-key']) approved['client-key'] = payload['client-key'];
    return send(type, uri, approved, (error, result) => {
      rejectedRegistration = error;
      callback(error, result);
    });
  };

  upstream.on('message', text => {
    try {
      const reply = JSON.parse(text);
      const operation = operations.get(reply?.id);
      if (operation) operation.reply = reply;
    } catch {
      // Upstream reports the parse failure. Never forward the raw frame to logs.
    }
  });
  upstream.on('error', error => {
    if (retired) return;
    client.emit('error', error.message?.startsWith('JSON parse error ')
      ? new Error('LG sent a malformed JSON response') : error);
  });
  upstream.on('prompt', () => { if (!retired) client.emit('prompt'); });
  upstream.on('connect', async () => {
    const current = ++session;
    const saved = await persisted;
    if (retired || current !== session || !upstream.connected) return;
    if (saved) {
      ready = true;
      client.emit('connect');
    }
  });

  function clearConnection() {
    ++session;
    ready = false;
    operations.clear();
    for (const close of closeButtons) close();
    closeButtons.clear();
  }

  upstream.on('close', close => {
    clearConnection();
    if (!retired) client.emit('close', close.code);
  });

  function issue(kind, uri, payload, callback, playback = false) {
    if (typeof payload === 'function') {
      callback = payload;
      payload = {};
    }
    if (retired || !ready || !upstream.connected) {
      callback(new Error('not connected'));
      return;
    }
    const operation = {};
    const id = upstream[kind](uri, payload, (error, result) => {
      if (kind === 'request') operations.delete(operation.id);
      if (retired) {
        if (kind === 'request') callback(new Error('TV connection retired'));
        return;
      }
      const reply = operation.reply;
      operation.reply = undefined;
      if (!reply) return callback(error, result);
      if (playback) return callback(null, reply.payload, reply);
      if (reply.type === 'error' || reply.payload == null || reply.payload.returnValue === false) {
        return callback(lgFailure(reply));
      }
      // A nested volume report must keep SOURCEID3's reporting-only behavior.
      callback(null, kind === 'subscribe' ? legacySubscriptionPayload(reply.payload) : reply.payload);
    });
    operation.id = id;
    if (id) operations.set(id, operation);
    return id;
  }

  client.request = (uri, payload, callback) => { issue('request', uri, payload, callback); };
  client.advanceReconnect = address => !retired && address === options.host &&
    typeof savedClientKey === 'string' && savedClientKey.length > 0 &&
    upstream.clientKey === savedClientKey && (upstream.advanceReconnect?.() ?? false);
  client.requestPlayback = (uri, callback) => { issue('request', uri, {}, callback, true); };
  client.subscribe = (uri, payload, callback) => { issue('subscribe', uri, payload, callback); };
  client.subscribeWithCancel = (uri, callback) => {
    const id = issue('subscribe', uri, callback);
    return () => {
      if (operations.delete(id)) upstream.unsubscribe(id);
    };
  };
  client.getSocket = (uri, callback) => {
    const current = session;
    client.request(uri, (error, result) => {
      if (error) return callback(error);
      if (current !== session || !ready) return callback(new Error('TV connection changed during button setup'));
      openButtonSocket(result?.socketPath, timeout, closeButtons, callback);
    });
  };
  client.disconnect = () => {
    retired = true;
    clearConnection();
    return upstream.disconnect();
  };
  return client;
};
