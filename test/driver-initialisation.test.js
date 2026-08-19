'use strict'

const assert = require('assert')
const Module = require('module')

const originalLoad = Module._load
Module._load = function load(request, parent, isMain) {
  if (request === 'homey') {
    return {
      Driver: class Driver {
        log() {}
      },
    }
  }
  return originalLoad.call(this, request, parent, isMain)
}

const WebosPlusDriver = require('../drivers/webos_plus/driver')
Module._load = originalLoad

async function run() {
  const driver = new WebosPlusDriver()
  const calls = {
    triggers: 0,
    actions: 0,
    conditions: 0,
    deviceCallbacks: 0,
  }

  driver.initTriggers = () => { calls.triggers += 1 }
  driver.initActions = () => { calls.actions += 1 }
  driver.initConditions = () => { calls.conditions += 1 }

  driver.onInit()
  assert.deepStrictEqual(calls, {
    triggers: 1,
    actions: 1,
    conditions: 1,
    deviceCallbacks: 0,
  })

  const first = await driver.initReady(async () => {
    calls.deviceCallbacks += 1
    return 'first device ready'
  })
  const second = await driver.initReady(async () => {
    calls.deviceCallbacks += 1
    return 'second device ready'
  })

  assert.strictEqual(first, 'first device ready')
  assert.strictEqual(second, 'second device ready')
  assert.deepStrictEqual(calls, {
    triggers: 1,
    actions: 1,
    conditions: 1,
    deviceCallbacks: 2,
  })

  console.log('Driver initialisation tests passed')
}

run().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
