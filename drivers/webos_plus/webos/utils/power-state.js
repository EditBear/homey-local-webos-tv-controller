'use strict';

const POWER_ON_STATES = new Set([
  'active',
  'screen saver',
  'screen off',
]);
const POWER_ON_PROCESSING = /\b(?:on|ready|resume|saver)\b/;
const POWER_OFF_PROCESSING = /\b(?:standby|suspend|off)\b/;

function normalisePowerText(value) {
  return typeof value === 'string' ? value.trim().toLowerCase() : '';
}

/**
 * Convert an LG power-state subscription payload to a definite state only
 * when the existing WebOS Plus rules have enough information.
 *
 * @returns {boolean|null} true for on, false for off, null for indeterminate
 */
function classifyPowerState(payload) {
  if (!payload || typeof payload !== 'object') return null;

  const state = normalisePowerText(payload.state);
  const processing = normalisePowerText(payload.processing);

  if (processing) {
    if (POWER_ON_PROCESSING.test(processing)) {
      return true;
    }
    if (POWER_OFF_PROCESSING.test(processing)) {
      return false;
    }
    return null;
  }

  if (!state) return null;
  return POWER_ON_STATES.has(state);
}

function normalisePowerStateTimeout(value, fallback = 2000) {
  const timeout = Number(value);
  return Number.isFinite(timeout) && timeout >= 0 ? timeout : fallback;
}

module.exports = {
  classifyPowerState,
  normalisePowerStateTimeout,
};
