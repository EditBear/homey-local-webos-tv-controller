'use strict';

const VOLUME_CAPABILITY_OPTIONS = Object.freeze({
  units: '%',
  min: 0,
  max: 1,
  step: 0.01,
  decimals: 2,
});

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function toFiniteNumber(value, label) {
  const number = Number(value);
  if (!Number.isFinite(number)) {
    throw new TypeError(`${label} must be a finite number`);
  }
  return number;
}

/**
 * Translate Homey's normalised volume_set value (0.00-1.00) to LG's
 * integer television volume (0-100).
 */
function homeyVolumeToLg(value) {
  const normalised = toFiniteNumber(value, 'Homey volume');
  if (normalised < 0 || normalised > 1) {
    throw new RangeError('Homey volume must be between 0 and 1');
  }
  return Math.round(normalised * 100);
}

/**
 * Translate LG's integer television volume (0-100) to Homey's normalised
 * volume_set value (0.00-1.00).
 */
function lgVolumeToHomey(value) {
  const percentage = toFiniteNumber(value, 'LG volume');
  return Math.round(clamp(percentage, 0, 100)) / 100;
}

/**
 * Translate the app's custom Flow-card percentage arguments (0-100) to the
 * normalised value stored in Homey's volume_set capability.
 */
function percentageToHomeyVolume(value) {
  return lgVolumeToHomey(value);
}

/**
 * Migrate a volume_set value retained from Candidate 1.0.27, where the
 * capability stored LG's 0-100 integer instead of Homey's 0-1 value.
 */
function normaliseStoredHomeyVolume(value) {
  if (value === null || value === undefined) return value;
  const stored = toFiniteNumber(value, 'Stored Homey volume');
  if (stored >= 0 && stored <= 1) return stored;
  if (stored > 1 && stored <= 100) return lgVolumeToHomey(stored);
  throw new RangeError('Stored Homey volume must be between 0 and 100');
}

/**
 * Accept both the legacy webOS response and the nested response returned by
 * newer LG televisions such as the G4.
 */
function extractLgVolumeStatus(result) {
  if (!result || typeof result !== 'object') return {};
  const source = result.volumeStatus && typeof result.volumeStatus === 'object'
    ? result.volumeStatus
    : result;
  return {
    volume: source.volume,
    muted: source.muted !== undefined ? source.muted : source.muteStatus,
  };
}

function normaliseVolumeStatus(result) {
  if (!result || typeof result !== 'object') {
    throw new TypeError('LG volume status must be an object');
  }
  const extracted = extractLgVolumeStatus(result);
  const status = {};
  if (extracted.volume !== undefined) {
    const volume = toFiniteNumber(extracted.volume, 'LG volume status');
    if (volume < 0 || volume > 100) {
      throw new RangeError('LG volume status must be between 0 and 100');
    }
    status.volume = lgVolumeToHomey(volume);
  }
  if (extracted.muted !== undefined) {
    if (typeof extracted.muted !== 'boolean') {
      throw new TypeError('LG muted status must be a boolean');
    }
    status.muted = extracted.muted;
  }
  if (status.volume === undefined && status.muted === undefined) {
    throw new TypeError('LG volume status contains neither volume nor muted state');
  }
  return status;
}

function volumeCapabilityOptionsMatch(options) {
  return Object.entries(VOLUME_CAPABILITY_OPTIONS)
    .every(([key, value]) => options?.[key] === value);
}

module.exports = {
  VOLUME_CAPABILITY_OPTIONS,
  homeyVolumeToLg,
  lgVolumeToHomey,
  percentageToHomeyVolume,
  normaliseStoredHomeyVolume,
  extractLgVolumeStatus,
  normaliseVolumeStatus,
  volumeCapabilityOptionsMatch,
};
