# Local webOS TV Controller 2.0.1

Local webOS TV Controller provides local LG webOS control, source and channel reporting, and Flow cards for TV commands. The source-reported trigger provides the raw source ID and report time, including fresh reports of the same source. Use Request current TV source to ask a connected TV for its current source.

The TV was confirmed on supplies the time of an LG Active report to Flows using the power listener. Use it to sequence wake-to-input Flows.

Use the explicit Play, Pause, Fast Forward and Rewind cards for playback. Existing Flows can keep the deprecated Toggle Play/Pause card. Toggle follows the last acknowledged Homey Play or Pause and starts with Play when there is no reliable history. The TV remote can change playback independently.

App or input uses speaker_artist and Channel uses speaker_track. Some Homey-generated cards use Artist or Track wording. The older webos_display.app and webos_display.channel tags follow these reports on devices that already have them. Channel is empty outside Live TV or when the tuner has no current report. Use the current fields for new Flows.

Requires Homey 12.9.0 or later. Tested on an LG G4 running webOS 25. Some webOS 26 TVs reject the signed pairing certificate and may fail to pair or reconnect with this version. If you are upgrading, keep the app and TV device installed so Homey can retain pairing, settings and saved Flow bindings. Flows that use the experimental Capture raw LG application diagnostics card from 1.0.51 Test need to remove that card.

Homey's volume_set capability takes normalized values from 0 to 1; original custom volume conditions use 0 to 100. This does not make LG and external-speaker scales interchangeable. For Sonos, keep numeric volume control on the Sonos device and preserve existing volume limits. Do not use a TV reading as a Sonos volume value or automatically restore a guessed level. Explicit TV mute/unmute remains available.

The app improves TV-speaker volume handling, source and channel freshness, command errors, remote buttons and alert closing. The LG 500 Application error on a background tuner report leaves Channel blank. An explicit command error still reaches the Flow.

Based on Max van de Laar's WebOS Plus: https://github.com/MaxvandeLaar/homey-webos-plus
Original contributor credits, copyright notices and GPL-3.0-or-later licence are retained. The upstream project is credited as the source, not as support for this derivative. Use the app listing's support contact for this version.

## Test release and source history

This repository contains the source for **Homey Test 2.0.1, Build 12**. The release notes explain the confirmed wake trigger, the shutdown power report fix and the changes to rediscovery. [2.0.1 changelog](CHANGELOG-2.0.1.md) · [Homey Test](https://homey.app/a/com.rompa.webos-plus-g4/test/)

Tag `v2.0.0` preserves Homey Test Build 11, and tag `v1.0.43` preserves the earlier Store release source. [Earlier changelog](CHANGELOG-2.0.0.md) · [Homey Community thread](https://community.homey.app/t/lg-webos-better-integration/15007/552)

Contributions and offers to maintain the app are welcome. [Contributing](CONTRIBUTING.md) · [Maintainers](MAINTAINERSHIP.md)

## Build and test

Use Node.js 22.12 or later in the 22 series, or Node.js 24 or newer, with npm. Apply the bundled reconnect patch after each `npm ci`. The script checks the pinned upstream dependency and verifies that its output matches Test Build 12. The launcher uses Homey CLI 4.4.1.

```sh
npm ci --omit=dev
node scripts/apply-lgtv2-patch.cjs
node --require ./test/offline-barrier.cjs --test test/*.test.cjs
./scripts/homey-local app validate --level publish
./scripts/homey-local app build
```

See [local installation and recovery](RECOVERY.md) for the developer installation procedure.
