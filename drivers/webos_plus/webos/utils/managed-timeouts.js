'use strict';

class ManagedTimeouts {
  constructor({
    setTimer = setTimeout,
    clearTimer = clearTimeout,
  } = {}) {
    this.setTimer = setTimer;
    this.clearTimer = clearTimer;
    this.timers = new Set();
  }

  schedule(callback, delay) {
    const timer = this.setTimer(() => {
      this.timers.delete(timer);
      callback();
    }, delay);
    this.timers.add(timer);
    return timer;
  }

  clearAll() {
    for (const timer of this.timers) {
      this.clearTimer(timer);
    }
    this.timers.clear();
  }

  get size() {
    return this.timers.size;
  }
}

module.exports = ManagedTimeouts;
