'use strict';

const assert = require('assert');
const {PassThrough} = require('stream');
const {
  MAX_ALERT_BUTTONS,
  readStreamBounded,
  assertImageContentType,
  assertBase64ImageSize,
  parseAlertButtons,
  normaliseAlertTimeout,
} = require('../drivers/webos_plus/webos/utils/bounds');

async function run() {
  const stream = new PassThrough();
  const read = readStreamBounded(stream, 5, 'Test stream');
  stream.end(Buffer.from('hello'));
  assert.strictEqual((await read).toString(), 'hello');

  const oversized = new PassThrough();
  const rejectedRead = readStreamBounded(oversized, 4, 'Test stream');
  oversized.end(Buffer.from('hello'));
  await assert.rejects(rejectedRead, /exceeds 4 bytes/);

  assert.strictEqual(assertImageContentType('image/png; charset=binary'), 'image/png');
  assert.throws(() => assertImageContentType('text/html'), /unsupported content type/);
  assert.strictEqual(assertBase64ImageSize(Buffer.from('image').toString('base64')).length > 0, true);

  assert.deepStrictEqual(parseAlertButtons(''), []);
  assert.deepStrictEqual(parseAlertButtons('[{"label":"OK"}]'), [{label: 'OK'}]);
  assert.throws(() => parseAlertButtons('{}'), /must contain an array/);
  assert.throws(
    () => parseAlertButtons(JSON.stringify(Array.from({length: MAX_ALERT_BUTTONS + 1}, () => ({})))),
    /at most/,
  );

  assert.strictEqual(normaliseAlertTimeout(undefined), null);
  assert.strictEqual(normaliseAlertTimeout(60), 60);
  assert.throws(() => normaliseAlertTimeout(0), /whole number/);
  assert.throws(() => normaliseAlertTimeout(1.5), /whole number/);
  assert.throws(() => normaliseAlertTimeout(3601), /whole number/);

  console.log('Network and input-boundary tests passed');
}

run().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
