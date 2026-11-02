# Terra Vox

**Hear how the planet changed.** Terra Vox is an Earth Information Jukebox for the NASA Space Apps Challenge 2026 challenge *The Earth Information Jukebox*. It turns real NASA Earth imagery into live, generated music, so blind and low-vision people (and everyone else) can experience climate data by ear.

## The moment: Duet mode

Press **D**. The **oldest** satellite frame of a theme plays in your **left ear** and the **newest** in your **right**, at the same time, through the *identical* mapping. Whatever differs between your ears is the planet having changed.

> **Greenhouse Gases, 2003 ⟷ 2026.** On the left, one low, calm C4 on a soft triangle wave at 88 BPM. On the right, eight buzzy sawtooth notes up at B♭5, 136 BPM, over a tense minor third.
> Methane at 400 hPa: **1,769 → 1,887 ppb**. Air at or above 1,900 ppb: **0 % → 49 %** of the planet.

That contrast is measured, not asserted: rendered offline, the newest ear's spectral centroid sits about two octaves above the oldest's (390 Hz → 1,520 Hz), it plays 12× as many notes per second, and the two ears are separated by 45 dB. Details are in [docs/mapping-explainer.md](docs/mapping-explainer.md#4-duet-mode-the-gap-you-can-hear).

Headphones are best for Duet. On one speaker or one earbud, choose **Take turns** and the two years alternate, centred.

## What it does

- **Four themes, chosen for contrasting sound signatures.** Wildfires (spiky, event-driven), Sea Level Change (slow, monotonic), Air Quality (noisy, daily) and Greenhouse Gases (smooth, trending).
- **Two sides to every record.** *Side A* plays a calibrated year-by-year record: one global NASA frame per year, always taken from the same calendar window. *Side B* (press **F** to flip the record) plays the theme's own NASA Earth Information Center visualization, frame by frame, through the same locked formulas. Each side-B frame keeps NASA's date stamp, or for the sea-level porthole, its water level.
- **Real-time sonification.** Each bar is one year (side A) or one frame (side B). Hue, brightness, colour variance, active-region density, change from the previous frame and latitude drive pitch, loudness, timbre, rhythm, tempo, harmony and stereo position through fixed formulas. Every note is constrained to C minor pentatonic, so it is always listenable.
- **Normalized across themes.** Every feature is scaled against its own track's history before the formulas run, and the mix is loudness-calibrated, so switching themes never blows out the mix or goes silent.
- **The planet.** A WebGL globe shows the frame being heard, with a spark for each note where its signal sits. In Duet the planet splits at the seam: the oldest year on the left half, the newest on the right.
- **Live mapping readout.** A mixing desk shows the numbers driving the sound right now (warmth 0.65 → E♭5, density 0.60 → 5 notes a bar …), plus the raw values and normalization ranges.
- **Field guide.** Under the player, each theme is checked against the record scientists cite: NOAA's global methane, NOAA's satellite sea-level record and NASA OMI regional NO₂. The app's own frames are drawn on the same chart, so you can see where a snapshot agrees with the trend. Published findings are linked, and every number names its source.
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
  | `F` | Flip the record: side A (every year) / side B (NASA EIC visualization) |
  | `L` | Cycle Duet listening mode |
  | `R` | Repeat the description |
  | `C` | Description detail: off / brief / full |
  | `S` | Speak aloud on / off |
  | `M` | Reduce motion on / off |
  | `G` | Switch Jukebox ⟷ Guess the Year |
  | `?` | Show the shortcuts |

- **Alt text generated from the data.** Each frame's alt text comes from its own features. For example: *"Greenhouse Gases, August 2014. World map of methane in the mid-troposphere… mid-toned, moderate brightness, moderate colour variance, sparse methane-rich air (2.0 %)… Mean methane at 400 hPa: 1,815 ppb."*
- **Live data captions**, like subtitles. Plain-English numbers and the sound they made, synced to the bar you are hearing. Screen readers hear each year at the detail level you choose. When you pause or scrub, the full description is read once.
- **Speak aloud** for people without a screen reader. It uses the browser's voice, ducks the music while speaking, and never lags behind the audio.
- **ARIA throughout.** Radio groups, tabs, a native dialog, live regions, named controls (16 of 16) and `aria-valuetext` on the timeline ("Aug 08–15, 2014, frame 14 of 25").
- **Colour-blind-safe.** Okabe-Ito colours (blue = oldest / left, orange = newest / right), always paired with text or shape.
- **High contrast.** Text under 24 px is at least 7 : 1 against its background; larger text is at least 4.5 : 1. Focus is a 3 px yellow ring on every control.
- **Motion you control.** By default the app follows your system's reduced-motion setting. **Reduce motion** (or `M`) overrides it either way and is remembered. With it on, the planet holds still, transitions become instant and the beat shows as a colour change instead of a ring.

## Design

The interface is an instrument floating in orbit: a dark hull, a horizon, and the planet as the biggest thing on screen. The Duet split is its one moment of spectacle. The full brief is [DESIGN.md](DESIGN.md), covering tokens, type, motion, components and a review protocol. Its rules are enforced in code. Every colour, size, radius, duration and easing lives in `web/styles/main.css` `:root`, and the scripts read them from there (`web/src/ui/tokens.js`). Only transform, opacity and WebGL uniforms animate. There are no shadows, gradients, glows, pills or all-caps.

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
python scripts/fetch_frames.py       # side A: GIBS frames, colormaps, EIC cover art
python scripts/extract_features.py   # writes data/features, data/display, data/themes.json
python scripts/extract_points.py     # where each frame's signal is, for the note sparks
python scripts/fetch_reference.py    # field guide: NOAA methane and sea level, OMI regional NO2
python scripts/fetch_eic.py          # side B: NASA SVS EIC movies, sampled and measured (needs ffmpeg)
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

**Side A.** The 97 frames come from [NASA GIBS](https://nasa-gibs.github.io/gibs-api-docs/), the imagery service behind [NASA Worldview](https://worldview.earthdata.nasa.gov), each sampled in the same calendar window every year so the seasonal cycle cancels out. "Active" pixels and headline values are read in real units by inverting NASA's published colormaps. Every frame's source URLs are recorded in its JSON.

**Side B: NASA Earth Information Center visualizations** ([SVS EIC gallery](https://svs.gsfc.nasa.gov/gallery/earth-information-center/)), one per theme:

| Theme | Visualization | Frames | What each frame reads out |
|---|---|---|---|
| Wildfires | [SVS 5113](https://svs.gsfc.nasa.gov/5113/) Active Fires As Observed by VIIRS, Oct 2024 – Oct 2026 | 40, dated from NASA's stamp | share of land where VIIRS saw fire (5-day window) |
| Sea Level Change | [SVS 5235](https://svs.gsfc.nasa.gov/5235/) Sea Level Through a Porthole, 1993–2023 | 31, by water level | sea level above 1993, read off the porthole's own ruler: waves around 1–3 cm at first, 11.2 cm at the end (NASA's own 2023 marker sits at about 10.8) |
| Air Quality | [SVS 5175](https://svs.gsfc.nasa.gov/5175/) TEMPO NO₂ over North America, Aug 28–31 2023 | 37 daylight scans with NASA's EDT stamp (11 of the 48 sampled showed no NO₂ at night or dawn and are skipped) | mean NO₂ in view, every pixel matched to the frame's colour bar, scaled by its tick marks |
| Greenhouse Gases | [SVS 5116](https://svs.gsfc.nasa.gov/5116/) Global Atmospheric Methane (GEOS), 2021 | 24 | share of the globe under dense methane haze |

**Field guide reference records.**

| Theme | Record | Source |
|---|---|---|
| Greenhouse Gases | Global surface methane, annual and monthly, 1984–2025 (1,645 → 1,936 ppb); CO₂ and N₂O for context | [NOAA Global Monitoring Laboratory](https://gml.noaa.gov/ccgg/trends_ch4/) |
| Sea Level Change | Global mean sea level from TOPEX/Poseidon, Jason-1/2/3 and Sentinel-6MF; +101 mm from 1993 to 2024, trend 3.1 mm/yr | [NOAA Laboratory for Satellite Altimetry](https://www.star.nesdis.noaa.gov/socd/lsa/SeaLevelRise/) |
| Air Quality | March mean tropospheric NO₂ for four regions and the globe, 2005–2025, compared on three-year averages at each end | NASA OMI via GIBS, derived by Terra Vox (method in `data/reference.json`) |
| Wildfires | Published MODIS studies (Cunningham et al. 2024; Andela et al. 2017) | linked in `data/context.json` |

Substitutions, stated plainly:
- The GIBS sea-surface-height layer ends in 2018, so NOAA's altimetry record carries the field guide to 2025.
- The regional NO₂ means are computed by Terra Vox from NASA's OMI layer. They are not an official NASA product, and the top of the GIBS palette saturates, so peaks read low.
- On side B, the top of TEMPO's colour bar fades to the same black as space, so values above about 10 ×10¹⁵ cannot be read and are left out. TEMPO only scans in daylight, so the movie's overnight frames are skipped.

## Repository

```
data/        raw_frames/ (GIBS PNGs + manifests + colormaps), features/ (one JSON per frame),
             display/ (frames as shown), points/ (note-spark positions), themes.json,
             eic.json + eic/ (side B frames), reference.json (field guide records),
             legends.json (map keys), context.json (checked facts and citations)
scripts/     fetch_frames.py, extract_features.py, extract_points.py, fetch_reference.py,
             fetch_eic.py, eic_labels.json (NASA date stamps), theme_defs.py
web/         index.html, styles/main.css (all design tokens), src/
               audio/   sonify.js (locked formulas, Voice, mix), scales.js, duet.js, levelCheck.js (dev)
               ui/      globe.js, turntable.js, odometer.js, themeTiles.js, mappingReadout.js,
                        fieldGuide.js, mapKey.js, guessTheYear.js, captions.js, a11y.js, tokens.js
               data/    loader.js
assets/      thumbnails/ (NASA SVS EIC cover images)
docs/        mapping-explainer.md
demo/        demo-script.md (90-second video)
DESIGN.md    the design brief: tokens, type, motion, components, review protocol
```

## Credits and license

Imagery courtesy of NASA EOSDIS GIBS / Worldview, built on MODIS (Terra), OMI (Aura), AIRS (Aqua) and JPL MEaSUREs altimetry. Side B visualizations and cover art are by NASA's Scientific Visualization Studio for the Earth Information Center; each track's credits are in `data/eic.json`. TEMPO data from the Smithsonian Astrophysical Observatory. Reference records from the NOAA Global Monitoring Laboratory (Lan, Thoning and Dlugokencky) and the NOAA Laboratory for Satellite Altimetry. NASA and NOAA do not endorse this project.

Code is released under the [MIT License](LICENSE).
