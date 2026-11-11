'use strict';

const CHANNEL_CAPABILITY = 'speaker_track';
const LIVE_TV_ID = 'com.webos.app.livetv';
const SETTLE_MS = 2000;

function channelValue(reply) {
  if (!reply || typeof reply !== 'object' || Array.isArray(reply)
    || reply.returnValue === false) return null;
  const raw = reply.channelNumber;
  const number = typeof raw === 'string' ? raw.trim()
    : (Number.isSafeInteger(raw) && raw >= 0 ? String(raw) : '');
  // Preserve leading zeros and broadcast subchannel notation; never coerce
  // booleans, missing numbers, or arbitrary text into a channel for V4.
  if (!/^\d+(?:[.-]\d+)?$/.test(number)) return null;
  const name = typeof reply.channelName === 'string' ? reply.channelName.trim() : '';
  return {number, text: name ? `${number} | ${name}` : number};
}

// Owns only channel reporting. No power interpretation, commands or retries.
class ChannelReport {
  constructor({write, error, onChannel, initialValue, writeLegacy, setTimer = setTimeout, clearTimer = clearTimeout}) {
    this.write = write;
    this.writeLegacy = writeLegacy;
    this.error = error;
    this.onChannel = onChannel;
    this.reported = initialValue;
    this.setTimer = setTimer;
    this.clearTimer = clearTimer;
    this.generation = 0;
    this.visit = 0;
    this.active = false;
    this.sourceId = null;
    this.timer = null;
    this.cancel = null;
    this.pending = null;
    this.writing = false;
  }

  bind(subscribe, isCurrent) {
    const retired = this.stop();
    this.subscribe = subscribe;
    this.isCurrent = isCurrent;
    this.active = retired;
    return this.generation;
  }

  cancelVisit() {
    this.visit += 1;
    if (this.timer !== null) this.clearTimer(this.timer);
    this.timer = null;
    const cancel = this.cancel;
    this.cancel = null;
    if (cancel) {
      try { cancel(); } catch (error) { this.error(error); return false; }
    }
    return true;
  }

  stop() {
    this.active = false;
    this.generation += 1;
    const retired = this.cancelVisit();
    this.sourceId = null;
    this.publish('');
    return retired;
  }

  source(generation, sourceId) {
    if (!this.active || generation !== this.generation || !this.isCurrent()) return;
    const id = typeof sourceId === 'string' && sourceId.length ? sourceId : null;
    if (id === this.sourceId) return;
    if (!this.cancelVisit()) {
      // Do not create a second server subscription after an uncertain removal.
      this.active = false;
      this.sourceId = null;
      this.publish('');
      return;
    }
    this.sourceId = id;
    this.publish('');
    if (id !== LIVE_TV_ID) return;

    const visit = this.visit;
    const current = () => this.active && generation === this.generation
      && visit === this.visit && this.sourceId === LIVE_TV_ID && this.isCurrent();
    this.timer = this.setTimer(() => {
      this.timer = null;
      if (!current()) return;
      try {
        const cancel = this.subscribe((error, reply) => {
          if (!current()) return;
          // The subscription adapter uses null for an unavailable tuner sample.
          if (!error && reply === null) {
            this.publish('');
            return;
          }
          const value = error ? null : channelValue(reply);
          if (!value) {
            this.publish('');
            this.error(error || new Error('Current channel reply has no usable channel number'));
            return;
          }
          this.publish(value.text);
          // Existing channel events remain independent of Homey display writes.
          try { this.onChannel(reply); } catch (failure) { this.error(failure); }
        });
        if (current()) this.cancel = cancel;
        else if (cancel) cancel();
      } catch (error) {
        if (current()) this.publish('');
        this.error(error);
      }
    }, SETTLE_MS);
  }

  publish(value) {
    this.pending = value;
    if (!this.writing) this.drain();
    this.writeLegacy?.(value);
  }

  async drain() {
    this.writing = true;
    try {
      while (this.pending !== null) {
        const value = this.pending;
        this.pending = null;
        if (value === this.reported) continue;
        try {
          await this.write(value);
          this.reported = value;
        } catch (error) { this.error(error); }
      }
    } finally { this.writing = false; }
  }
}

module.exports = {ChannelReport, CHANNEL_CAPABILITY, channelValue};
