'use strict';

const MAX_DISCOVERY_BYTES = 1024 * 1024;
const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
const MAX_ALERT_BUTTON_JSON_BYTES = 64 * 1024;
const MAX_ALERT_BUTTONS = 10;
const MIN_ALERT_TIMEOUT_SECONDS = 1;
const MAX_ALERT_TIMEOUT_SECONDS = 3600;

function readStreamBounded(stream, maxBytes, label) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    let settled = false;

    function fail(error) {
      if (settled) return;
      settled = true;
      if (typeof stream.destroy === 'function') stream.destroy();
      reject(error);
    }

    stream.on('data', chunk => {
      if (settled) return;
      const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
      size += buffer.length;
      if (size > maxBytes) {
        fail(new Error(`${ label } exceeds ${ maxBytes } bytes`));
        return;
      }
      chunks.push(buffer);
    });
    stream.on('error', fail);
    stream.on('end', () => {
      if (settled) return;
      settled = true;
      resolve(Buffer.concat(chunks, size));
    });
  });
}

function assertImageContentType(contentType) {
  if (typeof contentType !== 'string' || !contentType.toLowerCase().startsWith('image/')) {
    throw new Error('Image response has an unsupported content type');
  }
  return contentType.split(';')[0].trim().toLowerCase();
}

function assertBase64ImageSize(base64) {
  if (typeof base64 !== 'string') {
    throw new TypeError('Image data must be a string');
  }
  if (Buffer.byteLength(base64, 'base64') > MAX_IMAGE_BYTES) {
    throw new Error(`Image data exceeds ${ MAX_IMAGE_BYTES } bytes`);
  }
  return base64;
}

function parseAlertButtons(value) {
  if (!value) return [];
  if (typeof value !== 'string') throw new TypeError('Alert buttons must be supplied as JSON text');
  if (Buffer.byteLength(value, 'utf8') > MAX_ALERT_BUTTON_JSON_BYTES) {
    throw new Error(`Alert button JSON exceeds ${ MAX_ALERT_BUTTON_JSON_BYTES } bytes`);
  }

  const buttons = JSON.parse(value);
  if (!Array.isArray(buttons)) throw new TypeError('Alert button JSON must contain an array');
  if (buttons.length > MAX_ALERT_BUTTONS) {
    throw new Error(`An alert can contain at most ${ MAX_ALERT_BUTTONS } custom buttons`);
  }
  if (buttons.some(button => !button || typeof button !== 'object' || Array.isArray(button))) {
    throw new TypeError('Each alert button must be a JSON object');
  }
  return buttons;
}

function normaliseAlertTimeout(value) {
  if (value === undefined || value === null || value === '') return null;
  const timeout = Number(value);
  if (!Number.isInteger(timeout)
      || timeout < MIN_ALERT_TIMEOUT_SECONDS
      || timeout > MAX_ALERT_TIMEOUT_SECONDS) {
    throw new RangeError(
      `Alert timeout must be a whole number from ${ MIN_ALERT_TIMEOUT_SECONDS } to ${ MAX_ALERT_TIMEOUT_SECONDS } seconds`,
    );
  }
  return timeout;
}

module.exports = {
  MAX_DISCOVERY_BYTES,
  MAX_IMAGE_BYTES,
  MAX_ALERT_BUTTON_JSON_BYTES,
  MAX_ALERT_BUTTONS,
  MIN_ALERT_TIMEOUT_SECONDS,
  MAX_ALERT_TIMEOUT_SECONDS,
  readStreamBounded,
  assertImageContentType,
  assertBase64ImageSize,
  parseAlertButtons,
  normaliseAlertTimeout,
};
