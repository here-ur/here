# Black cat animation assets

- `black-cat-turnaround.png`: 2026-11-17 사용자가 지정한 고정 캐릭터 기준 원본(정면·측면·후면). 이후 3D·표정·동작 제작은 이 외형을 기준으로 한다. 별도 캐릭터를 임의로 생성하거나 교체하지 않는다.
- 공통 설정: `src/lib/character.ts`의 `CHARACTER`. 홈·채팅·메뉴·하품 렌더러가 이 설정의 에셋 경로를 사용한다. 기존 프로필의 `shape`·`color`는 캐릭터 외형 선택에 사용하지 않는다. 이름·대화 스타일·액세서리는 별도 설정이다.
- 이번 고정 작업은 기준 시트 등록과 공통 에셋 설정 통합이다. 현재 정면 이미지와 애니메이션은 유지하며, 새 기준 시트를 잘라 기존 얼굴 좌표에 끼워 넣거나 정지 이미지로 바꾸지 않는다.
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
- `purr` is a still pose cut from the pose sheets. `round` and `grumble` remain archived but are not loaded or played. Ordinary taps keep the current appearance; three rapid taps and waking from sleep retain their existing reactions.
- Voice answers play as audio without captions beneath the cat. Completed transcripts still enter conversation history; connection/listening status remains visible.
- Placement numbers live in `src/lib/cat-poses.ts`.

