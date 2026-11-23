# Local webOS TV Controller 2.0.5 Build 16

Released to Homey Test on 17 November 2026.

On 23 November 2026, the unchanged 2.0.5 Build 16 was submitted to Athom for certification with automatic publication after approval; until approved, 2.0.5 remains available on Test and the regular Store release remains 1.0.43.

This changelog covers the changes since Homey Store version 1.0.43 and links to earlier history and Max van de Laar’s original WebOS Plus. [Homey Test](https://homey.app/en-gb/app/com.rompa.webos-plus-g4/test/) · [1.0.43 source](https://github.com/EditBear/homey-local-webos-tv-controller/tree/v1.0.43) · [Original and 1.x history](CHANGELOG-2.0.0.md)

## 2.0.5 Build 16

- **Confirmed-ON notifications.** A successful, steady LG Active report triggers **The TV was confirmed on** once on the current connection. Screen saver, screen-off, transient and failed reports do not re-arm it. A steady report of standby or power off re-arms it on the same connection. A fresh registered connection can emit one initial confirmation so a wake that requires reconnecting still reaches a Flow. The card keeps its existing `confirmedAt` token, the receipt time of the LG report in milliseconds since the Unix epoch. The ordinary ON/OFF triggers keep their prior behaviour.
- **Verification.** On the public Test build, an LG G4 running webOS 25 delivered one confirmed-ON after a Homey wake from standby. There were zero repeats in the following 12 minutes, including a native screen-saver cycle. The existing TV pairing and saved Flows were preserved. The exact Store package passed 115 offline checks and Homey publish validation. Later tester feedback is recorded below. [Confirmed-ON report and Test announcement](https://community.homey.app/t/lg-webos-better-integration/15007/569)

Apart from version and release text, the confirmed-ON listener is the only runtime change from **2.0.4 Build 15**.

## Field feedback and remaining limits

These are tester reports reviewed before the Live release decision; they do not extend the independently recorded G4 test to every model or firmware.

- **Daniel, two TVs.** He explicitly reported one wake notification and no repeats on each TV with 2.0.5. His later report says HDMI switching worked after approximately 15 hours in standby on his G4. That later post does not restate the version, so continuity with his 2.0.5 report is inferred. A full 24-hour check, longer standby on the second TV, firmware and wake method remain unconfirmed. His request for a simple popup was resolved using the existing toast card with its second parameter blank. [Two-TV result](https://community.homey.app/t/lg-webos-better-integration/15007/575) · [Longer-standby G4 result](https://community.homey.app/t/lg-webos-better-integration/15007/578) · [Toast clarification](https://community.homey.app/t/lg-webos-better-integration/15007/576)
- **Trond, LG B9.** In response to the request to upgrade in place from 1.0.43 Live to 2.0.5 Test, he reported that pairing was retained and existing Flows and status updates seemed fine. He qualified testing as limited; his reply does not repeat the versions or identify the firmware. [B9 upgrade feedback](https://community.homey.app/t/lg-webos-better-integration/15007/573)
- **Linden85, LG OLED65C9.** The owner of the 2019 TV previously identified as webOS 4.5 reported success after updating. The reply does not identify the app version, discovery or manual pairing route, or saved Flow operation. [C9 update feedback](https://community.homey.app/t/lg-webos-better-integration/15007/574)
- **Sascha, LG C2.** He confirmed manual IP pairing and the unsigned fallback, HDMI ARC volume stepping, the Input picker and re-pairing. His original reports identify a C2 65-inch with webOS 25, firmware 43.21.94; the follow-ups say new or latest Test release without an exact version. Signed pairing remains the default. The opt-in unsigned fallback applies only to the specific blacklisted-certificate response, may provide reduced permissions and has not been verified across webOS 26 TVs. Cross-VLAN Wake-on-LAN remains unconfirmed. [Pairing feedback](https://github.com/EditBear/homey-local-webos-tv-controller/issues/2#issuecomment-6944479222) · [ARC feedback](https://github.com/EditBear/homey-local-webos-tv-controller/issues/4#issuecomment-6944497122) · [Picker feedback](https://github.com/EditBear/homey-local-webos-tv-controller/issues/6#issuecomment-6944455599) · [Re-pair feedback](https://github.com/EditBear/homey-local-webos-tv-controller/issues/8#issuecomment-6944469100)
- **Earlier reports remain open to follow-up.** An unavailable-badge report on 2.0.1 has no confirmed result on 2.0.5. GitHub issue #1 reports occasional missed ON on 1.0.43 with a 2016 OLED65E6V running webOS 3.0; its proposed cause is a hypothesis without matching app logs, and no 2.0.5 retest is recorded. Neither is a verified 2.0.5 fault or a claimed fix. [Older missed-ON report](https://github.com/EditBear/homey-local-webos-tv-controller/issues/1)

## 2.0.4 Build 15

- **Wake after an app restart in standby.** Standalone SSDP discovery now lets the app manage the saved TV’s availability independently. Homey can send **Turn on** after the app restarts with the TV in standby. Device startup itself leaves a sleeping TV in standby. Wake-on-LAN still depends on a valid MAC address and a network path that carries the wake packet.
- **Manual IP pairing.** A separate driver adds a TV that Homey can reach by IP when automatic discovery cannot see it. The MAC address is optional for pairing and required for Wake-on-LAN. Signed pairing is the default on both drivers. An opt-in unsigned fallback is limited to the specific blacklisted-certificate response. [Sascha’s PR #3](https://github.com/EditBear/homey-local-webos-tv-controller/pull/3)
- **Re-pair in place.** The device settings offer an explicit re-pair request. Ordinary IP and MAC edits retain the stored key. [Sascha’s PR #9](https://github.com/EditBear/homey-local-webos-tv-controller/pull/9)
- **External volume slider.** Opt-in relative stepping supports the selected HDMI ARC, optical or Bluetooth soundbar output. It defaults to Off and requires a fresh volume reading for the selected output. Sascha confirmed the HDMI ARC option on his setup. For setups where the TV reports a different level from the sound system, use the sound system’s own volume control. [Sascha’s PR #5](https://github.com/EditBear/homey-local-webos-tv-controller/pull/5) · [ARC feedback](https://github.com/EditBear/homey-local-webos-tv-controller/issues/4#issuecomment-6944497122)

The LG G4 passed the restart-in-standby wake check. Daniel reported that both of his TVs passed the same wake check on 2.0.4. [Daniel’s results](https://community.homey.app/t/lg-webos-better-integration/15007/568) · [Detailed 2.0.4 changelog](CHANGELOG-2.0.4.md)

## 2.0.3 Build 14

- **Input picker.** The TV device gained an external input picker. It uses LG’s labels, follows input changes from the remote, and offers HDMI 1–4 when the TV’s input list is unavailable. Saved Flow bindings and raw source IDs remain compatible. [Sascha’s PR #7](https://github.com/EditBear/homey-local-webos-tv-controller/pull/7) · [Detailed 2.0.3 changelog](CHANGELOG-2.0.3.md)

## 2.0.2 Build 13

- **Discovery and image errors.** Failed HTTP requests for a TV’s discovery metadata fall back to its IP address as the display name. Failed toast-icon downloads and failed or truncated Gallery-image reads report an error to the Flow before sending the notification. These network and stream failures are contained in the app.
- The experimental Live TV channel retry remained outside the released build. [Detailed 2.0.2 changelog](CHANGELOG-2.0.2.md)

## 2.0.1 Build 12

- **Confirmed wake for Flows.** Added **The TV was confirmed on** and the raw LG Active receipt timestamp. A TV becoming reachable or Homey accepting Turn on is a separate event from LG confirming Active.
- **Power reports.** Temporary foreground changes around shutdown no longer create false ON/OFF history and Flow triggers. An incomplete or contradictory LG power reply cannot confirm ON.
- **Reconnect after discovery.** Rediscovery of the same TV can bring forward one pending reconnect at its saved address. The guard rejects a discovery result for a different TV. [Detailed 2.0.1 changelog](CHANGELOG-2.0.1.md)

## 2.0.0 Build 11

- **Connection and pairing.** Reworked local transport around pinned `lgtv2` 2.1.0 and `ws` 8.22.2. Reuses per-device saved pairing keys, manages connection and power reporting separately, and validates replies before processing them.
- **Source and Channel.** Named inputs retain HDMI fallbacks and raw source IDs. The source-reported trigger can emit a fresh report for an unchanged source. **Request current TV source** requests a report over the existing connection. Tuner reports are scoped to Live TV. A background LG 500 leaves Channel empty until a valid report arrives, and explicit command failures reach the calling Flow.
- **Playback and remote controls.** The original Play, Pause, Fast Forward, Rewind and Toggle cards remain. Toggle follows the last acknowledged Homey Play or Pause and starts with Play when no reliable history is available. The TV remote can change playback independently. Channel up and down retain their own cards. Button socket setup and writes are bounded, and timed alerts close using the ID returned by LG.
- **Volume and display tags.** Homey’s standard volume capability uses 0–1 and custom volume conditions use 0–100. The app translates values at the LG boundary. **App or input** and **Channel** use Homey’s standard display fields. Existing devices with the legacy Source and Channel tags continue receiving corresponding values.
- **Compatibility.** Homey firmware 12.9.0 or newer is required. The original app ID, automatic driver ID and all 30 custom Flow card IDs from Live 1.0.43 survive. The experimental 1.0.51 Test diagnostic card was retired. Update in place and keep the existing TV device to retain its saved pairing, settings and Flow bindings. [Full 2.0.0 changelog, upstream history and 1.x Test history](CHANGELOG-2.0.0.md)

## Build provenance

This source corresponds to 2.0.5 Build 16, first released through Homey Test. The certification submission uses the same tested package without a rebuild or runtime change. The SHA-256 for the archive submitted to Athom was `5362c0e46d000c501cc98971e0809031f1bd60bd53d178c56ab5f8fb131f0795`. Athom’s processed archive was `234749cf52f7ffa4ff7d653badc8ac49060cd183815d6716f49cac46255dbb58`. Athom kept the same 83 files, reformatted the manifest without changing its content, and preserved every other file byte for byte. The repository also carries contributor documentation and offline tests. [Build instructions](README.md#build-and-test) · [Maintainership](MAINTAINERSHIP.md)
