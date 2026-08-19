'use strict';

function createPairingPayload(template, clientKey) {
  const payload = JSON.parse(JSON.stringify(template));
  if (clientKey) {
    payload['client-key'] = clientKey;
  } else {
    delete payload['client-key'];
  }
  return payload;
}

module.exports = {
  createPairingPayload,
};
