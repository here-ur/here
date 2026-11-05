# Black cat animation assets

- `black-cat.png`: original user-supplied character; silhouette and body retained.
- `black-cat-face-base.png`: clean face patch created with the builtin image generation tool, edit mode, transparent background. Only the central face area is composited over the original in `CatFace.tsx`; the generated outline is not used.
- Eyes, pupils and mouth: SVG layers; torso fixed, upper head masked for restrained motion. Speaking motion follows the speaking state, not phoneme timing.

## Generation prompt

Use case: precise-object-edit. Edit target: the supplied transparent 1536x1024 black cat character. Asset type: clean faceless base layer for an animated app mascot. Remove ONLY both orange eyes and black pupils, replacing their entire area with seamlessly matching dark charcoal plush surface and shading. No eyes, no eyebrows, no mouth, no nose. Preserve the exact character silhouette, ear positions, feet, arms, texture, lighting, pose, scale and position on the 1536x1024 transparent canvas; do not redesign or crop or change the body. This is an animation base: eyes and mouth will be composited in code later. Output genuinely transparent background. Please save the edited asset and return its local file path.
