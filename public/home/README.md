# Home artwork

Current home background: `sunlit-living-room.png`, supplied by the user on 2026-11-17. Render edge-to-edge with `object-fit: cover` and bottom-center alignment. Preserve the original colors; the earlier zoom/gradient overlays are removed. Next Image provides responsive image optimization.

## Earlier Figma artwork

Source: the user-provided Figma file `LRReRltHxTKQURnYxXUPOx`, frame `455:164` (393 × 852).

| Asset | Figma layer | Placement at reference size | Used by |
| --- | --- | --- | --- |
| `sunlit-background.png` | `455:378` | x -95, y -24, 583 × 1036 | Retained original; replaced on the home by `sunlit-living-room.png` |
| `main-cat.png` | `455:204` | x -188, y 251, 770 × 420; transparent original asset | `Drawer.tsx` (cat behind the open menu), and `CatArtwork` for the 2.4-second yawn before voice opens. Not drawn on the resting home. |
| `menu.svg` | `455:772` | 28 × 28, inside the 48 × 48 menu button at x 16, y 67 | Unused. Kept as the Figma original. |
| `chat.svg` | `455:782` | 24 × 24, inside the 48 × 48 button at x 257, y 748 | Unused. Kept as the Figma original. |
| `microphone.svg` | `455:778` | 24 × 24, inside the 48 × 48 button at x 321, y 748 | Unused. Kept as the Figma original. |

`main-cat.png` remains in the voice-start yawn and behind the open menu. The home now uses the user-supplied living room artwork described above.

The home buttons (menu, text chat, microphone, send, end call) use the shared `Icon` from `src/app/art.tsx` (`framework7-icons`) instead of the three SVGs above, and keep their existing handlers and accessible names. Controls continue using the shared Framework7 components.

The cat and button layout follow the earlier home, not this frame. The cat is `PoseCat` (`src/app/PoseCat.tsx`): the `Buddy` base sits still in place (the sideways stroll was removed on 2026-11-15), and swaps to pose clips and stills for taps and idle reactions (rules in `src/lib/cat-poses.ts`, timers in `src/app/use-cat-reactions.ts`). During text and voice conversation it stays on the existing `Buddy` states. Before voice opens, `PoseCat` shows the dev #39 yawn: for 2.4 seconds it hides the `Buddy` base and overlays `CatArtwork` (the same cat art from `main-cat.png`) at the identical geometry, without enlarging the cat. With reduced motion, the yawn and the looping pose clips are skipped.

Per the user's follow-up, the decorative status bar and white home indicator from Figma are omitted. Do not add them back.
