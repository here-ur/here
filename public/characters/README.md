# Black cat animation assets

- `black-cat-final.png`: approved front view, kept as supplied. This is the only active mascot artwork. The angled view is a reference.
- `CatFace.tsx` clips the studio background with an SVG outline and places the eye, paw and mouth layers in the image coordinate system. Neutral idle uses the artwork eyes; other poses can use animated eyes and pupils.
- The existing idle gait and remote playback waveform still drive the steps and mouth. Silence, mute, interruption and call teardown close the mouth.
- The home uses `CatArtwork` for idle, yawn and speech alike, with the unchanged `/home/main-cat.png` texture at one fixed size. `cat-artwork-renderer.ts` warps that continuous texture, fading head displacement through the neck and closing the original eyelids without replacement skin patches. Its first/last yawn poses have zero displacement. The old segmented `CatFace` is retained for the small legacy Buddy views.
- The home voice button plays a 2.4-second `yawning` intro before opening the microphone connection. Only the head, eyelids and mouth animate; the body, paws and tail stay fixed and the home character does not enlarge. Closing the call or switching to text cancels the intro. Reduced-motion users skip it. Without WebGL the exact static artwork remains visible.
- `/dev/buddy-preview#yawn` replays the same intro without microphone or API access and includes a pose slider for inspecting the animation. The approved raster artwork stays unchanged.

## Audio-motion verification

`/dev/buddy-preview` (local development only) includes a Korean synthetic speech sample generated with macOS Yuna, with pauses between sentences. It sends the audio through a MediaStream and the same output analyser used by WebRTC. It makes no API call and contains no user conversation. The sample is served only in development; production returns 404.

Waveform reference: [MDN AnalyserNode.getFloatTimeDomainData](https://developer.mozilla.org/en-US/docs/Web/API/AnalyserNode/getFloatTimeDomainData).
