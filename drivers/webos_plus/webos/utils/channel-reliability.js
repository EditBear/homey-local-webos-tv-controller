'use strict';

const DEFAULT_VERIFY_ATTEMPTS = 12;
const DEFAULT_VERIFY_INTERVAL_MS = 750;
const DEFAULT_VERIFY_TIMEOUT_MS = 12000;
const DEFAULT_READ_TIMEOUT_MS = 1500;

function channelNumber(value) {
  if (value === null || value === undefined) return '';
  return `${value}`.trim();
}

class ChannelObservationState {
  constructor(initialChannel = '') {
    this.current = channelNumber(initialChannel);
  }

  observe(nextChannel) {
    const next = channelNumber(nextChannel);
    const previous = this.current;
    const changed = next !== previous;
    this.current = next;
    return {
      changed,
      previous,
      current: next,
    };
  }

  reset(channel = '') {
    this.current = channelNumber(channel);
  }
}

async function verifyChannelSelection({
  requestedChannel,
  setChannel,
  getCurrentChannel,
  isCurrent = () => true,
  wait = delay => new Promise(resolve => setTimeout(resolve, delay)),
  attempts = DEFAULT_VERIFY_ATTEMPTS,
  intervalMs = DEFAULT_VERIFY_INTERVAL_MS,
  timeoutMs = DEFAULT_VERIFY_TIMEOUT_MS,
  readTimeoutMs = DEFAULT_READ_TIMEOUT_MS,
}) {
  const requested = channelNumber(requestedChannel);
  if (!requested) {
    throw new Error('A channel number is required');
  }
  if (!Number.isInteger(attempts) || attempts < 1) {
    throw new Error('Channel verification attempts must be a positive integer');
  }
  if (!Number.isFinite(intervalMs) || intervalMs < 0) {
    throw new Error('Channel verification interval must be zero or greater');
  }
  if (!Number.isFinite(timeoutMs) || timeoutMs < 1) {
    throw new Error('Channel verification timeout must be greater than zero');
  }
  if (!Number.isFinite(readTimeoutMs) || readTimeoutMs < 1) {
    throw new Error('Channel status-read timeout must be greater than zero');
  }

  await setChannel(requested);

  const deadline = Date.now() + timeoutMs;
  let lastChannel = '';
  let lastError = null;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    if (attempt > 1) {
      const waitTime = Math.min(intervalMs, Math.max(0, deadline - Date.now()));
      if (waitTime <= 0) break;
      await wait(waitTime);
    }
    if (!isCurrent()) {
      throw new Error(`Channel ${requested} verification was cancelled because the television connection changed`);
    }
    const remaining = deadline - Date.now();
    if (remaining <= 0) break;

    try {
      let readTimer;
      const current = await Promise.race([
        Promise.resolve().then(() => getCurrentChannel()),
        new Promise((resolve, reject) => {
          readTimer = setTimeout(
            () => reject(new Error('channel status read timed out')),
            Math.min(readTimeoutMs, remaining),
          );
        }),
      ]).finally(() => clearTimeout(readTimer));
      lastChannel = channelNumber(current && current.channelNumber);
      lastError = null;
      if (lastChannel === requested) {
        return current;
      }
    } catch (error) {
      lastError = error;
    }
  }

  const observed = lastChannel ? `; last observed channel was ${lastChannel}` : '';
  const readFailure = lastError ? `; last status check failed: ${lastError.message || lastError}` : '';
  throw new Error(`LG acknowledged channel ${requested}, but the television did not confirm it within ${timeoutMs} ms${observed}${readFailure}`);
}

module.exports = {
  ChannelObservationState,
  DEFAULT_VERIFY_ATTEMPTS,
  DEFAULT_VERIFY_INTERVAL_MS,
  DEFAULT_VERIFY_TIMEOUT_MS,
  DEFAULT_READ_TIMEOUT_MS,
  channelNumber,
  verifyChannelSelection,
};
