'use strict';

const SOURCE_NAME_CAPABILITY = 'speaker_artist';
const LIVE_TV_ID = 'com.webos.app.livetv';
// Display formatting only: raw source identities and events are untouched.
const fallbackName = id => {
  if (id === LIVE_TV_ID) return 'Live TV';
  const port = /^com\.webos\.app\.hdmi([1-4])$/.exec(id)?.[1];
  return port ? `HDMI${port}` : '';
};

// Guarded reporting into the original app/input field. No new TV requests.
class SourceNameReport {
  constructor(write, error, initialValue, writeLegacy) {
    this.write = write;
    this.writeLegacy = writeLegacy;
    this.error = error;
    this.reportedValue = initialValue;
    this.generation = 0;
    this.sequence = 0;
    this.sourceId = null;
    this.pending = null;
    this.writing = false;
  }

  reset() {
    this.generation += 1;
    this.sequence += 1;
    this.sourceId = null;
    this.publish('');
    return this.generation;
  }

  invalidate(generation) {
    if (generation === this.generation) this.reset();
  }

  begin(generation, sourceId) {
    if (generation !== this.generation) return null;
    this.sequence += 1;
    const id = typeof sourceId === 'string' && sourceId.trim().length ? sourceId : null;
    let initialName = null;
    if (id !== this.sourceId) {
      this.sourceId = id;
      // Clear the previous label while waiting for the current source's name.
      // Live TV keeps its existing immediate label.
      initialName = id === LIVE_TV_ID ? 'Live TV' : '';
      this.publish(initialName);
    }
    return id === null ? null : {generation, sequence: this.sequence, id, initialName};
  }

  resolve(ticket, apps) {
    if (!ticket || ticket.generation !== this.generation
      || ticket.sequence !== this.sequence) return;

    // Existing lookup logs its rejection. A failed refresh must not rewrite
    // an unchanged-source name or manufacture fresh timestamp evidence.
    if (apps === undefined || apps === null) return;
    if (!Array.isArray(apps) || Array.from(apps).some(app => !app
      || typeof app.id !== 'string' || !app.id.length)) {
      this.error(new TypeError('App-name lookup did not return a valid app list'));
      return;
    }

    const app = apps.find(entry => entry.id === ticket.id);
    const name = app && typeof app.name === 'string' && app.name.trim().length
      ? app.name : fallbackName(ticket.id);
    // Avoid repeating the initial write for this report, even if it failed.
    if (name !== ticket.initialName) this.publish(name);
  }

  publish(value) {
    // One outstanding write, one replaceable latest value. A source change
    // replaces an obsolete pending name, even if an earlier write is slow.
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
        if (value === this.reportedValue) continue;
        try {
          await this.write(value);
          this.reportedValue = value;
        } catch (error) {
          this.error(error);
        }
      }
    } finally {
      this.writing = false;
    }
  }
}

module.exports = {SourceNameReport, SOURCE_NAME_CAPABILITY};
