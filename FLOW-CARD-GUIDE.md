# Flow card user guide

This guide explains how to build Homey Flows with **Local webOS TV Controller 2.0.5**. It covers all **34 custom cards**—11 WHEN triggers, 8 AND conditions and 15 THEN actions—plus the standard cards Homey creates for the TV's capabilities.

The inherited cards come from Max van de Laar's WebOS Plus. The eight custom cards added in this app are identified below and receive extra examples. Card names can vary slightly with Homey's language, version and card formatting; the descriptions use the current English app definitions.

## Contents

- [Before you start](#before-you-start)
- [How WHEN AND and THEN work](#how-when-and-and-then-work)
- [The eight added custom cards](#the-eight-added-custom-cards)
- [Source names and timestamps](#source-names-and-timestamps)
- [WHEN cards](#when-cards)
- [AND cards](#and-cards)
- [THEN cards](#then-cards)
- [Standard Homey cards and relevant settings](#standard-homey-cards-and-relevant-settings)
- [Worked Flow examples](#worked-flow-examples)
- [Choosing the right card and resolving common problems](#choosing-the-right-card-and-resolving-common-problems)

## Before you start

Pair the TV with this app and give it a recognisable Homey name. The automatically discovered and Manual via IP device types use the same custom Flow cards. Select the intended television on every card. When updating, keep the existing app and TV device installed to retain their pairing, settings and saved Flow references.

Most commands and live checks need the TV to be on, authorised and connected. **Turn on** is the exception: it uses Wake-on-LAN to request a wake from standby. A successful wake request is not a confirmation that the TV is ready for the next command.

Keep the TV on while editing channel, app or input choices. These lists come from that particular TV. Type a few characters and select a returned suggestion; a typed label on its own is not the same as selecting a list entry.

The TV controls its own internal tuner and apps. A channel card does not select a channel inside an external satellite box, streaming app or HDMI device. An HDMI command selects a TV port; the connected player still needs its own startup and playback controls.

## How WHEN AND and THEN work

- **WHEN** starts a Flow when the app reports an event. It does not wait inside a different ordinary Flow that has already started.
- **AND** checks a condition when the Flow reaches it. A false condition stops that branch; it does not keep waiting for the condition to become true.
- **THEN** asks the TV to do something. A completed action generally means the relevant request completed, not that you have visually verified the final screen. Individual card limitations are explained below.

In Advanced Flow, connect operations in order when the second depends on the first. Placing two actions on independent branches can run them together. Several ordinary Flow THEN cards are also not a replacement for a sequence that waits for an external event.

A **Tag** carries a value into another card. Trigger Tags are available to the Flow started by that trigger. To use one later in another Flow, save it in a Homey Logic variable of the matching type: Text, Number or Yes/No. See Homey's [Logic and Tags guide](https://support.homey.app/hc/en-us/articles/4410240765586-Use-Logic-in-Flows).

For AND cards with an **is/isn't** or **equals/doesn't equal** choice, select the positive or negative form in the card. The negative form reverses a true/false result; it does not turn a failed TV request into a successful check.

## The eight added custom cards

These are additions to Max's custom card definitions. They do not imply that his app had no standard playback controls.

| Category | Added card | Why it exists |
| --- | --- | --- |
| WHEN | [The TV source was reported](#the-tv-source-was-reported) | Delivers a fresh source report even when the source has not changed. |
| WHEN | [The TV was confirmed on](#the-tv-was-confirmed-on) | Separates a qualifying LG Active report from an ordinary ON indication or wake request. |
| THEN | [Request current TV source](#request-current-tv-source) | Requests one source report from the current connection. |
| THEN | [Play](#play) | Makes the requested playback operation explicit. |
| THEN | [Pause](#pause) | Requests Pause without guessing the current playback state. |
| THEN | [Fast forward](#fast-forward) | Moves through supported playback rather than changing broadcast channels. |
| THEN | [Rewind](#rewind) | Moves backwards through supported playback rather than changing broadcast channels. |
| THEN | [Toggle Play/Pause command](#toggle-playpause-command) | Preserves older Flows; it follows acknowledged Homey commands and has limitations. |

Use explicit **Play** and **Pause** in new Flows. **Toggle Play/Pause command** is deprecated: existing Flows can retain it, but Homey may hide it when you add a new card.

## Source names and timestamps

### Friendly names and source IDs

A friendly name is intended for people: for example, a renamed HDMI input or an app's display name. It can change, or be supplied by a connected HDMI device. When an HDMI name is missing, the app retains a numbered HDMI fallback for ports 1–4.

Source trigger Tags use LG's raw foreground source ID. Common examples are:

| Source | Typical raw source ID |
| --- | --- |
| Live TV | `com.webos.app.livetv` |
| HDMI1 | `com.webos.app.hdmi1` |
| HDMI2 | `com.webos.app.hdmi2` |
| HDMI3 | `com.webos.app.hdmi3` |
| HDMI4 | `com.webos.app.hdmi4` |

Use the actual Tag from your own TV for other applications. Friendly labels and raw IDs are different values: a label such as “Game console” will not equal `com.webos.app.hdmi3`.

**Switch to external input** uses the TV's external-input list. Its selected input value can differ from the foreground source ID; choose the input from the card's list instead of copying a source-report Tag into that field.

A receiver or HDMI switch can change the player behind one TV port without changing the TV's raw HDMI source. This app reports what the TV can identify. The HDMI picker is a device control, not an additional custom Flow card.

### Event Tags and persistent display Tags

Source and channel event Tags should not be confused with the display fields:

- **Previous app or input / Current app or input** are raw source IDs.
- **Previous channel / Current channel** are channel-number text values.
- **App or input**, shown on the device, is a readable source label.
- The device's **Channel** field can include both number and name, such as `101 | Example HD`, and can be empty when no current tuner report is available.

Homey can call the last two fields **Artist** and **Track** in some automatically generated cards. Existing devices with the legacy Source and Channel Tags continue receiving corresponding values. The legacy Tags are compatibility fields; they are not the raw, timestamped source-report event.

### Timestamp units

`reportedAt` and `confirmedAt` are **Number Tags containing Unix epoch milliseconds**: elapsed milliseconds since 1 January 1970 UTC. They record when the app receives the relevant LG report, not a duration or the time when a button was pressed.

Store them in Number variables. Compare them only with times expressed in the same units. They are useful to a controller that must distinguish a new report from a previously stored one; they are not a request ID or an automatic guarantee that a report belongs to one particular Flow command.
## WHEN cards

These 11 custom cards start a Flow from a TV report. Select the TV device, such as **Living Room TV**, on every card. Cards with a channel or app picker need the TV on and connected while you choose an item; type part of its name or, for channels, its number. A missing result can mean the TV did not supply that item or its list could not be retrieved.

Reports describe what LG has reported to Homey. They do not by themselves prove that a picture is visible, an HDMI device is ready or audio can be heard. A change card compares a report with the app's previous value, so its first report can count as a change when there was no previous value. **The TV source was reported** deliberately includes unchanged source reports; **The TV was confirmed on** has its own confirmation rules.

### Channel changed

Use this to react to a different broadcast channel being reported, regardless of which channel was selected. Choose the TV; there are no other arguments.

The tokens are **Previous channel** (`oldChannel`) and **Current channel** (`newChannel`). Both are text containing channel numbers, for example `"1"` and `"2"`, rather than channel names. Previous channel can be empty when no earlier channel is known. These values have no measurement units.

The app listens for usable tuner reports while the foreground source is Live TV. It starts that subscription after a short settling period. It fires when the reported channel number differs from the last channel number it retained. The first usable report can fire. Repeating the same number does not fire, nor does clearing the Channel display when leaving Live TV or when the tuner has no usable report. Returning to Live TV on the same retained channel therefore need not fire.

Example: when Living Room TV reports a different channel, send yourself a notification containing **Previous channel** and **Current channel**.

### Channel changed to (number)

Use this when only arrival at one numbered broadcast channel matters. Choose the TV and enter the whole channel number in **channel**; the editor accepts integers from `0` upwards.

The tokens are **Previous channel** (`oldChannel`) and **Current channel** (`newChannel`), both text channel numbers, such as `"1"` and `"2"`. Previous channel can be empty when no earlier value is known. They contain no channel name or measurement unit.

This filters the same events as **Channel changed**, matching the new channel number as text. Initial reports can match; unchanged reports and a blank Channel display do not generate an event. A numeric entry cannot preserve leading zeros or broadcast subchannel notation: use the list card for those. In 2.0.5 the number trigger does not match an entered `0`, despite the editor allowing it.

Example: choose channel `2` on Living Room TV and notify yourself when the TV next reports a change to that channel.

### Channel changed naar (lijst)

This is the exact English label in 2.0.5; it means **Channel changed to (list)**. Use it to select a broadcast channel by its name and reported number instead of typing a number. Choose the TV, then search **channel** and select the returned entry while the TV is on and connected.

The tokens are **Previous channel** (`oldChannel`) and **Current channel** (`newChannel`), both text channel numbers, for example `"1"` and `"2"`. Previous channel can be empty. The tokens do not contain the picker's channel name and have no measurement units.

This filters the same channel-change events by the selected entry's number. A first report can match; repeating the retained number does not fire. Leaving Live TV, losing the tuner report or returning on the same retained channel does not itself count as a channel change. The list preserves the TV's channel-number format, which is useful for leading zeros and subchannels.

Example: pick a favourite channel from Living Room TV's list and send a notification when a reported channel change reaches it.

### Volume muted

Use this to respond when LG reports that TV mute has become enabled. Choose the TV; this card has no additional arguments and no tokens.

It fires when a successful volume subscription report marks `muted` as changed and its mute value differs from Homey's retained mute value, with the new value indicating muted. It is not triggered by sending a mute command alone. A first report can fire if it carries that changed marker and differs from the retained value; an initial numeric-volume report without the mute marker does not. An unchanged mute value does not fire.

Example: when Living Room TV reports muted, update a Homey status variable or send a quiet notification. The event reports TV mute, rather than independently checking the mute state of an external sound system.

### Volume unmuted

Use this to respond when LG reports that TV mute has become disabled. Choose the TV; there are no other arguments or tokens.

It uses the same report rules as **Volume muted**, but selects the new unmuted value. LG must mark `muted` as changed, and the reported value must differ from Homey's retained value. Sending an unmute command is not itself an event. A first marked report can fire; an unmarked initial report or a repeated unchanged mute value does not.

Example: when Living Room TV reports unmuted, clear a Homey “TV muted” status variable. This does not establish the current loudness of an external speaker.

### The TV source was reported

Use this when you need a newly received source report, including confirmation that the TV still reports the same source. Choose the TV; there are no other arguments.

The tokens are:

- **Source ID** (`source`): LG's raw foreground app or input identifier, such as `com.webos.app.livetv` or `com.webos.app.hdmi3`. This is an identifier, rather than the friendly **App or input** display name.
- **Reported at (epoch ms)** (`reportedAt`): a number such as `1793051358867`, measured in milliseconds since 1 January 1970 UTC. It records Homey's receipt of the LG report or requested reply, using Homey's clock. It is not a TV-provided timestamp or the moment a physical source switch completed.

It fires for usable, nonblank foreground-source subscription reports on the current connection, including the initial report and further reports of an unchanged source. A successful **Request current TV source** action also produces this event, even if the source has not changed. A failed request, an unusable source ID or a request superseded by a newer report or connection change produces no requested-source event. A cached display value alone does not create a fresh report.

Unlike **App or input changed**, this card does not require a different source ID. It also does not confirm power: LG can report a foreground app during a shutdown sequence. A report from an explicitly requested reply does not itself change the app/input display or generate an app/input-change event.

Example: request Living Room TV's current source, then have this WHEN card record **Source ID** and **Reported at (epoch ms)** in a Homey variable or notification. To check an intended HDMI selection, compare **Source ID** with the required HDMI identifier and keep the timestamp alongside it. Avoid making this same Flow request another source report unconditionally, which would repeatedly trigger it.

### The TV was confirmed on

Use this to start follow-up work when LG supplies a successful, steady `Active` power report. Choose the TV. In the TV's advanced settings, **Use polling instead of power listener** must be off: this card requires the power listener and does not fire from polling.

Its token is **Confirmed at (epoch ms)** (`confirmedAt`), a number such as `1794494688414` in milliseconds since 1 January 1970 UTC. It is Homey's receipt time for the qualifying LG report, using Homey's clock. It is not the time a Wake-on-LAN packet was sent or proof that an input, picture or external device is ready.

It fires on the first qualifying `Active` report for the current power subscription, with no power transition in progress. Further `Active` reports on that connection do not repeat it. After confirmation, screen saver, screen off and transition reports leave that confirmation in place; returning from them to `Active` does not fire again on the same connection. A successful steady `active standby`, `suspend` or `power off` report clears that confirmation, allowing a later qualifying `Active` report to fire.

The subscription begins afresh on a new registered connection. Its first qualifying `Active` report can therefore fire even if the TV was already on, for example after an app restart or reconnection. It is not an “only after a person pressed Power” event. Screen saver or screen off reports alone do not confirm on; if no confirmation has occurred yet, the first later qualifying `Active` report can still fire.

The event is generated when the qualifying report arrives. **Timeout power listener** governs a separate delayed on/off evaluation and is not an added wait before this event. Use reported state to check the result of follow-up actions instead of assuming a universal wake delay.

Example: when Living Room TV is confirmed on, record **Confirmed at (epoch ms)** and notify yourself that LG reported active. A wake-to-input Flow can use this event to begin its planned input selection, then use **The TV source was reported** to check the source LG actually reports.

### App or input changed

Use this when the reported foreground app/input identity changes. Choose the TV; there are no other arguments.

The tokens are **Previous app or input** (`oldApp`) and **Current app or input** (`newApp`). They contain raw LG identifiers, for example `com.webos.app.livetv` and `com.webos.app.hdmi3`, rather than friendly names. Previous app or input can be empty if no earlier identity is known. The tokens have no measurement units.

A nonblank foreground-source subscription report fires this card when its ID differs from the app's stored previous ID. The first report can fire when no ID is stored or the stored ID differs. A report matching the stored ID does not fire. A blank shutdown report is ignored. An explicit **Request current TV source** reply fires the source-reported card instead; it does not itself fire this change card.

Use **The TV source was reported** when the source may already be selected and you need a new report anyway. Neither card alone proves that the TV is on or that HDMI video is ready.

Example: when Living Room TV changes foreground source, send a notification with **Current app or input**, or record it in a Homey variable.

### App or input changed to

Use this to react only when the foreground app/input changes to one selected identity. Choose the TV, search **app** and select the app/input returned by the TV while it is on and connected. The choice stores its ID; availability depends on the list supplied by that TV.

The tokens are **Previous app or input** (`oldApp`) and **Current app or input** (`newApp`), raw LG IDs such as `com.webos.app.livetv` and `com.webos.app.hdmi3`. Previous app or input can be empty; neither token is a friendly name or a measured quantity.

It filters **App or input changed** by an exact match with the selected ID. A first report can match if it differs from the previous stored ID. An unchanged source report does not fire, nor does **Request current TV source** by itself. It will not fire merely because an external player begins playing while the TV remains on the same HDMI source.

Example: select a streaming app on Living Room TV and record a status message when LG reports a foreground change to that app.

### Sound output changed

Use this to react to LG reporting a different TV audio-output selection. Choose the TV; there are no other arguments.

The tokens are **Previous sound output** (`oldSoundOutput`) and **Current sound output** (`newSoundOutput`). They contain output IDs such as `tv_speaker`, `headphone` and `external_arc`. Previous sound output can be empty when there was no retained value. These are identifiers with no measurement units, rather than volume levels.

A successful sound-output subscription report fires when its nonempty output differs from the stored output. The first report can fire when there is no prior output or it differs from the retained one. A report matching the stored output does not fire. Sending an output-change command alone does not trigger it, and an output selection is not proof that audio is audible.

Example: when Living Room TV reports a different sound output, notify yourself using **Current sound output**. Keep any volume response specific to the selected audio system.

### Sound output changed to

Use this when only arrival at a particular TV audio-output selection matters. Choose the TV and an **output** from the dropdown: **TV speaker**, **External speaker**, **External optical**, **External ARC**, **Line out**, **Headphone**, **TV external speaker**, **TV speaker headphone** or **Bluetooth soundbar**. The available choices in this card do not guarantee that your TV supports every route.

The tokens are **Previous sound output** (`oldSoundOutput`) and **Current sound output** (`newSoundOutput`), output IDs such as `tv_speaker` and `external_arc`, rather than the dropdown labels or volume levels. Previous sound output can be empty. They have no measurement units.

This filters **Sound output changed** by an exact match with the selected output ID. The first report can match when the stored value is absent or different. A repeated report matching the stored output does not fire. Selecting an output is not confirmation of audible sound or an external device's numeric volume.

Example: select **Headphone** on Living Room TV and send a notification when LG reports a change to that output.

## AND cards

These eight custom cards check a condition when a Flow reaches them; they do not start a Flow or change the TV. Select the TV on each card. Every card has a positive and negative form in Homey, such as **is** and **isn't**. The headings below use the positive form and give the negative form in the text. None of these conditions supplies output tokens.

**Sound output**, **Channel** and **App/input** conditions request the current value from LG when run. A failed request is passed back as an error, rather than being replaced by an old cached value or an ordinary “doesn't match” result. A successful reply describes that reply's moment, not a promise that the value remains unchanged afterward. An inverted condition does not turn a failed LG request into a successful check.

**The tv is muted** and the three **Volume** conditions read Homey's retained capability value without making a fresh request or checking its age. Those values can remain after the TV disconnects or enters standby. Use them for decisions about the recorded state, with appropriate power/report context, rather than proof that the TV is currently reachable. An unknown or invalid cached volume makes each positive volume test false; reversing the test is not proof of a known volume.

### Sound output is

The negative form is **Sound output isn't**. Use this to allow a Flow only when LG currently reports the required TV audio-output selection. Choose the TV and **output**: **TV speaker**, **External speaker**, **External optical**, **External ARC**, **Line out**, **Headphone**, **TV external speaker**, **TV speaker headphone** or **Bluetooth soundbar**. Not every TV supports every listed output.

The app requests LG's current sound output and compares its ID with the selected ID, ignoring letter case. The positive form passes when they match. It does not use the last sound-output-change event as its answer, and an LG request failure is an error. There are no output tokens or numeric units.

Example: in a user-started status Flow for Living Room TV, check **Sound output is → Headphone** before sending a “Headphones selected” notification. This checks route selection, not whether sound is audible.

### Channel is (number)

The negative form is **Channel isn't (number)**. Use this to check a numbered broadcast channel at the moment the condition runs. Choose the TV and enter an integer **channel** from `0` upwards; for leading zeros or subchannels, prefer **Channel is (list)**.

The app requests LG's current channel and compares its reported `channelNumber` with the entered number converted to text. The positive form passes on an exact match; it does not compare the formatted Channel display or a channel name. A failed tuner request is an error, which can occur when Live TV has no current channel. It does not switch the TV to Live TV. There are no output tokens; the number is a channel identifier, not a measurement.

Example: after a user starts a channel-status Flow for Living Room TV, check **Channel is (number) → 2** before sending a “Channel 2 reported” notification.

### Channel is (list)

The negative form is **Channel isn't (list)**. Use this to check a broadcast channel selected by name and number. Choose the TV, search **channel**, and select the returned channel while the TV is on and connected. The selected entry retains the channel number supplied by LG.

When the Flow runs, the app requests the current channel and compares its reported number directly with that selected number. It does not use a cached Channel display or tune a channel. An LG request failure is an error; it is not evidence that some other channel is playing. A channel outside the TV's supplied list cannot be selected through this picker. There are no output tokens or measurement units.

Example: select a favourite channel from Living Room TV's list, then use this condition in a user-started Flow before sending “Your selected channel is reported.”

### The tv is muted

The negative form is **The tv isn't muted**. Use this to branch on Homey's recorded TV mute state. Choose the TV; there are no other arguments, output tokens or measurement units.

The app returns the retained TV mute capability value. It does not request a new mute report, check freshness or explicitly reject an unknown value. An initial volume report without LG's `muted` changed marker may not update that state. Treat an unknown or stale mute value as insufficient evidence for a decision that requires the TV's current physical mute state. This condition does not independently query an external speaker.

Example: in a status Flow for Living Room TV, use **The tv is muted** to include “TV mute recorded as on” in a notification, alongside the Flow's current connection/report context.

### Volume equals

The negative form is **Volume doesn't equal**. Use this to compare Homey's recorded TV volume with an exact level. Choose the TV and enter **volume** as an integer from `0` to `100`. These are the custom card's percentage-scale units: `20` compares with Homey's normalized capability value `0.20`.

The positive form passes only when the stored value is a valid number from `0` to `1` and exactly equals the entered level divided by `100`. There is no rounding tolerance and no fresh TV request. Unknown, invalid or unavailable numeric data makes the positive test false. There are no output tokens.

Example: with Living Room TV using its own speakers and a recent volume report available, check **Volume equals → 20** before sending “TV volume recorded as 20.” Do not treat that TV value as the volume of an external speaker.

### Volume is smaller than

The negative form is **Volume isn't smaller than**. Use this to compare Homey's recorded TV volume with a strict upper threshold. Choose the TV and enter integer **volume** from `0` to `100`; `20` means `20` on this card's percentage scale, equivalent to normalized Homey value `0.20`.

The positive form passes only for a valid stored volume strictly below the threshold. At `20`, a stored `0.19` passes and `0.20` does not. This reads the retained value, with no TV request or age check. Unknown or invalid numeric state makes the positive form return false. There are no output tokens.

Example: for Living Room TV's own speakers, combine a recent volume report with **Volume is smaller than → 20** to send an informational low-volume message. It is not a measurement of an external sound system's volume.

### Volume is larger than

The negative form is **Volume isn't larger than**. Use this to compare Homey's recorded TV volume with a strict lower threshold. Choose the TV and enter integer **volume** from `0` to `100`; the app divides that entry by `100` before comparing with Homey's normalized value.

The positive form passes only for a valid stored volume strictly above the threshold. At `20`, a stored `0.21` passes and `0.20` does not. It does not refresh the TV value or check its age. Unknown or invalid numeric state makes the positive form false. There are no output tokens; the threshold uses the custom card's `0–100` percentage scale.

Example: for Living Room TV's own speakers, check **Volume is larger than → 20** in a status Flow and notify yourself if the recorded level is above that threshold. Keep any external-speaker volume check on that speaker's own device.

### App/input is

The negative form is **App/input isn't**. Use this when a Flow should continue only if LG currently reports the selected foreground app/input. Choose the TV, search **app** and select the returned entry while the TV is on and connected. The selection stores its LG ID rather than matching the visible name each time.

When run, the app requests the current foreground app/input and checks for an exact match between its ID and the selected ID. It does not compare Homey's cached friendly **App or input** text, and an LG request failure is an error. This condition does not launch the selected item. It also does not prove that an app is playing content or that an HDMI source has a picture. There are no output tokens or measurement units.

Example: select a streaming app on Living Room TV and use **App/input is** in a user-started status Flow before sending a notification that LG reports that app in the foreground.
## THEN cards

THEN cards ask the TV to perform an action. On **every card**, select a paired TV, such as **Living Room TV**. Both **webOS TV (Auto)** and **webOS TV (Manual via IP)** devices are supported. The TV selection is required; there is no default TV. These cards require an active, authorised connection to the TV and do not wake the TV as part of the action.

Text and number fields can use compatible Homey input tokens instead of fixed values. A token must supply the same format as a value entered directly. Select dropdown and autocomplete choices from their lists. The Gallery-image card also accepts an **image token**. None of these THEN cards declares output tokens. **Request current TV source** delivers its result through a separate WHEN card, as explained below.

Most cards complete after receiving a non-error TV response. This establishes that the request was accepted at that point; the resulting picture, sound or playback still depends on the TV, its current app and connected equipment. Exceptions include remote-button delivery and the Gallery-image card, described in their sections. A disconnected TV, an unsupported operation or a TV-reported failure can make a card fail. The app does not automatically switch to a different control method when a command fails.

### Send an alert message with an okay button and optional timeout

Use this for a prominent TV message that can be dismissed with a button, such as a reminder that needs acknowledgement.

| Field | How to configure it |
| --- | --- |
| TV | Select the target paired TV. |
| Alert title | Optional text or text token. Leaving it blank sends no title. |
| Alert text | Required message text or a text token. |
| Button JSON ARRAY | Optional text containing a JSON **array** of button objects. Leave it blank for the app's built-in **Close** button only. |
| Timeout in seconds | Optional number or numeric token, measured in **seconds**. Enter a positive value, such as `10`, to request automatic closing. Blank or `0` sets no automatic close. There is no default timeout. |

Despite the card's “okay button” wording, the app always adds a button labelled **Close**. Custom buttons are added before it. If your TV accepts custom cancel buttons, this JSON requests an additional dismiss button labelled OK:

```json
[{"label":"OK","buttonType":"cancel","focus":true}]
```

Use double quotes and the surrounding square brackets. `label` supplies the button text; `buttonType: "cancel"` requests dismissal; `focus: true` requests initial focus. The app forwards custom button objects to LG. Its field help also shows `params` containing an app `id` and a `target` URL for an app-launch button, for example `{"id":"com.webos.app.browser","target":"https://example.com"}`. Support and the resulting action depend on the TV. The card does not return a token identifying a pressed button. Use an empty field or `[]` when no custom buttons are needed.

The timeout starts after the TV creates the alert. The Flow continues after creation; it does not wait for dismissal or for the timeout. Automatic closing is a later request and can fail, for example if the TV disconnects. Such a close failure is logged and does not change the already completed action. The card declares no timeout range and does not itself reject negative values; use a positive number or `0`, rather than a negative value. The automatic close depends on the app remaining running.

Invalid JSON, or JSON that is not an array, fails before an alert can be sent. A TV rejection fails the card. If LG returns no alert identifier, the error is **“Could not send an alert. Your TV probably does not support it!”** Alert availability and button behaviour vary by TV/webOS version.

**Example:** In a manually started Flow, select Living Room TV, leave the title and button field blank, enter `Reminder: your programme starts soon`, and set the timeout to `10` seconds. This requests one alert with a Close button and a later automatic close.

### Send a toast message

Use this for a brief, unobtrusive TV notification. The TV controls its appearance and display duration; this card has no duration or dismiss-button setting.

| Field | How to configure it |
| --- | --- |
| TV | Select the target paired TV. |
| Alert text (Required) | Required message text or a text token. |
| Image URL or Base64 (optional/might not be supported) | Optional image text or text token. Leave blank for a text-only toast. For an image URL, use a direct `http://` or `https://` URL whose response is the image itself. Raw Base64 image data is also accepted as input; see the format limits below. |

For a URL, Homey downloads the image and uses the response's content type. Supported non-TIFF image formats are placed within an 80 × 80 pixel icon area before sending. The image decoder must support the file and its content type. Use a direct image link rather than a webpage or a link that requires a redirect or sign-in.

Raw Base64 without a MIME prefix is sent with the image type **TIFF**; it is not automatically detected as PNG or JPEG. A full `data:image/...;base64,...` string is unreliable in this particular text field because its URL detection can treat it as a URL. Use a direct HTTP(S) image URL or the Gallery-image card for an image with a known format.

Image downloading, decoding and TV-request errors can fail this card. Toasts and especially toast icons are not supported consistently across LG models and webOS versions. A successful request does not guarantee that LG will show the image. There is no default icon.

**Example:** In a manually started Flow, select Living Room TV, enter `Your timer has finished`, and leave the optional image field blank. The same message field can contain a text token from another Flow card.

### Send a toast message with Gallery image (might not be supported)

Use this when an existing Homey image token should accompany a brief TV message, without supplying an image URL or copying Base64 text.

| Field | How to configure it |
| --- | --- |
| TV | Select the target paired TV. |
| Alert text | Required message text or a text token. |
| Image token | Drop or select an available **image** token in the card's image-token slot. This is an input to the card. It does not create an image or provide an output token. |

The app reads the image token's stream and content type, encodes the image, and uses the same toast-icon handling as **Send a toast message**. Supported non-TIFF images are placed within an 80 × 80 pixel icon area. If no image token reaches the action, the implementation sends a text-only toast; it does not supply a default image. The card has no display-duration setting.

An unavailable or unreadable image token can fail the action. This version can also complete the Gallery-image card without a visible toast when the image or TV notification cannot be processed. Therefore a completed Flow is insufficient evidence that the image or message appeared. LG support for Gallery-image toasts varies. For a message that must not depend on image handling, use **Send a toast message** with its optional image field blank.

**Example:** In a manually started Flow, select Living Room TV, enter `Here is the selected image`, and attach an existing Homey image token. The image token is supplied to the TV notification; there is no new image-token result from this card.

### Change the sound output

Use this to request a particular sound-output route on the TV.

| Field | How to configure it |
| --- | --- |
| TV | Select the target paired TV. |
| Select an output | Choose one of the fixed options below. There is no default specified by the card. |

The exact available choices are **TV speaker**, **External speaker**, **External optical**, **External ARC**, **Line out**, **Headphone**, **TV external speaker**, **TV speaker headphone**, and **Bluetooth soundbar**. The list is fixed in the app; it is not a detected list of outputs supported or currently connected on your TV. Use the option corresponding to a route available in the TV's own sound settings.

The card sends the selected route and fails if the TV reports an error. It does not connect or power an audio device, alter cabling, or set a volume. Whether a particular route can be selected and produces sound depends on the TV model, its settings and connected equipment.

**Example:** A manually started Flow selects Living Room TV and **TV speaker**, where that output is available on the TV. The card requests that route once.

### Change channel (number)

Use this when you already know the number of a tuned TV channel, or when a numeric Homey token supplies it.

| Field | How to configure it |
| --- | --- |
| TV | Select the target paired TV. |
| Channel | Required channel number or numeric token. The field has a minimum of `0` and a step of `1`; use a whole number. No default or maximum is declared. |

The app sends the number as a channel number to LG. It does not look up the channel first, send a sequence of remote-control digits, or choose a channel inside a streaming app or external receiver. The TV must have a corresponding tuned channel and support channel selection through its API. The numeric field is intended for whole channel numbers; use **Change the channel (list)** when you need an exact channel entry reported by the TV.

The card fails on a TV or connection error. A non-error response completes the action without waiting for a separate report confirming the tuned channel or picture.

**Example:** In a manually started Flow, select Living Room TV and channel `1`, if `1` is a valid tuned channel on that TV. A number token containing `1` can supply the same argument.

### Launch app

Use this to open an app reported by the TV.

| Field | How to configure it |
| --- | --- |
| TV | Select the target paired TV. |
| App | With the TV on and connected, type part of its app name and select a result from the autocomplete list. There is no default app. |

Results come from the TV's app list. Matching is a case-insensitive substring search of the app's **displayed name**, and results are sorted alphabetically by name. An empty search returns the full reported list. The search does not match hidden app IDs. Select the actual result; a plain text token containing an app name is not a substitute for the selected app entry.

The action launches the selected entry's app ID. The list depends on the TV, installed apps and LG's API; it is not a promise that every app shown on the TV's home screen will be returned. If the app list cannot be obtained, this version returns an empty list. A saved app selection can fail later if that app is removed or its ID changes.

TV launch errors fail the card. An accepted launch does not establish that the app has finished loading, signed in or started playing anything.

**Example:** In a manually started Flow, select Living Room TV, search for an installed app by name, and select it from the results. Running the Flow requests that app's launch once.

### Change the channel (list)

Use this to choose from the TV's own tuned-channel list rather than entering a channel number yourself.

| Field | How to configure it |
| --- | --- |
| TV | Select the target paired TV. |
| Channel | With the TV on and connected, search by channel name or number and select a result. There is no default channel. |

Each result shows the TV's channel name and its channel number. Matching is a case-insensitive substring search across the combined **number and name**. Results are sorted by the integer part of the channel number. An empty search returns the full reported channel list. The list comes from the TV's tuner service; it is not a list of channels inside an external receiver or streaming app. A plain text or numeric token does not replace the selected channel entry.

The card sends the selected entry's exact reported channel number. If the list cannot be obtained, this version returns an empty list. Refresh the selection if a retune changes the TV's channel list. TV or connection errors fail the action. A non-error response completes it without waiting for a separate channel-change report or picture.

**Example:** In a manually started Flow, select Living Room TV, search for a channel that is tuned on that TV, and choose its returned entry. The Flow requests that selected channel once.

### Simulate remote control button

Use this for one remote-control button press, particularly for navigation in the TV's currently focused interface.

| Field | How to configure it |
| --- | --- |
| TV | Select the target paired TV. |
| Button | Choose one of the fixed dropdown options below. No default button is declared. |

The exact options are:

- Navigation: **Left**, **Right**, **Up**, **Down**, **Home**, **Back**, **Dash**, **Info**, **Ok**, **Menu**, **Exit**.
- Other TV controls: **Rec/\***, **Subtitles**, **Volume up**, **Volume down**, **Mute**, **Channel up**, **Channel down**.
- Digits: **1**, **2**, **3**, **4**, **5**, **6**, **7**, **8**, **9**, **0**.
- Playback: **Play**, **Pause**, **Stop**, **Rewind**, **Fast forward**.
- Colour buttons: **Red**, **Green**, **Yellow**, **Blue**.

This is a fixed list; the TV does not populate it. Despite the selection-field hint about the TV being on, the choices themselves are not downloaded from the TV. The TV must be on and connected for delivery. The action sends one press, with no repeat count, hold duration or automatic repeat. Its effect depends on the focused TV menu or app, and may differ from a dedicated channel, app or playback card.

Completion means the button was written to the TV's input connection. LG provides no button-action acknowledgement here, so completion does not prove that the visible interface reacted. Connection setup, a closed input connection or a write timeout can fail the card. A timeout can leave delivery unknown; avoid assuming that the press was never sent.

**Example:** In a manually started Flow, select Living Room TV and **Home** to request a single Home-button press. Use a specific app or input card when that is the intended destination.

### Switch to external input

Use this to select an external input reported by the TV, such as an HDMI port.

| Field | How to configure it |
| --- | --- |
| TV | Select the target paired TV. |
| Input | With the TV on and connected, type part of the input's label and select a result from the autocomplete list. There is no default input. |

Results come from LG's external-input list. The search matches a case-insensitive substring of the **input label**, including a renamed label returned by LG. It sorts results alphabetically by label. An empty search returns the full reported list. It does not filter results to connected or signal-present inputs, and it does not search by a hidden input ID. A plain text token such as `HDMI 1` does not replace a selected input entry.

The app sends the selected entry's input ID. If the external-input list cannot be obtained, this version returns an empty list. A TV or connection error fails the action. Completion does not prove that an attached player is on, ready, or supplying a picture; the card only requests the TV input selection.

**Example:** In a manually started Flow, select Living Room TV, search for `HDMI`, and choose the intended input from the returned list. The displayed label may differ if that input has been renamed.

### Request current TV source

Use this to ask LG for a fresh report of the foreground TV app or input, even if it has not just changed.

| Field | How to configure it |
| --- | --- |
| TV | Select the target paired TV. There are no other fields, defaults or input-token slots. |

This action requests the current source and then triggers **The TV source was reported** for the same TV. Use that WHEN card in a separate Flow to receive **Source ID** and **Reported at (epoch ms)**. The latter is a numeric timestamp in **milliseconds since the Unix epoch**, captured when Homey receives the TV's response. These are the WHEN card's output tokens; this THEN card has no output tokens of its own. A source ID identifies the foreground app or input, rather than a friendly display name.

The action fails if source reporting is unavailable, if another explicit source request is already pending, if the TV reports a request error, or if LG returns an unusable source ID. A returned response is rejected if its connection or source report has been superseded while waiting; a newer source report can therefore prevent an older result from being delivered. Failure to deliver the report trigger also fails the action. The card has no configurable timeout and does not change the source.

**Example:** Flow A is manually started and runs **Request current TV source** for Living Room TV. Flow B starts with **The TV source was reported** for that TV and uses its **Source ID** token in a log or notification. Flow B can also receive other reports emitted by that WHEN card.

### Play

Use this when the intended command is explicitly **Play**, without inferring whether the content is currently paused.

| Field | How to configure it |
| --- | --- |
| TV | Select the target paired TV. There are no other arguments, defaults or input-token slots. |

The app sends one LG media **Play** command. It provides no content, app, playback-position or speed setting. The active TV app or media session must support the command; control of an external HDMI player is not guaranteed.

The card completes only when LG explicitly acknowledges the playback request. A TV rejection, an unacknowledged response, disconnection or request error fails the action. Even an acknowledgement does not establish actual playback or update a measured playback-state report. Play also contributes to the command history used by the deprecated toggle card.

**Example:** A manually started Flow runs **Play** for Living Room TV while a supported TV media app already has content ready to resume.

### Pause

Use this when the intended command is explicitly **Pause**, such as a user-selected pause action.

| Field | How to configure it |
| --- | --- |
| TV | Select the target paired TV. There are no other arguments, defaults or input-token slots. |

The app sends one LG media **Pause** command. It has no pause-duration or automatic-resume setting. Support depends on the active TV app or media session, and control of an external HDMI player is not guaranteed.

The card completes only when LG explicitly acknowledges the playback request. A TV rejection, an unacknowledged response, disconnection or request error fails the action. An acknowledgement does not establish that playback has physically paused or provide measured playback-state tokens. Pause also contributes to the command history used by the deprecated toggle card.

**Example:** A manually started Flow runs **Pause** for Living Room TV during playback in a TV app that supports pausing. A separate user action can run **Play** to resume.

### Toggle Play/Pause command

This is a **deprecated** card retained for existing Flows. Use explicit **Play** and **Pause** cards for new Flows where the intended operation is known.

| Field | How to configure it |
| --- | --- |
| TV | Select the target paired TV in an existing Flow. There are no other arguments, defaults or input-token slots. |

The card chooses its next command from the app's **Homey command history**, not from a measurement of actual playback. If the most recently tracked, acknowledged command was Play, it sends Pause; otherwise it sends Play. With no remembered command, including after a reconnect or app restart, the next command is Play.

The explicit Play and Pause cards and the Homey play/pause device control contribute to this history. Changes made with the TV's remote, within an app, by another controller, or through **Simulate remote control button** do not establish the current playback state for this toggle. An uncertain result or overlapping Play/Pause commands can clear the remembered history. A definite LG rejection preserves the previous command history. These rules mean the toggle can issue Play when the content is already playing, or Pause when it is already paused.

If a Play or Pause command is still pending, the toggle fails with **“A Play or Pause command is still pending”**. Its selected command is subject to the same LG acknowledgement and app-support limits as the explicit Play and Pause cards. The card does not return actual playback state.

**Example:** In an existing manually started Flow for Living Room TV, after an acknowledged Play sent through the app and with no intervening controls, this card requests Pause. Use the explicit **Pause** card if Pause is the operation you require.

### Fast forward

Use this to request the active TV media session's fast-forward operation.

| Field | How to configure it |
| --- | --- |
| TV | Select the target paired TV. There are no other arguments, defaults or input-token slots. |

This sends one LG media **Fast forward** command. It is a playback transport command, not a channel-up command. It has no seconds-to-skip, speed, repeat-count or hold-duration argument. The active app decides what the command does and whether it is supported; seekable content and an app that supports seeking are required for a useful effect. Control of an external HDMI player is not guaranteed.

The card completes only on LG's explicit acknowledgement. A rejection, unacknowledged response, disconnection or request error fails it. An acknowledgement does not establish a particular seek distance or actual playback position. It does not change the Play/Pause command history used by the deprecated toggle.

**Example:** A manually started Flow sends **Fast forward** once to Living Room TV during seekable content in a supported TV media app. Use **Play** separately when that app requires a Play command to leave fast-forward mode.

### Rewind

Use this to request the active TV media session's rewind operation.

| Field | How to configure it |
| --- | --- |
| TV | Select the target paired TV. There are no other arguments, defaults or input-token slots. |

This sends one LG media **Rewind** command. It is a playback transport command, not a channel-down command. It has no seconds-to-skip, speed, repeat-count or hold-duration argument. The active app decides what the command does and whether it is supported; seekable content and an app that supports seeking are required for a useful effect. Control of an external HDMI player is not guaranteed.

The card completes only on LG's explicit acknowledgement. A rejection, unacknowledged response, disconnection or request error fails it. An acknowledgement does not establish a particular seek distance or actual playback position. It does not change the Play/Pause command history used by the deprecated toggle.

**Example:** A manually started Flow sends **Rewind** once to Living Room TV during seekable content in a supported TV media app. Use **Play** separately when that app requires a Play command to leave rewind mode.
## Standard Homey cards and relevant settings

This section covers Local webOS TV Controller 2.0.5. Homey adds standard device cards alongside the app's own cards. Their English names below come from Athom's capability definitions; wording, translations and availability can vary with your Homey software and app version. Choose your paired television in the Flow editor and use the cards shown for that device. Both **webOS TV (Auto)** and **webOS TV (Manual via IP)** use the same TV controls. [Homey explains how device capabilities supply Flow cards.](https://apps.developer.homey.app/the-basics/flow)

For a When card, select the television and add the actions to run when the event occurs. For an And card, add it after a trigger to decide whether that Flow may continue. For a Then card, select the television and provide the value described below, if any. Examples use an imaginary television named **Living Room TV**.

### Power

The standard power cards use Homey's stored on/off state. A successful wake request can change this state before the TV has finished waking. Use the app's **The TV was confirmed on** card when a later action needs an LG Active report; even that confirmation does not prove an external source is ready.

| Standard card | Type | Purpose and setup | Example |
| --- | --- | --- | --- |
| Turned on | When | Runs when the TV's Homey on/off value changes to on. No numeric parameter or unit. | When Living Room TV turns on, switch on an ambient light. |
| Turned off | When | Runs when the Homey on/off value changes to off. No numeric parameter or unit. Treat it as the app's reported state. | When Living Room TV turns off, dim an ambient light. |
| Is turned on / Is turned off | And | Checks the stored on/off value; invert the condition for off. No numeric input. It does not send a fresh power query. | When a lighting scene starts, and Living Room TV is turned on, keep the screen-side light dim. |
| Turn on | Then | Sends Wake-on-LAN to the configured TV MAC address. Enter the MAC in device settings and enable the TV's network-wake option where supported. Homey must be able to deliver the wake packet on your network. No card parameter. | When a viewing Flow starts, turn on Living Room TV; sequence source selection using the app's confirmed-on event. |
| Turn off | Then | Sends the TV's normal standby command over the paired network connection. No card parameter. | When a bedtime Flow starts, turn off Living Room TV. |
| Toggle on or off | Then | Chooses on or off from Homey's current stored state. No card parameter. Use explicit Turn on or Turn off when the intended result is known. | Assign one remote button to toggle Living Room TV when its reported power state is dependable. |

These operations are normal TV wake/standby controls. [Athom's on/off card definitions.](https://github.com/athombv/node-homey-lib/blob/83fdbb5781cafccd46149b56f485b6547700363b/assets/capability/capabilities/onoff.json)

### Volume and mute

In the standard Homey percentage control, **20%** means a normalized capability value of **0.20**. Developer API or HomeyScript calls to `volume_set` use **0–1**; they must not send `20` to mean 20%. The app converts 0.20 to the LG numeric value 20. The app's own volume comparison cards use whole values from **0–100**, as described in their entries. A Homey percentage label does not establish that the TV and a connected sound system share a scale.

Use the sound system's own Homey device for numeric Sonos volume, with its own limits. Do not copy a TV value into a Sonos card or automatically restore a guessed level. Explicit TV mute and unmute are available independently of numeric volume control.

| Standard card | Type | Purpose, inputs and units | Example |
| --- | --- | --- | --- |
| The volume changed | When | Runs when the reported numeric TV volume changes. Supplies a **Volume** numeric tag. Homey uses a 0–1 value for this capability and may display it as a percentage. Only usable LG numeric reports update it; a retained value is not a new measurement. | When Living Room TV's volume changes, put its Volume tag in a notification. If using the tag in code, 0.20 represents 20%. |
| Set the volume to | Then | Select an absolute percentage in Homey's control; developer input is 0–1, in steps of 0.01. Start with the TV speakers or a supported external-output configuration that reports a dependable volume. | Set Living Room TV to 15% with TV speakers selected; the equivalent API value is 0.15. |
| Set relative volume | Then | Adds or subtracts percentage points from Homey's stored volume. The UI range is −100 to +100 percentage points, in one-percentage-point steps; the underlying relative value is −1 to +1, in steps of 0.01. Use only when the existing reading is current and its scale is known. This is different from one volume-up/down command. | With a current 15% reading, a +2-point change requests 17%; the underlying offset is +0.02. |
| Turn the volume up | Then | Sends one LG volume-up command. No numeric argument. The audible result and step size depend on the TV and selected sound output. | One press of a remote button sends one volume-up command to Living Room TV. |
| Turn the volume down | Then | Sends one LG volume-down command. No numeric argument. It does not promise a fixed number of decibels or a fixed step on an external sound system. | One press of a remote button sends one volume-down command. |
| Mute the volume | Then | Explicitly requests mute. No numeric argument; it does not set the level to zero. | When a doorbell Flow starts, mute Living Room TV. |
| Unmute the volume | Then | Explicitly requests unmute. No numeric argument. The existing sound level remains relevant, so unmute deliberately. | A separate remote button unmutes Living Room TV. |
| Toggle muted volume on or off | Then | Reverses Homey's stored mute state. No numeric argument. Prefer explicit mute/unmute when the required result is known or reporting is uncertain. | A single remote button toggles mute after checking that mute reporting works with the chosen sound output. |

[Athom's volume and relative-volume definitions](https://github.com/athombv/node-homey-lib/blob/83fdbb5781cafccd46149b56f485b6547700363b/assets/capability/capabilities/volume_set.json), [volume up](https://github.com/athombv/node-homey-lib/blob/83fdbb5781cafccd46149b56f485b6547700363b/assets/capability/capabilities/volume_up.json), [volume down](https://github.com/athombv/node-homey-lib/blob/83fdbb5781cafccd46149b56f485b6547700363b/assets/capability/capabilities/volume_down.json), and [mute definitions](https://github.com/athombv/node-homey-lib/blob/83fdbb5781cafccd46149b56f485b6547700363b/assets/capability/capabilities/volume_mute.json).

The app supplies its own **Volume muted**, **Volume unmuted** and muted-condition cards; those are described in the app-card catalogue. They are not extra standard cards inferred from the mute button.

### Channels and reported source labels

Channel up/down controls the TV's own tuner. It does not provide a generic way to change channels on a box connected by HDMI. Select Live TV and make sure the TV has its channels set up before using these actions.

| Standard card | Type | Purpose, inputs and units | Example |
| --- | --- | --- | --- |
| One channel up | Then | Sends one TV-tuner channel-up command. No channel number or other argument. | When a remote button is pressed while watching Live TV, move Living Room TV one channel up. |
| One channel down | Then | Sends one TV-tuner channel-down command. No argument. | A second remote button moves Living Room TV one channel down. |
| The artist changed | When | In this app, **Artist** means **App or input**, not a music artist. The string tag contains a display label such as Live TV or HDMI2. No filter parameter. Labels can be blank while the source is unknown or its name is being refreshed. | When App or input changes, show the new label in a dashboard or notification. |
| The track changed | When | In this app, **Track** means **Channel**. The string tag can contain a number and channel name, such as `7 \| Example Channel`. It is blank outside Live TV, during source changes, after a disconnect or when there is no usable tuner report. No filter parameter. | When Channel changes, send a notification only if the Channel tag is non-empty. |

The app titles the underlying fields **App or input** and **Channel**. Some Homey-generated cards still say Artist or Track. For source selection or an exact source ID, use the app's source cards; **The TV source was reported** also supplies a report time and can deliver a fresh report when the source stays the same. A display-label change is not the same event as a fresh source report. [Athom's channel-up](https://github.com/athombv/node-homey-lib/blob/83fdbb5781cafccd46149b56f485b6547700363b/assets/capability/capabilities/channel_up.json), [channel-down](https://github.com/athombv/node-homey-lib/blob/83fdbb5781cafccd46149b56f485b6547700363b/assets/capability/capabilities/channel_down.json), [Artist](https://github.com/athombv/node-homey-lib/blob/83fdbb5781cafccd46149b56f485b6547700363b/assets/capability/capabilities/speaker_artist.json), and [Track](https://github.com/athombv/node-homey-lib/blob/83fdbb5781cafccd46149b56f485b6547700363b/assets/capability/capabilities/speaker_track.json) definitions.

### Standard media controls

The app adds Homey's media capabilities when the device starts, so media cards may appear beside the explicit app cards. Their operation depends on the foreground TV app accepting the LG media command. These cards are not a promise to control every HDMI source or streaming app. For new Flows, the app's explicit **Play**, **Pause**, **Fast forward** and **Rewind** cards make the intended command clearest.

| Standard card | Type | Purpose and setup | Example |
| --- | --- | --- | --- |
| Play | Then | Sends LG's Play command to the foreground TV app. No arguments or units. Start a playable item in a compatible app first. | A remote's Play button resumes a paused item in a compatible TV app. |
| Pause | Then | Sends LG's Pause command. No arguments or units. It is a playback request rather than evidence that the player paused. | A remote's Pause button pauses the current item when the TV app supports it. |
| Toggle Play/Pause | Then | Homey's standard toggle uses its stored playing value to choose Play or Pause. No arguments. The app does not subscribe to the player's true playing state, so remote-driven changes can leave this value out of date. | Use separate Play and Pause buttons for predictable requests. Keep a standard toggle only where its local behaviour has been checked. |
| Next | Then | This app maps Homey's Next capability to LG **Fast forward**. No arguments or units; no fixed seek distance is specified. It is not a next-track or next-episode guarantee. | While playing a compatible item, a forward button requests fast-forward. |
| Previous | Then | This app maps Homey's Previous capability to LG **Rewind**. No arguments or units; no fixed seek distance is specified. | While playing a compatible item, a back button requests rewind. |

Some Homey versions also expose the following legacy media-state cards. They have no user-entered TV command or playback-position argument; select the TV as usual. Their presence does not mean that LG supplies dependable playback or album feedback.

| Legacy standard card | Type | Meaning and limitation in this app |
| --- | --- | --- |
| Started playing | WHEN | Responds to Homey's playing value becoming true. Do not use it as confirmation that a TV programme or recording visibly started. |
| Stopped playing | WHEN | Responds to Homey's playing value becoming false. It does not distinguish pause, stop, a player change or an unchanged physical picture reliably. |
| Is playing / Is not playing | AND | Checks Homey's retained playing value, with the negative form inverted. It does not ask LG for the true current playback state. Use an explicit command when you know the intended action. |
| The album changed | WHEN | Would carry Homey's Album text Tag if that field changed. The app does not populate a useful album value, so this is not an effective TV automation trigger. |

 Version 2.0.5 does not publish an independently observed playing state or an album value. Do not use these cards as proof of actual playback or build an album-change automation around them. The app's deprecated **Toggle Play/Pause command** card is a separate app card with its own command-history behaviour; its deprecation does not describe Homey's standard toggle. [Athom's playing](https://github.com/athombv/node-homey-lib/blob/83fdbb5781cafccd46149b56f485b6547700363b/assets/capability/capabilities/speaker_playing.json), [Next](https://github.com/athombv/node-homey-lib/blob/83fdbb5781cafccd46149b56f485b6547700363b/assets/capability/capabilities/speaker_next.json), [Previous](https://github.com/athombv/node-homey-lib/blob/83fdbb5781cafccd46149b56f485b6547700363b/assets/capability/capabilities/speaker_prev.json), and [Album](https://github.com/athombv/node-homey-lib/blob/83fdbb5781cafccd46149b56f485b6547700363b/assets/capability/capabilities/speaker_album.json) definitions.

### Device settings used by these cards

Open the paired television's settings in Homey. In a working installation, the defaults are a useful starting point. A setting for power detection does not enable or disable source/channel reporting: those reports have their own subscriptions.

| Setting | Default | When it matters |
| --- | --- | --- |
| Timeout power listener | 2000 milliseconds | Delay used when interpreting power-listener reports. Relevant to the standard power state and related events. Increase cautiously if a TV's transitions are being reported unreliably. It is not a delay between Flow actions. |
| Use polling instead of power listener | Off | Off uses the power listener, including **The TV was confirmed on**. Turning it on selects an alternative on/off estimate from network checks and disables that listener and confirmation event. Source, channel, sound-output and volume reporting remain separate. Polling reachability is not an LG Active confirmation. |
| Poll interval | 10 seconds | Time between power checks when polling is enabled. Allowed range: 5–3600 seconds. It does not set the refresh interval for channel or source reports. |
| Poll timeout | 8 seconds | Time allowed for each polling power check. Keep this lower than Poll interval. Allowed range: 0–3600 seconds. |
| Step volume for this audio output | Off | Optional numeric-volume method for HDMI ARC, Optical or Bluetooth soundbar. Choose it only when the TV reliably reports that output's volume. This setting does not switch the TV's sound output. See the requirements below. |
| Set the IP address manual | Off for Auto; on for Manual via IP | Keeps a chosen TV address rather than following automatic address updates. Use a stable address for a manual setup. |
| The IP address of the TV | Learned during setup | Homey needs network access to this TV address for paired local commands. If it changes in a manual setup, update it here. |
| MAC address of the TV | Learned or entered during setup | Required by Turn on / Wake-on-LAN. Use the MAC of the TV interface that will receive wake packets, formatted like `AA:BB:CC:DD:EE:FF`. Successful pairing while the TV is awake does not by itself establish standby wake support. |

For a new TV, use **Auto** when discovery finds it or **Manual via IP** when entering its network address directly. Keep the TV awake for initial authorisation and for list selections that need its current apps, inputs or channels. A manually reachable TV on another network segment may still need additional network support for Wake-on-LAN; a working ordinary command does not prove wake reachability.

#### Optional external-output volume stepping

With this option off, Set volume sends LG an absolute-volume request. If you opt into stepping for an output and that exact output is active, the app first requests a fresh volume reading, then sends volume-up/down steps towards the target and checks new readings. It needs an active, unmuted report for the selected output with a supported 0–100 scale. It stops with an error when that evidence is unavailable, when the volume fails to move as requested, when the output/connection changes, or when its limits are reached. Acknowledging a command is not a measured volume.

This option does not make every external speaker compatible and does not turn LG values into Sonos values. Keep Sonos numeric volume on the Sonos device. Do not use a retained Homey volume reading as the starting point for a relative-volume Flow unless it is current and its scale is established.

#### Input picker and older tags

The **Input** picker is a control on the Homey TV device. Select an HDMI label there to request that input; reported TV input changes update the selection. It is not a separate Flow card. Use the app's input/app actions in Flows.

Older devices may retain the `webos_display.app` and `webos_display.channel` tags. Version 2.0.5 mirrors the current guarded reports into them when they already exist. Use **App or input** and **Channel** for new Flows. A stored label or tag can be blank or out of date while disconnected or awaiting a report; it does not carry the timestamp or freshness evidence supplied by the source-reported event.
## Worked Flow examples

The names “Living Room TV” and the channel/input choices below are examples. Choose your own paired TV and the entries it returns. These examples describe Flows to build; they do not create or run anything automatically.

### Choose an HDMI input after a confirmed wake

For a TV whose startup time varies, use an event-driven sequence instead of assuming that five seconds is enough.

A simple always-on-startup arrangement is:

1. A button, schedule or other trigger starts a Flow whose THEN action is the TV's **Turn on**.
2. A separate Flow has **WHEN → The TV was confirmed on** for that TV.
3. Its THEN action is **Switch to external input → your chosen HDMI input**.

The second Flow runs for qualifying confirmations from any wake source and can also run after the app reconnects while the TV is already on. Use it only if you want that startup behaviour every time. LG Active is a useful sequencing point; it does not promise that every third-party app or attached player has completed its own startup.

To enable this behaviour only for selected startup Flows, add a Homey Logic Yes/No variable such as **Use HDMI3 on confirmed ON**, initially **No**:

1. Add **AND → Use HDMI3 on confirmed ON is Yes** to the confirmed-ON Flow before the HDMI action.
2. Set the variable to **Yes** when you want that startup rule enabled, and **No** when you want the TV to keep its own selected input.
3. Keep other startup actions in their own Flows with their own conditions. Adding this card to one Flow does not automatically trigger all your other startup Flows.

Changing the variable to Yes does not itself select an input or generate a confirmation. This variable is a persistent preference, not a pending command. While it is Yes, any qualifying confirmation—including a new connection while the TV is already on—can run the HDMI action. It stays enabled until you or another Flow changes it. If the TV is already on and ready and you simply want to change input now, use the input-switch action directly rather than waiting for another confirmed-ON event. The confirmation does not carry a request ID linking it to one earlier Turn on action.

### Keep a fresh source record even when HDMI has not changed

Create a Logic Text variable **TV source ID** and a Number variable **TV source reported at**.

1. **WHEN:** The TV source was reported.
2. **THEN:** Save the **Source ID** Tag to TV source ID.
3. **THEN:** Save **Reported at (epoch ms)** to TV source reported at.

A separate button or scheduled Flow can use **Request current TV source** while the TV is connected. A valid request response starts the report Flow even if the source ID is unchanged. Do not expect the action itself to export the two Tags: the WHEN card supplies them.

If another Flow needs to act on the returned source, do that from the report Flow using its Tags. Merely placing **Request current TV source** before another action does not create a “wait until HDMI3” condition.

### React only when a particular app is selected

1. **WHEN:** App or input changed to.
2. Select Living Room TV and choose the app from its suggestions.
3. **THEN:** Apply the appropriate lighting scene.

This is different from **The TV source was reported**, which can fire repeatedly for the same source. Use the change trigger for a transition; use the report trigger when fresh observations matter.

### Select a broadcast channel

With the TV connected and on ordinary Live TV, create a Flow whose THEN card is **Change the channel (list)** and select a channel returned by the TV.

Use the list version when channel numbering includes leading zeros or subchannels. The **Channel changed** trigger can then start a separate Flow that uses its Current channel Tag. Channel selection on an HDMI set-top box belongs to that box's integration.

### Send a plain TV notification

Use **Send a toast message**, enter a short Message, and leave the icon field empty. For example: `The washing machine has finished.`

The toast is a brief TV message. Choose the alert card instead when you need a title, a close button or a specified auto-close timeout. Use the image-token card only when your TV supports it.

### Control an existing recording without guessing state

With a compatible recording already playing, attach **Pause** to one button/Flow and **Play** to another. Use **Fast forward** and **Rewind** for transport navigation. Return to ordinary playback with Play where that player supports it.

An ordinary live broadcast needs the TV's Live Playback/time-shift feature and a usable buffer before it can pause or seek. These cards do not start a USB recording, create a time-shift buffer or turn the service on.

## Choosing the right card and resolving common problems

| Need or observation | Which card or check to use |
| --- | --- |
| “The TV was switched on; now select HDMI.” | Prefer the confirmed-ON pattern above when the power listener is in use. An ordinary Turn on completion is not the same event. |
| “I want the current source even if it is still HDMI3.” | Request current TV source, received by The TV source was reported. |
| “Only react when the source actually changes.” | App or input changed, or its selected-target version. |
| A source/tag is a friendly name but a comparison expects an ID. | Use Source ID or Current app or input; do not compare the readable label with a raw ID. |
| App/channel/input suggestions are empty. | Keep the TV on and connected, select the correct TV device, and choose a returned suggestion. LG decides which entries it exposes. |
| A tuner check fails or Channel is blank while an app/recording is open. | Channel cards describe the internal Live TV tuner. A blank field is not a playback failure. |
| Channel is temporarily blank on Live TV. | LG can return no usable tuner report during a transition. The field updates when a valid report arrives; the released app does not include the experimental channel retry. |
| A particular source is present but has no picture. | An HDMI selection reports the TV's port, not whether the attached player is powered, booted or supplying video. |
| An AND condition is false. | It ends that branch; use an appropriate WHEN event if the Flow should start later when the state changes. |
| A command returns an error. | Check connection, the active TV/player context and the selected argument. In Advanced Flow, route the card's error output to a notification or other deliberate response. |
| A generic Playing/Paused indicator disagrees with the picture. | Use explicit Play/Pause commands; the app does not have reliable universal playback-state feedback. |
| TV volume and soundbar volume disagree. | Use the sound system's own integration for exact volume. They are different reported levels. |
| A saved diagnostic card from 1.0.51 is missing. | The experimental Capture raw LG application diagnostics action was retired. Remove it from that Flow; the ordinary source-report/request cards remain. |

## Further help

For release history and compatibility notes, see [README](README.md), the [2.0.5 cumulative changelog](CHANGELOG-2.0.5.md) and the [history back to Max's original app](CHANGELOG-2.0.0.md).

For basic Flow/Tag use, see [Homey's Logic guide](https://support.homey.app/hc/en-us/articles/4410240765586-Use-Logic-in-Flows). Share ordinary app results or questions in the [Homey Community topic](https://community.homey.app/t/lg-webos-better-integration/15007). Include the app version, TV model, webOS version, the relevant card and what the TV visibly did.
