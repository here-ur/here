# Cat motion

The home uses the same approved transparent artwork for idle, yawn and speech. Do not swap the image, change its scale or split off a head layer on voice entry. The first and final yawn frames have no displacement. Keep the body, paws and tail still.

## References and interpretation

- [Grendelkhan's cat yawning, filmed at 4× slow motion](https://commons.wikimedia.org/wiki/File:Cat_yawning_in_slow_motion.webm): observed preparation around 3 seconds, opening around 8 seconds, a larger stretch/head lift around 10 seconds, and a closed mouth around 12 seconds followed by head recovery. These are observations of this clip, not a universal animal timing rule. The video is a study reference only and is not bundled in the app.
- [Disney Animation's process](https://disneyanimation.com/process/animation/) and [Toon Boom's animation principles](https://helpcentre.toonboom.com/hc/en-ca/articles/57087608774931-About-the-12-Principles-of-Animation): apply anticipation, acceleration/deceleration, a brief extreme pose and overlapping recovery while preserving the character's proportions.

Our stylised 2.4-second intro uses a small downward preparation, slower mouth opening, a short held stretch, quicker jaw release and a later head settle. Eyes close before the extreme pose and stay closed through release. There is no autonomous pupil travel while the eyes are closed. Do not run unrelated eye, blink and head loops over this sequence.

## Rendering and cancellation

- `cat-yawn.ts` owns pose tracks and duration. The renderer uses continuous UV deformation through the neck, the original eye/fur texture and a shaded mouth. It is a deformation of the supplied image, not a newly modelled 3D cat.
- The closed-eye warp excludes iris samples after the lids meet, avoiding a gold/pupil line rolling beneath closed lids. No discoloured skin patch is layered over the eyes.
- Closed lids retain a gently curved crease and soft local shading so the eyes remain readable. The crease follows the same warp, fades with closure and preserves the original fur colour. Keep the nose and muzzle outside eyelid deformation.
- `/dev/buddy-preview#yawn` shares the home renderer and offers replay and a pose slider. Check rest/0%, peak and recovery, plus unchanged lower-body pixels.
- Voice connection starts only after the intro. An abort during the intro cancels its timer and cannot open the microphone later. Reduced motion skips the intro; WebGL failure keeps the static original visible.
