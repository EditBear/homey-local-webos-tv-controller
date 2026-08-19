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

const WebOSTV = require('./webos/WebOSTV');
const {capabilities, store} = require('./webos/utils/constants');
const {
  VOLUME_CAPABILITY_OPTIONS,
  homeyVolumeToLg,
  lgVolumeToHomey,
  normaliseStoredHomeyVolume,
  normaliseVolumeStatus,
  volumeCapabilityOptionsMatch,
} = require('./webos/utils/volume');
const {
  bindCurrentConnection,
  DisconnectOffGuard,
} = require('./webos/utils/connection');
const SubscriptionState = require('./webos/utils/subscription-state');
const {
  ChannelObservationState,
  channelNumber,
  verifyChannelSelection,
} = require('./webos/utils/channel-reliability');
const {
  buildLaunchableAppList,
  filterLaunchableApps,
} = require('./webos/utils/launch-apps');
const {validateDeviceSettings} = require('./webos/utils/settings');
const {
  LifecycleState,
  SerialTaskQueue,
} = require('./webos/utils/lifecycle');
const net = require('net');
const CHANNEL_RECONCILE_INTERVAL_MS = 30000;
const LEGACY_SPEAKER_ARTIST_CAPABILITY = 'speaker_artist';
const LEGACY_SPEAKER_TRACK_CAPABILITY = 'speaker_track';
const LEGACY_SPEAKER_ALBUM_CAPABILITY = 'speaker_album';
const LEGACY_SPEAKER_PLAYING_CAPABILITY = 'speaker_playing';
const LEGACY_SPEAKER_NEXT_CAPABILITY = 'speaker_next';
const LEGACY_SPEAKER_PREV_CAPABILITY = 'speaker_prev';

class WebosPlusDevice extends WebOSTV {
  async onInit() {
    // Init LGTV
    this.construct();
    this.lifecycle = new LifecycleState();
    this.reconnectQueue = new SerialTaskQueue();
    this.channelObservationQueue = new SerialTaskQueue();
    this.channelSubscription = new SubscriptionState(3);
    this.channelRetryTimeout = null;
    this.channelReconcileTimeout = null;
    this.channelReconcileRunning = false;
    this.channelObservation = new ChannelObservationState(this.getStoreValue(store.currentChannel));
    this.currentForegroundApp = null;
    this.mediaCommandPlaying = false;
    this.disconnectOffGuard = new DisconnectOffGuard();

    this._driver = this.homey.drivers.getDriver('webos_plus');

    await this._driver.initReady(async () => {
      this.log('onInit: Device Ready!');
      this.lifecycle.begin();
      await this.registerCapabilities();
      this._connect();
      await this.initDevice();
    });
  }

  onDiscoveryResult(discoveryResult) {
    this.setAvailable();
    discoveryResult.id = discoveryResult.id.replace(/uuid:/g, '');
    return discoveryResult.id === this.getData().id;
  }

  async onDiscoveryAvailable(discoveryResult) {
    await this.setAvailable();
    const ipAddress = this.getSettings().ipAddress;
    if (this.getSettings().manualIpAddress === true && ipAddress !== '0.0.0.0'){
      return true;
    }
    if (ipAddress !== discoveryResult.address) {
      await this.setSettings({ipAddress: discoveryResult.address});
      await this.reconnectDevice();
    }
    return true;
  }

  async onDiscoveryAddressChanged(discoveryResult) {
    await this.setAvailable();
    const ipAddress = this.getSettings().ipAddress;
    if (this.getSettings().manualIpAddress === true && ipAddress !== '0.0.0.0'){
      return true;
    }
    if (ipAddress !== discoveryResult.address) {
      await this.setSettings({ipAddress: discoveryResult.address});
      await this.reconnectDevice();
    }
    return true;
  }

  async onDiscoveryLastSeenChanged(discoveryResult) {
    await this.setAvailable();
    return true;
  }

  /**
   * Initialise the WebOS Tv
   * @returns {Promise<void>}
   */
  async initDevice() {
    const client = this.lgtv;
    const generation = this.lifecycle.generation;
    if (this.pollInterval) {
      clearInterval(this.pollInterval);
    }
    if (this.getSettings().usePoll) {
      this.poll();
    }
    bindCurrentConnection(client, {
      isCurrent: candidate => this.lifecycle.isCurrent(candidate, this.lgtv, generation),
      onConnect: () => {
        this.subsSet = false;
        this.resetChannelSubscription();
        if (!this.getSettings().usePoll) {
          this.powerStateListener(client, generation);
        }
        this.volumeListener(client, generation);
        this.appListener(client, generation);
        this.soundOutputListener(client, generation);
        this.channelListener(client, generation);
      },
      onClose: () => {
        this.subsSet = false;
        this.currentForegroundApp = null;
        this.resetChannelSubscription();
        this.clearChannelReconciliation();
        this.scheduleDisconnectOff(client, generation, 'connection close');
      },
      onError: (error) => {
        if (error.code === 'EHOSTUNREACH') {
          this.scheduleDisconnectOff(client, generation, 'host unreachable');
        }
      },
    });
  }

  clearPendingDisconnectOff() {
    if (this.disconnectOffGuard && this.disconnectOffGuard.cancel()) {
      this.log('Power state: cancelled pending disconnect-off');
    }
  }

  scheduleDisconnectOff(client, generation, reason) {
    if (this.getSettings().usePoll || !this.disconnectOffGuard) return;
    const scheduled = this.disconnectOffGuard.schedule(() => {
      if (!this.lifecycle.isCurrent(client, this.lgtv, generation)) return;
      if (this.getCapabilityValue(capabilities.onOff) === false) return;
      this.log(`Power state: disconnect-off grace expired (${reason})`);
      this.reportBackground(
        this.setCapabilityValue(capabilities.onOff, false),
        'Power state: Could not mark persistently disconnected TV off',
      );
    });
    if (scheduled) {
      this.log(`Power state: waiting before inferred off (${reason})`);
    }
  }

  /**
   * Replace the current LG client and attach a fresh set of guarded lifecycle
   * and subscription handlers.
   */
  async reconnectDevice() {
    return this.reconnectQueue.run(() => this._replaceConnection());
  }

  async _replaceConnection() {
    const generation = this.lifecycle.begin();
    if (generation === null) return false;
    this.clearPendingDisconnectOff();
    const previousClient = this.lgtv;
    this.lgtv = null;
    if (previousClient && typeof previousClient.disconnect === 'function') {
      previousClient.disconnect();
    }
    if (this.simulateButtonSockTimeout) {
      clearTimeout(this.simulateButtonSockTimeout);
      this.simulateButtonSockTimeout = null;
    }
    this.alertCloseTimeouts.clearAll();
    this.simulateButtonSock = null;
    this.subsSet = false;
    this.currentForegroundApp = null;
    this.resetChannelSubscription();
    this.clearChannelReconciliation();
    if (this.lifecycle.deleted) return false;
    this._connect();
    await this.initDevice();
    return true;
  }

  /**
   * Register all capabilities
   *
   * @returns {Promise<void>}
   */
  async registerCapabilities() {
    await this.migrateDisplayCapabilities();

    if (this.hasCapability(LEGACY_SPEAKER_PLAYING_CAPABILITY)) {
      this.mediaCommandPlaying = this.getCapabilityValue(LEGACY_SPEAKER_PLAYING_CAPABILITY) === true;
      await this.removeCapability(LEGACY_SPEAKER_PLAYING_CAPABILITY);
    }

    if (this.hasCapability(LEGACY_SPEAKER_NEXT_CAPABILITY)) {
      await this.removeCapability(LEGACY_SPEAKER_NEXT_CAPABILITY);
    }

    if (this.hasCapability(LEGACY_SPEAKER_PREV_CAPABILITY)) {
      await this.removeCapability(LEGACY_SPEAKER_PREV_CAPABILITY);
    }

    const volumeOptions = this.getCapabilityOptions(capabilities.volumeSet);
    if (!volumeCapabilityOptionsMatch(volumeOptions)) {
      this.log('registerCapabilities: Correct volume_set capability options');
      await this.setCapabilityOptions(capabilities.volumeSet, VOLUME_CAPABILITY_OPTIONS);
    }
    const storedVolume = this.getCapabilityValue(capabilities.volumeSet);
    const normalisedStoredVolume = normaliseStoredHomeyVolume(storedVolume);
    if (storedVolume !== normalisedStoredVolume) {
      this.log(`registerCapabilities: Migrate volume_set from ${storedVolume} to ${normalisedStoredVolume}`);
      await this.setCapabilityValue(capabilities.volumeSet, normalisedStoredVolume);
    }

    this.registerCapabilityListener(capabilities.onOff, this.toggleOnOff.bind(this));
    this.registerCapabilityListener(capabilities.volumeSet, this.volumeSet.bind(this));
    this.registerCapabilityListener(capabilities.volumeMute, this.volumeMute.bind(this));
    this.registerCapabilityListener(capabilities.volumeUp, this.volumeUp.bind(this));
    this.registerCapabilityListener(capabilities.volumeDown, this.volumeDown.bind(this));
    this.registerCapabilityListener(capabilities.channelUp, this._channelUp.bind(this));
    this.registerCapabilityListener(capabilities.channelDown, this._channelDown.bind(this));
  }

  /**
   * Replace inherited speaker-metadata capabilities that were used to display
   * an LG app/input and channel. Add and seed both accurate display values
   * before removing any legacy capability so a failed migration is non-lossy.
   *
   * @returns {Promise<void>}
   */
  async migrateDisplayCapabilities() {
    const migrations = [
      {
        legacy: LEGACY_SPEAKER_ARTIST_CAPABILITY,
        replacement: capabilities.displayApp,
      },
      {
        legacy: LEGACY_SPEAKER_TRACK_CAPABILITY,
        replacement: capabilities.displayChannel,
      },
    ];
    const legacyValues = new Map();

    for (const migration of migrations) {
      if (this.hasCapability(migration.legacy)) {
        legacyValues.set(migration.legacy, this.getCapabilityValue(migration.legacy));
      }
    }

    for (const migration of migrations) {
      if (!this.hasCapability(migration.replacement)) {
        this.log(`Display capability migration: add ${migration.replacement}`);
        await this.addCapability(migration.replacement);
      }
    }

    for (const migration of migrations) {
      const legacyValue = legacyValues.get(migration.legacy);
      const currentValue = this.getCapabilityValue(migration.replacement);
      if (typeof legacyValue === 'string'
        && legacyValue.trim() !== ''
        && (typeof currentValue !== 'string' || currentValue.trim() === '')) {
        this.log(`Display capability migration: copy ${migration.legacy} to ${migration.replacement}`);
        await this.setCapabilityValue(migration.replacement, legacyValue);
      }
    }

    for (const legacyCapability of [
      LEGACY_SPEAKER_ARTIST_CAPABILITY,
      LEGACY_SPEAKER_TRACK_CAPABILITY,
      LEGACY_SPEAKER_ALBUM_CAPABILITY,
    ]) {
      if (this.hasCapability(legacyCapability)) {
        this.log(`Display capability migration: remove ${legacyCapability}`);
        await this.removeCapability(legacyCapability);
      }
    }
  }

  /**
   * Listen for changes in on/off state
   */
  powerStateListener(client = this.lgtv, generation = this.lifecycle.generation) {
    this.log(`powerStateListener: Called`);
    this._powerStateListener(() => {
      if (!this.lifecycle.isCurrent(client, this.lgtv, generation)) return;
      this.clearPendingDisconnectOff();
      this.log(`powerStateListener: received on`);
      this.reportBackground(
        this.setCapabilityValue(capabilities.onOff, true),
        'powerStateListener: Could not mark TV on',
      );
    }, () => {
      if (!this.lifecycle.isCurrent(client, this.lgtv, generation)) return;
      this.clearPendingDisconnectOff();
      this.log(`powerStateListener: received off`);
      this.reportBackground(
        this.setCapabilityValue(capabilities.onOff, false),
        'powerStateListener: Could not mark TV off',
      );
    });
  }

  async onSettings({oldSettings, newSettings, changedKeys}) {
    validateDeviceSettings(newSettings);
    const reconnectKeys = ['usePoll', 'manualIpAddress', 'ipAddress'];
    if (changedKeys.some(key => reconnectKeys.includes(key))){
      await this.reconnectDevice();
    } else if (newSettings.usePoll
      && changedKeys.some(key => key === 'pollInterval' || key === 'pollTimeout')) {
      this.poll();
    }
    return true;
  }

  poll() {
    if (this.pollInterval) {
      clearInterval(this.pollInterval);
    }

    this.pollInterval = setInterval(() => {
      const generation = this.lifecycle.generation;
      if (!this.lifecycle.isGeneration(generation)) return;
      const client = new net.Socket();
      const cancel = setTimeout(() => {
        if (!this.lifecycle.isGeneration(generation)) {
          client.destroy();
          return;
        }
        if (this.getCapabilityValue(capabilities.onOff)){
          this.reportBackground(
            this.setCapabilityValue(capabilities.onOff, false),
            'poll: Could not mark timed-out TV off',
          );
        }
        client.destroy();
      }, this.getSettings().pollTimeout * 1000);

      client.on('error', (error) => {
        if (!this.lifecycle.isGeneration(generation)) {
          clearTimeout(cancel);
          client.destroy();
          return;
        }
        if (this.getCapabilityValue(capabilities.onOff)){
          this.reportBackground(
            this.setCapabilityValue(capabilities.onOff, false),
            'poll: Could not mark unreachable TV off',
          );
        }
        this.error(error);
        clearTimeout(cancel);
        client.destroy();
      });

      client.connect(3000, this.getSettings().ipAddress, () => {
        if (!this.lifecycle.isGeneration(generation)) {
          clearTimeout(cancel);
          client.destroy();
          return;
        }
        if (!this.getCapabilityValue(capabilities.onOff)) {
          this.reportBackground(
            this.setCapabilityValue(capabilities.onOff, true),
            'poll: Could not mark reachable TV on',
          );
          if (!this.subsSet) {
            this.reconnectDevice().catch(error => this.error(error));
          }
        }
        clearTimeout(cancel);
        client.destroy();
      });
    }, this.getSettings().pollInterval * 1000);
  }

  async onDeleted() {
    this.clearPendingDisconnectOff();
    this.lifecycle.stop();
    if (this.pollInterval) {
      clearInterval(this.pollInterval);
      this.pollInterval = null;
    }
    if (this.simulateButtonSockTimeout) {
      clearTimeout(this.simulateButtonSockTimeout);
      this.simulateButtonSockTimeout = null;
    }
    this.alertCloseTimeouts.clearAll();
    this.resetChannelSubscription();
    this.clearChannelReconciliation();
    if (this.simulateButtonSock && typeof this.simulateButtonSock.close === 'function') {
      this.simulateButtonSock.close();
      this.simulateButtonSock = null;
    }
    const currentClient = this.lgtv;
    this.lgtv = null;
    if (currentClient && typeof currentClient.disconnect === 'function') {
      currentClient.disconnect();
    }
  }

  checkOnOff(value) {
    if (value === null || value === undefined || value === '') {
      this.reportBackground(
        this.setCapabilityValue(capabilities.onOff, false),
        'checkOnOff: Could not mark TV off',
      );
      return false;
    } else {
      this.reportBackground(
        this.setCapabilityValue(capabilities.onOff, true),
        'checkOnOff: Could not mark TV on',
      );
      return true;
    }
  }

  reportBackground(promise, context) {
    Promise.resolve(promise).catch(error => this.error(context, error));
  }

  /**
   * Listen for changes in volume
   */
  volumeListener(client = this.lgtv, generation = this.lifecycle.generation) {
    this.log(`volumeListener: Called`);
    this._volumeListener((newVolume) => {
      if (!this.lifecycle.isCurrent(client, this.lgtv, generation)) return;
      if (!this.checkOnOff(newVolume)) {
        return;
      }
      let normalisedVolume;
      try {
        normalisedVolume = normaliseVolumeStatus({volume: newVolume}).volume;
      } catch (error) {
        this.error(`volumeListener: Invalid LG volume '${newVolume}'`, error);
        return;
      }
      const currentVolume = this.getCapabilityValue(capabilities.volumeSet);
      this.log(`volumeListener: Volume changed from ${currentVolume} to ${normalisedVolume}`);
      if (currentVolume !== normalisedVolume) {
        this.log(`volumeListener: Capability ${capabilities.volumeSet} to ${normalisedVolume}`);
        this.setCapabilityValue(capabilities.volumeSet, normalisedVolume)
          .catch(error => this.error(error));
      }
    }, (newMutedValue) => {
      if (!this.lifecycle.isCurrent(client, this.lgtv, generation)) return;
      if (!this.checkOnOff(newMutedValue)) {
        return;
      }
      let normalisedMutedValue;
      try {
        normalisedMutedValue = normaliseVolumeStatus({muted: newMutedValue}).muted;
      } catch (error) {
        this.error(`volumeListener: Invalid LG muted state '${newMutedValue}'`, error);
        return;
      }
      const currentMute = this.getCapabilityValue(capabilities.volumeMute);
      this.log(`volumeListener: Mute changed from ${currentMute} to ${normalisedMutedValue}`);
      if (currentMute !== normalisedMutedValue) {
        this.log(`volumeListener: Capability ${capabilities.volumeMute} to ${normalisedMutedValue}`);
        this.setCapabilityValue(capabilities.volumeMute, normalisedMutedValue)
          .catch(error => this.error(error));
        this.reportBackground(
          this._driver.triggerVolumeMuteChanged(this, {}, {muted: normalisedMutedValue}),
          'volumeListener: Could not trigger mute Flow',
        );
      }
    });
  }

  async refreshVolumeStatus() {
    const status = normaliseVolumeStatus(await this._volumeCurrent());
    if (status.volume !== undefined
      && this.getCapabilityValue(capabilities.volumeSet) !== status.volume) {
      await this.setCapabilityValue(capabilities.volumeSet, status.volume);
    }
    if (status.muted !== undefined
      && this.getCapabilityValue(capabilities.volumeMute) !== status.muted) {
      await this.setCapabilityValue(capabilities.volumeMute, status.muted);
    }
    return status;
  }

  async mediaPlay() {
    const result = await this._mediaTogglePlayPause(true);
    this.mediaCommandPlaying = true;
    return result;
  }

  async mediaPause() {
    const result = await this._mediaTogglePlayPause(false);
    this.mediaCommandPlaying = false;
    return result;
  }

  async mediaTogglePlayPause() {
    return this.mediaCommandPlaying ? this.mediaPause() : this.mediaPlay();
  }

  /**
   * Listen for changes in app/input
   */
  appListener(client = this.lgtv, generation = this.lifecycle.generation) {
    this.log(`appListener: Called`);
    this._appListener(async (newAppId) => {
      if (!this.lifecycle.isCurrent(client, this.lgtv, generation)) return;
      const oldAppId = this.getStoreValue(store.currentApp);
      const oldAppToken = typeof oldAppId === 'string' ? oldAppId : '';
      const newAppToken = typeof newAppId === 'string' ? newAppId : '';
      this.log(`appListener: App/input changed from ${oldAppId} to ${newAppId}`);
      if (!this.checkOnOff(newAppId)) {
        return;
      }
      this.currentForegroundApp = newAppId;

      if (newAppId !== oldAppId) {
        this.log(`appListener: Store ${store.currentApp} set to ${newAppId}`);
        this.reportBackground(
          this.setStoreValue(store.currentApp, newAppId),
          'appListener: Could not store current app',
        );

        this.log(`appListener: Flow trigger app/input changed`);
        this.reportBackground(this._driver.triggerAppChanged(this, {
          oldApp: oldAppToken,
          newApp: newAppToken
        }, {
          oldApp: oldAppToken,
          newApp: newAppToken
        }), 'appListener: Could not trigger app-change Flow');
      }

      this.log(`appListener: Gather media screen information for ${newAppId}`);
      // listApps includes system applications such as Live TV that LG omits
      // from listLaunchPoints on current webOS televisions.
      const allApps = await this._appList().catch(error => {
        this.error(error);
        return null;
      });
      if (!this.lifecycle.isCurrent(client, this.lgtv, generation)) return;
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
      this.reportBackground(
        this.setCapabilityValue(capabilities.displayApp, app.name),
        'appListener: Could not update application name',
      );

      if (newAppId !== 'com.webos.app.livetv') {
        this.clearChannelRetry();
        this.clearChannelReconciliation();
        this.log(`appListener: '${newAppId}' is not Live TV. Set capability ${capabilities.displayChannel} to empty string`);
        this.reportBackground(
          this.setCapabilityValue(capabilities.displayChannel, ''),
          'appListener: Could not clear channel information',
        );
      } else {
        // LG reports the Live TV foreground app before its broadcast service is
        // ready. Wait briefly and retry so a normal source transition is not
        // misreported as a channel-service failure.
        let channel = null;
        for (let attempt = 1; attempt <= 3 && !channel; attempt += 1) {
          await new Promise(resolve => setTimeout(resolve, attempt === 1 ? 750 : 500));
          if (!this.lifecycle.isCurrent(client, this.lgtv, generation)) return;
          if (this.getStoreValue(store.currentApp) !== newAppId) {
            this.log(`appListener: Source changed while waiting for Live TV channel information`);
            break;
          }
          this.log(`appListener: Get Live TV channel information (attempt ${attempt})`);
          channel = await this._channelCurrent().catch(() => null);
          if (!this.lifecycle.isCurrent(client, this.lgtv, generation)) return;
        }

        if (!channel) {
          this.log(`appListener: Live TV channel information is not ready. Keep the existing channel display`);
        } else {
          this.log(`appListener: Channel found for '${newAppId}' ${app.name}. Set capability ${capabilities.displayChannel} to '${this._formatChannelDisplay(channel.channelNumber, channel.channelName)}'`);
          this.reportBackground(
            this.setCapabilityValue(capabilities.displayChannel, this._formatChannelDisplay(channel.channelNumber, channel.channelName)),
            'appListener: Could not update channel information',
          );
        }
        if (newAppId !== oldAppId) {
          this.channelSubscription.resetFailures();
        }
        this.channelListener(client, generation);
        this.scheduleChannelReconciliation(client, generation);
      }

    });
  }

  /**
   * Listen for changes in sound output
   */
  soundOutputListener(client = this.lgtv, generation = this.lifecycle.generation) {
    this.log(`soundOutputListener: Called`);
    this._soundOutputListener((newSoundOutput) => {
      if (!this.lifecycle.isCurrent(client, this.lgtv, generation)) return;
      if (!this.checkOnOff(newSoundOutput)) {
        return;
      }

      const oldSoundOutput = this.getStoreValue(store.currentSoundOutput);
      const oldSoundOutputToken = typeof oldSoundOutput === 'string' ? oldSoundOutput : '';
      const newSoundOutputToken = typeof newSoundOutput === 'string' ? newSoundOutput : '';
      this.log(`soundOutputListener: Sound output changed from ${oldSoundOutput} to ${newSoundOutput}`);

      if (newSoundOutput && oldSoundOutput !== newSoundOutput) {
        this.log(`soundOutputListener: Store ${store.currentSoundOutput} to ${newSoundOutput}`);
        this.reportBackground(
          this.setStoreValue(store.currentSoundOutput, newSoundOutput),
          'soundOutputListener: Could not store current sound output',
        );

        this.log(`soundOutputListener: Flow trigger sound output changed`);
        this.reportBackground(this._driver.triggerSoundOutputChanged(this, {
          oldSoundOutput: oldSoundOutputToken,
          newSoundOutput: newSoundOutputToken
        }, {
          oldSoundOutput: oldSoundOutputToken,
          newSoundOutput: newSoundOutputToken
        }), 'soundOutputListener: Could not trigger sound-output Flow');
      }
    });
  }

  /**
   * Listen for changes in channel
   */
  channelListener(client = this.lgtv, lifecycleGeneration = this.lifecycle.generation) {
    if (!this.lifecycle.isCurrent(client, this.lgtv, lifecycleGeneration)) return;
    const generation = this.channelSubscription.begin();
    if (generation === null) {
      this.log(`channelListener: Subscription is ${this.channelSubscription.status}; do not create a duplicate`);
      return;
    }
    this.log(`channelListener: Start attempt ${this.channelSubscription.attempts}`);
    this._channelListener((newChannel) => {
      if (!this.lifecycle.isCurrent(client, this.lgtv, lifecycleGeneration)) return;
      if (!this.channelSubscription.succeed(generation)) {
        this.log(`channelListener: Ignore stale channel subscription callback`);
        return;
      }
      this.clearChannelRetry();
      if (!this.checkOnOff(newChannel)) {
        return;
      }
      this.reportBackground(
        this.applyChannelObservation(newChannel, 'channelListener'),
        'channelListener: Could not apply channel information',
      );
      this.scheduleChannelReconciliation(client, lifecycleGeneration);
    }, (error) => {
      if (!this.lifecycle.isCurrent(client, this.lgtv, lifecycleGeneration)) return;
      if (!this.channelSubscription.fail(generation)) {
        return;
      }
      this.error(`channelListener: Subscription attempt failed`, error);
      this.scheduleChannelRetry(client, lifecycleGeneration);
    });
  }

  clearChannelRetry() {
    if (this.channelRetryTimeout) {
      clearTimeout(this.channelRetryTimeout);
      this.channelRetryTimeout = null;
    }
  }

  resetChannelSubscription() {
    this.clearChannelRetry();
    if (this.channelSubscription) {
      this.channelSubscription.reset();
    }
  }

  clearChannelReconciliation() {
    if (this.channelReconcileTimeout) {
      clearTimeout(this.channelReconcileTimeout);
      this.channelReconcileTimeout = null;
    }
  }

  scheduleChannelReconciliation(client = this.lgtv, generation = this.lifecycle.generation) {
    this.clearChannelReconciliation();
    if (this.currentForegroundApp !== 'com.webos.app.livetv'
      || !this.lifecycle.isCurrent(client, this.lgtv, generation)) {
      return;
    }
    this.channelReconcileTimeout = setTimeout(() => {
      this.channelReconcileTimeout = null;
      this.runChannelReconciliation(client, generation)
        .catch(error => this.error('channelReconciliation: Unexpected failure', error));
    }, CHANNEL_RECONCILE_INTERVAL_MS);
  }

  async runChannelReconciliation(client = this.lgtv, generation = this.lifecycle.generation) {
    if (this.channelReconcileRunning
      || this.currentForegroundApp !== 'com.webos.app.livetv'
      || !this.lifecycle.isCurrent(client, this.lgtv, generation)) {
      return;
    }
    this.channelReconcileRunning = true;
    try {
      const channel = await this._channelCurrent();
      if (!this.lifecycle.isCurrent(client, this.lgtv, generation)
        || this.currentForegroundApp !== 'com.webos.app.livetv') {
        return;
      }
      await this.applyChannelObservation(channel, 'channelReconciliation');
    } catch (error) {
      this.error('channelReconciliation: Could not reconcile Live TV channel', error);
    } finally {
      this.channelReconcileRunning = false;
      if (this.currentForegroundApp === 'com.webos.app.livetv'
        && this.lifecycle.isCurrent(client, this.lgtv, generation)) {
        this.scheduleChannelReconciliation(client, generation);
      }
    }
  }

  async applyChannelObservation(newChannel, caller = 'channelObservation') {
    return this.channelObservationQueue.run(
      () => this._applyChannelObservation(newChannel, caller),
    );
  }

  async _applyChannelObservation(newChannel, caller = 'channelObservation') {
    if (!newChannel || newChannel.channelNumber === null || newChannel.channelNumber === undefined) {
      throw new Error(`${caller}: LG returned no channel number`);
    }
    const nextChannel = channelNumber(newChannel.channelNumber);
    const previousChannel = this.channelObservation.current;
    const channelDisplay = this._formatChannelDisplay(newChannel.channelNumber, newChannel.channelName);
    this.log(`${caller}: Channel changed from ${previousChannel} to ${newChannel.channelName}`);
    this.log(`${caller}: Set capability ${capabilities.displayChannel} to '${channelDisplay}'`);
    await this.setCapabilityValue(capabilities.displayChannel, channelDisplay);

    if (nextChannel === previousChannel) {
      return false;
    }

    this.log(`${caller}: Set Store ${store.currentChannel} to '${nextChannel}'`);
    await this.setStoreValue(store.currentChannel, nextChannel);
    const observation = this.channelObservation.observe(nextChannel);
    this.log(`${caller}: Flow trigger channel changed`);
    await this._driver.triggerChannelChanged(this, {
      oldChannel: observation.previous,
      newChannel: observation.current,
    }, {
      oldChannel: observation.previous,
      newChannel: observation.current,
    });
    return true;
  }

  async changeChannelVerified(requestedChannel) {
    const client = this.lgtv;
    const generation = this.lifecycle.generation;
    const channel = await verifyChannelSelection({
      requestedChannel,
      setChannel: channelNumber => this._channelSet(channelNumber),
      getCurrentChannel: () => this._channelCurrent(),
      isCurrent: () => this.lifecycle.isCurrent(client, this.lgtv, generation),
    });
    if (!this.lifecycle.isCurrent(client, this.lgtv, generation)) {
      throw new Error('Channel verification was cancelled because the television connection changed');
    }
    await this.applyChannelObservation(channel, 'changeChannelVerified');
    this.scheduleChannelReconciliation(client, generation);
    return channel;
  }

  scheduleChannelRetry(client = this.lgtv, generation = this.lifecycle.generation) {
    this.clearChannelRetry();
    if (this.currentForegroundApp !== 'com.webos.app.livetv' || !this.channelSubscription.canRetry()) {
      return;
    }
    const delay = this.channelSubscription.attempts * 1000;
    this.log(`channelListener: Retry failed Live TV subscription in ${delay} ms`);
    this.channelRetryTimeout = setTimeout(() => {
      this.channelRetryTimeout = null;
      if (this.currentForegroundApp === 'com.webos.app.livetv'
        && this.lifecycle.isCurrent(client, this.lgtv, generation)) {
        this.channelListener(client, generation);
      }
    }, delay);
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
      await this._turnOn();
      this.log(`toggleOnOff: TV turn-on command succeeded. Set capability ${capabilities.onOff} to ${value}`);
      await this.setCapabilityValue(capabilities.onOff, true);
    } else {
      this.log(`toggleOnOff: Try to turn the tv off`);
      await this._turnOff();
      this.log(`toggleOnOff: TV turn-off command succeeded. Set capability ${capabilities.onOff} to ${value}`);
      await this.setCapabilityValue(capabilities.onOff, false);
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
    const lgVolume = homeyVolumeToLg(value);
    this.log(`volumeSet: Try to set the LG volume to ${lgVolume}`);
    const newVolume = await this._volumeSet(lgVolume);
    if (newVolume) {
      this.log(`volumeSet: Volume set. Set capability ${capabilities.volumeSet} to ${value}`);
      await this.setCapabilityValue(capabilities.volumeSet, lgVolumeToHomey(newVolume.volume));
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
      await this.setCapabilityValue(capabilities.volumeMute, response.muted);
    }
  }

  /**
   * Increase volume by 1
   *
   * @returns {Promise<void>}
   */
  async volumeUp() {
    this.log(`volumeUp: Called`);
    const volume = this.getCapabilityValue(capabilities.volumeSet);
    this.log(`volumeUp: Current volume ${volume}. Try to increase the volume`);
    const response = await this._volumeUp();
    if (response) {
      const nextVolume = Math.min((volume || 0) + 0.01, 1);
      this.log(`volumeUp: Volume increased. Set capability ${capabilities.volumeSet} to ${nextVolume}`);
      await this.setCapabilityValue(capabilities.volumeSet, nextVolume);
    }
  };

  /**
   * Decrease volume by 1
   * @returns {Promise<void>}
   */
  async volumeDown() {
    this.log(`volumeDown: Called`);
    const volume = this.getCapabilityValue(capabilities.volumeSet);
    this.log(`volumeDown: Current volume ${volume}. Try to decrease the volume`);
    const response = await this._volumeDown();
    if (response) {
      const nextVolume = Math.max((volume || 0) - 0.01, 0);
      this.log(`volumeDown: Volume decreased. Set capability ${capabilities.volumeSet} to ${nextVolume}`);
      await this.setCapabilityValue(capabilities.volumeSet, nextVolume);
    }
  }

  /**
   * Get all apps with filter option by name
   *
   * @param {string} query Search value
   * @returns {Promise<*[]>}
   */
  async filteredAppList(query = '') {
    this.log(`filteredAppList: Called`, query);
    this.log(`filteredAppList: Retrieve user launch points and required television apps`);
    const [launchPoints, allApps] = await Promise.all([
      this._appListLaunchPoints(),
      this._appList(),
    ]);
    const choices = buildLaunchableAppList(launchPoints, allApps);
    const filtered = filterLaunchableApps(choices, query);
    this.log(`filteredAppList: Filtered user-facing result`, filtered);
    return filtered;
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
    const list = await this._externalInputList();
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
    const list = await this._channelList();
    return _filter(list, query);
  }

  /**
   * Format the channel display
   *
   * @param {string|number} number The channel number
   * @param {string} name The channel name
   * @returns {string}
   * @private
   */
  _formatChannelDisplay(number, name) {
    let channelDisplay = number ? `${number}` : '';

    if (name) {
      channelDisplay = channelDisplay && channelDisplay.length > 0
        ? `${channelDisplay} | ${name}`
        : `${name};`
    }
    return channelDisplay;
  };
}

module.exports = WebosPlusDevice;
