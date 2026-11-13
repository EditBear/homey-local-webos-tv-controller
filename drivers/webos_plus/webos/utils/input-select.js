'use strict';

// Used when the TV does not return its input list, for example when a
// pairing without full permissions is refused ssap://tv/getExternalInputList.
function fallbackInputs() {
  return [1, 2, 3, 4].map(n => ({id: `HDMI_${n}`, name: `HDMI ${n}`, appId: `com.webos.app.hdmi${n}`}));
}

function usableInputs(inputs) {
  const list = Array.isArray(inputs)
    ? inputs.filter(input => input && (typeof input.id === 'string' || typeof input.id === 'number') && `${input.id}` !== '')
    : [];
  return list.length > 0 ? list : fallbackInputs();
}

function pickerValues(inputs) {
  return inputs.map(input => ({
    id: `${input.id}`,
    title: {en: typeof input.name === 'string' && input.name !== '' ? input.name : `${input.id}`},
  }));
}

function inputForApp(inputs, appId) {
  if (typeof appId !== 'string' || !Array.isArray(inputs)) return undefined;
  return inputs.find(input => input.appId === appId);
}

module.exports = {fallbackInputs, usableInputs, pickerValues, inputForApp};
