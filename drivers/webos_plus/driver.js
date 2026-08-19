/*
 * LG WebOS TV app for Homey
 * Copyright (C) 2020  Max van de Laar
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with this program.  If not, see <http://www.gnu.org/licenses/>.
 */

'use strict'

const Homey = require('homey')
const http = require('http')
const https = require('https')
const {capabilities} = require('./webos/utils/constants')
const {percentageToHomeyVolume} = require('./webos/utils/volume')
const {runDeviceAction} = require('./webos/utils/action')
const {
  MAX_DISCOVERY_BYTES,
  MAX_IMAGE_BYTES,
  readStreamBounded,
  assertImageContentType,
} = require('./webos/utils/bounds')
const {
  validateDescriptionUrl,
  createPairingDevice,
} = require('./webos/utils/discovery')

const HTTP_TIMEOUT_MS = 5000

class WebosPlusDriver extends Homey.Driver {
  onInit() {
    this.initTriggers()
    this.initActions()
    this.initConditions()
    this.log('WebosPlus Driver has been inited')
  }

  initReady(callback) {
    return callback()
  }

  initTriggers() {
    this._triggerChannelChanged = this.homey.flow.getDeviceTriggerCard('webos_channel_changed')
    this._triggerVolumeMuted = this.homey.flow.getDeviceTriggerCard('webos_volume_muted')
    this._triggerVolumeUnmuted = this.homey.flow.getDeviceTriggerCard('webos_volume_unmuted')
    this._triggerChannelChangedToList = this.homey.flow.getDeviceTriggerCard('webos_channel_changed_to_list')
      .registerRunListener((args, state) => {
        return Promise.resolve(args.channel.number && `${ args.channel.number }` === `${ state.newChannel }`)
      })
    this._triggerChannelChangedToNumber = this.homey.flow.getDeviceTriggerCard('webos_channel_changed_to_number')
      .registerRunListener((args, state) => {
        return Promise.resolve(args.channel && `${ args.channel }` === `${ state.newChannel }`)
      })
    this._triggerChannelChangedToList
      .getArgument('channel')
      .registerAutocompleteListener((query, args) => args.webosDevice.filteredChannelList(query))

    this._triggerAppChanged = this.homey.flow.getDeviceTriggerCard('webos_app_changed')
    this._triggerAppChangedTo = this.homey.flow.getDeviceTriggerCard('webos_app_changed_to')
      .registerRunListener((args, state) => {
        return Promise.resolve(args.app && args.app.id === state.newApp)
      })
    this._triggerAppChangedTo
      .getArgument('app')
      .registerAutocompleteListener((query, args) => args.webosDevice.filteredAppList(query))
    this._triggerSoundOutputChanged = this.homey.flow.getDeviceTriggerCard('webos_sound_output_changed')
    this._triggerSoundOutputChangedTo = this.homey.flow.getDeviceTriggerCard('webos_sound_output_changed_to')
      .registerRunListener((args, state) => {
        return Promise.resolve(args.output === state.newSoundOutput)
      })
  }

  triggerChannelChanged(device, tokens, state) {
    this._triggerChannelChanged
      .trigger(device, tokens, state)
      .catch(error => this.error(error))
    this._triggerChannelChangedToList
      .trigger(device, tokens, state)
      .catch(error => this.error(error))
    this._triggerChannelChangedToNumber
      .trigger(device, tokens, state)
      .catch(error => this.error(error))
  }

  triggerAppChanged(device, tokens, state) {
    this._triggerAppChanged
      .trigger(device, tokens, state)
      .catch(error => this.error(error))
    this._triggerAppChangedTo
      .trigger(device, tokens, state)
      .catch(error => this.error(error))
  }

  triggerSoundOutputChanged(device, tokens, state) {
    this._triggerSoundOutputChanged
      .trigger(device, tokens, state)
      .catch(error => this.error(error))
    this._triggerSoundOutputChangedTo
      .trigger(device, tokens, state)
      .catch(error => this.error(error))
  }

  triggerVolumeMuteChanged(device, tokens, state) {
    if (state.muted) {
      this._triggerVolumeMuted
        .trigger(device, tokens, state)
        .catch(error => this.error(error))
    } else {
      this._triggerVolumeUnmuted
        .trigger(device, tokens, state)
        .catch(error => this.error(error))
    }
  }

  initConditions() {
    this._conditionMuted = this.homey.flow.getConditionCard('webos_muted')
    this.conditionMuted()
    this._conditionVolumeEquals = this.homey.flow.getConditionCard('webos_volume_equals')
    this.conditionVolumeEquals()
    this._conditionVolumeSmaller = this.homey.flow.getConditionCard('webos_volume_smaller')
    this.conditionVolumeSmaller()
    this._conditionVolumeLarger = this.homey.flow.getConditionCard('webos_volume_larger')
    this.conditionVolumeLarger()
    this._conditionChannelNumber = this.homey.flow.getConditionCard('webos_channel_number')
    this.conditionChannelNumber()
    this._conditionChannelList = this.homey.flow.getConditionCard('webos_channel_list')
    this.conditionChannelList()
    this._conditionApp = this.homey.flow.getConditionCard('webos_app')
    this.conditionApp()
    this._conditionSoundOutput = this.homey.flow.getConditionCard('webos_sound_output')
    this.conditionSoundOutput()
  }

  initActions() {
    this._actionChangeChannelList = this.homey.flow.getActionCard('change_channel_list')
    this.actionChangeChannelList()
    this._actionChangeChannelNumber = this.homey.flow.getActionCard('change_channel_number')
    this.actionChangeChannelNumber()
    this._actionLaunchApp = this.homey.flow.getActionCard('launch_app')
    this.actionLaunchApp()
    this._actionSimulateButton = this.homey.flow.getActionCard('simulate_button')
    this.actionSimulateButton()
    this._actionSendToast = this.homey.flow.getActionCard('send_toast')
    this.actionSendToast()
    this._actionChangeSoundOutput = this.homey.flow.getActionCard('change_sound_output')
    this.actionChangeSoundOutput()
    this._actionSwitchInput = this.homey.flow.getActionCard('switch_input')
    this.actionSwitchInput()
    this._actionSendAlert = this.homey.flow.getActionCard('send_alert')
    this.actionSendAlert()
    this._actionMediaPlay = this.homey.flow.getActionCard('webos_media_play')
    this.actionMediaPlay()
    this._actionMediaPause = this.homey.flow.getActionCard('webos_media_pause')
    this.actionMediaPause()
    this._actionMediaToggle = this.homey.flow.getActionCard('webos_media_toggle')
    this.actionMediaToggle()
    this._actionMediaFastForward = this.homey.flow.getActionCard('webos_media_fast_forward')
    this.actionMediaFastForward()
    this._actionMediaRewind = this.homey.flow.getActionCard('webos_media_rewind')
    this.actionMediaRewind()
  }

  conditionSoundOutput() {
    this._conditionSoundOutput
      .registerRunListener(async (args, state) => {
        const device = args.webosDevice
        const output = args.output
        const result = await device._soundOutputCurrent()
        return result.toLowerCase() === output.toLowerCase()
      })
  }

  conditionChannelNumber() {
    this._conditionChannelNumber
      .registerRunListener(async (args, state) => {
        const device = args.webosDevice
        const channel = args.channel
        const result = await device._channelCurrent()
        return `${ channel }` === result.channelNumber
      })
  }

  conditionChannelList() {
    this._conditionChannelList
      .registerRunListener(async (args, state) => {
        const device = args.webosDevice
        const channel = args.channel
        const result = await device._channelCurrent()
        return channel.number === result.channelNumber
      })
      .getArgument('channel')
      .registerAutocompleteListener((query, args) => args.webosDevice.filteredChannelList(query))
  }

  conditionVolumeLarger() {
    this._conditionVolumeLarger
      .registerRunListener(async (args, state) => {
        const device = args.webosDevice
        const volume = percentageToHomeyVolume(args.volume)
        const status = await device.refreshVolumeStatus()
        if (status.volume === undefined) throw new Error('LG volume status did not include volume')
        const result = status.volume > volume
        device.log(`conditionVolumeLarger: ${ status.volume } > ${ volume } is ${ result }`)
        return result
      })
  }

  conditionVolumeSmaller() {
    this._conditionVolumeSmaller
      .registerRunListener(async (args, state) => {
        const device = args.webosDevice
        const volume = percentageToHomeyVolume(args.volume)
        const status = await device.refreshVolumeStatus()
        if (status.volume === undefined) throw new Error('LG volume status did not include volume')
        const result = status.volume < volume
        device.log(`conditionVolumeSmaller: ${ status.volume } < ${ volume } is ${ result }`)
        return result
      })
  }

  conditionVolumeEquals() {
    this._conditionVolumeEquals
      .registerRunListener(async (args, state) => {
        const device = args.webosDevice
        const volume = percentageToHomeyVolume(args.volume)
        const status = await device.refreshVolumeStatus()
        if (status.volume === undefined) throw new Error('LG volume status did not include volume')
        const result = status.volume === volume
        device.log(`conditionVolumeEquals: ${ status.volume } === ${ volume } is ${ result }`)
        return result
      })
  }

  conditionMuted() {
    this._conditionMuted
      .registerRunListener(async (args, state) => {
        const device = args.webosDevice
        const status = await device.refreshVolumeStatus()
        if (status.muted === undefined) throw new Error('LG volume status did not include muted state')
        device.log(`conditionMuted: muted is ${ status.muted }`)
        return status.muted
      })
  }

  actionMediaPlay() {
    this._actionMediaPlay
      .registerRunListener(args => runDeviceAction(() => args.webosDevice.mediaPlay()))
  }

  actionMediaPause() {
    this._actionMediaPause
      .registerRunListener(args => runDeviceAction(() => args.webosDevice.mediaPause()))
  }

  actionMediaToggle() {
    this._actionMediaToggle
      .registerRunListener(args => runDeviceAction(() => args.webosDevice.mediaTogglePlayPause()))
  }

  actionMediaFastForward() {
    this._actionMediaFastForward
      .registerRunListener(args => runDeviceAction(() => args.webosDevice.mediaFastForward()))
  }

  actionMediaRewind() {
    this._actionMediaRewind
      .registerRunListener(args => runDeviceAction(() => args.webosDevice.mediaRewind()))
  }

  conditionApp() {
    this._conditionApp
      .registerRunListener(async (args, state) => {
        const device = args.webosDevice
        const app = args.app
        const result = await device._appCurrent()
        return app.id === result.appId
      })
      .getArgument('app')
      .registerAutocompleteListener((query, args) => args.webosDevice.filteredAppList(query))
  }

  actionChangeSoundOutput() {
    this._actionChangeSoundOutput
      .registerRunListener((args, state) => {
        const device = args.webosDevice
        const {output} = args
        return runDeviceAction(() => device._soundOutputSet(output))
      })
  }

  actionSendToast() {
    this._actionSendToast
      .registerRunListener(async (args, state) => {
        const device = args.webosDevice
        const {
          message,
          iconData,
        } = args
        let icon = iconData
        if (this._isUrl(iconData)) {
          icon = await this.encodeImage(iconData)
        }

        return runDeviceAction(() => device._toastSend(message, icon))
      })
  }

  actionSimulateButton() {
    this._actionSimulateButton
      .registerRunListener((args, state) => {
        const device = args.webosDevice
        return runDeviceAction(() => device._simulateButton(args.button))
      })
  }

  actionChangeChannelNumber() {
    this._actionChangeChannelNumber
      .registerRunListener((args, state) => {
        const device = args.webosDevice
        return runDeviceAction(() => device.changeChannelVerified(`${ args.channel }`))
      })
  }

  actionChangeChannelList() {
    this._actionChangeChannelList
      .registerRunListener((args, state) => {
        const device = args.webosDevice
        return runDeviceAction(() => device.changeChannelVerified(`${ args.channel.number }`))
      })
      .getArgument('channel')
      .registerAutocompleteListener((query, args) => args.webosDevice.filteredChannelList(query))
  }

  actionLaunchApp() {
    this._actionLaunchApp
      .registerRunListener((args, state) => {
        const device = args.webosDevice
        return runDeviceAction(() => device._appLaunch(args.app.id))
      })
      .getArgument('app')
      .registerAutocompleteListener((query, args) => args.webosDevice.filteredAppList(query))
  }

  actionSwitchInput() {
    this._actionSwitchInput
      .registerRunListener((args, state) => {
        const device = args.webosDevice
        return runDeviceAction(() => device._switchInput(args.input.id))
      })
      .getArgument('input')
      .registerAutocompleteListener((query, args) => args.webosDevice.filteredExternalInputList(query))
  }

  actionSendAlert() {
    this._actionSendAlert
      .registerRunListener(async (args, state) => {
        const device = args.webosDevice
          return await device._alertSend(args)
      })
  }

  async _mapDiscoveryResults(result) {
    const info = await WebosPlusDriver._getInfo(result.headers.location)
    const macAddress = await this.homey.arp.getMAC(result.address)
    return createPairingDevice(result, info, macAddress)
  }

  async onPairListDevices(data, callback) {
    const discoveryStrategy = this.getDiscoveryStrategy()
    const discoveryResults = discoveryStrategy.getDiscoveryResults()

    const results = Object.values(discoveryResults)
    const settled = await Promise.allSettled(results.map(result => this._mapDiscoveryResults(result)))
    const devices = []
    const errors = []
    settled.forEach(item => {
      if (item.status === 'fulfilled') {
        devices.push(item.value)
      } else {
        errors.push(item.reason)
        this.error('Could not prepare discovered television for pairing', item.reason)
      }
    })
    if (results.length > 0 && devices.length === 0) {
      throw new Error(`Could not prepare any discovered television for pairing: ${ errors[0]?.message || 'unknown error' }`)
    }
    return devices
  }

  static _getInfo(url) {
    return new Promise((resolve, reject) => {
      let parsedUrl
      try {
        parsedUrl = validateDescriptionUrl(url)
      } catch (error) {
        reject(error)
        return
      }
      const requester = parsedUrl.protocol === 'https:' ? https : http
      const request = requester.get(parsedUrl, (response) => {
        if (response.statusCode < 200 || response.statusCode >= 300) {
          response.resume()
          reject(new Error(`TV description request failed with HTTP ${ response.statusCode }`))
          return
        }
        readStreamBounded(response, MAX_DISCOVERY_BYTES, 'TV description')
          .then(buffer => {
          const body = buffer.toString('utf8')
          let tags = [
            'deviceType',
            'friendlyName',
            'manufacturer',
            'manufacturerURL',
            'modelDescription',
            'modelName',
            'modelURL',
            'modelNumber',
            'UDN',
          ]

          let result = {}
          tags.forEach((tag) => {
            result[tag] = this._getTextBetweenTags(tag, body)
          })

          resolve(result)
        })
          .catch(reject)
      })
      request.on('error', reject)
      request.setTimeout(HTTP_TIMEOUT_MS, () => {
        request.destroy(new Error(`TV description request timed out after ${ HTTP_TIMEOUT_MS } ms`))
      })
    })
  }

  _isUrl(str) {
    const regexp = new RegExp(/((([A-Za-z]{3,9}:(?:\/\/)?)(?:[\-;:&=\+\$,\w]+@)?[A-Za-z0-9\.\-]+|(?:www\.|[\-;:&=\+\$,\w]+@)[A-Za-z0-9\.\-]+)((?:\/[\+~%\/\.\w\-_]*)?\??(?:[\-\+=&;%@\.\w_]*)#?(?:[\.\!\/\\\w]*))?)/i)
    return regexp.test(str)
  }

  encodeImage(imageUrl) {
    return new Promise((resolve, reject) => {
      let request = https
      if (imageUrl.startsWith('https')) {
        request = https
      } else if (imageUrl.startsWith('http')) {
        request = http
      } else {
        request = https
        imageUrl = `https://${ imageUrl }`
      }

      const imageRequest = request.get(imageUrl, async (response) => {
        try {
          if (response.statusCode < 200 || response.statusCode >= 300) {
            response.resume()
            throw new Error(`Image request failed with HTTP ${ response.statusCode }`)
          }
          const type = assertImageContentType(response.headers['content-type'])
          const body = await readStreamBounded(response, MAX_IMAGE_BYTES, 'Image response')
          resolve(`data:${ type };base64,${ body.toString('base64') }`)
        } catch (error) {
          reject(error)
        }
      })
      imageRequest.setTimeout(HTTP_TIMEOUT_MS, () => {
        imageRequest.destroy(new Error(`Image request timed out after ${ HTTP_TIMEOUT_MS } ms`))
      })
      imageRequest.on('error', reject)
    })
  }

  static _getTextBetweenTags(tag, string) {
    let re1 = new RegExp('<' + tag + '>(.*?)<\/' + tag + '>', 'g')
    let matches = string.match(re1)

    let re2 = new RegExp('<\/?' + tag + '>', 'g')
    if (matches) return matches[0].replace(re2, '')
    return null
  }

}

module.exports = WebosPlusDriver
