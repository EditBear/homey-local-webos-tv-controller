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

'use strict';

const fetch = require('node-fetch');
const WebOSTV = require('./webos/WebOSTV');
const {capabilities, store} = require('./webos/utils/constants');
const {toLgVolume, fromLgVolume} = require('./webos/utils/numeric-volume');
const {SourceNameReport, SOURCE_NAME_CAPABILITY} = require('./webos/utils/source-name-report');
const {ChannelReport, CHANNEL_CAPABILITY} = require('./webos/utils/channel-report');
const net = require('net');
const {planVolumeSteps, MAX_STEPS} = require('./webos/utils/volume-steps');
const https = require('https');

const unsecureHttpsAgent = new https.Agent({
  rejectUnauthorized: false,
});

class WebosPlusDevice extends WebOSTV {
  async onInit() {
    this._channelStopped = false;
    // Init LGTV
    this.construct();

    // Initialise media screen image
    this.image = await this.homey.images.createImage();
    this.image.setUrl(null);
    this.setAlbumArtImage(this.image)
    this._driver = this.homey.drivers.getDriver('webos_plus');

    await this._driver.initReady(async () => {
      this.log('onInit: Device Ready!');
      try {
        await this.registerCapabilities();
      } catch (error) {
        this.error('startup: required capability setup failed', error);
        if (!this._channelStopped) {
          await this.setUnavailable('TV device setup failed.')
            .catch(statusError => this.error('startup: could not mark device unavailable', statusError));
        }
        return;
      }

      // Setup can outlast shutdown. Do not start a late TV connection.
      if (this._channelStopped) return;
      // The transport connects asynchronously; attach reporting before yielding.
      this._connect();
      await this.initDevice();
    });
  }

  onDiscoveryResult(discoveryResult) {
    const id = discoveryResult?.id;
    const deviceId = this.getData()?.id;
    return Boolean(deviceId) && typeof id === 'string' && id.replace(/uuid:/g, '') === deviceId;
  }

  onDiscoveryAvailable(discoveryResult) {
    this.setAvailable();
    const ipAddress = this.getSettings().ipAddress;
    this.advanceRediscoveryRetry(discoveryResult, ipAddress);
    if (this.getSettings().manualIpAddress === true && ipAddress !== '0.0.0.0'){
      return Promise.resolve(true);
    }
    if (ipAddress !== discoveryResult.address) {
      this.setSettings({ipAddress: discoveryResult.address}).then(() => {
        this._connect();
      }).catch(this.error);
    }
    return Promise.resolve(true);
  }

  onDiscoveryAddressChanged(discoveryResult) {
    this.setAvailable();
    const ipAddress = this.getSettings().ipAddress;
    if (this.getSettings().manualIpAddress === true && ipAddress !== '0.0.0.0'){
      return Promise.resolve(true);
    }
    if (ipAddress !== discoveryResult.address) {
      this.setSettings({ipAddress: discoveryResult.address}).then(() => {
        this._connect();
      }).catch(this.error);
    }
    return Promise.resolve(true);
  }

  onDiscoveryLastSeenChanged(discoveryResult) {
    this.setAvailable();
    this.advanceRediscoveryRetry(discoveryResult, this.getSettings().ipAddress);
    return Promise.resolve(true);
  }

  advanceRediscoveryRetry(discoveryResult, ipAddress) {
    const id = discoveryResult?.id;
    const deviceId = this.getData()?.id;
    if (this._channelStopped || !deviceId || typeof id !== 'string' ||
        id.replace(/^uuid:/, '') !== deviceId || discoveryResult.address !== ipAddress ||
        typeof ipAddress !== 'string' || !net.isIP(ipAddress) || ipAddress === '0.0.0.0' || ipAddress === '::') return;

    if (this.lgtv?.advanceReconnect?.(ipAddress)) {
      this.log('Discovery: brought forward the pending reconnect for the same TV and address');
    }
  }

  /**
   * Initialise the WebOS Tv
   * @returns {Promise<void>}
   */
  async initDevice() {
    if (!this._sourceNameReport && this.hasCapability(SOURCE_NAME_CAPABILITY)) {
      this._sourceNameReport = new SourceNameReport(
        value => this.setCapabilityValue(SOURCE_NAME_CAPABILITY, value),
        error => this.error('state report: App or input', error),
        this.getCapabilityValue(SOURCE_NAME_CAPABILITY),
        this.legacyDisplayWriter('webos_display.app'),
      );
      this._sourceNameReport.reset();
    }
    if (this._sourceNameReport && this._sourceNameClient !== this.lgtv) {
      if (this._sourceNameClient) {
        this._sourceNameClient.removeListener('close', this._sourceNameClose);
      }
      const client = this.lgtv;
      this._sourceNameClient = client;
      this._sourceNameReport.reset();
      this._sourceNameClose = () => {
        if (this._sourceNameClient === client) this._sourceNameReport.reset();
      };
      client.on('close', this._sourceNameClose);
    }
    if (this.pollInterval) {
      clearInterval(this.pollInterval);
    }
    if (this.getSettings().usePoll) {
      this.poll();
    }
    this.lgtv.on('connect', () => {
      if (!this.getSettings().usePoll) {
        this.powerStateListener();
      }
      this.setCapabilityValue(capabilities.onOff, true)
        .catch(error => this.error('state report: initDevice/connect onoff', error));
      this.volumeListener();
      this.channelListener();
      this.appListener();
      this.soundOutputListener();
    });
    this.lgtv.on('error', (error) => {
      if (error.code === 'EHOSTUNREACH') {
        this.setCapabilityValue(capabilities.onOff, false)
          .catch(error => this.error('state report: initDevice/EHOSTUNREACH onoff', error));
      }
    });
  }

  /**
   * Register all capabilities
   *
   * @returns {Promise<void>}
   */
  async registerCapabilities() {
    // Used for displaying the current app/input
    if (!this.hasCapability(capabilities.speakerArtist)) {
      await this.addCapability(capabilities.speakerArtist);
    }

    // Used for displaying the current channel
    if (!this.hasCapability(capabilities.speakerTrack)) {
      await this.addCapability(capabilities.speakerTrack);
    }

    // Used for displaying the app/input icon
    if (!this.hasCapability(capabilities.speakerAlbum)) {
      await this.addCapability(capabilities.speakerAlbum);
    }

    if (!this.hasCapability(capabilities.speakerPlaying)) {
      await this.addCapability(capabilities.speakerPlaying);
    }

    if (!this.hasCapability(capabilities.speakerNext)) {
      await this.addCapability(capabilities.speakerNext);
    }

    if (!this.hasCapability(capabilities.speakerPrev)) {
      await this.addCapability(capabilities.speakerPrev);
    }

    this.registerCapabilityListener(capabilities.onOff, this.toggleOnOff.bind(this));
    this.registerCapabilityListener(capabilities.volumeSet, this.volumeSet.bind(this));
    this.registerCapabilityListener(capabilities.volumeMute, this.volumeMute.bind(this));
    this.registerCapabilityListener(capabilities.volumeUp, this.volumeUp.bind(this));
    this.registerCapabilityListener(capabilities.volumeDown, this.volumeDown.bind(this));
    this.registerCapabilityListener(capabilities.channelUp, this._channelUp.bind(this));
    this.registerCapabilityListener(capabilities.channelDown, this._channelDown.bind(this));
    this.registerCapabilityListener(capabilities.speakerPlaying, this._mediaTogglePlayPause.bind(this));
    this.registerCapabilityListener(capabilities.speakerNext, this._mediaNext.bind(this));
    this.registerCapabilityListener(capabilities.speakerPrev, this._mediaPrev.bind(this));
    // A slow cosmetic option write must not hold up device reporting/controls.
    this.updateReportingTitles().catch(error => this.error('state report: reporting titles', error));
  }

  async updateReportingTitles() {
    // Preserve retained options and field identities; change visible titles only.
    for (const [id, title] of [
      [capabilities.speakerArtist, {en: 'App or input', nl: 'App of ingang'}],
      [capabilities.speakerTrack, {en: 'Channel', nl: 'Zender'}],
    ]) {
      try {
        if (!this.hasCapability(id)) continue;
        const options = this.getCapabilityOptions(id) || {};
        if (Object.keys(title).every(language => options.title && options.title[language] === title[language])) continue;
        await this.setCapabilityOptions(id, {...options, title: {...options.title, ...title}});
      } catch (error) { this.error('state report: reporting title', id, error); }
    }
  }

  /**
   * Listen for changes in on/off state
   */
  powerStateListener() {
    this.log(`powerStateListener: Called`);
    this._powerStateListener(() => {
      this.log(`powerStateListener: received on`);
      this.setCapabilityValue(capabilities.onOff, true)
        .catch(error => this.error('state report: powerStateListener/on onoff', error));
    }, () => {
      this.log(`powerStateListener: received off`);
      this.setCapabilityValue(capabilities.onOff, false)
        .catch(error => this.error('state report: powerStateListener/off onoff', error));
    }, async confirmedAt => {
      if (this._channelStopped || this.getSettings().usePoll) return;
      this.log('state report: confirmed power ON', confirmedAt);
      try {
        await this._driver.triggerPowerOnConfirmed(this, confirmedAt);
      } catch (error) {
        this.error('state report: confirmed power ON Flow', error);
      }
    });
  }

  onSettings({oldSettings, newSettings, changedKeys}) {
    if (oldSettings.usePoll !== newSettings.usePoll){
      this.lgtv.disconnect();
      this.construct();
      this._connect();
      this.initDevice();
    }
    if (newSettings.usePoll) {
      this.poll();
    }
    return Promise.resolve(true);
  }

  poll() {
    if (this.pollInterval) {
      clearInterval(this.pollInterval);
    }

    this.pollInterval = setInterval(() => {
      const client = new net.Socket();
      const cancel = setTimeout(() => {
        if (this.getCapabilityValue(capabilities.onOff)){
          this.setCapabilityValue(capabilities.onOff, false)
            .catch(error => this.error('state report: poll/timeout onoff', error));
        }
        client.destroy();
      }, this.getSettings().pollTimeout * 1000);

      client.on('error', (error) => {
        if (this.getCapabilityValue(capabilities.onOff)){
          this.setCapabilityValue(capabilities.onOff, false)
            .catch(error => this.error('state report: poll/error onoff', error));
        }
        this.error(error);
        clearTimeout(cancel);
        client.destroy();
      });

      client.connect(3000, this.getSettings().ipAddress, () => {
        if (!this.getCapabilityValue(capabilities.onOff)) {
          this.setCapabilityValue(capabilities.onOff, true)
            .catch(error => this.error('state report: poll/connect onoff', error));
          if (!this.subsSet) {
            this.lgtv.disconnect();
            this.construct();
            this._connect();
            this.initDevice();
          }
        }
        clearTimeout(cancel);
        client.destroy();
      });
    }, this.getSettings().pollInterval * 1000);
  }

  checkOnOff(value) {
    if (value === null || value === undefined || value === '') {
      this.setCapabilityValue(capabilities.onOff, false)
        .catch(error => this.error('state report: checkOnOff/absent onoff', error));
      return false;
    } else {
      this.setCapabilityValue(capabilities.onOff, true)
        .catch(error => this.error('state report: checkOnOff/present onoff', error));
      return true;
    }
  }

  /**
   * Validate one value against an existing string Flow-token contract.
   *
   * This deliberately does not trim, relabel, serialise or generically
   * stringify LG data. A genuinely absent previous value may be represented
   * by an empty string, and channel numbers may be converted explicitly from
   * finite numbers to decimal text. All other mismatches are rejected.
   *
   * @param {string} field Flow-token field name used for bounded diagnostics
   * @param {*} value Value to validate
   * @param {object} options Validation options
   * @param {boolean} options.allowAbsent Whether null/undefined means no prior value
   * @param {boolean} options.allowFiniteNumber Whether a finite number is a valid channel
   * @returns {{valid: boolean, value?: string}}
   * @private
   */
  _flowStringToken(field, value, {allowAbsent = false, allowFiniteNumber = false} = {}) {
    if (typeof value === 'string') {
      return {valid: true, value};
    }

    if (allowAbsent && (value === null || value === undefined)) {
      return {valid: true, value: ''};
    }

    if (allowFiniteNumber && typeof value === 'number' && Number.isFinite(value)) {
      return {valid: true, value: `${value}`};
    }

    const receivedType = value === null
      ? 'null'
      : Array.isArray(value)
        ? 'array'
        : typeof value === 'number' && !Number.isFinite(value)
          ? 'non-finite number'
          : typeof value;
    const warningKey = `${field}:${receivedType}`;

    if (!this._flowTokenWarningKeys) {
      this._flowTokenWarningKeys = new Set();
    }
    if (!this._flowTokenWarningKeys.has(warningKey)) {
      this._flowTokenWarningKeys.add(warningKey);
      this.error(`flowToken: Suppressed Flow trigger because '${field}' must be a string; received ${receivedType}`);
    }

    return {valid: false};
  }

  /**
   * Listen for changes in volume
   */
  volumeListener() {
    this.log(`volumeListener: Called`);
    this._volumeListener((newVolume, legacyPowerReport) => {
      // Preserve the inherited power check only for its original report path.
      if (legacyPowerReport && !this.checkOnOff(legacyPowerReport.value)) {
        return;
      }
      const normalizedVolume = fromLgVolume(newVolume);
      if (normalizedVolume === null) return;
      const currentVolume = this.getCapabilityValue(capabilities.volumeSet);
      this.log(`volumeListener: Volume changed from ${currentVolume} to ${normalizedVolume}`);
      if (currentVolume !== normalizedVolume) {
        this.log(`volumeListener: Capability ${capabilities.volumeSet} to ${normalizedVolume}`);
        this.setCapabilityValue(capabilities.volumeSet, normalizedVolume)
          .catch(error => this.error('state report: volumeListener volume_set', error));
      }
    }, (newMutedValue) => {
      if (!this.checkOnOff(newMutedValue)) {
        return;
      }
      const currentMute = this.getCapabilityValue(capabilities.volumeMute);
      this.log(`volumeListener: Mute changed from ${currentMute} to ${newMutedValue}`);
      if (currentMute !== newMutedValue) {
        this.log(`volumeListener: Capability ${capabilities.volumeMute} to ${newMutedValue}`);
        this.setCapabilityValue(capabilities.volumeMute, newMutedValue)
          .catch(this.error);
        this._driver.triggerVolumeMuteChanged(this, {}, {muted: newMutedValue});
      }
    });
  }

  async requestCurrentSource() {
    const client = this.lgtv;
    const report = this._sourceNameReport;
    if (!client || !report || this._sourceNameClient !== client || this._channelStopped) {
      throw new Error('TV source reporting is unavailable');
    }
    if (this._currentSourceRequestPending) {
      throw new Error('A current TV source request is already pending');
    }

    // Subscription reports and connection resets advance the existing sequence.
    const sequence = report.sequence;
    this._currentSourceRequestPending = true;
    try {
      const {result, reportedAt} = await this._appCurrent({withReportTime: true});
      if (this._channelStopped || this.lgtv !== client ||
        this._sourceNameReport !== report || report.sequence !== sequence) {
        throw new Error('The TV source request was superseded');
      }

      const source = result.appId;
      if (typeof source !== 'string' || source.length === 0 ||
        source.trim() !== source || /[\x00-\x1f\x7f|]/.test(source)) {
        throw new Error('LG did not return a usable TV source ID');
      }

      const sourceReport = {source, reportedAt};
      await this._driver.triggerSourceReported(this, sourceReport, {...sourceReport});
      return true;
    } finally {
      this._currentSourceRequestPending = false;
    }
  }

  /**
   * Listen for changes in app/input
   */
  appListener() {
    this.log(`appListener: Called`);
    const report = this._sourceNameReport;
    const client = this.lgtv;
    const generation = report ? report.reset() : null;
    const channelReport = this._channelReport;
    const channelGeneration = channelReport ? channelReport.generation : null;
    this._appListener(async (newAppId) => {
      const reportedAt = Date.now();
      if (channelReport && client === this.lgtv) channelReport.source(channelGeneration, newAppId);
      if (client !== this.lgtv && report) report.invalidate(generation);
      const nameTicket = report && client === this.lgtv
        ? report.begin(generation, newAppId) : null;
      const oldAppId = this.getStoreValue(store.currentApp);
      this.log(`appListener: App/input changed from ${oldAppId} to ${newAppId}`);
      // LG can report a blank or Home foreground during shutdown. An app ID
      // is source information, so it must not change the reported power state.
      if (typeof newAppId !== 'string' || newAppId.trim() === '') {
        return;
      }

      // A fresh report is useful even when the source did not change. Reuse
      // the current reporter ticket; do not alter its display/channel work.
      if (nameTicket && client === this.lgtv && generation === report.generation
        && !this._channelStopped) {
        const sourceReport = {source: newAppId, reportedAt};
        // Homey Flow delivery must never delay or interrupt existing reporting.
        try {
          Promise.resolve(this._driver.triggerSourceReported(this, sourceReport, {...sourceReport}))
            .catch(error => this.error('state report: source-reported Flow', error));
        } catch (error) {
          this.error('state report: source-reported Flow', error);
        }
      }

      if (newAppId !== oldAppId) {
        this.log(`appListener: Store ${store.currentApp} set to ${newAppId}`);
        this.setStoreValue(store.currentApp, newAppId)
          .catch(error => this.error('state report: app store', error));

        const oldApp = this._flowStringToken('oldApp', oldAppId, {allowAbsent: true});
        const newApp = this._flowStringToken('newApp', newAppId);
        if (oldApp.valid && newApp.valid) {
          const flowValues = {
            oldApp: oldApp.value,
            newApp: newApp.value
          };
          this.log(`appListener: Flow trigger app/input changed`);
          this._driver.triggerAppChanged(this, flowValues, {...flowValues});
        }
      }

      this.log(`appListener: Gather media screen information for ${newAppId}`);
      const allApps = await this._appListLaunchPoints().catch(this.error);
      if (report) {
        if (client === this.lgtv) report.resolve(nameTicket, allApps);
        else report.invalidate(generation);
      }
      if (!allApps) {
        this.error('appListener: No Apps/inputs found');
        return;
      }
      const app = allApps.find(app => app.id === newAppId);
      if (!app) {
        this.error(`appListener: No app found for ${newAppId}`);
        return;
      }

      this.log(`appListener: App found for '${newAppId}' ${app.name}`);
      // Text fields are supplied only by the guarded reporters. Keep the
      // shared catalogue and artwork, without the redundant channel read.

      if (!app.imageLarge && !app.image) {
        this.log(`appListener: No image found for '${newAppId}' ${app.name}`);
        return;
      }

      this.log(`appListener: Set image for '${newAppId}' ${app.name} (${app.imageLarge || app.image})`);
      this.image.setStream(async (stream) => {

        const appImage = await fetch(app.imageLarge || app.image, {method: 'get', agent: unsecureHttpsAgent}).catch(this.error);

        if (!appImage.ok) {
          this.error('appListener: Get image failed');
          throw new Error('Invalid Response');
        }

        return appImage.body.pipe(stream);
      });

      this.image.update();
    });
  }

  /**
   * Listen for changes in sound output
   */
  soundOutputListener() {
    this.log(`soundOutputListener: Called`);
    this._soundOutputListener((newSoundOutput) => {
      if (!this.checkOnOff(newSoundOutput)) {
        return;
      }

      const oldSoundOutput = this.getStoreValue(store.currentSoundOutput);
      this.log(`soundOutputListener: Sound output changed from ${oldSoundOutput} to ${newSoundOutput}`);

      if (oldSoundOutput !== newSoundOutput) {
        const oldOutput = this._flowStringToken('oldSoundOutput', oldSoundOutput, {allowAbsent: true});
        const newOutput = this._flowStringToken('newSoundOutput', newSoundOutput);

        // Preserve Max's existing rule that a falsy sound-output value is not
        // stored or emitted, while still diagnosing a malformed Flow boundary.
        if (!newSoundOutput) {
          return;
        }

        this.log(`soundOutputListener: Store ${store.currentSoundOutput} to ${newSoundOutput}`);
        this.setStoreValue(store.currentSoundOutput, newSoundOutput)
          .catch(error => this.error('state report: sound output store', error));

        if (oldOutput.valid && newOutput.valid) {
          const flowValues = {
            oldSoundOutput: oldOutput.value,
            newSoundOutput: newOutput.value
          };
          this.log(`soundOutputListener: Flow trigger sound output changed`);
          this._driver.triggerSoundOutputChanged(this, flowValues, {...flowValues});
        }
      }
    });
  }

  legacyDisplayWriter(id) {
    let reported;
    try {
      if (!this.hasCapability(id)) return undefined;
      reported = this.getCapabilityValue(id);
    } catch (error) {
      this.error('state report: legacy display setup', id, error);
      return undefined;
    }
    let pending = null;
    let writing = false;

    const drain = async () => {
      writing = true;
      try {
        while (pending !== null) {
          const value = pending;
          pending = null;
          if (this._channelStopped || value === reported) continue;
          try {
            await this.setCapabilityValue(id, value);
            reported = value;
          } catch (error) {
            this.error('state report: legacy display', id, error);
          }
        }
      } finally {
        writing = false;
      }
    };

    return value => {
      if (this._channelStopped) return;
      pending = value;
      if (!writing) void drain();
    };
  }

  /**
   * Listen for changes in channel
   */
  channelListener() {
    this.log(`channelListener: Called`);
    if (this._channelStopped) return;
    const client = this.lgtv;
    if (!this._channelReport) {
      this._lastChannelNumber = this.getStoreValue(store.currentChannel);
      this._channelReport = new ChannelReport({
        write: value => this.hasCapability(CHANNEL_CAPABILITY)
          ? this.setCapabilityValue(CHANNEL_CAPABILITY, value) : Promise.resolve(),
        error: error => this.error('state report: Channel', error),
        onChannel: channel => this.reportChannel(channel),
        initialValue: this.getCapabilityValue(CHANNEL_CAPABILITY),
        writeLegacy: this.legacyDisplayWriter('webos_display.channel'),
        setTimer: (callback, delay) => this.homey.setTimeout(callback, delay),
        clearTimer: timer => this.homey.clearTimeout(timer),
      });
    }
    if (this._channelReportClient) {
      this._channelReportClient.removeListener('close', this._channelClose);
    }
    this._channelReportClient = client;
    this._channelReport.bind(
      callback => this._channelListener(
        value => callback(null, value), error => callback(error), client),
      () => !this._channelStopped && this.lgtv === client,
    );
    this._channelClose = () => {
      if (this._channelReportClient === client) this._channelReport.stop();
    };
    client.on('close', this._channelClose);
  }

  // Only the new channel timer/subscription is disposed; Max's other resources
  // and reconnection behaviour are not changed by this repair.
  stopChannelReport() {
    if (this._channelReport) this._channelReport.stop();
    if (this._channelReportClient) {
      this._channelReportClient.removeListener('close', this._channelClose);
      this._channelReportClient = null;
    }
  }

  _connect() {
    this.stopChannelReport();
    return super._connect();
  }

  onUninit() {
    this._channelStopped = true;
    this.stopChannelReport();
  }

  onDeleted() {
    this._channelStopped = true;
    this.stopChannelReport();
  }

  reportChannel(newChannel) {
      if (!this.checkOnOff(newChannel)) {
        return;
      }
      const oldChannel = this._lastChannelNumber;
      this.log(`channelListener: Channel changed from ${oldChannel} to ${newChannel.channelName}`);

      if (`${newChannel.channelNumber}` !== `${oldChannel}`) {
        // A duplicate report can arrive before the asynchronous store write.
        this._lastChannelNumber = newChannel.channelNumber;
        this.log(`channelListener: Set Store ${store.currentChannel} to '${newChannel.channelNumber}'`);
        this.setStoreValue(store.currentChannel, `${newChannel.channelNumber}`)
          .catch(error => this.error('state report: channel store', error));

        const previousChannel = this._flowStringToken('oldChannel', oldChannel, {
          allowAbsent: true,
          allowFiniteNumber: true
        });
        const currentChannel = this._flowStringToken('newChannel', newChannel.channelNumber, {
          allowFiniteNumber: true
        });
        if (previousChannel.valid && currentChannel.valid) {
          const flowValues = {
            oldChannel: previousChannel.value,
            newChannel: currentChannel.value
          };
          this.log(`soundOutputListener: Flow trigger channel changed`);
          this._driver.triggerChannelChanged(this, flowValues, {...flowValues});
        }
      }
  }

  /**
   * Toggle power state on/off
   *
   * @param {boolean} value Represents on|off with true|false
   * @returns {Promise<void>}
   */
  async toggleOnOff(value) {
    this.log(`toggleOnOff: Called`, value);
    if (value) {
      this.log(`toggleOnOff: Try to turn the tv on`);
      const on = await this._turnOn().catch(this.error);
      if (on) {
        this.log(`toggleOnOff: TV turned on. Set capability ${capabilities.onOff} to ${value}`);
        this.setCapabilityValue(capabilities.onOff, true);
      }
    } else {
      this.log(`toggleOnOff: Try to turn the tv off`);
      const off = this._turnOff().catch(this.error);
      if (off) {
        this.log(`toggleOnOff: TV turned off. Set capability ${capabilities.onOff} to ${value}`);
        this.setCapabilityValue(capabilities.onOff, false);
      }
    }
  }

  /**
   * Set the volume to a specific value
   *
   * @param {number} value Represents the volume value
   * @returns {Promise<void>}
   */
  async volumeSet(value) {
    this.log(`volumeSet: Called`, value);
    const lgVolume = toLgVolume(value);
    this.log(`volumeSet: Try to set LG volume to ${lgVolume}`);

    const soundOutput = this.getStoreValue(store.currentSoundOutput);
    const currentLg = Math.round(Number(this.getCapabilityValue(capabilities.volumeSet)) * 100);
    const plan = planVolumeSteps(soundOutput, currentLg, lgVolume);
    if (plan) {
      this.log(`volumeSet: Sound output is '${soundOutput}', stepping ${plan.direction} ${plan.count} time(s)`);
      await this._volumeStepTo(currentLg, lgVolume);
      return;
    }

    // An acknowledgement is not a measured level, especially with external audio.
    // Let command failures reach Homey; volumeListener publishes actual reports.
    await this._volumeSet(lgVolume);
  }

  /**
   * Step the volume with up/down presses. A newer slider value changes the
   * target of a run that is already stepping instead of starting a second one.
   */
  async _volumeStepTo(start, target) {
    this._volumeStepTarget = target;
    if (this._volumeStepping) return;
    this._volumeStepping = true;
    try {
      let position = start;
      let steps = 0;
      while (!this._channelStopped && steps < MAX_STEPS) {
        const next = planVolumeSteps('external', position, this._volumeStepTarget);
        if (!next || next.count === 0) break;
        if (next.direction === 'up') {
          await this._volumeUp();
          position += 1;
        } else {
          await this._volumeDown();
          position -= 1;
        }
        steps += 1;
        await new Promise(resolve => this.homey.setTimeout(resolve, 80));
      }
    } finally {
      this._volumeStepping = false;
    }
  }

  /**
   * Toggle mute
   *
   * @param value
   * @returns {Promise<void>}
   */
  async volumeMute(value) {
    this.log(`volumeMute: Called`, value);
    this.log(`volumeMute: Try to set mute to ${value}`);
    const response = await this._volumeMute(value);
    if (response) {
      this.log(`volumeMute: Mute set. Set capability ${capabilities.volumeMute} to ${value}`);
      this.setCapabilityValue(capabilities.volumeMute, response.muted);
    }
  }

  /**
   * Increase volume by 1
   *
   * @returns {Promise<void>}
   */
  async volumeUp() {
    this.log(`volumeUp: Called`);
    // The step size/result depends on the audio output; wait for its numeric report.
    await this._volumeUp();
  };

  /**
   * Decrease volume by 1
   * @returns {Promise<void>}
   */
  async volumeDown() {
    this.log(`volumeDown: Called`);
    await this._volumeDown();
  }

  /**
   * Get all apps with filter option by name
   *
   * @param {string} query Search value
   * @returns {Promise<*[]>}
   */
  async filteredAppList(query = '') {
    const device = this;
    this.log(`filteredAppList: Called`, query);

    function _filter(list, query) {
      device.log(`filteredAppList: Filter list with query '${query}'`, list);
      let tmp = list.filter(app => app.name.toLowerCase().includes(query.toLowerCase()));
      device.log(`filteredAppList: Filter sort result by name`, tmp);
      return tmp.sort((a, b) => {
        return a.name.toLowerCase() > b.name.toLowerCase() ? 1 : b.name.toLowerCase() > a.name.toLowerCase() ? -1 : 0;
      });
    }

    this.log(`filteredAppList: try to get all apps/inputs`);
    const list = await this._appList().catch(this.error);
    if (!list) {
      this.error(`filteredAppList: No apps/inputs found! Return empty array`);
      return [];
    }
    return _filter(list, query);
  }

  /**
   * Get all external inputs with filter option by label
   *
   * @param {string} query Search value
   * @returns {Promise<*[]>}
   */
  async filteredExternalInputList(query = '') {
    const device = this;
    this.log(`filteredExternalInputList: Called`, query);

    function _filter(list, query) {
      device.log(`filteredExternalInputList: Filter list with query '${query}'`, list);
      let tmp = list.filter(input => input.name.toLowerCase().includes(query.toLowerCase()));
      device.log(`filteredExternalInputList: Filter sort result by label`, tmp);
      return tmp.sort((a, b) => {
        return a.name.toLowerCase() > b.name.toLowerCase() ? 1 : b.name.toLowerCase() > a.name.toLowerCase() ? -1 : 0;
      });
    }

    this.log(`filteredExternalInputList: try to get all external inputs`);
    const list = await this._externalInputList().catch(this.error);
    if (!list) {
      this.error(`filteredExternalInputList: No external inputs found! Return empty array`);
      return [];
    }
    return _filter(list, query);
  }

  /**
   * Get all channels with filter option by name or number
   *
   * @param {string} query Search value
   * @returns {Promise<*[]>}
   */
  async filteredChannelList(query = '') {
    this.log(`filteredChannelList: Called`, query);
    const device = this;

    function _filter(list, query) {
      device.log(`filteredChannelList: Filter list with query '${query}'`, list);
      let tmp = list.filter(channel => channel.search.toLowerCase().includes(query.toLowerCase()));
      device.log(`filteredChannelList: Filter sort result by number`, tmp);
      return tmp.sort((a, b) => {
        const numA = parseInt(a.number);
        const numB = parseInt(b.number);
        return numA > numB ? 1 : numB > numA ? -1 : 0;
      });
    }

    this.log(`filteredChannelList: try to get all channels`);
    const list = await this._channelList().catch(this.error);
    if (!list) {
      this.error(`filteredChannelList: No channels found! Return empty array`);
      return [];
    }
    return _filter(list, query);
  }

  /**
   * Format the speaker track
   *
   * @param {string|number} number The channel number
   * @param {string} name The channel name
   * @returns {string}
   * @private
   */
  _formatSpeakerTrack(number, name) {
    let track = number ? `${number}` : '';

    if (name) {
      track = track && track.length > 0 ? `${track} | ${name}` : `${name};`
    }
    return track;
  };
}

module.exports = WebosPlusDevice;
