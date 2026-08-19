'use strict';

class CallbackRegistry {
  constructor({
    setTimer = setTimeout,
    clearTimer = clearTimeout,
  } = {}) {
    this.entries = new Map();
    this.setTimer = setTimer;
    this.clearTimer = clearTimer;
  }

  addOneShot(id, callback, timeoutMs, label = 'request') {
    this.addUntil(id, callback, timeoutMs, label, () => true);
  }

  addUntil(id, callback, timeoutMs, label, isComplete) {
    this.remove(id);
    const entry = {
      callback,
      persistent: false,
      isComplete,
      timer: null,
    };
    entry.timer = this.setTimer(() => {
      if (this.entries.get(id) !== entry) return;
      this.entries.delete(id);
      callback(new Error(`${label} timeout`));
    }, timeoutMs);
    this.entries.set(id, entry);
  }

  addPersistent(id, callback) {
    this.remove(id);
    this.entries.set(id, {
      callback,
      persistent: true,
      isComplete: null,
      timer: null,
    });
  }

  dispatch(id, error, result) {
    const entry = this.entries.get(id);
    if (!entry) return false;
    const complete = !entry.persistent && (error || entry.isComplete(error, result));
    if (complete) {
      this.entries.delete(id);
      if (entry.timer) this.clearTimer(entry.timer);
    }
    entry.callback(error, result);
    return true;
  }

  remove(id) {
    const entry = this.entries.get(id);
    if (!entry) return false;
    this.entries.delete(id);
    if (entry.timer) this.clearTimer(entry.timer);
    return true;
  }

  failAll(error) {
    const entries = Array.from(this.entries.values());
    this.entries.clear();
    for (const entry of entries) {
      if (entry.timer) this.clearTimer(entry.timer);
      entry.callback(error);
    }
  }

  get size() {
    return this.entries.size;
  }
}

function createCorrelationIdFactory(prefix) {
  let count = 0;
  return function getCorrelationId() {
    const id = `${prefix}${count.toString(16).padStart(4, '0')}`;
    count += 1;
    return id;
  };
}

module.exports = {
  CallbackRegistry,
  createCorrelationIdFactory,
};
