# Home artwork

Source: the user-provided Figma file `LRReRltHxTKQURnYxXUPOx`, frame `455:164` (393 × 852).

| Asset | Figma layer | Placement at reference size |
| --- | --- | --- |
| `sunlit-background.png` | `455:378` | x -95, y -24, 583 × 1036 |
| `main-cat.png` | `455:204` | x -188, y 251, 770 × 420; transparent original asset |
| `menu.svg` | `455:772` | 28 × 28, inside the 48 × 48 menu button at x 16, y 67 |
| `chat.svg` | `455:782` | 24 × 24, inside the 48 × 48 button at x 257, y 748 |
| `microphone.svg` | `455:778` | 24 × 24, inside the 48 × 48 button at x 321, y 748 |

`HomeScreen.tsx` renders these original Figma assets; `home-scene.css` defines the responsive layout and the two original gradient layers. These are individual assets, not a screenshot of the UI. Preserve SVG intrinsic dimensions.

Per the user's follow-up, the decorative status bar and white home indicator from Figma are omitted. Keep the remaining artwork and controls in their existing positions.

The idle cat stays fixed. The existing expressive `Buddy` is used during voice conversation and for accessories, without the lateral `stroll` behavior. Menu, text input, send, microphone, and end-call actions retain the existing handlers and accessible names. Controls continue using the shared Framework7 components.
