'use strict';

/**
 * Run a Homey Flow action and return true only after the underlying LG command
 * has fulfilled. Rejections are deliberately allowed to propagate to Homey.
 */
async function runDeviceAction(command) {
  await command();
  return true;
}

module.exports = {
  runDeviceAction,
};
