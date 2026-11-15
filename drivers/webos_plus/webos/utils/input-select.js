'use strict';

const {hdmiDisplayName} = require('./source-name-report');

function hdmiAppForInput(id) {
  const match = typeof id === 'string' && /^HDMI_([1-4])$/.exec(id);
  return match ? 'com.webos.app.hdmi' + match[1] : undefined;
}

function fallbackInputs() {
  return [1, 2, 3, 4].map(port => {
    const id = 'HDMI_' + port;
    return {id, appId: hdmiAppForInput(id)};
  });
}

function usableInputs(inputs) {
  const ids = new Set();
  const list = [];
  for (const input of Array.isArray(inputs) ? inputs : []) {
    const id = input?.id;
    if (!(Number.isFinite(id) || (typeof id === 'string' && id.trim()))) continue;
    const optionId = String(id);
    if (optionId === 'none' || ids.has(optionId)) continue;
    ids.add(optionId);
    list.push(input);
  }
  return list.length ? list : fallbackInputs();
}

function pickerValues(inputs) {
  return inputs.map(input => {
    const id = String(input.id);
    const fallback = hdmiDisplayName(hdmiAppForInput(input.id) ?? input.appId);
    const label = typeof input.name === 'string' && input.name.trim() ? input.name : fallback || id;
    return {id, title: {en: label}};
  });
}

function launchAppForInput(input) {
  const appId = input.appId;
  if (typeof appId !== 'string' || !appId.trim() || appId.trim() !== appId) return undefined;
  const standardApp = hdmiAppForInput(input.id);
  return !standardApp || appId === standardApp ? appId : undefined;
}

function inputForApp(inputs, appId) {
  if (typeof appId !== 'string' || !Array.isArray(inputs)) return undefined;
  const exact = inputs.find(input => launchAppForInput(input) === appId);
  return exact ?? inputs.find(input => (!input.appId || (typeof input.appId === 'string' && !input.appId.trim()))
    && hdmiAppForInput(input.id) === appId);
}

module.exports = {fallbackInputs, usableInputs, pickerValues, inputForApp, launchAppForInput};
