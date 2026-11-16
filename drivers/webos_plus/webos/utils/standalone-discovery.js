'use strict';

function discoveryId(result) {
  return typeof result?.id === 'string' ? result.id.replace(/^uuid:/, '') : '';
}

// SSDP supplies address updates without letting driver-linked discovery decide
// whether Homey may dispatch commands to a paired TV in standby.
class StandaloneDiscovery {
  constructor(strategy) {
    this.strategy = strategy;
    this.watches = new Map();
    this.onResult = result => {
      const watch = this.watches.get(discoveryId(result));
      if (watch) this.bindResult(watch, result, true);
    };
  }

  watch(id, notify) {
    this.watches.get(id)?.stop();
    const watch = {id, notify};
    watch.stop = () => {
      if (this.watches.get(id) !== watch) return;
      this.watches.delete(id);
      this.unbindResult(watch);
      if (!this.watches.size) this.strategy.removeListener('result', this.onResult);
    };
    this.watches.set(id, watch);
    try {
      // Listen before reading the cache. A fresh result takes precedence.
      if (this.watches.size === 1) this.strategy.on('result', this.onResult);
      const cached = Object.values(this.strategy.getDiscoveryResults()).find(result => discoveryId(result) === id);
      if (cached && !watch.binding) this.bindResult(watch, cached, false);
    } catch (error) {
      watch.stop();
      throw error;
    }
    return watch.stop;
  }

  bindResult(watch, result, fresh) {
    if (watch.binding?.result !== result) {
      this.unbindResult(watch);
      const binding = {
        result,
        observed: (observed = result) => {
          if (watch.binding === binding && this.watches.get(watch.id) === watch &&
              discoveryId(observed) === watch.id) watch.notify(observed);
        },
      };
      watch.binding = binding;
      result.on('addressChanged', binding.observed);
      result.on('lastSeenChanged', binding.observed);
    }
    // Cached observations can be stale, so they only attach listeners.
    if (fresh) watch.binding.observed();
  }

  unbindResult(watch) {
    const binding = watch.binding;
    if (!binding) return;
    watch.binding = null;
    binding.result.removeListener('addressChanged', binding.observed);
    binding.result.removeListener('lastSeenChanged', binding.observed);
  }

  stop() {
    for (const watch of this.watches.values()) watch.stop();
  }
}

module.exports = {StandaloneDiscovery, discoveryId};
