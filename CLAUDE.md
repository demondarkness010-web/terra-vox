# Terra Vox

Earth Information Jukebox for NASA Space Apps 2026. Vite + vanilla JS + three.js + Tone.js in
`web/`; offline Python feature extraction in `scripts/`. Accessibility-first: sound and text
carry all information, visuals confirm it.

## Before any UI work

Read `DESIGN.md` in full. It is the brief and it wins over defaults and habit.
Tokens live in `web/styles/main.css` `:root`; never hard-code colour, size, radius,
duration or easing anywhere else. No new dependencies without asking.

## After any UI change

Run the review protocol at the end of `DESIGN.md`: screenshots at 1440 and 375 in single and
Duet, motion full and reduced; the leak greps; a full keyboard pass. Report what you checked.
