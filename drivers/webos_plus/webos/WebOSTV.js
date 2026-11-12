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

const Homey = require('homey')
const {endpoints} = require('./utils/constants')
const {readLgVolume} = require('./utils/numeric-volume')
const wol = require('node-wol')
const Jimp = require('jimp-compact')

const CLIENT_KEY_STORE_KEY = 'pairingKey'

class WebOSTV extends Homey.Device {

  /**
   * Custom constructor
   */
  construct() {
    this.lgtv = null
    this.subsSet = false
    this.simulateButtonConnection = null
    this.simulateButtonConnecting = null
    this._playPauseState = null
  }

  /**
   * Connect to the LG WebOS TV
   */
  _connect() {
    this._playPauseState = null
    this.setAvailable()
    this.log(`_connect: Connect to TV wss://${ this.getSettings().ipAddress }:3001`)

    const storedClientKey = this.getStoreValue(CLIENT_KEY_STORE_KEY)
    const clientKey = typeof storedClientKey === 'string' && storedClientKey.length > 0
      ? storedClientKey
      : null

    let client
    const saveKey = (key, callback) => {
      client.clientKey = key

      Promise.resolve()
        .then(() => this.setStoreValue(CLIENT_KEY_STORE_KEY, key))
        .then(
          () => callback(null),
          error => callback(error),
        )
    }

    client = require('../lgtv2/lgtv2')({
      host: this.getSettings().ipAddress,
      clientKey,
      saveKey,
    })
    this.lgtv = client

    this.lgtv.on('prompt', () => {
      this.log('_connect: [prompt] Please authorize on TV')
      this.setWarning('Please authorise on the TV')
    })

    this.lgtv.on('close', () => {
      if (this.lgtv === client) this._playPauseState = null
      this.log('_connect: [close] Disconnected')
    })

    this.lgtv.on('error', (err) => {
      if (err.code === 'EHOSTUNREACH') {
        this.setAvailable()
      } else {
        this.error(err)
      }
    })

    this.lgtv.on('connect', () => {
      this.unsetWarning()
      this.log('_connect: [connect] Connected')
    })
  }

  _getParentFunctionName() {
    try {
      throw new Error()
    } catch (e) {
      // matches this function, the caller and the parent
      const allMatches = e.stack.match(/at\s[aA-zZ]*\.(\S*)/g)
      return allMatches[2].split('.')[1]
    }
  }

  request(url, data) {
    return new Promise((resolve, reject) => {
      const caller = this._getParentFunctionName()
      this.log('Data', data)
      this.lgtv.request(url, data, (err, res) => {
        const {
          endpoint,
          error,
          result,
        } = this._handleResponse(err, res, url)
        if (error) {
          this.error(`${ caller } error: ${ endpoint } with result:`, result)
          return reject(error)
        }
        this.log(`${ caller }: Success`, result)
        return resolve(result)
      })
    })
  }

  /**
   * Handles the API response
   *
   * @param {*} err The api error object
   * @param {*} res The api response object
   * @param {string} endpoint What api endpoint is called
   * @returns {{result: *, error: *, endpoint: string}}
   * @private
   */
  _handleResponse(err, res, endpoint) {
    this.log(`_handleResponse: ${ endpoint }`)
    let responseError = null

    if (err) {
      responseError = err instanceof Error
        ? err
        : new Error(err && err.message ? String(err.message) : String(err))
      if (err && typeof err.code !== 'undefined' && typeof responseError.code === 'undefined') {
        responseError.code = err.code
      }
    } else if (!res || typeof res !== 'object' || Array.isArray(res)) {
      responseError = new Error(`LG response for ${ endpoint } did not contain an object payload`)
      responseError.isLGResponseFailure = true
    } else if (res.returnValue === false || (typeof res.errorText === 'string' && res.errorText.length > 0)) {
      responseError = new Error(res.errorText || `LG response for ${ endpoint } reported failure`)
      responseError.isLGResponseFailure = true
      if (typeof res.errorCode !== 'undefined') {
        responseError.code = res.errorCode
        responseError.lgErrorCode = res.errorCode
      }
    }

    if (responseError) {
      this.error('_handleResponse error:', endpoint, responseError)
    }

    return {
      error: responseError,
      result: res,
      endpoint,
    }
  }

  /**
   * A listener (subscription) on power state changes
   *
   * @param {Function} handleOn Callback when powered on
   * @param {Function} handleOff Callback when powered off
   * @param {Function} handleConfirmedOn Callback with the LG reply receipt time
   */
  _powerStateListener(handleOn, handleOff, handleConfirmedOn) {
    this.log(`_powerStateListener: Start listening for changes in power state`)
    const client = this.lgtv
    let connectionOpen = true
    client.once('close', () => { connectionOpen = false })
    let timer = null
    let processing = null
    let status = null
    let statusPowerOnReason = null
    client.subscribe(endpoints.powerState, (err, res) => {
      const receivedAt = Date.now()
      const {
        error,
        result,
      } = this._handleResponse(err, res, endpoints.powerState)
      if (error && error.isLGResponseFailure) {
        this.error(error)
        return
      }
      if (!error && ((result.state && typeof result.state !== 'string') ||
        (result.processing && typeof result.processing !== 'string'))) {
        this.error('LG power report contained an invalid state or processing value')
        return
      }
      if (timer) {
        this.log(`_powerStateListener: Reset timer`)
        clearTimeout(timer)
        timer = null
      }
      this.log('_powerStateListener: Power state changed', result)
      if (error) {
        this.error(error)
        handleOff()
        return
      }
      if (!this.subsSet) {
        this.subsSet = true
      }

      status = result.state ? result.state.toLowerCase() : ''
      processing = result.processing ? result.processing.toLowerCase() : null
      statusPowerOnReason = (res && res.powerOnReason ? res.powerOnReason : null)

      // The existing ON/OFF callback also covers screen and transition states.
      if (connectionOpen && this.lgtv === client && result.returnValue === true &&
        status === 'active' && (result.processing == null || result.processing === '') &&
        result.errorCode == null && (result.errorText == null || result.errorText === '')) {
        handleConfirmedOn(receivedAt)
      }

      this.log(`_powerStateListener: ${ timer ? 'Reset' : 'Set' } timeout to ${ this.getSettings().powerStateTimeout || 2000 } ms and check the state`)
      timer = setTimeout(() => {
        this.log(`_powerStateListener: Called timeout`, status, processing)

        //Screen saver(?) should tv be turned on?
        if (((status === 'active' || status === 'screen saver' || status === 'screen off') && !processing) || (processing && (processing.includes('on') || processing.includes('ready') || processing.includes('resume') || processing.includes('saver')))) {
          handleOn()
        } else if ((!processing && status !== 'active' && status !== 'screen off') || (processing && (processing.includes('standby') || processing.includes('suspend') || processing.includes('off')))) {
          handleOff()
        }

        clearTimeout(timer)
        timer = null
      }, this.getSettings().powerStateTimeout || 2000)
    })
  }

  /**
   * A listener (subscription) on volume changes
   *
   * @param {Function} handleChange Callback (validated LG volume, optional original power report)
   * @param {Function} handleMute Callback when mute changed
   */
  _volumeListener(handleChange, handleMute) {
    this.log(`_volumeListener: Start listening for changes in volume`)
    this.lgtv.subscribe(endpoints.volume.get, (err, res) => {
      const {
        error,
        result,
        endpoint,
      } = this._handleResponse(err, res, endpoints.volume.get)
      if (error) {
        this.error(`_volumeListener: ${ endpoint } with result:`, result)
        return
      }
      if (!this.subsSet) {
        this.subsSet = true
      }

      const volume = readLgVolume(result)
      if (result.changed && result.changed.indexOf('volume') !== -1) {
        this.log(`_volumeListener: Volume changed to ${ result.volume }`)
        handleChange(volume, { value: result.volume })
      } else {
        // Initial and nested reports were missed by the changed-marker reader.
        // These newly consumed reports must not add ON/OFF transitions.
        if (volume !== null) handleChange(volume)
      }
      if (result.changed && result.changed.indexOf('muted') !== -1) {
        this.log(`_volumeListener: Mute changed to ${ result.muted }`)
        handleMute(result.muted)
      }
    })
  }

  /**
   * A listener (subscription) on app/input changes
   *
   * @param {Function} handleChange Callback when app/input changed
   */
  _appListener(handleChange) {
    this.log(`_appListener: Start listening for changes in app/input`)
    this.lgtv.subscribe(endpoints.app.getForegroundApp, (err, res) => {
      const {
        error,
        result,
        endpoint,
      } = this._handleResponse(err, res, endpoints.app.getForegroundApp)
      if (error) {
        this.error(`_appListener: ${ endpoint } with result:`, result)
        return
      }
      if (!this.subsSet) {
        this.subsSet = true
      }
      this.log(`_appListener: App/input changed to ${ result.appId }`)
      handleChange(result.appId)
    })
  }

  /**
   * A listener (subscription) on sound output changes
   *
   * @param {Function} handleChange Callback when changed
   */
  _soundOutputListener(handleChange) {
    this.log(`_soundOutputListener: Start listening for changes in sound output`)
    this.lgtv.subscribe(endpoints.audio.getOutput, (err, res) => {
      const {
        error,
        result,
        endpoint,
      } = this._handleResponse(err, res, endpoints.audio.getOutput)
      if (error) {
        this.error(`_soundOutputListener: ${ endpoint } with result:`, result)
        return
      }
      if (!this.subsSet) {
        this.subsSet = true
      }
      this.log(`_soundOutputListener: Sound output changed to ${ result.soundOutput }`)
      handleChange(result.soundOutput)
    })
  }

  /**
   * A listener (subscription) on channel changes
   *
   * @param {Function} handleChange Callback when changed
   */
  _channelListener(handleChange, handleError, client = this.lgtv) {
    this.log(`_channelListener: Start listening for changes in channel`)
    return client.subscribeWithCancel(endpoints.channel.current, (err, res) => {
      const channelUnavailable = err
        ? err.isLGResponseFailure === true && err.message === '500 Application error'
        : res?.errorText === '500 Application error'
      if (channelUnavailable) {
        // LG can lose the tuner before publishing the new foreground source.
        this.log('_channelListener: Current channel unavailable (LG 500)')
        handleChange(null)
        return
      }

      const {
        error,
        result,
        endpoint,
      } = this._handleResponse(err, res, endpoints.channel.current)
      if (error) {
        this.error(`_channelListener: ${ endpoint } with result:`, result)
        if (handleError) handleError(error)
        return
      }
      if (!this.subsSet) {
        this.subsSet = true
      }
      this.log(`_channelListener: Channel changed to ${ result.channelNumber }`)
      handleChange(result)
    })
  }

  /**
   * Turn tv on
   */
  _turnOn() {
    const {macAddress} = this.getSettings()
    this.log(`_turnOn: Send request to turn on (WoL) with mac address ${ macAddress }`)
    return new Promise((resolve, reject) => {
      wol.wake(macAddress, (error) => {
        if (error) {
          this.error(`Failed waking up ${ macAddress }`)
          return reject(error)
        }
        this.log('_turnOn: TV turned on successfully')
        return resolve(true)
      })
    })
  }

  /**
   * Turn tv off
   */
  _turnOff() {
    this.log('_turnOff: Send request to turn the TV off')
    return new Promise((resolve, reject) => {
      this.lgtv.request(endpoints.system.off, (err, res) => {
        const {
          error,
          result,
          endpoint,
        } = this._handleResponse(err, res, endpoints.system.off)
        if (error) {
          this.error(`_turnOff: ${ endpoint } with result:`, result)
          return reject(error)
        }
        this.log('_turnOff: TV turned off successfully')
        resolve(result)
      })
    })
  }

  /**
   * Set volume to a specific value
   *
   * @param {number} volume
   * @returns {Promise<{volume: number, result: *}>} Promise object represents the API response
   */
  _volumeSet(volume) {
    this.log(`_volumeSet: Send request to set volume to ${ volume }`)
    return new Promise((resolve, reject) => {
      this.lgtv.request(endpoints.volume.set, {volume}, (err, res) => {
        const {
          error,
          result,
          endpoint,
        } = this._handleResponse(err, res, endpoints.volume.set)
        if (error) {
          this.error(`_volumeSet: ${ endpoint } with result:`, result)
          return reject(error)
        }
        this.log(`_volumeSet: Set volume successfully to ${ volume }`)
        return resolve({
          volume,
          result,
        })
      })
    })
  }

  /**
   * Set muted state of the tv
   *
   * @param {boolean} mute
   * @returns {Promise<{muted: boolean, result: *}>}
   */
  _volumeMute(mute) {
    this.log(`_volumeMute: Send request to set mute to ${ mute }`)
    return new Promise((resolve, reject) => {
      this.lgtv.request(endpoints.volume.mute, {mute}, (err, res) => {
        const {
          endpoint,
          error,
          result,
        } = this._handleResponse(err, res, endpoints.volume.mute)
        if (error) {
          this.error(`_volumeMute: ${ endpoint } with result:`, result)
          return reject(error)
        }
        this.log(`_volumeMute: Set mute successfully to ${ mute }`)
        return resolve({
          result,
          muted: mute,
        })
      })
    })
  }

  /**
   * Set volume up by 1
   *
   * @returns {Promise<*>}
   */
  _volumeUp() {
    this.log(`_volumeUp: Send request to increase volume`)
    return new Promise((resolve, reject) => {
      this.lgtv.request(endpoints.volume.up, (err, res) => {
        const {
          endpoint,
          error,
          result,
        } = this._handleResponse(err, res, endpoints.volume.up)
        if (error) {
          this.error(`_volumeUp: ${ endpoint } with result:`, result)
          return reject(error)
        }
        this.log(`_volumeUp: Increased volume successfully`)
        return resolve(result)
      })
    })
  }

  /**
   * Set volume down by 1
   *
   * @returns {Promise<*>}
   */
  _volumeDown() {
    this.log(`_volumeDown: Send request to decrease volume`)
    return new Promise((resolve, reject) => {
      this.lgtv.request(endpoints.volume.down, (err, res) => {
        const {
          endpoint,
          error,
          result,
        } = this._handleResponse(err, res, endpoints.volume.down)
        if (error) {
          this.error(`_volumeDown: ${ endpoint } with result:`, result)
          return reject(error)
        }
        this.log(`_volumeDown: Decreased volume successfully`)
        return resolve(result)
      })
    })
  }

  /**
   * Get the current channel
   *
   * @returns {Promise<*>}
   */
  _channelCurrent() {
    this.log(`_channelCurrent: Send request to get the current channel`)
    return new Promise((resolve, reject) => {
      this.lgtv.request(endpoints.channel.current, (err, res) => {
        const {
          endpoint,
          error,
          result,
        } = this._handleResponse(err, res, endpoints.channel.current)
        if (error) {
          this.error(`_channelCurrent: ${ endpoint } with result:`, result)
          return reject(error)
        }
        this.log(`_channelCurrent: Success getting channel`)
        return resolve(result)
      })
    })
  }

  /**
   * Increase channel by 1
   *
   * @returns {Promise<*>}
   */
  _channelUp() {
    this.log(`_channelUp: Send request to increase the channel`)
    return new Promise((resolve, reject) => {
      this.lgtv.request(endpoints.channel.up, (err, res) => {
        const {
          endpoint,
          error,
          result,
        } = this._handleResponse(err, res, endpoints.channel.up)
        if (error) {
          this.error(`_channelUp: ${ endpoint } with result:`, result)
          return reject(error)
        }
        this.log(`_channelUp: Increased the channel successfully`)
        return resolve(result)
      })
    })
  }

  /**
   * Decrease channel by 1
   *
   * @returns {Promise<*>}
   */
  _channelDown() {
    this.log(`_channelDown: Send request to decrease the channel`)
    return new Promise((resolve, reject) => {
      this.lgtv.request(endpoints.channel.down, (err, res) => {
        const {
          endpoint,
          error,
          result,
        } = this._handleResponse(err, res, endpoints.channel.down)
        if (error) {
          this.error(`_channelDown: ${ endpoint } with result:`, result)
          return reject(error)
        }
        this.log(`_channelDown: Decreased the channel successfully`)
        return resolve(result)
      })
    })
  }

  /**
   * Get all channels
   *
   * @returns {Promise<*[]>}
   */
  _channelList() {
    this.log(`_channelList: Send request to get all channels`)
    return new Promise((resolve, reject) => {
      this.lgtv.request(endpoints.channel.list, (err, res) => {
        const {
          endpoint,
          error,
          result,
        } = this._handleResponse(err, res, endpoints.app.getAll)
        if (error) {
          this.error(`_channelList: ${ endpoint } with result:`, result)
          return reject(error)
        }
        this.log(`_channelList: Retrieved all channels successfully`)
        if (!Array.isArray(result.channelList)) {
          const schemaError = new TypeError('_channelList: LG response channelList is not an array')
          this.error(schemaError)
          return reject(schemaError)
        }
        try {
          const channels = result.channelList.map(channel => {
            return {
              name: channel.channelName,
              description: channel.channelNumber,
              number: channel.channelNumber,
              search: `${ channel.channelNumber } ${ channel.channelName }`,
            }
          })
          this.log(`_channelList: Mapped all channels and resolve`)
          return resolve(channels)
        } catch (mappingError) {
          this.error('_channelList: Failed to map LG channelList', mappingError)
          return reject(mappingError)
        }
      })
    })
  }

  /**
   * Set channel to a specific channel number
   *
   * @param {string} channelNumber
   * @returns {Promise<{channelNumber: number, result: *}>}
   */
  _channelSet(channelNumber) {
    this.log(`_channelSet: Send request to set channel to ${ channelNumber }`)
    return new Promise((resolve, reject) => {
      this.lgtv.request(endpoints.channel.set, {channelNumber}, (err, res) => {
        const {
          endpoint,
          error,
          result,
        } = this._handleResponse(err, res, endpoints.channel.set)
        if (error) {
          this.error(`_channelSet: ${ endpoint } with result:`, result)
          return reject({
            error,
            result,
          })
        }
        this.log(`_channelSet: Set channel successfully to ${ channelNumber }`)
        return resolve({
          channelNumber,
          result,
        })
      })
    })
  }

  /**
   * Simulate a button press
   *
   * @param {string} button
   * @returns {Promise<void>} Completes on local write, not TV acknowledgement
   */
  async _simulateButton(button) {
    this.log(`_simulateButton: Send request to simulate button '${ button }'`)
    const client = this.lgtv
    let connection = this.simulateButtonConnection
    if (connection && (connection.client !== client || !connection.socket.isOpen())) {
      this._disposeButtonConnection(connection)
      connection = null
    }

    if (!connection) {
      let pending = this.simulateButtonConnecting
      if (!pending || pending.client !== client) {
        pending = {client}
        this.simulateButtonConnecting = pending
        pending.promise = new Promise((resolve, reject) => {
          client.getSocket(endpoints.inputSocket, (error, socket) => {
            if (error) return reject(error)
            resolve(socket)
          })
        }).then(socket => {
          const opened = {client, socket, timer: null, writes: 0, disposed: false}
          if (this.lgtv !== client || this.simulateButtonConnecting !== pending || !socket.isOpen()) {
            this._disposeButtonConnection(opened)
            throw new Error('Button connection changed or closed during setup')
          }
          this.simulateButtonConnection = opened
          socket.once('close', () => this._disposeButtonConnection(opened))
          return opened
        }).finally(() => {
          if (this.simulateButtonConnecting === pending) this.simulateButtonConnecting = null
        })
      }
      connection = await pending.promise
    }

    connection.writes++
    clearTimeout(connection.timer)
    connection.timer = null
    try {
      if (connection.disposed || this.lgtv !== client) {
        throw new Error('Button connection changed or closed before sending')
      }
      await connection.socket.send('button', {name: button.toUpperCase()})
      if (connection.disposed || this.lgtv !== client) {
        throw new Error('Button connection changed or closed while sending')
      }
      this.log(`_simulateButton: Sent button '${ button }'`)
    } catch (error) {
      this._disposeButtonConnection(connection)
      throw error
    } finally {
      connection.writes--
      if (!connection.disposed && connection.writes === 0) {
        const timer = setTimeout(() => {
          if (connection.timer !== timer) return
          connection.timer = null
          this._disposeButtonConnection(connection)
        }, 10000)
        connection.timer = timer
      }
    }
  }

  _disposeButtonConnection(connection) {
    if (!connection || connection.disposed) return
    connection.disposed = true
    clearTimeout(connection.timer)
    connection.timer = null
    if (this.simulateButtonConnection === connection) this.simulateButtonConnection = null
    try {
      connection.socket.close()
    } catch (error) {
      this.error('_simulateButton: close failed', error)
    }
  }

  /**
   * Launch an app
   *
   * @param {string} appId
   * @returns {Promise<*>} Promise object represents the API response
   */
  _appLaunch(appId) {
    this.log(`_appLaunch: Send request to launch app/input '${ appId }'`)
    return new Promise(async (resolve, reject) => {
      this.lgtv.request(endpoints.app.launch, {id: appId}, (err, res) => {
        const {
          endpoint,
          error,
          result,
        } = this._handleResponse(err, res, endpoints.app.launch)
        if (error) {
          this.error(`_appLaunch: ${ endpoint } with result:`, result)
          return reject(error)
        }
        this.log(`_appLaunch: Successfully launched app/input ${ appId }`)
        return resolve(result)
      })
    })
  }

  /**
   * Get all apps/inputs
   *
   * @returns {Promise<*[]>} App/inputs list
   */
  _appListLaunchPoints() {
    this.log(`_appListLaunchPoints: Send request to retrieve all launch points`)
    return new Promise((resolve, reject) => {
      this.lgtv.request(endpoints.app.getAll, (err, res) => {
        const {
          endpoint,
          error,
          result,
        } = this._handleResponse(err, res, endpoints.app.getAll)
        if (error) {
          this.error(`_appListLaunchPoints: ${ endpoint } with result:`, result)
          return reject(error)
        }

        this.log(`_appListLaunchPoints: Retrieved all launch points successfully`)
        if (!Array.isArray(result.launchPoints)) {
          const schemaError = new TypeError('_appListLaunchPoints: LG response launchPoints is not an array')
          this.error(schemaError)
          return reject(schemaError)
        }
        try {
          const apps = result.launchPoints.map(point => {
            return {
              name: point.title,
              image: point.icon,
              id: point.id,
              imageLarge: point.largeIcon,
            }
          })
          this.log(`_appListLaunchPoints: Mapped all launchp oints and resolve`)
          return resolve(apps)
        } catch (mappingError) {
          this.error('_appListLaunchPoints: Failed to map LG launchPoints', mappingError)
          return reject(mappingError)
        }
      })
    })
  }

  _appList() {
    this.log(`_appList: Send request to retrieve all apps`)
    return new Promise((resolve, reject) => {
      this.lgtv.request(endpoints.app.list, (err, res) => {
        const {
          endpoint,
          error,
          result,
        } = this._handleResponse(err, res, endpoints.app.getAll)
        if (error) {
          this.error(`_appList: ${ endpoint } with result:`, result)
          return reject(error)
        }

        this.log(`_appList: Retrieved all apps successfully`)
        if (!Array.isArray(result.apps)) {
          const schemaError = new TypeError('_appList: LG response apps is not an array')
          this.error(schemaError)
          return reject(schemaError)
        }
        try {
          const apps = result.apps.map(point => {
            return {
              name: point.title,
              image: point.miniicon,
              id: point.id,
              imageLarge: point.icon,
            }
          })
          this.log(`_appList: Mapped all apps and resolve`)
          return resolve(apps)
        } catch (mappingError) {
          this.error('_appList: Failed to map LG apps', mappingError)
          return reject(mappingError)
        }
      })
    })
  }

  /**
   * Get the current app/input
   *
   * @returns {Promise<*>}
   */
  _appCurrent({withReportTime = false} = {}) {
    this.log(`_appCurrent: Send request to get current app/input`)
    return new Promise((resolve, reject) => {
      this.lgtv.request(endpoints.app.getForegroundApp, (err, res) => {
        const reportedAt = withReportTime ? Date.now() : undefined
        const {
          endpoint,
          error,
          result,
        } = this._handleResponse(err, res, endpoints.app.getForegroundApp)
        if (error) {
          this.error(`_appCurrent: ${ endpoint } with result:`, result)
          return reject(error)
        }
        this.log(`_appCurrent: Successfully retrieved current app/input`)
        return resolve(withReportTime ? {result, reportedAt} : result)
      })
    })
  }

  async _sendLegacyPlaybackToggle() {
    if (this._playPauseState?.pending) {
      throw new Error('A Play or Pause command is still pending')
    }
    const endpoint = this._playPauseState?.last === endpoints.media.play
      ? endpoints.media.pause
      : endpoints.media.play
    return this._sendPlaybackCommand(endpoint)
  }

  _sendPlaybackCommand(endpoint) {
    if (endpoint === endpoints.media.play || endpoint === endpoints.media.pause) {
      return this._trackPlayPause(endpoint, () => this._requestPlayback(endpoint))
    }
    return this._requestPlayback(endpoint)
  }

  async _trackPlayPause(endpoint, send, acknowledged = result => result === true) {
    // This is Homey command history for the deprecated card, not player state.
    const state = this._playPauseState ??= {pending: 0, overlap: false, last: undefined}
    if (state.pending) {
      state.overlap = true
      state.last = undefined
    }
    state.pending += 1
    try {
      const result = await send()
      if (!state.overlap) state.last = acknowledged(result) ? endpoint : undefined
      return result
    } catch (error) {
      if (error?.playbackRejected !== true) state.last = undefined
      throw error
    } finally {
      state.pending -= 1
      if (state.pending === 0) state.overlap = false
    }
  }

  _requestPlayback(endpoint) {
    return new Promise((resolve, reject) => {
      const client = this.lgtv
      if (!client) return reject(new Error('TV is not connected'))

      // The LG client clears pending callbacks when the connection closes.
      const disconnected = () => finish(new Error('TV disconnected before acknowledging the playback command'))
      const finish = error => {
        client.removeListener('close', disconnected)
        if (error) reject(error)
        else resolve(true)
      }
      client.once('close', disconnected)

      try {
        client.requestPlayback(endpoint, (error, payload, reply) => {
          if (error) return finish(error)
          if (this.lgtv !== client) return disconnected()

          const parts = [reply, payload].filter(part => part && typeof part === 'object' && !Array.isArray(part))
          const messages = new Set()
          let code
          let rejected = false
          for (const part of parts) {
            for (const value of [part.error, part.errorText]) {
              if (typeof value === 'string' && value.trim()) messages.add(value.trim())
            }
            const candidate = part.errorCode ?? (part.type === 'error' ? part.code : undefined)
            if ((Number.isFinite(candidate) && candidate !== 0)
              || (typeof candidate === 'string' && candidate.trim() && candidate.trim() !== '0')) {
              code ??= candidate
            }
            if (part.type === 'error' || part.returnValue === false || part.error || part.errorText) {
              rejected = true
            }
          }

          rejected ||= code !== undefined
          if (!rejected && reply?.type === 'response' && payload?.returnValue === true) return finish()

          const detail = [...messages].join(' — ') || (rejected
            ? 'TV rejected the playback command'
            : 'TV did not acknowledge the playback command')
          const failure = new Error(code === undefined ? detail : `${detail} (LG code ${code})`)
          failure.playbackRejected = rejected
          if (code !== undefined) failure.code = code
          return finish(failure)
        })
      } catch (error) {
        finish(error)
      }
    })
  }

  /**
   * Toggle media button play/pause
   *
   * @param {boolean} value - Play = true, Pause = false
   * @returns {Promise<*>} Promise object represents the API response
   */
  _mediaTogglePlayPause(value) {
    this.log(`_mediaTogglePlayPause: Send request to play/pause`)
    const url = value ? endpoints.media.play : endpoints.media.pause
    const send = () => new Promise((resolve, reject) => {
      this.lgtv.request(url, (err, res) => {
        const {
          endpoint,
          error,
          result,
        } = this._handleResponse(err, res, url)
        if (error) {
          this.error(`_mediaTogglePlayPause: (value: ${ value }) ${ endpoint } with result:`, result)
          return reject(error)
        }
        this.log(`_mediaTogglePlayPause: Successfully toggled play/pause`)
        return resolve(result)
      })
    })
    return this._trackPlayPause(url, send, result =>
      result?.returnValue === true && !result.error && !result.errorText
        && (result.errorCode == null || result.errorCode === 0 || result.errorCode === '0'))
  }

  /**
   * Media next
   *
   * @returns {Promise<*>} Promise object represents the API response
   */
  _mediaNext() {
    this.log(`_mediaNext: Send request to fastForward`)
    return new Promise((resolve, reject) => {
      this.lgtv.request(endpoints.media.fastForward, (err, res) => {
        const {
          endpoint,
          error,
          result,
        } = this._handleResponse(err, res, endpoints.media.fastForward)
        if (error) {
          this.error(`_mediaNext: ${ endpoint } with result:`, result)
          return reject(error)
        }
        this.log(`_mediaNext: Successfully fastForward`)
        return resolve(result)
      })
    })
  }

  /**
   * Media previous
   *
   * @returns {Promise<*>} Promise object represents the API response
   */
  _mediaPrev() {
    this.log(`_mediaPrev: Send request to rewind`)
    return new Promise((resolve, reject) => {
      this.lgtv.request(endpoints.media.rewind, (err, res) => {
        const {
          endpoint,
          error,
          result,
        } = this._handleResponse(err, res, endpoints.media.rewind)
        if (error) {
          this.error(`_mediaPrev: ${ endpoint } with result:`, result)
          return reject(error)
        }
        this.log(`_mediaPrev: Successfully rewind`)
        return resolve(result)
      })
    })
  }

  /**
   * Get the current sound output
   *
   * @returns {Promise<string>}
   */
  _soundOutputCurrent() {
    this.log(`_soundOutputCurrent: Send request to get the current sound output`)
    return new Promise((resolve, reject) => {
      this.lgtv.request(endpoints.audio.getOutput, (err, res) => {
        const {
          endpoint,
          error,
          result,
        } = this._handleResponse(err, res, endpoints.audio.getOutput)
        if (error) {
          this.error(`_soundOutputCurrent: ${ endpoint } with result:`, result)
          return reject(error)
        }
        this.log(`_soundOutputCurrent: Successfully retrieved current sound output`)
        return resolve(result.soundOutput)
      })
    })
  }

  /**
   * Change the sound output
   *
   * @param {string} output
   * @returns {Promise<*>}
   */
  _soundOutputSet(output) {
    this.log(`_soundOutputSet: Send request to change the sound output to ${ output }`)
    return new Promise((resolve, reject) => {
      this.lgtv.request(endpoints.audio.setOutput, {output}, (err, res) => {
        const {
          endpoint,
          error,
          result,
        } = this._handleResponse(err, res, endpoints.audio.setOutput)
        if (error) {
          this.error(`_soundOutputSet: ${ endpoint } with result:`, result)
          return reject(error)
        }
        this.log(`_soundOutputSet: Successfully changed the sound output to ${ output }`)
        return resolve(result)
      })
    })
  }

  /**
   * Send toast message
   *
   * @param {string} message
   * @param {string} iconData
   * @returns {Promise<*>}
   */
  async _toastSend(message, iconData) {
    let data = {message}
    if (iconData) {
      data['iconExtension'] = 'tiff'
      data['iconData'] = iconData
      if (data.iconData.includes(',')) {
        const base64 = data.iconData.split(',')
        data.iconData = base64[1]
        const type = base64[0].split('/')
        let typeString = type.length > 0 ? type[1] : null
        typeString = typeString ? typeString.split(';')[0] : null
        if (typeString) {
          data.iconExtension = typeString
        }
      }
    }

    this.log(`_toastSend: Send request to create a toast message as`, data.iconExtension)
    if (data.iconData && data.iconExtension && data.iconExtension !== 'tiff') {
      data.iconData = await this._resizeIcon(data.iconData, data.iconExtension)
    }

    return this.request(endpoints.toast.create, data)
  }

  /**
   * Resize Toast icons to maximum of 80px
   * @param base64
   * @param mimeType
   * @returns {Promise<unknown>}
   * @private
   */
  _resizeIcon(base64, mimeType) {
    return new Promise((resolve, reject) => {
      const icon = new Buffer(base64, 'base64')
      Jimp.read(icon)
        .then(async (newIcon) => {
          const stringData = await newIcon.contain(80, 80).getBase64Async(`image/${ mimeType }`)
          resolve(stringData.split(',')[1])
        })
        .catch(err => {
          this.error('_resizeIcon: ', err)
          reject(err)
        })
    })
  }

  /**
   * Get the current external inputs
   *
   * @returns {Promise<*>}
   */
  _externalInputList() {
    this.log(`_externalInputList: Send request to retrieve all external inputs`)
    return new Promise((resolve, reject) => {
      this.lgtv.request(endpoints.system.inputs.list, (err, res) => {
        const {
          endpoint,
          error,
          result,
        } = this._handleResponse(err, res, endpoints.system.inputs.list)
        if (error) {
          this.error(`_externalInputList: ${ endpoint } with result:`, result)
          return reject(error)
        }

        this.log(`_externalInputList: Retrieved all external inputs successfully`)
        if (!Array.isArray(result.devices)) {
          const schemaError = new TypeError('_externalInputList: LG response devices is not an array')
          this.error(schemaError)
          return reject(schemaError)
        }
        try {
          const inputs = result.devices.map(input => {
            return {
              name: input.label,
              image: input.icon,
              port: input.port,
              id: input.id,
              appId: input.appId,
              imageLarge: input.icon,
            }
          })
          this.log(`_externalInputList: Mapped all external inputs and resolve`)
          return resolve(inputs)
        } catch (mappingError) {
          this.error('_externalInputList: Failed to map LG devices', mappingError)
          return reject(mappingError)
        }
      })
    })
  }

  /**
   * Switch to external input
   *
   * @param {string} inputId
   * @returns {Promise<*>}
   */
  _switchInput(inputId) {
    this.log(`_switchInput: Send request to change to external input ${ inputId }`)
    return new Promise((resolve, reject) => {
      this.lgtv.request(endpoints.system.inputs.switch, {inputId}, (err, res) => {
        const {
          endpoint,
          error,
          result,
        } = this._handleResponse(err, res, endpoints.system.inputs.switch)
        if (error) {
          this.error(`_switchInput: ${ endpoint } with result:`, result)
          return reject(error)
        }
        this.log(`_switchInput: Successfully changed the external input to ${ inputId }`)
        return resolve(result)
      })
    })
  }

  /**
   * Send an alert to the TV
   *
   * @param message
   * @param timeout
   * @returns {Promise<unknown>}
   * @private
   */
  async _alertSend(args) {
    const data = {
      title: args.title || undefined,
      message: args.message,
      buttons: [],
    }

    if (Boolean(args.buttons)) {
      data.buttons = JSON.parse(args.buttons)
    }

    data.buttons.push({
      label: 'Close',
      buttonType: 'cancel',
    })

    this.log(`_alertSend: Send request to create an alert message`)
    const result = await this.request(endpoints.alert.create, data)
    const alertId = result.alertId
    if (!alertId) {
      throw new Error('Could not send an alert. Your TV probably does not support it!')
    }
    if (args.timeout) {
      setTimeout(async () => {
        let closeResult
        try {
          closeResult = await this.request(endpoints.alert.close, {alertId})
        } catch (error) {
          try {
            this.error('_alertSend: Automatic close failed', error)
          } catch (loggingError) {
            // Logging must not turn a handled close failure into a new rejection.
          }
          return
        }
        this.log('_alertSend: Closed', closeResult)
      }, args.timeout * 1000)
    }
    this.log(`_alertSend: Successfully sent a alert message`, JSON.stringify(result))
  }
}

module.exports = WebOSTV

