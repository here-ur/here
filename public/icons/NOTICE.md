# Iconsax Free icons

Source: official `iconsax@0.1.1` npm package (free category data only).
Copyright Iconsax. https://iconsax.io
License: https://docs.iconsax.io/license-and-terms/license

Integrated into the Here application source, not distributed as an icon pack.
Monochrome color inheritance, close icon rotation, and proportional keyline alignment were adapted.

## Grid and stroke

- Base grid: 24 × 24px.
- Painted keylines: square 18 × 18, circle 20 × 20, horizontal 20 × 16, vertical 16 × 20.
- Center at (12, 12); preserve source proportions.
- Narrow navigation chevrons share a 16px painted height with the speaker, for optical balance in the top bar.
- Line icons use a final 1.5px stroke at the 24px base size; compensate for the inner keyline transform. Filled icons retain their original fills.
- Smaller/larger icon sizes scale from this base grid. Main onboarding controls use 24px.
- Reference: https://www.krds.go.kr/html/site/style/style_06.html
- Source geometry: scripts/icons/iconsax-free.source.svg. Rebuild and verify with npm run icons:build.
- Figma artwork (sleep badge, wave and star) is separate from the UI icon sprite.
The linked speaker is volume-high / Twotone; mute uses volume-slash / Twotone.

## Source mapping

- help: message-question / linear
- down: arrow-down-02 / linear
- back: arrow-left-02 / linear
- forward: arrow-right-01 / linear
- log: task / linear
- mic: microphone / linear
- stop: stop / bold
- micOff: microphone-slash / linear
- keyboard: keyboard / linear
- soundOn: volume-high / twotone
- soundOff: volume-slash / twotone
- send: arrow-up-01 / linear
- hangUp: call-slash / linear
- captions: subtitle / linear
- info: info-circle / linear
- lock: lock / linear
- phone: call / linear
- email: sms / linear
- close: add / linear
- pin: location / linear
- add: add / linear
- menu: menu / linear
- library: book-open / linear
- sparkles: magic-star / linear
- paintbrush: paint-brush / linear
- pencil: edit-2 / linear
- check: tick-circle / linear
- chat: message-bubble / linear
- paw: pet / bold
- refresh: refresh-right / linear
- chev: arrow-right-02 / linear
- chev2: arrow-right-02 / linear
- arrow: arrow-right-01 / linear
- heart: heart / bold
- sparkle: magic-star / linear
- star: magic-star / bold
- dice: shuffle / linear
- clock: clock / linear
- calendar: calendar / linear
- profile: profile / bulk
- wind: wind / linear
- drop: drop / linear
- grid: grid-4 / linear
- flame: fire / bold
- sun: sun / linear
- notification: notification / linear
- cake: cake / bold
- swap: arrow-swap-01 / linear

- checkFilled: tick-circle / bold (official Iconsax Free page, user-selected 2026-11-28). Filled geometry retains its original cutout; no added stroke.

- heartCircle: heart-circle / bold

- badgeEdit: edit-2 / bold
- badgeClock: clock / bold
- badgeChat: message-bubble / bold
- badgeProfile: profile / bold
- badgePhone: call / bold
