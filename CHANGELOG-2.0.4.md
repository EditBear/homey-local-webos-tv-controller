# Homey Test 2.0.4 (Build 15)

Homey could mark an LG TV unavailable after the app restarted while the TV was in standby. That blocked the existing Turn on command before the app could send Wake-on-LAN. The app now handles SSDP discovery and device availability separately. Keep the existing Homey app and paired TV when updating so Homey can retain settings and saved Flows. [Homey Test](https://homey.app/en-gb/app/com.rompa.webos-plus-g4/test/)

Thanks to Sascha for the following contributions:

- The HDMI input picker uses the TV’s labels, follows source changes and offers HDMI 1–4 if labels are unavailable. [PR #7](https://github.com/EditBear/homey-local-webos-tv-controller/pull/7)
- The manual IP driver accepts a TV address and an optional Wake-on-LAN MAC address. Both drivers default to signed pairing and offer an opt-in unsigned fallback for the specific blacklisted-certificate response. [PR #3](https://github.com/EditBear/homey-local-webos-tv-controller/pull/3)
- Re-pairing requires an explicit request in device settings. Editing the IP or MAC keeps the saved pairing key. [PR #9](https://github.com/EditBear/homey-local-webos-tv-controller/pull/9)
- External volume stepping defaults to Off. When enabled for a selected output, it requires fresh volume readings from that output. On our LG G4 and Sonos Arc, the readings disagreed, so the setting was left Off and numeric volume is controlled on the Sonos device. [PR #5](https://github.com/EditBear/homey-local-webos-tv-controller/pull/5)

The LG G4 passed a wake test after restarting the app in standby. The owner repeated the test successfully after installing from the Homey Test link. Signed manual pairing and explicit re-pairing also passed on that TV. Cross-VLAN pairing, the unsigned fallback and stepped volume still depend on the TV and setup.

[Previous changes in 2.0.3](CHANGELOG-2.0.3.md)
