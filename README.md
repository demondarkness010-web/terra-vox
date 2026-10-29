# Terra Vox

**Hear how the planet changed.** Terra Vox is an Earth Information Jukebox for the NASA Space Apps Challenge 2026 challenge *The Earth Information Jukebox*. It turns real NASA Earth imagery into live, generated music, so blind and low-vision people (and everyone else) can experience climate data by ear.

## The moment: Duet mode

Press **D**. The **oldest** satellite frame of a theme plays in your **left ear** and the **newest** in your **right**, at the same time, through the *identical* mapping. Whatever differs between your ears is the planet having changed.

> **Greenhouse Gases, 2003 ⟷ 2026.** On the left, one low, calm C4 on a soft triangle wave at 88 BPM. On the right, eight buzzy sawtooth notes up at B♭5, 136 BPM, over a tense minor third.
> Methane at 400 hPa: **1,769 → 1,887 ppb**. Air at or above 1,900 ppb: **0 % → 49 %** of the planet.

That contrast is measured, not asserted: rendered offline, the newest ear's spectral centroid sits about two octaves above the oldest's (390 Hz → 1,520 Hz), it plays 12× as many notes per second, and the two ears are separated by 45 dB. Details are in [docs/mapping-explainer.md](docs/mapping-explainer.md#4-duet-mode-the-gap-you-can-hear).

Headphones are best for Duet. On one speaker or one earbud, choose **Take turns** and the two years alternate, centred.

## What it does

- **Four themes, chosen for contrasting sound signatures.** Wildfires (spiky, event-driven), Sea Level Change (slow, monotonic), Air Quality (noisy, daily) and Greenhouse Gases (smooth, trending), each a yearly series of global NASA frames.
- **Real-time sonification.** Each bar is one year. Hue, brightness, colour variance, active-region density, year-over-year change and latitude drive pitch, loudness, timbre, rhythm, tempo, harmony and stereo position through fixed formulas. Every note is constrained to C minor pentatonic, so it is always listenable.
- **Normalized across themes.** Every feature is scaled against its own theme's history before the formulas run, and the mix is loudness-calibrated, so switching themes never blows out the mix or goes silent.
- **Live mapping readout.** The actual numbers driving the sound right now (`hue → pitch: 0.65 → E♭5`, `density → notesPerBar: 0.60 → 5` …), plus the raw values and normalization ranges.
- **Guess the Year.** An audio-first game: a hidden year plays, you compare it by ear with the oldest and newest anchors, then pick the year. The reveal is spoken first, and the picture is only a confirmation.

## Accessibility (the point, not an add-on)

- **Sound is the primary channel.** Visuals are secondary and optional; nothing requires sight or a mouse.
- **Full keyboard control** with visible focus. Every shortcut is also an on-screen control. Press **?** for the list.

  | Key | Action |
  |---|---|
  | `Space` | Play / pause |
  | `[` `]` | Previous / next year (← → on the timeline) |
  | `1`–`4` | Choose a theme and play |
  | `D` | Duet on / off |
  | `L` | Cycle Duet listening mode |
  | `R` | Repeat the description |
  | `C` | Description detail: off / brief / full |
  | `S` | Speak aloud on / off |
  | `G` | Switch Jukebox ⟷ Guess the Year |

- **Alt text generated from the data.** Each frame's alt text comes from its own features. For example: *"Greenhouse Gases, August 2014. World map of methane in the mid-troposphere… mid-toned, moderate brightness, moderate colour variance, sparse methane-rich air (2.0 %)… Mean methane at 400 hPa: 1,815 ppb."*
- **Live data captions**, like subtitles. Plain-English numbers and the sound they made, synced to the bar you are hearing. Screen readers hear each year at the detail level you choose. When you pause or scrub, the full description is read once.
- **Speak aloud** for people without a screen reader. It uses the browser's voice, ducks the music while speaking, and never lags behind the audio.
- **ARIA throughout.** Radio groups, tabs, a native dialog, live regions, named controls (16 of 16) and `aria-valuetext` on the timeline ("Aug 08–15, 2014, frame 14 of 25").
- **Colour-blind-safe.** Okabe-Ito colours (blue = oldest / left, orange = newest / right), always paired with text or shape. Every text colour pair has at least 5 : 1 contrast. Reduced motion is respected.

## Run it

Requires Node 20.19+ or 22.12+ (Vite 8).

```bash
cd web
npm install
npm run dev          # http://localhost:5173
```

For an offline demo build, run `npm run build` and serve `web/dist/` with any static server (`npm run preview`). No backend is needed, and all NASA data is precomputed and bundled.

To regenerate the data from NASA (Python 3.10+):

```bash
python -m venv .venv
source .venv/bin/activate            # Windows: .venv\Scripts\activate
pip install -r requirements.txt
python scripts/fetch_frames.py       # downloads frames, colormaps, EIC cover art
python scripts/extract_features.py   # writes data/features, data/display, data/themes.json
```

## How the mapping works (short version)

```js
note        = scale[Math.floor((hue / 360) * 10) % 10]      // C minor pentatonic, C4–Bb5
velocity    = clamp(0.3 + brightness * 0.7, 0.3, 1.0)
timbre      = colorVariance < 0.15 ? 'sine' : colorVariance < 0.35 ? 'triangle' : 'sawtooth'
notesPerBar = 1 + Math.round(pixelDensity * 7)
tempoBPM    = 80 + Math.round(frameDelta * 80)
interval    = frameDelta > 0.5 ? 'minor third (tense)' : 'perfect fifth (consonant)'
pan         = latBand === 'north' ? -0.8 : latBand === 'south' ? 0.8 : 0
```

`hue` is measured on a cool → warm axis, so warm colours sound high. Every feature is normalized per theme first. "Active" pixels are defined in real units by inverting NASA's published colormaps: a detected fire, sea ≥ 10 cm above its mean, NO₂ ≥ 5 × 10¹⁵ molecules/cm², or methane ≥ 1,900 ppb.

The full explanation, normalization ranges, Duet measurements and caveats are in **[docs/mapping-explainer.md](docs/mapping-explainer.md)**.

## Data

| Theme | NASA dataset | Years |
|---|---|---|
| Wildfires | MODIS/Terra Thermal Anomalies & Fires (8-day, Aug 8–15) | 2001–2025 |
| Sea Level Change | JPL MEaSUREs Sea Surface Height Anomalies (TOPEX/Poseidon, Jason-1/2/3) | 1992–2018 |
| Air Quality | OMI/Aura Tropospheric NO₂ (3-day mosaic, Mar 15–17) | 2005–2025 |
| Greenhouse Gases | AIRS/Aqua Methane at 400 hPa (August mean) | 2003–2026 |

The 97 frames come from [NASA GIBS](https://nasa-gibs.github.io/gibs-api-docs/), the imagery service behind [NASA Worldview](https://worldview.earthdata.nasa.gov). Theme cover art comes from the [NASA SVS Earth Information Center](https://svs.gsfc.nasa.gov/gallery/earth-information-center/) dashboards. The EIC gallery's own frame sequences are undated single-year HDR animations, so dated yearly frames come from GIBS, the fallback named in our build plan. Every frame's source URLs are recorded in its JSON.

## Repository

```
data/        raw_frames/ (GIBS PNGs + manifests + colormaps), features/ (one JSON per frame),
             display/ (frames as shown), themes.json (metadata + normalization ranges)
scripts/     fetch_frames.py, extract_features.py, theme_defs.py
web/         index.html, styles/main.css, src/
               audio/   sonify.js (locked formulas, Voice, mix), scales.js, duet.js, levelCheck.js (dev)
               ui/      turntable.js, themeTiles.js, mappingReadout.js, guessTheYear.js, captions.js, a11y.js
               data/    loader.js
assets/      thumbnails/ (NASA SVS EIC cover images)
docs/        mapping-explainer.md
demo/        demo-script.md (90-second video)
```

## Credits and license

Imagery courtesy of NASA EOSDIS GIBS / Worldview, built on MODIS (Terra), OMI (Aura), AIRS (Aqua) and JPL MEaSUREs altimetry. Cover art from the NASA Scientific Visualization Studio's Earth Information Center. NASA does not endorse this project.

Code is released under the [MIT License](LICENSE).
