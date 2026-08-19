'use strict';

const DEFAULT_DISCONNECT_OFF_GRACE_MS = 10000;

/**
 * Delay an inferred power-off after a connection failure so a short LG
 * WebSocket restart cannot masquerade as a physical television power cycle.
 */
class DisconnectOffGuard {
  constructor({
    delayMs = DEFAULT_DISCONNECT_OFF_GRACE_MS,
    setTimer = setTimeout,
    clearTimer = clearTimeout,
  } = {}) {
    if (!Number.isFinite(delayMs) || delayMs < 0) {
      throw new TypeError('Disconnect-off grace must be a non-negative number');
    }
    this.delayMs = delayMs;
    this.setTimer = setTimer;
    this.clearTimer = clearTimer;
    this.timer = null;
  }

  schedule(action) {
    if (typeof action !== 'function') {
      throw new TypeError('Disconnect-off action must be a function');
    }
    if (this.timer !== null) return false;
    this.timer = this.setTimer(() => {
      this.timer = null;
      action();
    }, this.delayMs);
    return true;
  }

  cancel() {
    if (this.timer === null) return false;
    this.clearTimer(this.timer);
    this.timer = null;
    return true;
  }

  get pending() {
    return this.timer !== null;
  }
}

/**
 * Bind lifecycle callbacks to one LG client while ignoring events emitted by
 * a client that has since been replaced.
 */
function bindCurrentConnection(client, handlers) {
  const {
    isCurrent,
    onConnect,
    onClose,
    onError,
  } = handlers;

  client.on('connect', (...args) => {
    if (isCurrent(client)) {
      onConnect(...args);
    }
  });

  client.on('close', (...args) => {
    if (isCurrent(client)) {
      onClose(...args);
    }
  });

  client.on('error', (...args) => {
    if (isCurrent(client)) {
      onError(...args);
    }
  });
}

module.exports = {
  DEFAULT_DISCONNECT_OFF_GRACE_MS,
  DisconnectOffGuard,
  bindCurrentConnection,
};
