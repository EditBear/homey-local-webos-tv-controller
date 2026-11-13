'use strict';

const Homey = require('homey');
const {parseManualInput, canConnect} = require('../webos_plus/webos/utils/manual-setup');

/**
 * Pairs a TV by IP address. This driver has no discovery strategy: Homey manages
 * the availability of discovery drivers and would keep a TV that is never
 * discovered (for example on another VLAN) at "No response". The shared Flow
 * cards are registered by the main webos_plus driver.
 */
class WebosPlusManualDriver extends Homey.Driver {
  async onPair(session) {
    let manual = null

    session.setHandler('manual_ip', async (data) => {
      manual = null
      const input = parseManualInput(data)
      if (!input) {
        throw new Error('Please enter the IP address of the TV.')
      }
      await canConnect(input.ipAddress, 3001, 4000).catch(() => {
        throw new Error(`Cannot reach ${ input.ipAddress } on port 3001. Check that the TV is on and that your network allows Homey to reach it.`)
      })
      manual = input
      return true
    })

    session.setHandler('list_devices', async () => {
      if (!manual) return []
      return [{
        name: `LG webOS TV (${ manual.ipAddress })`,
        data: {
          id: `manual-${ manual.ipAddress }`,
        },
        settings: {
          macAddress: manual.macAddress,
          ipAddress: manual.ipAddress,
          manualIpAddress: true,
        },
      }]
    })
  }
}

module.exports = WebosPlusManualDriver
