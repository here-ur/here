# Menu artwork

Source: user-provided Figma file `LRReRltHxTKQURnYxXUPOx`, frame `455:209` at 393 × 852. These are original layer assets, not UI screenshots.

| Asset | Figma layer | Intrinsic dimensions / reference placement |
| --- | --- | --- |
| `sunlit-background.png` | `455:210` | 941 × 1672; placed at x -95, y 0, 558 × 992 |
| `garden.svg` | `455:327` | 24 × 24; x 32, y 88 |
| `library.svg` | `455:338` | 24 × 24; x 32, y 144 |
| `friends.svg` | `455:344` | 24 × 24; x 32, y 200 |
| `help.svg` | `455:352` | 24 × 24; x 32, y 256 |
| `character.svg` | `455:357` | 24 × 24; x 32, y 314 |
| `settings.svg` | `455:369` | 24 × 24; x 32, y 708 |

`Drawer.tsx` uses these SVGs at their intrinsic size in Framework7 ListItem controls. `drawer-menu.css` defines the panel geometry: width 337, right corner radius 48, top padding 72, bottom padding 48; rows are 56px tall with 32px horizontal padding and a 10px icon-to-text gap. Labels use Pretendard 18/600, letter spacing -0.36px, color #393a3c; panel color is #faf9f3. The 27 × 2 divider starts at x 32, y 296.

The cat asset from layer `455:213` is byte-identical to `public/home/main-cat.png` and is reused at x -188, y 202, 770 × 420. Per the user's follow-up, the decorative status bar and home indicator from Figma are omitted. Keep the menu layout in its existing position.

The footer uses actual API quota data; the design's 200 is an example, not a hardcoded balance. Menu navigation, settings, keyboard focus trapping, Escape, and outside-click dismissal remain interactive. A close button becomes visible when keyboard-focused. The settings contents are not part of this Figma frame and retain their existing controls.
