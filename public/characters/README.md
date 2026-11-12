# Black cat animation assets

- `black-cat-final.png`: approved front view, kept as supplied. This is the only active mascot artwork. The angled view is a reference.
- `CatFace.tsx` clips the studio background with an SVG outline and places the eye, paw and mouth layers in the image coordinate system. Neutral idle uses the artwork eyes; other poses can use animated eyes and pupils.
- The existing idle gait and remote playback waveform still drive the steps and mouth. Silence, mute, interruption and call teardown close the mouth.

## Audio-motion verification

`/dev/buddy-preview` (local development only) includes a Korean synthetic speech sample generated with macOS Yuna, with pauses between sentences. It sends the audio through a MediaStream and the same output analyser used by WebRTC. It makes no API call and contains no user conversation. The sample is served only in development; production returns 404.

Waveform reference: [MDN AnalyserNode.getFloatTimeDomainData](https://developer.mozilla.org/en-US/docs/Web/API/AnalyserNode/getFloatTimeDomainData).
