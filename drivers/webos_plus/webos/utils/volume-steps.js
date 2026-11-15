'use strict';

const {readLgVolume} = require('./numeric-volume');

const STEPPED_OUTPUTS = new Set(['external_arc', 'external_optical', 'bt_soundbar']);
const MAX_STEPS = 100;
const STEP_DELAY_MS = 80;

function readExternalVolume(reply, output) {
  if (!STEPPED_OUTPUTS.has(output)) return null;
  if (reply?.returnValue !== true || reply.errorText || reply.errorCode != null) return null;
  const nested = reply.volumeStatus;
  const outputs = [reply.soundOutput, nested?.soundOutput].filter(value => value !== undefined);
  if (outputs.length === 0 || outputs.some(value => value !== output)) return null;
  if (reply.maxVolume !== 100 && nested?.maxVolume !== 100) return null;
  if (reply.activeStatus === false || nested?.activeStatus === false) return null;
  const mute = [reply.muted, reply.muteStatus, nested?.muted, nested?.muteStatus]
    .filter(value => value !== undefined);
  if (mute.length === 0 || mute.some(value => value !== false)) return null;
  return readLgVolume(reply);
}

module.exports = {STEPPED_OUTPUTS, MAX_STEPS, STEP_DELAY_MS, readExternalVolume};
