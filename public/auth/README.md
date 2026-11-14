# Login artwork

- Source: the user-provided Figma file `LRReRltHxTKQURnYxXUPOx`, revised frame `455:121`, image layer `455:122`.
- `login-cat-bedroom.png` is the original downloaded image asset, not a screenshot of the UI.
- `login-cat-bedroom.mp4` is the user's supplied `hear-cat-light-drift-loop-5s.mp4`, copied without re-encoding. Only the first welcome screen replaces the image with this muted, inline, autoplaying loop. The existing crop and gradient layers are unchanged; the PNG remains its poster and the form/loading background.
- `AuthScreen` preserves the reference crop and warm top/bottom gradients. Per the user's follow-up, do not render the decorative time, signal, Wi-Fi, battery, or home indicator from Figma.
- The welcome screen has exactly two icon-free Framework7 buttons: white phone/password login and black signup. Signup goes through phone ID, SMS verification, and a required password of at least 8 characters. Password setup/recovery is available inside the login form.
- The user confirmed there are no Terms/Privacy URLs yet and requested design only. Footer wording and underlines match Figma; they remain non-interactive text until approved documents are provided.
