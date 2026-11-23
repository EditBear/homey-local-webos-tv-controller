# Recovery and local installation

This repository contains the public source for Local webOS TV Controller
2.0.5, [Build 16](CHANGELOG-2.0.5.md), first released through Homey Test on
17 November 2026. The certification submission uses the exact tested package.

On 23 November 2026, the unchanged 2.0.5 Build 16 was submitted to Athom for certification with automatic publication after approval; until approved, 2.0.5 remains available on Test and the regular Store release remains 1.0.43.

Tags `v2.0.2`, `v2.0.1` and `v2.0.0` preserve Test Builds 13, 12 and 11.
Tag `v1.0.43` preserves the 1.0.43 Live Store source.

## Requirements

- a compatible Homey Pro running Homey 12.9.0 or later, and a Homey account;
- Node.js 22.12 or later in the 22 series, or Node.js 24 or newer;
- npm and internet access when dependencies are not already available;
- Homey CLI 4.4.1, obtained by the project launcher.

## Upgrade and preserve existing devices

Update in place and keep the existing app and TV device installed. The original
app ID, automatic driver ID and all 30 custom Flow card IDs from Live 1.0.43
are retained. Saved pairing, settings and Flow bindings belong to the Homey
device state; a source archive alone does not preserve or restore that state.
The experimental Capture raw LG application diagnostics card from 1.0.51 Test
was retired, so remove that card from any affected Flow.

Homey's standard volume capability uses 0–1; the original custom volume
conditions use 0–100. Keep numeric Sonos volume control on Sonos and retain
existing limits. External-output stepping is opt-in, defaults to Off and
requires a fresh reading for the selected output. Do not treat the TV's reading
as an interchangeable external-speaker volume.

Signed pairing is the default on both drivers. Allow unsigned pairing is an
opt-in fallback for the specific blacklisted-certificate response. Its positive
C2 result on webOS 25 does not prove support across webOS 26 TVs; reduced
permissions may still limit commands. A MAC address and a network path carrying
the wake packet are required for Wake-on-LAN. Cross-VLAN wake is unconfirmed.

See the [current changelog](CHANGELOG-2.0.5.md#field-feedback-and-remaining-limits)
for the B9 and C9 upgrade feedback and its limits, Daniel's approximately
15-hour G4 standby result, and the unconfirmed earlier unavailable-badge and
issue #1 outcomes. Full 24-hour and second-TV longer-standby coverage remain
unconfirmed.

## Restore from source

```sh
npm ci --omit=dev
node scripts/apply-lgtv2-patch.cjs
node --require ./test/offline-barrier.cjs --test test/*.test.cjs
./scripts/homey-local app build
./scripts/homey-local login
./scripts/homey-local select
./scripts/homey-local app install
```

`homey app install` installs the application persistently without requiring the
Homey App Store. It is a live change to the selected Homey and should only be
run after the build and tests pass and after confirming the intended Homey.

## Independent preservation

The repository owner also retains checksum-protected source and
dependency-complete archives plus a full Git bundle. Those private recovery
artifacts are deliberately not committed here because generated dependencies,
local maintenance evidence and diagnostics do not belong in the public source
repository.

Historical source can be restored from the public repository or from an
owner-supplied release archive. Future Homey firmware or SDK changes may still
require code updates; preserving the application cannot guarantee perpetual
platform compatibility.
