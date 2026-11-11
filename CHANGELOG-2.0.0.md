# Local webOS TV Controller 2.0.0 changelog and version history

11 November 2026 · Homey Test Build 11 · `com.rompa.webos-plus-g4`

This record compares the released Test build with Max van de Laar’s preserved WebOS Plus source, traces the intervening G4 fork, and identifies which changes reached 2.0.0. The Homey listing carries shorter English and Dutch release notes. The historical entries below cover the preserved upstream release notes and every numbered 1.x fork revision, including experiments. [Homey Test listing](https://homey.app/a/com.rompa.webos-plus-g4/test/)

| Reference | Exact identity |
| --- | --- |
| Upstream comparison | Max van de Laar’s WebOS Plus 3.1.2, `com.maxvandelaar.webos-plus`, commit [`157ac37e391430a8d09f58529306656869a4c3c5`](https://github.com/MaxvandeLaar/homey-webos-plus/commit/157ac37e391430a8d09f58529306656869a4c3c5), dated 11 September 2024. Its manifest still says 3.1.2. The Git tag `v3.1.2` points to the earlier `7e33d8f0e7193e3c1a0c903ae2f44836deeefb33` commit. |
| Homey development build used for the latest physical checks | `6501276c05dddb9dd4280276b479c1138c71b56e46e289bfd8b6be43f9489fb8` |
| Uploaded 2.0.0 Test archive | `9e10ebea5b4c69411725f033c2a903294a80c6e1d9ed659990264cec697c7302` |
| Athom’s processed Build 11 archive | `66f47e9d50d794b1505a32541d308b0bc518a420c19cedec9cc408a6758b3caf`. All 73 members match the upload. Athom reformatted the manifest without changing its content. |

Max’s project remains the upstream source. The fork retains his credit, the inherited credit for Dominic Vonk and Paul Molensky, the GPL-3.0-or-later licence and Sebastian Raff’s MIT licence for `lgtv2`. The July 2026 G4 build also reported 3.1.2 after local modifications. It was the direct parent of fork 1.0.0. The later 2.0.0 redesign began again from the audited Max source, and reconsidered the 1.x changes individually. [Max’s repository](https://github.com/MaxvandeLaar/homey-webos-plus)

## What changed from Max’s app in 2.0.0

| Area | Change and practical effect |
| --- | --- |
| Connection and standby recovery | Replaced the bundled connection implementation with pinned `lgtv2` 2.1.0 and `ws` 8.22.2. The client tries secure WebSocket port 3001 first and can try 3000, bounds the opening handshake, checks connection liveness and continues reconnecting after failures. The adapter retains the Homey-facing commands and ignores stale connection work. A bounded WebSocket opening still leaves LG registration as a separate step. |
| Pairing and existing devices | Uses a private per-device key in Homey’s device store, waits for successful registration and for a new key to be saved, and retains the fork’s app and driver IDs. Registration uses the accepted signed manifest. Some webOS 26 TVs reject that certificate, so they may fail to pair or reconnect even with a saved key. The unsigned fallback used experimentally in 1.x is excluded. Max’s original app has a different ID, so this Store update applies in place to this fork. |
| Power and startup | Keeps physical power reports distinct from connection status, initializes Homey capabilities before subscriptions, and accepts fresh reports only for the current connection. Brief socket loss or a malformed response alone does not generate an Off event. Existing optional power polling stays separate from the source and channel reports. |
| Source reporting | Shows the LG friendly label when available and uses the raw HDMI port as the fallback for HDMI1 through HDMI4. The **App or input changed** trigger still signals an actual change. **The TV source was reported** also delivers the raw source ID and receipt time when LG freshly reports the same source. A switch behind an HDMI receiver can leave the TV’s HDMI port unchanged. |
| Requested source refresh | New **Request current TV source** action makes one request over the current connection. A valid response emits the source-reported trigger with a fresh receipt time. A newer report, a replaced connection or a stopped device supersedes a pending response. The request does not write a guessed source or channel to the display. |
| Channel reports and tuning | Uses one source-owned tuner subscription after the short Live TV settling interval and retires it when leaving Live TV. Old replies cannot repopulate Channel after leaving the source. A background LG `500 Application error` clears the unavailable channel without disrupting playback. Fresh tuner reports restore the channel. Explicit tuning errors still reach the calling Flow. |
| App lists and explicit errors | Checks channel, app, launch point and external input responses before reading their lists. A failed background capability or store write is contained so it cannot break subsequent reports. Relevant explicit channel, Launch, volume and playback errors reach the calling Flow. |
| Volume and audio | Translates Homey’s 0–1 `volume_set` capability to LG’s 0–100 scale. One-step adjustments use one percentage point and relative adjustments use percentage points. Custom volume conditions use 0–100. Handles the LG G4’s nested numeric volume reports. An external ARC/eARC sound system can have its own independent volume scale and control. |
| Playback and channels | Adds explicit **Play**, **Pause**, **Fast Forward** and **Rewind**. A positive LG reply establishes that the command was acknowledged. Channel up and down stay available through their separate Homey cards. Deprecated **Toggle Play/Pause** follows acknowledged Homey command history and defaults to Play when the history is unknown. The TV remote can change playback independently. |
| Remote buttons and alerts | Bounds setup and writes on the separate remote button socket and closes that socket when its main connection is retired. Timed text alerts close using the ID LG returned, and a failed automatic close is handled. Inherited image notification and artwork surfaces remain subject to what the TV supports. |
| Display fields and saved Flows | Uses the standard capabilities `speaker_artist` (**App or input**) and `speaker_track` (**Channel**). Existing devices with the legacy `webos_display.app` or `webos_display.channel` tag also receive the corresponding updates. A legacy write failure cannot block the current fields. |
| Store package | Requires Homey 12.9.0 or newer. Removes the temporary connection observer and its module, keeps normal error reporting, and includes original attribution and the bilingual Store documentation. Development test helpers and captures remain outside the package. |

The final manifest contains **10 custom triggers, 8 custom conditions and 15 custom actions**. All 26 custom IDs from Max’s manifest survive. Seven were added relative to Max’s app: the source-reported trigger, the current-source request action, and the five playback actions including Toggle. Homey also generates cards from capabilities. Their counts are separate. All Live 1.0.43 custom IDs survive. The experimental 1.0.51 Test card **Capture raw LG application diagnostics** was retired, so a saved Flow that uses it needs an edit before using this version.

## Evidence and limits as of Build 11

- The webOS 25 development line proved first pairing on a private test device, reuse of its saved key on restart, and a real same-source Flow receipt during a short wake on a retained connection. An in-place development update later reused the existing TV key, preserved saved Flows and delivered a real **Request current TV source** Flow receipt.
- After about **10 hours 35 minutes** of normal standby, the same running development app registered again with the saved key and reported fresh power, Live TV and channel. The capture did not establish the precise elapsed time from the remote press. It logged 6,771 connection attempt starts while the TV was unavailable through recovery. The origin of a later briefly displayed TV notification remains unknown.
- Earlier 2.0.0 checks on the previous connection library covered HDMI names and raw IDs, time-shift and USB transport, and Toggle plus the legacy tags. The same functional code carried forward. Representative checks of these controls on the new transport, together with remote buttons, timed alerts and ordinary use, remain listed in the acceptance plan.
- For the exact Store package, all **17 offline checks** and standard Publish validation passed. The optional Verified check flags a legacy channel argument without a title. A paired 1.x Store upgrade with saved Flows, multi-TV and affected webOS 26 operation remain unverified. No real Store upgrade result is inferred from a Devkit install. Build 11 is on **Test**. Live was 1.0.43 at release.

## Upstream WebOS Plus history

These are Max’s version numbers. His 2.0.0 and the fork’s 2.0.0 are different releases. The following is a paraphrase of the preserved original release entries. [Original upstream changelog](UPSTREAM-CHANGELOG.json)

| Max version | Recorded change |
| --- | --- |
| 1.0.0 | Initial WebOS Plus release. |
| 1.0.1 | Made toast icon values optional, accepted icon URLs and simplified image extension handling. |
| 1.2.0 | Added image token support in toasts and channel, source and sound-output change triggers. |
| 1.2.1 | Added support for dynamic IP addresses. |
| 1.3.0 | Added trigger arguments and a media screen. |
| 1.3.1 | Fixed a device remaining unavailable. |
| 2.0.0 | Rewrote the app and revised TV power checking. |
| 2.1.0 | Added mute and unmute triggers and improved power checking. |
| 2.2.0 | Added polling for TV power state. |
| 2.2.1 | Fixed a TV incorrectly reported Off. |
| 2.3.0 | Added external input commands and the option to enter a TV IP address. |
| 3.0.0 | Moved to Homey SDK 3 and fixed volume and media images. |
| 3.0.1 | Adopted secure WebSockets. |
| 3.0.2 | Fixed secure connection and device availability issues. |
| 3.1.0 | Added a Flow action for alerts with buttons. |
| 3.1.1 | Fixed simulated button presses sent in quick succession. |
| 3.1.2 | Fixed a timeout. The audited commit also includes subsequent upstream fixes for an undefined power polling setting and saving device settings. |

## July 2026 G4 work before the fork

The local build kept the upstream version 3.1.2 while correcting missing or mistyped Flow tokens, finding Live TV in LG’s full app list, and delaying tuner reads while Live TV stayed active. It kept the previous channel on a temporary tuner failure, guarded against a late reply after a source change, accepted valid LG replies without an explicit success flag and corrected a diagnostic label for the app-list endpoint. Local packaging was simplified for Homey. V2 retained the string tokens and reliable source ownership. It replaced the July retry and old-channel retention behaviour with a source-owned subscription and explicit unavailable Channel.

## Independent fork 1.x history

The entries are the changes recorded for each candidate, including prototypes and rejected experiments. Known channel milestones include 1.0.43 on Live and 1.0.48 and 1.0.51 on Test. Individual candidate notes do not establish Store publication or hardware acceptance.

| Fork version | Recorded change |
| --- | --- |
| 1.0.0 | Created an independently identified development fork from the frozen, tested LG G4 source. No intended television-control behaviour changed. |
| 1.0.1 | Corrected the volume card's percentage scale and LG/Homey volume conversion. External ARC/eARC audio devices may retain their own volume. |
| 1.0.2 | Improved reconnection after TV address or polling changes and ignored stale events from replaced connections. |
| 1.0.3 | Added bounded recovery for failed Live TV channel subscriptions without creating duplicate active subscriptions. |
| 1.0.4 | Flow actions now report failed LG commands as errors instead of completing successfully or changing Homey state prematurely. |
| 1.0.5 | Registered Flow cards once per app start and made pairing, autocomplete and discovery errors complete reliably instead of hanging or being hidden. |
| 1.0.6 | Declared the app as a local Homey LAN integration and tightened exclusions for development, evidence and secret-bearing files. |
| 1.0.7 | Improved Store descriptions and corrected English and Dutch Flow-card wording without changing card identifiers or television-control behaviour. |
| 1.0.8 | Stored LG pairing credentials privately and improved Node.js 22 network and buffer compatibility. |
| 1.0.9 | Added bounded network requests, image-size limits and safer alert input validation. |
| 1.0.10 | Serialised reconnection and ignored stale callbacks after connection replacement or device deletion. |
| 1.0.11 | Aligned declared device capabilities with runtime behaviour and added manifest-to-handler consistency checks. |
| 1.0.12 | Improved pairing resilience when discovery data, addresses or MAC information are invalid. |
| 1.0.13 | Tightened package exclusions for development, generated and sensitive files. |
| 1.0.14 | Removed an unnecessary development dependency and regenerated the dependency lockfile. |
| 1.0.15 | Prevented transient power-subscription errors from incorrectly marking the television off. |
| 1.0.16 | Isolated LG registration payloads so multiple televisions cannot share mutable pairing state. |
| 1.0.17 | Prevented pending LG commands from hanging after WebSocket disconnection or registration timeout. |
| 1.0.18 | Prevented overlapping LG connection attempts and cancelled reconnect work after deliberate disconnect. |
| 1.0.19 | Bounded and shared remote-button socket connections so failed button actions cannot hang. |
| 1.0.20 | Added the required driver icon and strengthened offline Store-manifest checks. |
| 1.0.21 | Cancelled timed-alert work during reconnect or deletion and removed legacy plaintext key-file handling. |
| 1.0.22 | Corrected channel-token examples and added manifest-schema and translation consistency checks. |
| 1.0.23 | Completed required formatted Flow titles for alert and notification arguments. |
| 1.0.24 | Completed the required dropped-image placeholder in the notification Flow title. |
| 1.0.25 | Completed LG's two-stage authorisation handshake and saved the accepted key before connecting. |
| 1.0.26 | Verified channel changes after LG acknowledgement and added a fallback check for silently stale Live TV channel information. |
| 1.0.27 | Clarified the two channel cards and limited app choices to user-facing launch targets. |
| 1.0.28 | Tested automatic recovery after an expired LG pairing prompt. The experiment was excluded. |
| 1.0.29 | Continued the expired-prompt recovery experiment. Pairing regressions led to its exclusion. |
| 1.0.30 | Removed the experimental prompt retries. Development resumed from the earlier pairing path. |
| 1.0.31 | Corrected existing-device volume capability options to Homey's normalized percentage scale without changing the known-good pairing and discovery implementation. |
| 1.0.32 | Repaired relative-volume migration and live volume/mute conditions, and replaced the unreliable playback-state condition with explicit media command cards. |
| 1.0.33 | Added compatibility with the LG G4's nested live volume and mute response while retaining support for the inherited response format. |
| 1.0.34 | Reinstated the inherited Is playing condition for further controlled user testing while retaining all live-verified volume and mute repairs. |
| 1.0.35 | Read-only investigation of the advertised playback, recording and audio services. No playback command or app feature was introduced. |
| 1.0.36 | Removed the inherited Is playing condition after LG G4 protocol and live playback tests proved that the television does not expose a reliable playback-state signal. Play, Pause and Toggle actions remain available. |
| 1.0.37 | Replaced the misleading generated Next and Previous cards with accurately named Fast forward and Rewind actions after live LG G4 USB-recording tests verified their actual behaviour. |
| 1.0.38 | Removed the unsupported image-token notification card after repeated LG G4 tests timed out, while retaining the working notification card with its optional icon field. |
| 1.0.39 | Prevented brief LG WebSocket restarts from generating false television off/on Flow events while retaining confirmed power-state detection. |
| 1.0.40 | Replaced misleading Artist, Track and Album change cards with accurately named app/input and channel display values while retaining the proven dedicated Flow cards. |
| 1.0.41 | Ensured existing-device capability migration completes before connecting, so all LG power, volume, app, sound-output and channel subscriptions start reliably after an upgrade. |
| 1.0.42 | Removed the unusable inherited Artwork token after the LG G4 returned HTTP 404 for every tested app-icon source; all verified Flow cards remain unchanged. |
| 1.0.43 | Prepared the independently published Local webOS TV Controller community release with original Store artwork, clear upstream credit and unchanged television-control behaviour from the live-verified 1.0.42 baseline. |
| 1.0.44 | Restored Max-compatible LG connection retry behaviour while retaining safe retry cancellation, and rejected incomplete LG list responses without crashing the app. |
| 1.0.45 | Removed continuous Live TV channel polling and cancelled stale inferred-off timers immediately after LG reconnection. |
| 1.0.46 | Added bounded webOS 26 pairing compatibility, finite reconnection attempts and safe app/input Flow choices while retaining webOS 25 registration behaviour. |
| 1.0.47 | Restored recovery when the LG control connection remains disconnected by starting a fresh bounded reconnect cycle only after exhausted attempts and a later TV discovery signal. |
| 1.0.48 | Corrected bounded recovery after standby by clearing stale session state and ignoring obsolete socket events. |
| 1.0.49 | Added an explicit, bounded diagnostic capture of unprocessed LG application metadata without changing normal source handling. |
| 1.0.50 | Reissued the bounded LG application diagnostic capture as a higher version so locally installed diagnostic builds can migrate safely to Athom Test. |
| 1.0.51 | Added a TV source-reported Flow trigger with the raw source ID and receipt time, including fresh reports of an unchanged source. Existing source-change triggers retain their behaviour. |

## Homey distribution history

| Build | Version | Recorded channel or outcome |
| --- | --- | --- |
| 1 | 1.0.43 | Live under the independent Local webOS TV Controller identity. |
| 2 | 1.0.44 | Test. |
| 3 | 1.0.45 | Draft, superseded by the corrected package. |
| 4 | 1.0.45 | Test. |
| 5 | 1.0.46 | Test. |
| 6 | 1.0.47 | Test. |
| 7 | 1.0.48 | Test. |
| 8 | 1.0.50 | Test. The installed archive had the diagnostics card and preceded the new source report trigger. |
| 9 | 1.0.51 | Archive processing failed. |
| 10 | 1.0.51 | Test. The new source report trigger and the diagnostic action were both present. |
| 11 | 2.0.0 | Test. The report trigger remains, the current-source action is new, and the diagnostic action is removed. |

Version 1.0.49 was a private diagnostic build.

## From the 1.x line to the 2.0.0 Test build

| Period | What reached the release |
| --- | --- |
| 27–30 October · Max baseline and focused fixes | The rebuild went back to Max’s audited source. It restored private pairing storage, explicit power reporting, guards for malformed lists, correctly typed Flow tokens and protection for background Homey writes. More extensive lifecycle, pairing signature and discovery/address proposals were deferred or rejected when the evidence did not support them. |
| 30 October–4 November · Application behaviour | Tested the volume translation and command error handling, the source and channel display, and then remote buttons and timed alert closure. The evidence distinguishes accepted behaviour from diagnostics and from the earlier timeout. |
| 4–6 November · Upgrade, startup and wake | Restored the fresh source-report event without turning it into a source-change event. Existing-device startup, preservation, short standby/wake and ordinary Live TV use were tested on the earlier V2 line. Helper timing changes improved the acceptance checks without changing the product event contract. |
| 6–9 November · Source labels, playback and legacy compatibility | Tested friendly HDMI names with numeric fallbacks and the raw IDs, playback through the Live TV to USB transition, and compatibility for Toggle and the legacy tags. A channel request failure was handled independently from playback. |
| 10 November · Transport replacement | An overnight check of the older transport had left Homey showing the TV off after physical wake. Replaced the main connection engine with upstream `lgtv2` and verified private pairing, restart and short wake. Installed the same transport under the existing app identity and added **Request current TV source**. |
| 11 November · Long standby and Store Test | The installed development build recovered after normal overnight standby. Build 11 removed the temporary logger, updated the release documentation, and was published to Homey Test after package verification. |

The original 1.x retries, periodic channel reconciliation, unsigned registration trial and temporary diagnostic cards are historical. V2’s connection, source, channel and upgrade behaviour is defined by the exact Build 11 package above. Saved-address handover and broader sound-output or catalogue changes remained outside this release.
