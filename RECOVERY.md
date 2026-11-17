# Recovery and local installation

This repository contains the public source for Local webOS TV Controller
2.0.5, [Homey Test Build 16](CHANGELOG-2.0.5.md). Tags `v2.0.2`, `v2.0.1`
and `v2.0.0` preserve Test Builds 13, 12 and 11. Tag `v1.0.43` preserves
the current Live Store source.

## Requirements

- a compatible Homey Pro and Homey account;
- Node.js 22.12 or later in the 22 series, or Node.js 24 or newer;
- npm and internet access when dependencies are not already available;
- Homey CLI 4.4.1, obtained by the project launcher.

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
