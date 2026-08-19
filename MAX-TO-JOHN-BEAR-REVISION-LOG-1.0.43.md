# Max WebOS Plus to John Bear fork — revision log

Finalised for Candidate 1.0.43 on 1 August 2026.

This document is the consolidated public explanation of the changes. The
chronological, file-level engineering evidence and Max's original changelog are
preserved in the project steward's private release records.

## Provenance

- Original application: WebOS Plus by Max van de Laar
- Original repository: `https://github.com/MaxvandeLaar/homey-webos-plus`
- Audited upstream revision: `157ac37e391430a8d09f58529306656869a4c3c5`
- Original application ID: `com.maxvandelaar.webos-plus`
- Earlier credited developers: Dominic Vonk and Paul Molensky
- Included library: lgtv2 by Sebastian Raff under the MIT licence
- Independent fork ID: `com.rompa.webos-plus-g4`
- Independent publisher and project steward: John Bear
- Independent Store name from 1.0.43: Local webOS TV Controller
- Application licence: GNU GPL version 3 or later

The frozen local 3.1.2 source—not a later GitHub download—was the authoritative
functional source from which the independent fork was created.

## Changes already present in the local source before fork version 1.0.0

1. Normalised app/input, sound-output and channel Flow tokens to the declared
   string types so missing initial values could not break Flow triggering.
2. Used LG's complete application list where required to identify Live TV.
3. Added delayed, foreground-guarded Live TV channel acquisition for the G4's
   tuner startup timing.
4. Preserved valid channel information during temporary tuner unavailability.
5. Made WebOS response handling accept valid modern replies without an explicit
   success flag while rejecting explicit errors and missing responses.
6. Corrected app-list endpoint metadata and simplified the local packaging
   toolchain used for the tested Homey Pro installation.

## Independent-fork engineering revisions

| Candidate | Material revision |
|---|---|
| 1.0.0 | Created the separate `com.rompa` identity and isolated pairing credentials from Max's installed application. |
| 1.0.1 | Corrected Homey's 0–1 volume scale and conversion to/from LG's 0–100 volume. |
| 1.0.2–1.0.5 | Guarded reconnection, channel-subscription recovery, action failures, driver initialisation and asynchronous completion. |
| 1.0.6–1.0.7 | Added current local/LAN Store metadata, package exclusions, concise Store text and corrected Flow presentation. |
| 1.0.8–1.0.10 | Moved pairing credentials to private storage, added Node.js compatibility and bounded network/image input, and serialised reconnect state. |
| 1.0.11–1.0.14 | Aligned manifest and runtime capabilities, strengthened pairing/discovery validation and package boundaries, and removed an unused development dependency. |
| 1.0.15–1.0.21 | Prevented false power-off reports, isolated pairing payloads, bounded pending WebSocket requests and button sockets, prevented overlapping reconnects, completed Store assets, and cancelled lifecycle work safely. |
| 1.0.22–1.0.24 | Corrected token examples, translations and required formatted Flow/drop-token presentation. |
| 1.0.25 | Repaired LG's two-stage authorisation exchange so the accepted client key is saved before subscriptions begin. |
| 1.0.26 | Verified requested channel changes and reconciled silently stale Live TV channel telemetry. |
| 1.0.27 | Clarified numeric versus list channel cards and restricted application choices to user-facing targets. |
| 1.0.28–1.0.30 | Experimental pairing-retry branch rejected and excluded from the final source. |
| 1.0.31 | Corrected existing-device `volume_set` capability options while retaining 1.0.27 pairing and discovery. |
| 1.0.32–1.0.33 | Surgically repaired volume migration, relative volume, equality/below/above and mute conditions; added the LG G4 nested volume-response format. |
| 1.0.34–1.0.36 | Re-tested and then removed the inherited Is playing condition after protocol and live tests proved there was no reliable device-wide playback state. |
| 1.0.37 | Replaced misleading Next/Previous cards with live-proven Fast forward/Rewind actions. |
| 1.0.38 | Removed the image-token notification action after repeated LG G4 timeouts; retained the working notification action with optional URL/Base64 icon. |
| 1.0.39 | Stabilised power WHEN cards against brief WebSocket disconnects while retaining authoritative LG state. |
| 1.0.40 | Replaced misleading Artist/Track/Album device surfaces with accurate App or input and Channel displays. |
| 1.0.41 | Ensured existing-device capability migration completes before LG subscriptions connect. |
| 1.0.42 | Removed the empty Artwork surface after every LG-provided application-icon URL returned HTTP 404. |
| 1.0.43 | Applied the John Bear publication identity, neutral Local webOS TV Controller branding, full provenance and stricter verified-developer argument labels without changing television-control behaviour. |

## Resulting Flow catalogue

The final retained catalogue contains 14 WHEN, 9 AND and 25 THEN cards. Every
retained card has recorded live evidence in its supported context. Stable Flow
card IDs were preserved throughout corrections so existing Candidate Flows are
not renamed or silently redirected.

## Deliberately unsupported or removed claims

- Is playing: removed because the tested LG G4 did not expose dependable state
  across Live TV time-shift, USB recordings and YouTube.
- Artist, Track and Album: removed because the television supplied app/channel
  labels rather than genuine music metadata.
- Artwork: removed because all tested LG-supplied image URLs returned HTTP 404.
- Image-token notification: removed because the LG G4 did not acknowledge the
  image-bearing toast request.
- Next and Previous: renamed Fast forward and Rewind because live USB-recording
  tests proved those commands changed transport speed rather than file order.

## Known boundaries retained honestly

- Numeric volume depends on the active television sound output. External
  ARC/eARC equipment may expose its own scale or reject LG absolute volume.
- Media commands depend on the active player accepting the relevant webOS
  command.
- Television availability, APIs and payload shapes may vary by model and webOS
  version; the verified hardware is the local LG G4 used for acceptance.

## Verification boundary

Candidate 1.0.42 is the immutable live-verified functional baseline. Candidate
1.0.43 changes Store metadata, artwork, documentation, explicit argument labels
and the startup log only. All driver/runtime JavaScript is byte-identical to
1.0.42, and `app.js` differs only by the John Bear copyright line and startup
name. Both publish and verified Homey validation levels pass offline.
