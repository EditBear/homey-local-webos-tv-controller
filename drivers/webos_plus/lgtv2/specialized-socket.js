'use strict';

class SpecializedSocket {
  constructor(socket, onClose = () => {}) {
    this.socket = socket;
    this.onClose = onClose;
    this.isOpen = true;
  }

  send(type, payload = {}) {
    if (!this.isOpen) throw new Error('specialized socket is closed');
    const message = Object.keys(payload)
      .reduce((lines, key) => lines.concat([`${key}:${payload[key]}`]), [`type:${type}`])
      .join('\n') + '\n\n';
    this.socket.send(message);
  }

  close() {
    if (!this.isOpen) return;
    this.isOpen = false;
    this.socket.close();
    this.onClose(this);
  }

  markClosed() {
    if (!this.isOpen) return;
    this.isOpen = false;
    this.onClose(this);
  }
}

class SpecializedSocketPool {
  constructor(timeout, {
    setTimer = setTimeout,
    clearTimer = clearTimeout,
  } = {}) {
    this.timeout = timeout;
    this.setTimer = setTimer;
    this.clearTimer = clearTimer;
    this.sockets = new Map();
    this.pending = new Map();
  }

  acquire(url, opener) {
    const existing = this.sockets.get(url);
    if (existing && existing.isOpen) return Promise.resolve(existing);
    if (existing) this.sockets.delete(url);

    const pending = this.pending.get(url);
    if (pending) return pending.promise;

    let resolvePromise;
    let rejectPromise;
    const promise = new Promise((resolve, reject) => {
      resolvePromise = resolve;
      rejectPromise = reject;
    });
    let settled = false;
    let timer = null;
    const finish = (error, socket) => {
      if (settled) return false;
      settled = true;
      if (timer) this.clearTimer(timer);
      this.pending.delete(url);
      if (error) {
        rejectPromise(error);
      } else if (!socket || !socket.isOpen) {
        rejectPromise(new Error('specialized socket did not open'));
      } else {
        this.sockets.set(url, socket);
        resolvePromise(socket);
      }
      return true;
    };
    this.pending.set(url, {promise, finish});
    timer = this.setTimer(() => {
      finish(new Error('specialized socket connection timeout'));
    }, this.timeout);
    try {
      opener(finish);
    } catch (error) {
      finish(error);
    }
    return promise;
  }

  remove(url, socket) {
    if (this.sockets.get(url) === socket) {
      this.sockets.delete(url);
      return true;
    }
    return false;
  }

  closeAll(error = new Error('specialized socket pool closed')) {
    for (const {finish} of Array.from(this.pending.values())) {
      finish(error);
    }
    for (const socket of Array.from(this.sockets.values())) {
      socket.close();
    }
    this.pending.clear();
    this.sockets.clear();
  }
}

module.exports = {
  SpecializedSocket,
  SpecializedSocketPool,
};
