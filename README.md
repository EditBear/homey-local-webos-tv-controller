# Local webOS TV Controller

Local webOS TV Controller is an independently published community Homey Pro application for
compatible LG televisions. It communicates with the television over the local
network and concentrates on detailed television control and automation.

## Maintenance status

I published this app to help other Homey users, but I am not a programmer and
cannot promise continuing code maintenance. Developers are warmly invited to
improve it, submit pull requests, fork it, or volunteer to maintain it.

The GPL-3.0-or-later licence permits reuse and modification under its terms.
Repository access does not transfer the existing Homey App Store listing, and
Athom independently decides whether any separate Store submission is accepted.

The app can monitor power, the foreground app or input, Live TV channels,
sound output, volume and mute state. Its Flow cards cover channel and app
selection, remote-control commands, television notifications, media commands
and television-specific conditions and triggers.

## Scope

This is a specialist television controller. It complements LG ThinQ, whose
Homey application serves LG's wider connected-appliance ecosystem. It is not
an LG, Athom or original-author product and does not claim official status.

Functions depend on the television model, webOS version and enabled network
settings. Numeric volume control requires an output that exposes LG's numeric
volume. An external ARC or eARC system may use a separate scale. Media commands
require an active player that accepts the corresponding webOS command.

## Verified release baseline

Version 1.0.43 is a Store-packaging revision of the live-verified 1.0.42
functional baseline. The accepted catalogue contains 14 WHEN, 9 AND and 25 THEN
cards. The consolidated public change history is in
`MAX-TO-JOHN-BEAR-REVISION-LOG-1.0.43.md`.

## Provenance

This application is derived from WebOS Plus by Max van de Laar:

https://github.com/MaxvandeLaar/homey-webos-plus

Max van de Laar is credited as the original author. Dominic Vonk and Paul
Molensky retain their inherited contributor credit. The bundled lgtv2 library
is by Sebastian Raff and retains its MIT licence.

The fork is published under the John Bear identity. See
`NOTICE`, `LICENSE` and the consolidated revision record for attribution and
licensing details.

## Build, test and local installation

Install Node.js 18 or newer and the project dependencies, then run:

```sh
npm install
npm test
npx homey app build
```

To install the app persistently on a compatible Homey Pro without using the
Homey App Store, authenticate and select the Homey through the Homey CLI, then
run:

```sh
npx homey app install
```

See `RECOVERY.md` for the preservation boundaries and recovery procedure.

## Support

Support contact: wakeful.issue_8i@icloud.com

Please include the television model, webOS version, Homey model, app version,
active sound output and the exact Flow card when reporting a problem.

Problem reports are welcomed, but this community release is provided on a
best-effort basis without a guaranteed response or update schedule.
