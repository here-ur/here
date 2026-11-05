# Black cat animation assets

- `black-cat.png`: original user-supplied character; silhouette and body retained.
- `black-cat-face-base.png`: clean face patch created with the builtin image generation tool, edit mode, transparent background. Only the central face area is composited over the original in `CatFace.tsx`; the generated outline is not used.
- Eyes, pupils and mouth: SVG layers; upper head masked for restrained motion. Idle home motion uses short steps with world-space planted feet; interruptions finish one step and settle in place. Speaking mouth size follows the remote playback waveform. Frequency bands select six mouth families (rest/open/wide/round/pucker/teeth), with a short hold and shape interpolation. This is a lightweight visual approximation, not phoneme recognition or Korean forced alignment. Silence, mute, interruption and call teardown close the mouth.

## Generation prompt

Use case: precise-object-edit. Edit target: the supplied transparent 1536x1024 black cat character. Asset type: clean faceless base layer for an animated app mascot. Remove ONLY both orange eyes and black pupils, replacing their entire area with seamlessly matching dark charcoal plush surface and shading. No eyes, no eyebrows, no mouth, no nose. Preserve the exact character silhouette, ear positions, feet, arms, texture, lighting, pose, scale and position on the 1536x1024 transparent canvas; do not redesign or crop or change the body. This is an animation base: eyes and mouth will be composited in code later. Output genuinely transparent background. Please save the edited asset and return its local file path.

## Audio-motion verification

`/dev/buddy-preview` (local development only) includes a Korean synthetic speech sample generated with macOS Yuna, with pauses between sentences. It sends the audio through a MediaStream and the same output analyser used by WebRTC. It makes no API call and contains no user conversation. The sample is served only in development; production returns 404.

Waveform reference: [MDN AnalyserNode.getFloatTimeDomainData](https://developer.mozilla.org/en-US/docs/Web/API/AnalyserNode/getFloatTimeDomainData).
