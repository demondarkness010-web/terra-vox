---
version: alpha
name: Terra Vox
description: >-
  An Earth Information Jukebox. Real NASA satellite frames play as live music, so blind
  and low-vision people (and everyone else) can hear how the planet changed. Sound is the
  primary channel; the visuals are a confirmation, and they should be worth looking at.
colors:
  space: "#000000"
  hull: "#15171a"
  panel: "#1e2125"
  raised: "#2a2e33"
  engrave: "#3a3f46"
  edge: "#6e757e"
  ink: "#f2f4f5"
  muted: "#c9cdd2"
  quiet: "#b3b9c0"
  old: "#56b4e9"
  old-text: "#8fd1f7"
  new: "#e69f00"
  new-text: "#ffbf47"
  focus: "#f0e442"
  good: "#3dd6a0"
  limb: "#7fc4ff"
  on-signal: "#15171a"
typography:
  numeral-xl: { fontFamily: "Anybody Variable", fontSize: 9rem, fontWeight: 300, lineHeight: 0.9, letterSpacing: -0.035em }
  numeral-lg: { fontFamily: "Anybody Variable", fontSize: 4.5rem, fontWeight: 300, lineHeight: 0.95, letterSpacing: -0.03em }
  display: { fontFamily: "Anybody Variable", fontSize: 3rem, fontWeight: 700, lineHeight: 1.0, letterSpacing: -0.02em }
  headline: { fontFamily: "Anybody Variable", fontSize: 2.25rem, fontWeight: 700, lineHeight: 1.05, letterSpacing: -0.015em }
  title: { fontFamily: "Atkinson Hyperlegible Next Variable", fontSize: 1.5rem, fontWeight: 700, lineHeight: 1.2 }
  lead: { fontFamily: "Atkinson Hyperlegible Next Variable", fontSize: 1.3125rem, fontWeight: 400, lineHeight: 1.4 }
  body: { fontFamily: "Atkinson Hyperlegible Next Variable", fontSize: 1.125rem, fontWeight: 400, lineHeight: 1.5 }
  body-strong: { fontFamily: "Atkinson Hyperlegible Next Variable", fontSize: 1.125rem, fontWeight: 700, lineHeight: 1.4 }
  label: { fontFamily: "Atkinson Hyperlegible Next Variable", fontSize: 1rem, fontWeight: 600, lineHeight: 1.3 }
  small: { fontFamily: "Atkinson Hyperlegible Next Variable", fontSize: 0.875rem, fontWeight: 600, lineHeight: 1.35 }
spacing: { s1: 4px, s2: 8px, s3: 12px, s4: 16px, s5: 24px, s6: 32px, s7: 48px, s8: 72px, s9: 120px }
rounded: { none: 0px, tight: 4px, control: 8px, round: 999px }
components:
  button-play: { backgroundColor: "{colors.ink}", textColor: "{colors.on-signal}", rounded: "{rounded.round}", size: 80px }
  button-primary: { backgroundColor: "{colors.ink}", textColor: "{colors.on-signal}", typography: "{typography.body-strong}", rounded: "{rounded.control}", height: 56px, padding: 24px }
  button-control: { backgroundColor: "{colors.panel}", textColor: "{colors.ink}", typography: "{typography.label}", rounded: "{rounded.control}", height: 44px, padding: 16px }
  button-control-on: { backgroundColor: "{colors.ink}", textColor: "{colors.on-signal}", typography: "{typography.label}", rounded: "{rounded.control}", height: 44px, padding: 16px }
  toggle-speak-on: { backgroundColor: "{colors.good}", textColor: "{colors.on-signal}", typography: "{typography.label}", rounded: "{rounded.control}", height: 44px, padding: 16px }
  more-toggle-open: { backgroundColor: "{colors.raised}", textColor: "{colors.ink}", typography: "{typography.label}", rounded: "{rounded.control}", height: 44px, padding: 16px }
  ear-tag-old: { backgroundColor: "{colors.old}", textColor: "{colors.on-signal}", typography: "{typography.small}", rounded: "{rounded.tight}" }
  ear-tag-new: { backgroundColor: "{colors.new}", textColor: "{colors.on-signal}", typography: "{typography.small}", rounded: "{rounded.tight}" }
  pad-old-on: { backgroundColor: "{colors.old}", textColor: "{colors.on-signal}", typography: "{typography.body-strong}", rounded: "{rounded.control}", height: 64px }
  pad-new-on: { backgroundColor: "{colors.new}", textColor: "{colors.on-signal}", typography: "{typography.body-strong}", rounded: "{rounded.control}", height: 64px }
  desk-board: { backgroundColor: "{colors.panel}", textColor: "{colors.ink}", rounded: "{rounded.control}", padding: 24px }
  kbd: { backgroundColor: "{colors.raised}", textColor: "{colors.muted}", typography: "{typography.small}", rounded: "{rounded.tight}" }
---

# Terra Vox design system

Read this whole file before touching anything in `web/`. It is the brief, and it overrides
taste, habit and whatever a "modern website" usually looks like.

The values in the YAML above are mirrored in `web/styles/main.css` `:root` (the reference
block is at the end of this file). If the CSS and this file disagree, fix whichever is wrong
in the same change. No colour, size, radius, duration or easing may appear outside `:root`.

## Overview

**Orbit and instrument.** Terra Vox is two things placed against each other: a view of the
planet from orbit, and a precise instrument that plays it. Everything on screen belongs to
one or the other, and the line where they meet is the horizon.

- **The orbit** is true black space with the Earth in it, lit only by NASA's own pixels and
  by a thin, physically motivated blue limb of atmosphere. It is photographic and silent.
- **The instrument** is the hull below and around it: anodised graphite panels, engraved
  dividers, faders, knobs, a transport and a timeline groove. It is exact, tactile and
  calm, and it never emits light of its own.
- **The signal** is the only colour that moves between the two: sky blue for the oldest
  year and left ear, orange for the newest year and right ear. When those two colours
  appear, they always mean that.

The reference points are specific, and they are about discipline, not decoration:

1. **Apollo 17's Blue Marble and the GIBS frames themselves.** The planet is shown as a
   photograph, at scale, edge cropped, never as a small glossy ball floating in a box.
2. **The 1975 NASA Graphics Standards Manual (Danne & Blackburn).** Flush-left type, a
   strict grid, generous margins, one family used rigorously, nothing centred for effect.
   Borrow the rigour only. Never use the NASA insignia, the "worm" logotype, or NASA red:
   NASA does not endorse this project and its marks are protected.
3. **Mission control consoles and studio hi-fi.** Controls look like they have travel and
   detents. Labels are engraved, short and functional. A fader is a fader.

**The one memorable thing is the Duet split.** Pressing D cuts the planet into two years
down a single hard seam: the past on the left, the present on the right. Every other part
of the interface stays quiet so that moment lands. If a new idea competes with the split
for attention, cut the new idea.

### Why the old screen felt flat (do not regress to this)

- One near-black (`#050506`) everywhere, so nothing said "space" and nothing said "object".
- The planet sat centred inside a box, small, like a product render.
- Every control was the same grey pill; the hierarchy came only from bold weight.
- Weight 800 was used 17 times, so nothing was bold any more.
- 13 different durations and 11 radii, so motion and shape had no grammar.
- Middle-dot meta strings (`A · B · C`) everywhere, the commonest template tell.

## Colors

Two blacks, three panel steps, three inks, one signal pair, and four single-purpose colours.
Every pair below was measured (WCAG 2 ratio, and APCA Lc for dark-mode realism).

| Token | Hex | Role | Measured |
|---|---|---|---|
| `space` | #000000 | Behind the planet only: the stage. Never under body text. | — |
| `hull` | #15171a | Page ground: the instrument body. | ink 16.3:1, Lc 99 |
| `panel` | #1e2125 | Desk board, crate, dialogs. | ink 14.7:1, Lc 98 |
| `raised` | #2a2e33 | Pressed or hovered controls, `kbd`, fader tracks. | ink 12.4:1 |
| `engrave` | #3a3f46 | Hairline dividers and fader scale marks. Decorative only. | 1.7:1 (never sole carrier) |
| `edge` | #6e757e | Control boundaries, idle timeline bars, anything that carries data. | 3.5:1 on panel, 3.9:1 on hull |
| `ink` | #f2f4f5 | Primary text and selected states. Cool white, not cream. | |
| `muted` | #c9cdd2 | Secondary text of any length. | 11.2:1, Lc 75 on hull |
| `quiet` | #b3b9c0 | Tertiary text at 18px+ only: footnotes, previous caption. | 9.1:1, Lc 63 |
| `old` | #56b4e9 | Oldest year, left ear, cold. Fills, marks, numerals 36px+. | 7.8:1, Lc 56 |
| `old-text` | #8fd1f7 | The same meaning, for text under 36px. | 10.8:1, Lc 73 |
| `new` | #e69f00 | Newest year, right ear, hot. Fills, marks, numerals 36px+. | 8.0:1, Lc 57 |
| `new-text` | #ffbf47 | The same meaning, for text under 36px. | 10.9:1, Lc 74 |
| `focus` | #f0e442 | Keyboard focus ring and skip link. Nothing else is yellow. | 13.6:1 |
| `good` | #3dd6a0 | Correct answer, Speak aloud on. Always with `on-signal` text. | 9.7:1, Lc 68 |
| `limb` | #7fc4ff | The atmosphere rim in WebGL. The only glow in the product. | |
| `on-signal` | #15171a | Text on any filled signal colour or on ink. | 7.8:1 on old, 8.0:1 on new |

Rules:

- **Light comes from three sources only:** the NASA frame, the atmospheric limb, and the
  signal marks (sparks, meters, fader caps). Chrome never glows, has no gradient wash and
  casts no coloured shadow.
- **The signal pair is semantic.** Blue and orange never decorate. Each always travels with
  a word or a position ("Left ear, oldest year"), so the meaning survives colour blindness,
  forced colours and a screen reader. The Okabe-Ito pair was chosen because it stays
  distinguishable under every common colour-vision deficiency. Do not "refresh" it.
- **No third accent hue.** Theme identity comes from the frames themselves (fire, ocean,
  NO₂, methane imagery), not from a theme colour painted onto the chrome.
- **Pure black is only space.** Text never sits on `space` except the Duet ear years, which
  are 48px+ numerals, and the ear tags, which carry their own solid fill.

## Typography

Two families, clearly distinct, each with one job.

- **Anybody Variable** is the voice of numbers and headlines. Its width axis is a data
  channel: the year's `font-stretch` follows tempo (75% at 80 BPM, 130% at 160 BPM), so a
  frantic year is literally set wide. Years are set **light (300) and huge**: big, thin
  numerals read as instrument read-outs; big, heavy numerals read as a sports scoreboard.
- **Atkinson Hyperlegible Next Variable** is for everything a person reads: captions,
  labels, controls, tables. It was designed for low-vision readers. Body text is 18px, not 16.

Scale (classic ratios, rem at 16px root): 14, 16, 18, 21, 24, 36, 48, 72, 144.

| Role | Token | Use |
|---|---|---|
| Year now playing | `numeral-xl` | `.now-year`. `clamp(5.5rem, 9vw, 9rem)`. One per screen. |
| Duet ear years | `numeral-lg` | `.ear-year`. Old in `old`, new in `new` (they are 48px+). |
| Section headline | `headline` | "How the data plays the music", "Guess the Year". |
| Gap sentence | `display` | The Duet sentence ("Eight buzzy notes up at B♭5…"). `text-wrap: balance`. |
| Theme name | `title` | `.now-theme`. |
| Caption, values | `lead` / `body-strong` | `.cap-data` is `body-strong`; `.now-value` is `lead`. |
| Running text | `body` | Help, intro, explanations. Max 64ch. |
| Controls | `label` | Every button and select. |
| Tags, keys, footnotes | `small` | `kbd`, ear tags, credits. Never below 14px. |

Rules:

- Weights are 300 (numerals only), 400, 600, 700. **800 is retired.** Hierarchy comes from
  size, width and colour, then weight.
- Numbers that change use `font-variant-numeric: tabular-nums` so nothing jitters.
- Sentence case everywhere. No all-caps labels, no letter-spaced eyebrows above headings.
- Flush left. Centre only the play button's icon and the Duet seam.
- Never put a monospace face on small data labels. Code in the readout table is the only
  monospace, because it is literally code.
- Never accent one word of a headline with italic, bold or a colour.

## Layout

A strict 12-column grid, `max-width: 1680px`, gutter `clamp(16px, 2.6vw, 40px)`, spacing
only from the `s1`–`s9` scale. Generous, unequal margins: the manual's rigour, not a card
grid.

```
Desktop, single mode: the whole first screen
┌──────────────────────────────────────────────────────────────────────┐
│ Terra Vox  NASA Earth data you can hear         Duet  More  Speak  … │  hull
├──────────┬───────────────────────────────────────────────────────────┤
│ Themes   │ ░░░░░░░░░░░░░░░░ SPACE ░░░░░░░░░░░░░░░░ │ Wildfires        │
│ ▸ Fire   │ ░░░░░░░░░░░░░░╭──────────╮░░░░░░░░░░░░░ │ Aug 08-15, 2019  │
│   Sea    │ ░░░░░░░░░░░░╭╯  planet   ╰╮░░░░░░░░░░░ │ 2019             │  ← numeral-xl
│   Air    │ ░░░░░░░░░░░╭╯  (cropped   ╰╮░░░░░░░░░░ │ 260 fire areas   │
│   GHG    │ ░░░░░░░░░░░│  by stage)    │░░░░░░░░░░ │ story · caption  │
├──────────┴═══════════════ horizon ═════════════════┴──────────────────┤
│ ⏮  ▶  ⏭   ▁▂▃▂▅▆▃▇█▆▅▇█▇  timeline groove, one bar per year           │  hull
└──────────────────────────────────────────────────────────────────────┘

Behind "More" (aria-expanded; opens below the timeline and takes focus)
┌──────────────────────────────────────────────────────────────────────┐
│ More                                                                  │
│ ┌ Guess the Year ──────────┐ ┌ Side B: NASA EIC visualization ──────┐ │  panel cards
│ Field guide: the official record behind each theme                    │
│ How the data plays the music  ┌ desk board: 7 channel strips ──────┐  │  panel
└──────────────────────────────────────────────────────────────────────┘

Duet mode: the stage spans the full width, one hard seam in the middle
┌──────────────────────────────┬───────────────────────────────────────┐
│ Left ear, oldest year        │                 Right ear, newest year │
│ 2003                    ╭────┼────╮                              2026 │
│                       ╭╯ old │ new ╰╮                                 │
│                       │ frame│frame │                                 │
├══════════════════════════════╧══════ horizon ═════════════════════════┤
│ "Four buzzy notes up at E♭5, against one calm C4."    gap table      │
```

- **The planet is photographed, not displayed.** In single mode its diameter is about 1.15×
  the stage height and its lower limb is cropped by the horizon, the way it looks from
  orbit. In Duet the two halves meet on the seam. Never shrink it to "fit nicely".
- **The horizon** is the bottom edge of the stage: a 1px `edge` line where space ends and the
  hull begins. It is the only full-width rule on the page.
- **Text never overlaps the planet** except the Duet ear years and tags, which sit on space
  at the outer edges, or on a solid `hull` scrim if the planet reaches them.
- ≤ 860px: one column; the crate becomes a horizontal snap row; the stage stays 4:3.
- ≤ 640px: the transport is sticky at the bottom inside `env(safe-area-inset-bottom)`.
- Touch targets ≥ 44×44px. Play is 80px.

## Elevation & Depth

Depth is lightness and material, never shadow.

- `space` < `hull` < `panel` < `raised`. Something closer to your hand is lighter.
- **No `box-shadow` for elevation.** No soft grey shadow under anything. Dividers are
  `border`, never `box-shadow`, so they survive forced colours.
- The only shading in the product is physical: the planet's terminator and its limb,
  rendered in WebGL.
- Dialogs sit on `panel` with a 1px `edge` border over a `rgb(0 0 0 / 0.72)` backdrop.

## Shapes

Shape follows the object. Four radii, each with a meaning:

| Token | Value | For |
|---|---|---|
| `none` | 0 | Data: timeline bars (top corners only get `tight`), frames, the stage, the seam. |
| `tight` | 4px | Small physical parts: `kbd`, ear tags, fader caps, album art. |
| `control` | 8px | Everything a finger presses that is not round: buttons, pads, selects, panels. |
| `round` | 999px | Only things that are physically round: play button, knobs, discs, meters' ends. |

No pills for toggles or switches. A rectangle with an 8px radius is a switch on a console; a
pill is a SaaS toggle.

## Components

Reuse before creating. Existing parts: `.play-btn`, `.icon-btn`, `.btn-primary`,
`.btn-text`, `.ghost`, `.duet-toggle`, `.seg`, `.tile`, `.pad(.old|.new|.main)`,
`.option`, `.fader`, `.knob`, `.more-toggle`, `.more-card`, `kbd`. Class names are unique
per component: the desk's column is `.channel`.

Every interactive part has all five states, and they are visibly different without colour:

| State | Treatment |
|---|---|
| Rest | `panel` fill, `ink` text, 1px `edge` border if it sits on `panel`. |
| Hover (`@media (hover: hover)` only) | `raised` fill. No lift, no glow, no scale. |
| Pressed | `transform: scale(0.97)` for `--dur-press`. Round controls 0.94. |
| On / selected | `ink` fill with `on-signal` text, or the signal fill for old/new pads. Plus `aria-pressed` / `aria-selected`. |
| Focus | `outline: 3px solid var(--focus); outline-offset: 3px`. Always outline, never shadow. |
| Disabled | `opacity: 0.4`, `cursor: default`, and the reason is in the label or a hint. |

Signature parts:

- **Play.** 80px `ink` disc, `on-signal` icon. While playing, a single ring expands on each
  downbeat (`.is-beat`), one beat long. It is the heartbeat of the page; nothing else pulses.
- **Timeline groove.** One bar per year, height is the year's value, `edge` at rest,
  `ink` for the current year, `old`/`new` for the anchors in Duet. Bars have square bottoms
  and 4px top corners, like a printed chart.
- **Desk.** Seven channel strips on one `panel` board, separated by 1px `engrave` borders.
  Fader tracks are `raised`, scale marks `engrave`, caps `ink` (single) or `old`/`new`
  (Duet). Labels under each strip: the sound in `label`, the input in `small` `muted`.
- **One screen.** The first screen is the whole instrument: themes, the planet, the big
  date, the caption, play, Duet. Everything that is not "pick a theme, press play, Duet"
  (Guess the Year, side B, the field guide, the desk) lives behind the one **More** button
  (`.more-toggle`, `aria-expanded`), which opens a `.more` section under the timeline and
  moves focus to its heading. `G` opens Guess the Year directly; "← Back to the jukebox"
  returns. No tabs.
- **Big date.** The current year in `numeral-xl`, display face, weight 300, tabular
  figures. It changes in place, with no roll: the music already marks the change.
- **Story line and region switch.** Above the date, one bold `label` sentence says what
  to listen for (`.track-story`, side A only). Air Quality adds a `.seg` radiogroup of four
  regions (`.region-switch`, 2 × 2) in the crate. The crate mirrors the player's rows, so the
  regions land below the horizon, level with the transport: choosing a region is choosing
  a track, a setting on the console rather than a picture in space.
- **The stage row is fixed** at `--stage-h`, so header + stage + transport is one screen.
  On short screens the reading (`.now-read`) scrolls inside its panel and the captions stay
  pinned under it; only while it actually scrolls does it take a tab stop. Below 760px of
  height the date drops to `numeral-lg` and the faded previous caption line hides first.
- **Ear tags.** Solid `old`/`new` fill, `on-signal` text, `tight` radius. Copy is
  "Left ear, oldest year" and "Right ear, newest year". No middle dot.
- **Duet toggle.** The two dots overlap when off and part when on: the logo of the idea.
  Animate the separation with `transform: translateX`, never `margin`.

## Do's and Don'ts

Do:

- Let motion come from the music (beat, sparks, meters) or from a person's action.
- Make the planet bigger than feels safe, and the chrome quieter than feels safe.
- Keep every value in a token, and every new part in an existing component's grammar.
- Keep the no-JS, no-animation state complete and readable.
- Say what something does in plain words: "Play mystery year", "Hear oldest".

Don't (each of these is an AI-default tell, and a reviewer will reject it):

- No per-section fade-and-slide-up reveals, no parallax, no scroll-jacking, no pinned
  storytelling sections, no smooth-scroll libraries.
- No gradient washes, no glassmorphism or `backdrop-filter` blur panels, no neon, no glow on
  buttons or text, no `text-shadow`.
- No star fields, nebula backgrounds, lens flares or particle fields. Space is black, as it
  is in every NASA photograph taken in daylight.
- No soft drop shadows, no identical rounded cards in a grid, no one-radius-for-everything.
- No all-caps eyebrow labels, no `A · B · C` meta strings, no `→` appended to buttons, no
  "WORD — fragment" labels, no numbered `01 / 02 / 03` markers unless it is a real sequence.
- No emoji in the interface. No stock icons other than transport glyphs.
- No NASA insignia, worm logo or NASA red. Credit NASA in the footer, as now.
- No hype copy ("Experience the planet like never before"). Errors explain and never apologise.

## Motion

Motion has a grammar: press, settle, travel, and the beat. Nothing else.

| Token | Value | Use |
|---|---|---|
| `--dur-press` | 120ms | `:active` scale, key feedback. |
| `--dur-state` | 180ms | Colour, fill and border changes. Also the reduced-motion crossfade. |
| `--dur-settle` | 320ms | Fader caps, knobs, overlay fades, tile selection. |
| `--dur-travel` | 560ms | Disc slide, frame crossfade, caption change. |
| `--dur-split` | 760ms | The Duet split. Matches `SPLIT_MS` in `globe.js`. |
| `--beat` | set by JS, `60000 / BPM` ms | Anything that answers the music. |
| `--split-step` | 80ms | The Duet split's stagger: its steps start at 0, 1, 3, 4 and 5 steps. |
| `--ease-settle` | `cubic-bezier(0.16, 1, 0.3, 1)` | Default. Fast start, long soft landing. |
| `--ease-mechanical` | `cubic-bezier(0.3, 0, 0, 1)` | Faders and knobs: moves with weight, stops dead, no overshoot. |
| `--ease-part` | `cubic-bezier(0.34, 1.4, 0.64, 1)` | Only the Duet dots and the two planets parting. Nowhere else. |
| linear | | Anything scroll-linked, and continuous spin. |

**Motion is on the beat.** `main.js` writes `--beat` on `:root` whenever tempo changes
(80 BPM → 750ms, 160 BPM → 375ms). The caption track changes over `calc(var(--beat) * 0.5)`,
the beat ring lasts one beat, sparks live one bar. A fast, hot year makes the whole
interface move faster; a calm year makes it slower. This is the product's motion identity:
reuse it, don't invent a second clock.

**The one orchestrated moment: the Duet split** (user-triggered, ≤ 800ms total):

| t | What happens |
|---|---|
| 0ms | The seam draws from top to bottom: `scaleY(0 → 1)`, `--dur-settle`, `--ease-settle`. |
| 80ms | The two planets part along the seam: `--dur-split`, `--ease-part`. |
| 240ms | The ear tags fade in: opacity only, `--dur-state`. |
| 320ms | The ear years fade in: opacity only, `--dur-state`. |
| 400ms | The gap sentence fades in under the stage: opacity only. |

Leaving Duet runs the same sequence in reverse at 0.7× duration.

Rules:

- Animate only `transform`, `opacity`, and WebGL uniforms. Never `height`, `width`,
  `margin`, `top`/`left` or `filter` on large areas.
- Nothing loops forever except the planet's spin and the playing indicator, and both stop
  under the motion toggle and while paused for more than 5 seconds.
- Hover never animates position or size.
- Durations come from tokens. If a value isn't in the table, the answer is the nearest token.

Reduced motion (`prefers-reduced-motion: reduce` or `html[data-motion="reduce"]`):

| Element | Full | Reduced |
|---|---|---|
| Planet | Slow spin, faces its data on change | Still, faces its data |
| Duet split | Seam draws, planets part | Instant layout, `--dur-state` crossfade |
| Sparks | Rings bloom at real locations | Dots fade in place |
| Beat ring | Expands each beat | Off; the play button's fill steps once per bar |
| Desk on scroll | Faders rise from zero | Faders at their values, no animation |

## Scroll Animation

Terra Vox is an instrument, not a scrollytelling page. There is **exactly one**
scroll-linked effect, and it lives behind More: as `.desk-board` enters the viewport, each fader cap and knob rises
from zero to its current value, left to right, as if the desk were powering on.

```css
@supports (animation-timeline: view()) {
  @media (prefers-reduced-motion: no-preference) {
    :root:not([data-motion="reduce"]) .desk-board :is(.fader, .knob) .cap {
      animation: fader-on linear backwards;
      animation-timeline: view();
      animation-range: entry 15% cover 40%;
    }
    :root:not([data-motion="reduce"]) .desk-board .knob .cap { animation-name: knob-on; }
    @keyframes fader-on { from { transform: translateY(0); } }
    @keyframes knob-on { from { transform: rotate(-135deg); } }
  }
}
```

Each `from` state is "zero" for that control; the `to` state is whatever the cap's own
`transform` already says, so the animation always lands on the live value. Rules:

- CSS `view()` timelines only. They now run in Chromium, Safari 26+ and Firefox 159+.
  No scroll listeners, no Lenis, no GSAP, no ScrollTrigger.
- The un-animated state is the correct, final state. Unsupported browsers lose nothing.
- The WebGL loop pauses when the stage leaves the viewport (`IntersectionObserver`).
- Scroll never moves the globe camera and never starts audio.

## Accessibility

Accessibility is the brief, not a pass at the end.

- **Contrast floors:** body text ≥ 7:1 and APCA |Lc| ≥ 75; text at 24px+ ≥ 4.5:1 and
  |Lc| ≥ 60; numerals at 36px+ |Lc| ≥ 45; data marks, control edges and the focus ring
  ≥ 3:1. Measure hover and selected states too. Never round up (4.49 fails).
- **Signal colours are never alone:** every blue/orange element also has a word, a position
  or a shape.
- **Motion toggle:** an on-screen Motion control sets `html[data-motion]` to `full` or
  `reduce`, defaults to the OS setting, persists in `localStorage` (wrapped in `try`), and is
  in the Keys dialog. It satisfies WCAG 2.2.2 for the spinning planet.
- **Forced colours:** focus uses `outline`; dividers use `border`; signal fills get
  `forced-color-adjust: none` only where the colour itself is the data (meters, timeline).
- **Audio** never starts without a gesture. Every visual change has a live-region or text
  equivalent (`#sr-announcer`, `#sr-captions`).
- **Keyboard:** every shortcut has an on-screen control; focus order follows the visual
  order; dialogs trap and return focus.
- **WebGL can't be audited by tools.** Spot-check text over the stage by eye at the
  brightest frame of each theme (wildfires 2020, greenhouse gases 2026).

## Voice

- Plain, specific, active: "Play", "Hear oldest", "Next round", "Show the introduction again".
- One name per action through the whole flow: the button "Duet" produces "Duet on".
- Numbers carry units and real values: "1,769 → 1,887 ppb", not "a big increase".
- Join facts with commas or separate lines, never middle dots.
- Errors say what happened and what to do: "The frame didn't load. Showing the flat image
  instead."

## Review protocol

Run this after every UI change, before calling it done.

1. Screenshot 1440×900 and 375×812, in single and Duet, with motion full and reduced. Compare
   against the wireframes above. Is the planet still the biggest thing? Is the split still
   the only spectacle?
2. Grep for leaks. These must return nothing outside `:root`:
   ```sh
   grep -nE '#[0-9a-fA-F]{3,8}\b|[0-9]+ms|cubic-bezier' web/styles/main.css | grep -vE '^[0-9]+:\s*--'
   grep -n 'box-shadow' web/styles/main.css
   grep -rn ' · ' web/index.html web/src
   grep -n 'font-weight: 800' web/styles/main.css
   ```
3. Tab through the whole page from the skip link. Every stop has a visible yellow ring.
4. Run axe in DevTools; zero contrast or name violations.
5. Read every new string aloud. If it sounds like an ad, rewrite it.
6. Take one thing away (the Chanel rule). If nobody would miss it, it was decoration.

## Known debts (resolved)

All of these were fixed when the code was brought up to this spec. The leak greps in the
review protocol keep them from coming back.

- `.strip` renamed `.channel` (desk). The odometer and its `.wheel-strip` were later removed
  for a plain big date, and the mode tabs for the More disclosure (Plan to 10/10).
- Timeline bars use `edge`; ground split into `space` (stage) and `hull` (page).
- `ink`, `muted`, `quiet` and `good` moved to the values in the table above.
- No weight 800 anywhere; years are weight 300.
- No pill radii on controls; `control` (8px) throughout.
- No animated `height` or `margin`; the Duet dots move by transform.
- No `box-shadow`; dividers are `border`.
- No middle dots in markup or scripts; commas and line breaks instead.
- Planet limb uses `limb`; spin obeys the Motion toggle and stops after 5 s paused.

## Reference `:root`

```css
:root {
  color-scheme: dark;
  /* colour */
  --space: #000000; --hull: #15171a; --panel: #1e2125; --raised: #2a2e33;
  --engrave: #3a3f46; --edge: #6e757e;
  --ink: #f2f4f5; --muted: #c9cdd2; --quiet: #b3b9c0;
  --old: #56b4e9; --old-text: #8fd1f7; --new: #e69f00; --new-text: #ffbf47;
  --focus: #f0e442; --good: #3dd6a0; --limb: #7fc4ff; --on-signal: #15171a;
  --backdrop: rgb(0 0 0 / 0.72);
  /* type */
  --font: "Atkinson Hyperlegible Next Variable", system-ui, sans-serif;
  --display: "Anybody Variable", "Atkinson Hyperlegible Next Variable", system-ui, sans-serif;
  --mono: ui-monospace, "SFMono-Regular", Consolas, monospace;
  --t-small: 0.875rem; --t-label: 1rem; --t-body: 1.125rem; --t-lead: 1.3125rem;
  --t-title: 1.5rem; --t-headline: 2.25rem; --t-display: 3rem;
  --t-numeral-lg: clamp(3rem, 5vw, 4.5rem); --t-numeral-xl: clamp(5.5rem, 9vw, 9rem);
  /* space */
  --s1: 4px; --s2: 8px; --s3: 12px; --s4: 16px; --s5: 24px;
  --s6: 32px; --s7: 48px; --s8: 72px; --s9: 120px;
  --gutter: clamp(16px, 2.6vw, 40px);
  /* shape */
  --r-tight: 4px; --r-control: 8px; --r-round: 999px;
  /* parts (the component sizes from the YAML, and the layout's fixed measures) */
  --control-h: 44px; --primary-h: 56px; --pad-h: 64px; --play-size: 80px;
  --page-w: 1680px; --crate-w: 264px; --now-w: 360px;
  --stage-h: clamp(360px, calc(100vh - 264px), 680px);
  --fader-h: 148px; --fader-travel: 134px; --knob-size: 76px; --groove-h: 68px;
  /* motion */
  --dur-press: 120ms; --dur-state: 180ms; --dur-settle: 320ms;
  --dur-travel: 560ms; --dur-split: 760ms; --beat: 600ms;
  --split-step: 80ms;
  --ease-settle: cubic-bezier(0.16, 1, 0.3, 1);
  --ease-mechanical: cubic-bezier(0.3, 0, 0, 1);
  --ease-part: cubic-bezier(0.34, 1.4, 0.64, 1);
  --loop: running;   /* animation-play-state of the two permitted loops */
}
/* One declaration per line, so the leak grep's `^\s*--` filter skips them. */
html[data-motion="reduce"] {
  --dur-settle: 0ms;
  --dur-travel: 0ms;
  --dur-split: 0ms;
  --split-step: 0ms;
  --loop: paused;
}
@media (prefers-reduced-motion: reduce) {
  html:not([data-motion="full"]) {
    --dur-settle: 0ms;
    --dur-travel: 0ms;
    --dur-split: 0ms;
    --split-step: 0ms;
    --loop: paused;
  }
}
```

Scripts never hard-code these either: `web/src/ui/tokens.js` reads colours, durations and
easings from `:root` (the globe's limb, spark colours, split timing and easings all come
from here), and `main.js` writes `--beat`.
