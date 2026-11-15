# Black cat animation assets

- `black-cat-final.png`: approved front view, kept as supplied. This is the only active mascot artwork. The angled view is a reference.
- `CatFace.tsx` clips the studio background with an SVG outline and places the eye, paw and mouth layers in the image coordinate system. Neutral idle uses the artwork eyes; other poses can use animated eyes and pupils.
- The remote playback waveform drives the mouth. The idle gait (`use-cat-stroll.ts`) runs only when `Buddy` gets `stroll`, which only `/dev/buddy-preview` passes now; the home stroll was removed on 2026-11-15. Silence, mute, interruption and call teardown close the mouth.
- The home cat is `PoseCat` with the `Buddy`/`CatFace` base for idle, reactions and speech (decided 2026-11-15, keeping the earlier home cat). `CatArtwork` is used only for the voice-start yawn: `PoseCat` overlays it at exactly the `CatFace` geometry (the full 3396 × 1852 art sits at -50.9%, -4.959%, 197.213% × 107.549% of the square cat box) and hides the base for those 2.4 seconds. `cat-artwork-renderer.ts` warps the unchanged `/home/main-cat.png` texture, fading head displacement through the neck and closing the original eyelids without replacement skin patches. Its first/last yawn poses have zero displacement, so the swap in matches the resting art; the swap back fades into the connecting look.
- The home voice button plays a 2.4-second `yawning` intro before opening the microphone connection (after the microphone notice sheet, when one is needed). Only the head, eyelids and mouth animate; the body, paws and tail stay fixed and the home character does not enlarge until the intro ends. Closing the call or switching to text cancels the intro. Reduced-motion users skip it. Without WebGL the exact static artwork remains visible.
- `/dev/buddy-preview#yawn` replays the same intro without microphone or API access and includes a pose slider for inspecting the animation. The approved raster artwork stays unchanged.

## Audio-motion verification

`/dev/buddy-preview` (local development only) includes a Korean synthetic speech sample generated with macOS Yuna, with pauses between sentences. It sends the audio through a MediaStream and the same output analyser used by WebRTC. It makes no API call and contains no user conversation. The sample is served only in development; production returns 404.

Waveform reference: [MDN AnalyserNode.getFloatTimeDomainData](https://developer.mozilla.org/en-US/docs/Web/API/AnalyserNode/getFloatTimeDomainData).

## Motion clips (draft)

- `motion/*.webp`: looping animated WebP clips without background, cut from Magnific image-to-video renders (one cat, 960×960, locked camera). Every clip uses the same crop window, so the cat keeps the same size and ground line; the last 8 frames are blended into the first for a seamless loop.
- `round`, `grumble`, `purr` are still poses cut from the pose sheets. `round` has the same body as the main art, so swapping to it reads as the eyes widening.
- Placement numbers live in `src/lib/cat-poses.ts`.

