'use strict';

const assert = require('node:assert/strict');
const path = require('node:path');
const test = require('node:test');

const packageDir = process.env.HOMEY_TEST_PACKAGE || path.join(__dirname, '..');
const {usableInputs, pickerValues, inputForApp, fallbackInputs, launchAppForInput} =
  require(path.join(packageDir, 'drivers/webos_plus/webos/utils/input-select.js'));

test('a missing or empty input list shows HDMI1 through HDMI4', () => {
  for (const reported of [null, undefined, [], [{}], 'x']) {
    assert.deepEqual(usableInputs(reported), fallbackInputs());
  }
  assert.deepEqual(pickerValues(fallbackInputs()), [
    {id: 'HDMI_1', title: {en: 'HDMI1'}},
    {id: 'HDMI_2', title: {en: 'HDMI2'}},
    {id: 'HDMI_3', title: {en: 'HDMI3'}},
    {id: 'HDMI_4', title: {en: 'HDMI4'}},
  ]);
});

test('reported inputs keep their labels and ids', () => {
  const inputs = usableInputs([{id: 'HDMI_1', name: 'Apple TV', appId: 'com.webos.app.hdmi1'}, {id: 'HDMI_2', appId: 'com.webos.app.hdmi2'}, null]);
  assert.equal(inputs.length, 2);
  assert.deepEqual(pickerValues(inputs), [
    {id: 'HDMI_1', title: {en: 'Apple TV'}},
    {id: 'HDMI_2', title: {en: 'HDMI2'}},
  ]);
});

test('the foreground app selects its input, other apps leave it alone', () => {
  const inputs = fallbackInputs();
  assert.equal(inputForApp(inputs, 'com.webos.app.hdmi3').id, 'HDMI_3');
  assert.equal(inputForApp(inputs, 'netflix'), undefined);
  assert.equal(inputForApp(undefined, 'com.webos.app.hdmi1'), undefined);
  assert.equal(inputForApp(inputs, null), undefined);
});

test('empty and whitespace-only labels use the original display fallback on all HDMI ports', () => {
  for (const input of fallbackInputs()) {
    for (const name of [undefined, '', '  ']) {
      const [option] = pickerValues(usableInputs([{...input, name}]));
      assert.equal(option.id, input.id);
      assert.equal(option.title.en, input.id.replace('_', ''));
    }
  }
});

test('exact HDMI input IDs can follow the remote when LG omits an app ID', () => {
  const valid = {id: 'HDMI_3', name: 'Movie'};
  const conflicting = {id: 'HDMI_2', appId: 'com.webos.app.hdmi3'};
  const unknown = {id: 'external5', name: 'HDMI4'};
  const inputs = usableInputs([conflicting, valid, unknown]);
  assert.equal(inputForApp(inputs, 'com.webos.app.hdmi3'), valid);
  assert.equal(inputForApp(inputs, 'com.webos.app.hdmi2'), undefined);
  assert.equal(inputForApp(inputs, 'com.webos.app.hdmi4'), undefined);
  assert.equal(launchAppForInput(valid), undefined);
  assert.equal(launchAppForInput(conflicting), undefined);
});
