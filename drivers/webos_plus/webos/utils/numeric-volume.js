'use strict';

// Homey uses fractions; LG's supported numeric-volume protocol uses integers.
function isHomeyVolume(value) {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 1;
}

function toLgVolume(value) {
  if (!isHomeyVolume(value)) {
    throw new RangeError('Volume must be a number from 0 to 1 (Homey percentage units)');
  }
  return Math.round(value * 100);
}

function fromLgVolume(value) {
  return Number.isInteger(value) && value >= 0 && value <= 100 ? value / 100 : null;
}

// Used only for numeric reports; mute, power and transport semantics stay separate.
function readLgVolume(payload) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return null;
  const nested = payload.volumeStatus;
  const hasFlat = Object.prototype.hasOwnProperty.call(payload, 'volume');
  const hasNested = nested && typeof nested === 'object' && !Array.isArray(nested)
    && Object.prototype.hasOwnProperty.call(nested, 'volume');
  if (!hasFlat && !hasNested) return null;
  if (payload.maxVolume !== undefined && payload.maxVolume !== 100) return null;
  if (hasFlat && fromLgVolume(payload.volume) === null) return null;
  if (hasNested && (fromLgVolume(nested.volume) === null
      || (nested.maxVolume !== undefined && nested.maxVolume !== 100))) return null;
  if (hasFlat && hasNested && payload.volume !== nested.volume) return null;
  return hasFlat ? payload.volume : nested.volume;
}

module.exports = {isHomeyVolume, toLgVolume, fromLgVolume, readLgVolume};
