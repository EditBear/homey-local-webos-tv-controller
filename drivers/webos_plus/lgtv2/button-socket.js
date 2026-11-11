'use strict';

const { EventEmitter } = require('node:events');
const WebSocket = require('ws');

// Homey's button action needs an awaitable write and a close notification.
module.exports = function openButtonSocket(url, timeout, owners, callback) {
  let socket;
  try {
    socket = new WebSocket(url, { rejectUnauthorized: false, perMessageDeflate: false, handshakeTimeout: timeout });
  } catch (error) {
    callback(error);
    return;
  }
  const button = new EventEmitter();
  const pending = new Set();
  let opening = true;
  let closed = false;

  function complete(error) {
    if (!opening) return;
    opening = false;
    clearTimeout(deadline);
    callback(error, error ? undefined : button);
  }

  function retire(error) {
    if (closed) return;
    closed = true;
    owners.delete(close);
    complete(error);
    for (const finish of pending) finish(error);
    button.emit('close');
  }

  function close() {
    retire(new Error('Button connection closed'));
    socket.terminate();
  }

  const deadline = setTimeout(() => {
    retire(new Error('Button input connection timed out'));
    socket.terminate();
  }, timeout);
  owners.add(close);
  socket.once('open', () => { if (!closed) complete(null); });
  socket.on('error', error => {
    retire(error);
    socket.terminate();
  });
  socket.once('close', () => retire(new Error('Button connection closed')));
  button.isOpen = () => !closed && socket.readyState === WebSocket.OPEN;
  button.close = close;
  button.send = (type, payload) => new Promise((resolve, reject) => {
    if (!button.isOpen()) return reject(new Error('Button connection is not open'));
    const message = ['type:' + type, ...Object.entries(payload || {}).map(([key, value]) => key + ':' + value)]
      .join('\n') + '\n\n';
    const timer = setTimeout(() => finish(new Error('Button write timed out; delivery is unknown')), timeout);
    function finish(error) {
      if (!pending.delete(finish)) return;
      clearTimeout(timer);
      if (error) reject(error);
      else resolve();
    }
    pending.add(finish);
    try { socket.send(message, finish); } catch (error) { finish(error); }
  });
};
