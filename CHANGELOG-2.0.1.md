# Local webOS TV Controller 2.0.1

Released to Homey Test as Build 12 on 12 November 2026. The regular Homey listing was on 1.0.43 at release. [Homey Test](https://homey.app/a/com.rompa.webos-plus-g4/test/)

- **Confirmed wake for Flows.** Added **The TV was confirmed on**. It provides a numeric `confirmedAt` timestamp in Unix epoch milliseconds when the power listener receives LG's Active report. An ordinary power update can occur while the TV is still waking, so Flows that switch inputs can use this trigger to wait for a confirmed wake. Enable the power listener to use the card.
- **Accurate power reports during shutdown.** LG can report a blank foreground, then Home, then a blank foreground while shutting down. The app now handles those reports as source changes. That prevents this sequence from adding false power transitions or firing the associated ON/OFF Flows.
- **Faster retry when the same TV reappears.** When Homey rediscovers the paired TV at its saved address, the app can bring forward one already scheduled retry per recovery episode. It consumes the existing retry timer during the wait between connection attempts. This can shorten the time to reconnect when the TV is already reachable.
- **Discovery with multiple TVs.** The app checks each discovery result against the saved TV ID before the availability callback runs. A result for one TV can no longer mark another TV available during the identity check.

All 45 offline checks passed, including the reconnect timer and discovery tests. An in-place LG G4 webOS 25 test preserved pairing and saved Flows and passed standby and wake with the connection still open. **Advancing a pending retry on rediscovery still needs a live test.**

Existing Flow card IDs and argument and token bindings carry forward from 2.0.0 Test. Requires Homey 12.9.0 or later. TVs that reject the signed pairing certificate, including some webOS 26 TVs, may have trouble pairing or reconnecting. [Previous release history](CHANGELOG-2.0.0.md)
