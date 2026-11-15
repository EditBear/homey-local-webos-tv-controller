# Local webOS TV Controller 2.0.3

This Homey Test candidate carries forward the exact runtime from the 2.0.2 development build tested on Lounge Television.

- Sascha’s Input picker lets you switch HDMI inputs from the TV device in Homey. It shows labels supplied by the LG TV, has standard HDMI 1–4 fallbacks and follows reported input changes. [Sascha’s contribution](https://github.com/EditBear/homey-local-webos-tv-controller/pull/7)
- All 34 custom Flow cards, the raw source reports and the app and driver IDs are preserved. Update the existing app in place and keep the TV device installed to retain its pairing and saved Flow bindings.

The recorded LG G4 trial verified HDMI 3 switching and its raw source report. John also reported successful selections across his other sources apart from the Sonos Arc input on his setup.

[2.0.2 changelog](CHANGELOG-2.0.2.md) · [2.0.1 changelog](CHANGELOG-2.0.1.md)
