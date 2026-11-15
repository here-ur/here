# Home artwork

Source: the user-provided Figma file `LRReRltHxTKQURnYxXUPOx`, frame `455:164` (393 × 852).

| Asset | Figma layer | Placement at reference size | Used by |
| --- | --- | --- | --- |
| `sunlit-background.png` | `455:378` | x -95, y -24, 583 × 1036 | `HomeScreen.tsx` (home background) |
| `main-cat.png` | `455:204` | x -188, y 251, 770 × 420; transparent original asset | `Drawer.tsx` (cat behind the open menu). Not drawn on the home itself. |
| `menu.svg` | `455:772` | 28 × 28, inside the 48 × 48 menu button at x 16, y 67 | Unused. Kept as the Figma original. |
| `chat.svg` | `455:782` | 24 × 24, inside the 48 × 48 button at x 257, y 748 | Unused. Kept as the Figma original. |
| `microphone.svg` | `455:778` | 24 × 24, inside the 48 × 48 button at x 321, y 748 | Unused. Kept as the Figma original. |

Only the background comes from this frame. `HomeScreen.tsx` draws `sunlit-background.png`, and `home-scene.css` defines the responsive layout and the two original gradient layers. These are individual assets, not a screenshot of the UI.

The home buttons (menu, text chat, microphone, send, end call) use the shared `Icon` from `src/app/art.tsx` (`framework7-icons`) instead of the three SVGs above, and keep their existing handlers and accessible names. Controls continue using the shared Framework7 components.

The cat and button layout follow the earlier home, not this frame. The cat is `PoseCat` (`src/app/PoseCat.tsx`): the `Buddy` base strolls sideways while the home is resting, and swaps to pose clips and stills for taps and idle reactions (rules in `src/lib/cat-poses.ts`, timers in `src/app/use-cat-reactions.ts`). During text and voice conversation it stays on the existing `Buddy` states. With reduced motion, the stroll and the looping pose clips are turned off.

Per the user's follow-up, the decorative status bar and white home indicator from Figma are omitted. Do not add them back.
