# How Terra Vox translates sight into sound

Terra Vox plays NASA Earth imagery as music. Every sound comes from numbers measured on a real satellite frame. The mapping is fixed, published below and reproducible: run the same frame through it and you get the same sound.

The constraint that keeps it listenable is that every melodic note comes from **C minor pentatonic** (C, E♭, F, G, B♭ over two octaves, C4–B♭5). Those five notes have no semitone clashes, so whatever the data does, the result sounds like music rather than noise.

---

## 1. From a NASA frame to six numbers

`scripts/extract_features.py` (Python, OpenCV) measures six features on each frame. It runs once, offline, and ships the results as JSON, so the browser never needs to reach NASA during a demo.

| Feature | What is measured | Range |
|---|---|---|
| `hue` | Colour *warmth* of the frame. Each pixel's HSV hue is placed on a cool → warm axis (blue 0 → cyan → green → yellow → red → crimson 360) and averaged, weighted by saturation so grey pixels carry no hue. | 0–360 |
| `brightness` | Mean Rec. 709 relative luminance | 0–1 |
| `colorVariance` | Mean per-channel RGB standard deviation ÷ 127.5 | 0–1 |
| `pixelDensity` | Share of valid pixels that are **active** (rule per theme, below) | 0–1 |
| `frameDelta` | Mean absolute RGB change from the previous year's frame ÷ 255. The first frame uses its change to the second, so the oldest year is not silent-tempo by construction. | 0–1 |
| `latBand` | Mean latitude of the active pixels: `north` (> 23.44°), `south` (< −23.44°), otherwise `equatorial` | category |

**Why a warmth axis and not plain hue?** Standard HSV puts red at 0°, so mapping raw hue straight to pitch would make the *hottest* colours the *lowest* notes. A circular mean of a blue-to-red palette also averages out to magenta. On the warmth axis the build plan's rule holds: **cool colours sound low, warm colours sound high.** The plain HSV mean is still recorded in each JSON (`raw.hsvHueMean`) for transparency.

**Active pixels, per theme:**

| Theme | Active when… |
|---|---|
| Wildfires | a satellite detected a fire there (any marked pixel) |
| Sea Level Change | the sea surface stands **≥ 10 cm** above its 1993–2012 mean |
| Air Quality | tropospheric NO₂ **≥ 5 × 10¹⁵ molecules/cm²** |
| Greenhouse Gases | methane at 400 hPa **≥ 1,900 ppb** |

The physical thresholds work because we **invert NASA's published colormaps**. GIBS publishes the exact RGB → value table for each layer, and every pixel in our frames matched a palette entry exactly (100.00 % match). That also gives every frame real units for the captions (ppb, cm, molecules/cm²), not just colours.

## 2. Per-theme normalization (before any formula runs)

A wildfire frame is a black map with small bright markers, while a methane frame is colour wall-to-wall. Their raw brightness values sit in completely different ranges. Feed raw values into the formulas and switching themes would jump from near-silence to a wall of sound.

So `hue`, `brightness`, `colorVariance`, `pixelDensity` and `frameDelta` are each **min–max scaled against their own theme's history**:

```
normalized = (raw − themeMin) / (themeMax − themeMin)      // hue then × 360, capped below 360
```

Every theme now drives the formulas across the same 0–1 range. The ranges are stored in `data/themes.json`, and the app's *Live mapping → Raw values and normalization* panel shows raw value, theme range and normalized value for the frame you are hearing.

| Theme | brightness range | pixelDensity range | frameDelta range |
|---|---|---|---|
| Wildfires | 0.051–0.055 | 0.070–0.083 | 0.017–0.021 |
| Sea Level Change | 0.711–0.764 | 0.054–0.248 | 0.170–0.258 |
| Air Quality | 0.958–0.960 | 0.004–0.009 | 0.022–0.024 |
| Greenhouse Gases | 0.440–0.696 | 0.000–0.492 | 0.015–0.045 |

> **Honest caveat:** Air Quality and Wildfires have narrow raw ranges, so normalization magnifies small differences. That is what makes their daily and event-driven noise audible. Treat any single year as weather, and listen for the pattern.

## 3. The locked formulas

Implemented verbatim in `web/src/audio/sonify.js → mapFeatures()`, on the normalized features:

```js
scaleDegree = Math.floor((hue / 360) * scale.length) % scale.length
note        = scale[scaleDegree]                    // C4 Eb4 F4 G4 Bb4 C5 Eb5 F5 G5 Bb5

velocity    = clamp(0.3 + (brightness * 0.7), 0.3, 1.0)

timbre      = colorVariance < 0.15 ? 'sine'
            : colorVariance < 0.35 ? 'triangle'
            : 'sawtooth'

notesPerBar = 1 + Math.round(pixelDensity * 7)      // 1–8
tempoBPM    = 80 + Math.round(frameDelta * 80)      // 80–160
interval    = frameDelta > 0.5 ? 'minor third (tense)' : 'perfect fifth (consonant)'
pan         = latBand === 'north' ? -0.8 : latBand === 'south' ? 0.8 : 0
```

| You see… | You hear… |
|---|---|
| warmer colours | higher notes |
| a brighter frame | a louder layer (never below 0.3, so never silent) |
| more colour variety | a richer patch: sine → triangle → buzzy sawtooth |
| more active area (fire, high water, pollution, methane-rich air) | more notes per bar |
| a bigger change from last year | faster tempo, and above 0.5 a tense minor third instead of a calm fifth |
| activity north / south of the tropics | sound placed left / right in your headphones |

**How a bar is played.** One bar is one year. The bar opens on the mapped `note`, and the remaining `notesPerBar − 1` notes walk a fixed pentatonic figure up from it, so the pitch centre still follows the data. Underneath, a soft dyad sounds the mapped `interval` an octave below the note. That harmony note can step outside the pentatonic set (that is the "tension"), but the melody never does.

**Mix normalization.** A sawtooth carries far less energy than a sustained sine at the same setting. Untrimmed, the timbre switch alone moved the level by 15 dB. We rendered every timbre × density × tempo combination offline, measured RMS, and trimmed each timbre. Loudness now follows `velocity` as the mapping intends: across the oldest and newest frames of all four themes, levels sit between −18 and −29 dB RMS (the 0.3–1.0 velocity range), with peaks at or below −5 dB. A compressor and a −1 dB limiter guard the master bus.

## 4. Duet mode: the gap you can hear

Duet sends the **oldest** and the **newest** frame of a theme through the *identical* mapping at the same time: oldest hard **left**, newest hard **right**. Each keeps its own data-driven tempo, and both start on the same downbeat. Because the mapping is identical, whatever differs between your ears is the planet having changed.

We checked that the gap is real and audible by rendering each Duet offline and measuring each ear separately:

| Theme | Oldest (left) | Newest (right) |
|---|---|---|
| **Greenhouse Gases** 2003 → 2026 | C4, 1 note/bar, 88 BPM, triangle, calm fifth; spectral centroid ≈ 390 Hz; 0.4 notes/s | B♭5, 8 notes/bar, 136 BPM, sawtooth, tense third; centroid ≈ 1,520 Hz; 4.5 notes/s |
| **Sea Level Change** 1992 → 2018 | G4, 2 notes/bar, sawtooth; 1.0 notes/s | B♭5, 8 notes/bar, triangle; 3.0 notes/s, about 6 dB louder |
| **Wildfires** 2001 → 2025 | E♭5, 5 notes/bar, sawtooth; centroid ≈ 1,420 Hz | C4, 1 note/bar, sine, tense third; centroid ≈ 230 Hz |
| **Air Quality** 2005 → 2025 | F5, 7 notes/bar, 141 BPM, sawtooth, tense third; centroid ≈ 1,460 Hz; 4.1 notes/s | G5, 3 notes/bar, 112 BPM, sine, calm fifth; centroid ≈ 640 Hz; 1.4 notes/s |

Stereo separation measured **43–53 dB** on every theme, so the two years stay in their own ears.

What the numbers behind those sounds say:
- **Methane:** 1,769 → 1,887 ppb mean at 400 hPa. The share of air at or above 1,900 ppb went from 0 % to 49 %.
- **Sea level:** −0.6 → +5.3 cm mean anomaly. Ocean ≥ 10 cm above the mean went from 8.7 % to 24.8 %.
- **NO₂:** the global mean rose slightly, but the heavily polluted area shrank. The sound follows the area, so it calms.
- **Fires:** the 2025 Aug 8–15 window had the lowest fire-marker coverage of the 25 years sampled (7.0 % of the map vs 7.8 % in 2001).

The data sets the direction of each story; Terra Vox reports it rather than choosing it.

**Accessibility inside Duet.** Hard panning hides one year from anyone listening on one speaker, one earbud, or with hearing in one ear. Duet therefore also offers **Take turns** (one bar of each year, centred, alternating), **Oldest only** and **Newest only**.

## 5. Data sources

| Theme | Dataset (NASA) | GIBS layer | Frames |
|---|---|---|---|
| Wildfires | MODIS/Terra Thermal Anomalies & Fires | `MODIS_Terra_Thermal_Anomalies_All` | 8-day union, Aug 8–15, 2001–2025 (25) |
| Sea Level Change | JPL MEaSUREs Gridded Sea Surface Height Anomalies (TOPEX/Poseidon, Jason-1/2/3) | `JPL_MEaSUREs_L4_Sea_Surface_Height_Anomalies` | 5-day grid date nearest Oct 1, 1992–2018 (27) |
| Air Quality | OMI/Aura Tropospheric NO₂ Column | `OMI_Nitrogen_Dioxide_Tropo_Column` | 3-day gap-filling mosaic, Mar 15–17, 2005–2025 (21) |
| Greenhouse Gases | AIRS/Aqua Methane at 400 hPa, monthly | `AIRS_L3_Methane_400hPa_Volume_Mixing_Ratio_Monthly_Day` | August mean, 2003–2026 (24) |

Every frame is sampled in the same calendar window each year, so the seasonal cycle cancels out and frame-to-frame change is year-over-year change.

- **Imagery:** [NASA GIBS](https://nasa-gibs.github.io/gibs-api-docs/), the imagery service behind [NASA Worldview](https://worldview.earthdata.nasa.gov). Global equirectangular WMS frames, 1024 × 512. Colormaps come from `gibs.earthdata.nasa.gov/colormaps/v1.3/`.
- **Cover art and context:** the [NASA SVS Earth Information Center gallery](https://svs.gsfc.nasa.gov/gallery/earth-information-center/), its Wildland Fires, Climate Vital Signs, Air Quality and Greenhouse Gases dashboards.
- **Why GIBS rather than SVS frames:** the EIC gallery publishes its visualizations as undated HDR (EXR) frame sequences covering a single year, so it cannot supply an oldest-vs-newest pair. GIBS serves the same instruments' imagery by date, which is the fallback the build plan names. Every source URL is recorded per frame in `data/features/<theme>/<date>.json` and `data/raw_frames/<theme>/manifest.json`.
- **Known instrument note:** Terra's orbit has been drifting in recent years, which can lower its fire counts. The 2025 dip may be partly instrumental.
- **What the "mean" values are:** the headline numbers (mean methane, mean sea-surface height anomaly, mean NO₂) are unweighted averages over the map's data pixels. An equirectangular map over-represents the poles, and values are read back from 1-step colour bins. They are a consistent yardstick across our frames, not a substitute for NASA's official area-weighted global means.

## 6. Reproduce it

```bash
python -m venv .venv && .venv/Scripts/activate      # or: source .venv/bin/activate
pip install -r requirements.txt
python scripts/fetch_frames.py       # ~100 GIBS frames, colormaps, EIC covers
python scripts/extract_features.py   # features + normalization -> data/
```

Every frame's JSON holds its raw measurements, normalized features, real-unit values and the exact GIBS URLs it came from.
