'use strict';

class LifecycleState {
  constructor() {
    this.generation = 0;
    this.deleted = false;
  }

  begin() {
    if (this.deleted) return null;
    this.generation += 1;
    return this.generation;
  }

  isCurrent(client, currentClient, generation) {
    return !this.deleted
      && client === currentClient
      && generation === this.generation;
  }

  isGeneration(generation) {
    return !this.deleted && generation === this.generation;
  }

  stop() {
    this.deleted = true;
    this.generation += 1;
  }
}

class SerialTaskQueue {
  constructor() {
    this.tail = Promise.resolve();
  }

  run(task) {
    const result = this.tail
      .catch(() => undefined)
      .then(task);
    this.tail = result;
    return result;
  }
}

module.exports = {
  LifecycleState,
  SerialTaskQueue,
};
