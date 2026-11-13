'use strict';

const MAX_STEPS = 100;

// With ARC, optical or Bluetooth output many TVs accept ssap://audio/setVolume
// without changing anything, while volume up/down keeps working.
function usesTvVolume(soundOutput) {
  return typeof soundOutput !== 'string' || soundOutput === '' || soundOutput === 'tv_speaker';
}

// Returns {direction: 'up' | 'down', count} or null when setVolume should be used.
function planVolumeSteps(soundOutput, currentLg, targetLg) {
  if (usesTvVolume(soundOutput)) return null;
  if (!Number.isInteger(currentLg) || !Number.isInteger(targetLg)) return null;
  const difference = targetLg - currentLg;
  if (difference === 0) return {direction: 'up', count: 0};
  return {direction: difference > 0 ? 'up' : 'down', count: Math.min(Math.abs(difference), MAX_STEPS)};
}

module.exports = {planVolumeSteps, usesTvVolume, MAX_STEPS};
