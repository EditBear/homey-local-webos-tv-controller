# Recovery and local installation

This repository contains the complete public source for Local webOS TV
Controller. Release `v1.0.43` corresponds to the published Homey app version
1.0.43.

## Requirements

- a compatible Homey Pro and Homey account;
- Node.js 20.17 or newer;
- npm and internet access when dependencies are not already available;
- the Homey CLI supplied through this project's development dependencies.

## Restore from source

```sh
npm ci
npm test
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
