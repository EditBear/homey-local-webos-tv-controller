'use strict';

const {readLgVolume} = require('./numeric-volume');

const ARC_OUTPUT = 'external_arc';
const MAX_STEPS = 100;
const STEP_DELAY_MS = 80;

function readArcVolume(reply) {
  if (reply?.returnValue !== true || reply.errorText || reply.errorCode != null) return null;
  const nested = reply.volumeStatus;
  const outputs = [reply.soundOutput, nested?.soundOutput].filter(value => value !== undefined);
  if (outputs.length === 0 || outputs.some(value => value !== ARC_OUTPUT)) return null;
  if (reply.maxVolume !== 100 && nested?.maxVolume !== 100) return null;
  if (reply.activeStatus === false || nested?.activeStatus === false) return null;
  const mute = [reply.muted, reply.muteStatus, nested?.muted, nested?.muteStatus]
    .filter(value => value !== undefined);
  if (mute.length === 0 || mute.some(value => value !== false)) return null;
  return readLgVolume(reply);
}

module.exports = {ARC_OUTPUT, MAX_STEPS, STEP_DELAY_MS, readArcVolume};
