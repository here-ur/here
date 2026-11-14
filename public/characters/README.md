# Black cat animation assets

- `black-cat-final.png`: approved front view, kept as supplied. This is the only active mascot artwork. The angled view is a reference.
- `CatFace.tsx` clips the studio background with an SVG outline and places the eye, paw and mouth layers in the image coordinate system. Neutral idle uses the artwork eyes; other poses can use animated eyes and pupils.
- The existing idle gait and remote playback waveform still drive the steps and mouth. Silence, mute, interruption and call teardown close the mouth.

## Audio-motion verification

`/dev/buddy-preview` (local development only) includes a Korean synthetic speech sample generated with macOS Yuna, with pauses between sentences. It sends the audio through a MediaStream and the same output analyser used by WebRTC. It makes no API call and contains no user conversation. The sample is served only in development; production returns 404.

Waveform reference: [MDN AnalyserNode.getFloatTimeDomainData](https://developer.mozilla.org/en-US/docs/Web/API/AnalyserNode/getFloatTimeDomainData).

## Motion clips (draft)

- `motion/*.webp`: looping animated WebP clips without background, cut from Magnific image-to-video renders (one cat, 960×960, locked camera). Every clip uses the same crop window, so the cat keeps the same size and ground line; the last 8 frames are blended into the first for a seamless loop.
- `round`, `grumble`, `purr` are still poses cut from the pose sheets. `round` has the same body as the main art, so swapping to it reads as the eyes widening.
- Placement numbers live in `src/lib/cat-poses.ts`.

