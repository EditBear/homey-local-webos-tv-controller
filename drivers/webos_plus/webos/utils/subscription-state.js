'use strict';

class SubscriptionState {
  constructor(maxAttempts = 3) {
    this.maxAttempts = maxAttempts;
    this.reset();
  }

  reset() {
    this.generation = (this.generation || 0) + 1;
    this.status = 'idle';
    this.attempts = 0;
  }

  resetFailures() {
    if (this.status === 'failed') {
      this.attempts = 0;
    }
  }

  begin() {
    if (this.status === 'subscribing' || this.status === 'active') {
      return null;
    }
    if (this.attempts >= this.maxAttempts) {
      return null;
    }
    this.attempts += 1;
    this.generation += 1;
    this.status = 'subscribing';
    return this.generation;
  }

  succeed(generation) {
    if (generation !== this.generation) {
      return false;
    }
    this.status = 'active';
    this.attempts = 0;
    return true;
  }

  fail(generation) {
    if (generation !== this.generation) {
      return false;
    }
    this.status = 'failed';
    return true;
  }

  canRetry() {
    return this.status === 'failed' && this.attempts < this.maxAttempts;
  }
}

module.exports = SubscriptionState;
