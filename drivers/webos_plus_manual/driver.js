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
    let entered = null

    // The view has no button of its own: it reports every edit, and the pairing
    // "Continue" button moves on to list_devices, which validates what was entered.
    session.setHandler('manual_ip', async (data) => {
      entered = data
      return true
    })

    session.setHandler('list_devices', async () => {
      const manual = parseManualInput(entered)
      if (!manual) {
        throw new Error('Please enter the IP address of the TV.')
      }
      await canConnect(manual.ipAddress, 3001, 4000).catch(() => {
        throw new Error(`Cannot reach ${ manual.ipAddress } on port 3001. Check that the TV is on and that your network allows Homey to reach it.`)
      })
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
