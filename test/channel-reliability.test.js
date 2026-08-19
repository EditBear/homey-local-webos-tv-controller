'use strict';

const assert = require('assert');
const {
  ChannelObservationState,
  verifyChannelSelection,
} = require('../drivers/webos_plus/webos/utils/channel-reliability');

(async () => {
  const observations = new ChannelObservationState('101');
  assert.deepStrictEqual(observations.observe(231), {
    changed: true,
    previous: '101',
    current: '231',
  });
  assert.deepStrictEqual(observations.observe('231'), {
    changed: false,
    previous: '231',
    current: '231',
  });

  const reads = [
    {channelNumber: '231', channelName: 'BBC NEWS'},
    {channelNumber: '101', channelName: 'BBC ONE Lon HD'},
  ];
  let sentChannel = null;
  let waits = 0;
  const verified = await verifyChannelSelection({
    requestedChannel: 101,
    setChannel: async channel => {
      sentChannel = channel;
    },
    getCurrentChannel: async () => reads.shift(),
    wait: async delay => {
      assert.strictEqual(delay, 25);
      waits += 1;
    },
    attempts: 3,
    intervalMs: 25,
  });
  assert.strictEqual(sentChannel, '101');
  assert.strictEqual(verified.channelNumber, '101');
  assert.strictEqual(waits, 1);

  await assert.rejects(
    verifyChannelSelection({
      requestedChannel: 101,
      setChannel: async () => {},
      getCurrentChannel: async () => ({channelNumber: 231}),
      wait: async () => {},
      attempts: 2,
      intervalMs: 10,
    }),
    /acknowledged channel 101.*last observed channel was 231/,
  );

  await assert.rejects(
    verifyChannelSelection({
      requestedChannel: 101,
      setChannel: async () => {},
      getCurrentChannel: async () => ({channelNumber: 231}),
      isCurrent: () => false,
      attempts: 1,
      intervalMs: 0,
    }),
    /connection changed/,
  );

  const expectedReadError = new Error('status unavailable');
  await assert.rejects(
    verifyChannelSelection({
      requestedChannel: 101,
      setChannel: async () => {},
      getCurrentChannel: async () => {
        throw expectedReadError;
      },
      wait: async () => {},
      attempts: 2,
      intervalMs: 10,
    }),
    /last status check failed: status unavailable/,
  );

  console.log('Channel reliability tests passed');
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
