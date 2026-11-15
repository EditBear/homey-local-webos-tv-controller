# Local webOS TV Controller 2.0.2

Released to [Homey Test](https://homey.app/en-gb/app/com.rompa.webos-plus-g4/test/) as **Build 13** on 15 November 2026. The regular Homey Store release remained on 1.0.43.

- **TV discovery.** If the TV's HTTP description request fails, discovery keeps the result and uses the IP address as the display name. The saved identity and MAC lookup are unchanged. Refused or unreachable connections could previously escape the request's error handling.
- **On-screen notifications with an icon URL.** Failed downloads now report an error to the Flow before sending a notification. A request or response stream failure could previously escape the action or leave it waiting.
- **On-screen notifications with a Gallery image.** Failure to open or fully read the image, including a stream that closes early, now reports an error to the Flow before sending a notification. The previous action could remain pending or let the error escape.

The Gallery crash report identified its handler. The connection crash reports did not identify which app request failed, so this release fixes the verified failure paths without assuming all those crashes had the same cause.

**The experimental Live TV channel retry is not included.** Channel reporting is unchanged from 2.0.1. The existing ability to bring forward a pending TV connection attempt on rediscovery is also unchanged.

The app and driver IDs, pairing and settings definitions, and all 34 custom Flow cards are unchanged. Update in place and keep the existing TV device to retain pairing and saved Flow bindings.

[2.0.1 changelog](CHANGELOG-2.0.1.md) · [2.0.0 changelog and earlier history](CHANGELOG-2.0.0.md)
