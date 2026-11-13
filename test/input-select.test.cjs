'use strict';

const assert = require('node:assert/strict');
const path = require('node:path');
const test = require('node:test');

const packageDir = process.env.HOMEY_TEST_PACKAGE || path.join(__dirname, '..');
const {usableInputs, pickerValues, inputForApp, fallbackInputs} =
  require(path.join(packageDir, 'drivers/webos_plus/webos/utils/input-select.js'));

test('a missing or empty input list falls back to HDMI 1-4', () => {
  for (const reported of [null, undefined, [], [{}], 'x']) {
    assert.deepEqual(usableInputs(reported), fallbackInputs());
  }
  assert.equal(fallbackInputs().length, 4);
});

test('reported inputs keep their labels and ids', () => {
  const inputs = usableInputs([{id: 'HDMI_1', name: 'Apple TV', appId: 'com.webos.app.hdmi1'}, {id: 'HDMI_2', appId: 'com.webos.app.hdmi2'}, null]);
  assert.equal(inputs.length, 2);
  assert.deepEqual(pickerValues(inputs), [
    {id: 'HDMI_1', title: {en: 'Apple TV'}},
    {id: 'HDMI_2', title: {en: 'HDMI_2'}},
  ]);
});

test('the foreground app selects its input, other apps leave it alone', () => {
  const inputs = fallbackInputs();
  assert.equal(inputForApp(inputs, 'com.webos.app.hdmi3').id, 'HDMI_3');
  assert.equal(inputForApp(inputs, 'netflix'), undefined);
  assert.equal(inputForApp(undefined, 'com.webos.app.hdmi1'), undefined);
  assert.equal(inputForApp(inputs, null), undefined);
});
