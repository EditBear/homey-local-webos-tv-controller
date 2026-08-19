'use strict';

class ReconnectState {
  constructor(delay, {
    setTimer = setTimeout,
    clearTimer = clearTimeout,
  } = {}) {
    this.delay = Number(delay);
    this.setTimer = setTimer;
    this.clearTimer = clearTimer;
    this.timer = null;
    this.connecting = false;
    this.stopped = false;
  }

  start() {
    this.stopped = false;
  }

  beginConnection() {
    if (this.stopped || this.connecting) return false;
    this.cancelScheduled();
    this.connecting = true;
    return true;
  }

  connectionSettled() {
    this.connecting = false;
  }

  connected() {
    this.connecting = false;
    this.cancelScheduled();
  }

  schedule(callback) {
    if (this.stopped || this.timer || !Number.isFinite(this.delay) || this.delay <= 0) {
      return false;
    }
    this.timer = this.setTimer(() => {
      this.timer = null;
      if (!this.stopped) callback();
    }, this.delay);
    return true;
  }

  cancelScheduled() {
    if (!this.timer) return false;
    this.clearTimer(this.timer);
    this.timer = null;
    return true;
  }

  stop() {
    this.stopped = true;
    this.connecting = false;
    this.cancelScheduled();
  }

  get scheduled() {
    return Boolean(this.timer);
  }
}

module.exports = ReconnectState;
