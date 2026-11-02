# How Terra Vox translates sight into sound

> **Limits, stated up front**
> - **One snapshot per year is not an annual mean.** Each side A year is one calendar window (an 8-day fire composite, a 3-day NO₂ mosaic, one October sea-surface grid, one August methane month), taken at the same time every year so the seasons cancel. It shows the direction of change, not an official yearly average. The field guide (behind **More**) sets each theme against the record scientists cite.
> - **NASA GIBS sea-surface height ends in 2018.** Side A's sea level stops there; NOAA's altimetry record in the field guide carries it to 2025, and side B's porthole reaches 2023.
> - **Reading values back from colours has quantisation error.** We invert NASA's published colormaps (every pixel matched a palette entry), but each colour stands for a bin, not an exact number, and the top of some palettes saturates over the most extreme places, so peaks read low.

Terra Vox plays NASA Earth imagery as music. **We sonify the measurement, not the picture of it**: every frame is first turned back into the physical number NASA's colours encode (ppb, cm, molecules/cm², fire areas), that number is placed on a fixed range written down for its theme, and the music follows it. The mapping is fixed, published below, and checked by a script: run the same frame through it and you get the same sound.

Every melodic note comes from **C minor pentatonic** (C, E♭, F, G, B♭ over two octaves). Those five notes have no semitone clashes, so whatever the data does, the result sounds like music rather than noise.

---

## 1. From a NASA frame to one measurement

`scripts/extract_features.py` (side A) and `scripts/fetch_eic.py` (side B) run once, offline, and ship JSON, so the browser never needs to reach NASA during a demo.

GIBS publishes the exact RGB → value table for each layer. Inverting it turns every pixel back into a value, and every pixel in our frames matched a palette entry exactly. From those values each frame gets three numbers, all on **fixed ranges** (`scripts/theme_defs.py`, `SOUND` in `scripts/fetch_eic.py`), never the min and max of our own frames: min–max scaling stretches any wobble to the full musical range and turns noise into music.

| Number | What it is | Drives |
|---|---|---|
| `value01` | The headline measurement, placed on its theme's fixed range (0 = bottom, 1 = top) | pitch, loudness, timbre: **how much** |
| `activeShare01` | The share of the map or region past the theme's "active" threshold, on a zero-based fixed range | notes per bar: **how widespread** |
| `fromFirst01` | \|`value01` − the oldest frame's `value01`\| | tempo and harmony: **how far it has moved** |

**Side A, the year-by-year record:**

| Theme | Measurement | Fixed range | Active share (density) | Share range |
|---|---|---|---|---|
| Wildfires | Separate fire areas: connected patches of MODIS detections in the 8-day August composite | 0–300 (record 295, 2022) | the count itself | — |
| Sea Level Change | Mean sea-surface height anomaly vs the 1993–2012 mean | −5 to +10 cm | ocean ≥ 10 cm above the mean | 0–50 % (record 25 %) |
| Air Quality | March mean tropospheric NO₂ over one region | 0–14 ×10¹⁵ molecules/cm² (record 13.0, North China 2011) | the region's observed air ≥ 5 ×10¹⁵ | 0–100 % North China (record 86 %); 0–50 % northern India, eastern US, western Europe (records 19, 26, 41 %) |
| Greenhouse Gases | Mean methane at 400 hPa | 1,750–1,950 ppb | air ≥ 1,900 ppb | 0–100 % (record 49 %) |

**Side B, the NASA Earth Information Center visualizations:** each yields one quantity, which drives pitch, loudness and density together.

| Visualization | Measurement | Fixed range |
|---|---|---|
| SVS 5113, Active Fires (VIIRS) | share of land where VIIRS saw fire | 0–5 % of land |
| SVS 5235, Sea Level Through a Porthole | water level read off the porthole's own ruler | 0–15 cm above 1993 |
| SVS 5175, TEMPO NO₂ over North America | mean NO₂ in view, matched to the frame's colour bar | 0–1.5 ×10¹⁵ (a continent-wide mean, mostly clean air; record 0.90) |
| SVS 5116, Global Atmospheric Methane | share of the globe under dense methane haze | 0–100 % |

**Why these choices:**
- **Wildfires count fire areas, not map coverage.** GIBS draws every detection as a dot of fixed screen size, so "percent of the map covered by dots" changes with the image resolution. A count of separate areas does not.
- **Air Quality follows one region at a time.** The global March mean barely moves (correlation with year 0.19), because regions move in opposite directions: North China's NO₂ peaked in 2011 and has fallen since, while northern India's has risen. Choose the region under the themes; the default is North China. The regional value is the mean over every day of March (`data/reference.json`), so it is steadier than the 3-day frame on screen.
- **Density ceilings of 50 %.** Notes per bar has only eight steps. A share that never passes 20 % would otherwise get one or two of them, and the rounding would hide the trend (northern India's density tracked its NO₂ at only r = 0.65 on 0–100 %; on 0–50 % it is 0.88). The ranges stay zero-based, so twice the area still plays about twice the notes.
- **The colour features are kept, not played.** Hue, brightness, colour variance and frame-to-frame pixel change are still measured and stored in every frame's JSON, for transparency, but they no longer drive the sound. They describe the picture; the sound describes the measurement.

## 2. The mapping

`web/src/audio/mapping.js → mapFeatures()`, a pure function the app and the validation script share:

```js
note        = scale[Math.floor(f.value01 * 9.999)]          // pitch = how much (C4–B♭5)
velocity    = 0.4 + 0.6 * f.value01                          // more = louder
timbre      = f.value01 < 0.33 ? 'sine' : f.value01 < 0.66 ? 'triangle' : 'sawtooth'
notesPerBar = 1 + Math.round(f.activeShare01 * 7)            // density = how widespread
tempoBPM    = 80 + Math.round(60 * f.fromFirst01)            // 80–140: how far it has moved
interval    = f.fromFirst01 >= 0.25 ? 'minor third (tense)' : 'perfect fifth (consonant)'
pan         = time only: oldest left, newest right
```

| The data… | You hear… |
|---|---|
| more of it (more methane, higher sea, more NO₂, more fire areas) | a higher note, louder, and a richer wave: sine → triangle → buzzy sawtooth |
| spread over more of the map or region | more notes per bar |
| further from where the record started | a faster tempo, and from a quarter of the range on, a tense minor third instead of a calm fifth |
| later in time | further to the right in your headphones |

**How a bar is played.** One bar is one year (side A) or one frame (side B). The bar opens on the mapped note, and the remaining notes walk a fixed pentatonic figure up from it, so the pitch centre still follows the data. Underneath, a soft dyad sounds the mapped interval an octave below. That harmony note can step outside the pentatonic set (that is the tension), but the melody never does.

**One instrument per theme.** The theme tells you what; the music tells you how much. Methane plays a **soft pad** (three slightly detuned oscillators, slow attack), sea level a **deep bass** (one octave down), wildfires **plucked notes** (instant attack, no sustain) and air quality **breathy noise** (pink noise band-passed around each note, under a soft lead). The scale and the mapping are the same for all four.

**Mix.** Each timbre and each instrument has a loudness trim, calibrated by rendering frames offline and measuring RMS (`web/src/audio/levelCheck.js`), so that a bigger value is never quieter. At the top of their ranges all four instruments sit within about 1.5 dB of each other (−15.8 to −17.2 dB RMS). Methane's Duet, measured per ear: 2003 at −20.4 dB, 2026 at −16.5 dB, so the year with more methane is louder. A compressor and a −1 dB limiter guard the master bus.

## 3. Proof: does the sound carry the data?

`scripts/validate_mapping.py` runs every frame of every track through the app's own `mapping.js` (imported in Node, so there is no second copy of the formulas) and prints Pearson's r between the measured value and each parameter. Tempo carries the distance from the oldest frame, so it is checked against |value − oldest value|; its r with the value itself is shown for reference and is expected to differ (Eastern US NO₂ fell, so the further it fell the faster it plays: r = −0.99 with the value, 0.99 with the distance). The script fails if any of pitch, loudness, density or tempo falls below 0.8 on any track.

```bash
python scripts/validate_mapping.py --markdown
```

| Track | Frames | Pitch | Loudness | Density | Tempo (vs distance) | Tempo vs value | Pass |
|---|---:|---:|---:|---:|---:|---:|:---:|
| Wildfires | 25 | 0.91 | 1.00 | 0.84 | 0.99 | -0.26 | yes |
| Sea Level Change | 27 | 0.98 | 1.00 | 0.86 | 1.00 | 0.79 | yes |
| Air Quality: North China Plain | 21 | 0.97 | 1.00 | 0.87 | 1.00 | 0.45 | yes |
| Air Quality: Northern India | 21 | 0.86 | 1.00 | 0.88 | 0.99 | 0.97 | yes |
| Air Quality: Eastern United States | 21 | 0.84 | 1.00 | 0.93 | 0.99 | -0.99 | yes |
| Air Quality: Western Europe | 21 | 0.89 | 1.00 | 0.97 | 0.99 | 0.55 | yes |
| Greenhouse Gases | 24 | 0.99 | 1.00 | 0.91 | 1.00 | 1.00 | yes |
| Active Fires As Observed by VIIRS, 2024–Present (SVS 5113) (side B) | 40 | 0.97 | 1.00 | 0.93 | 1.00 | -0.54 | yes |
| Sea Level Through a Porthole (2023) (SVS 5235) (side B) | 31 | 1.00 | 1.00 | 0.98 | 1.00 | 0.96 | yes |
| TEMPO – Nitrogen Dioxide Air Pollution Over North America (SVS 5175) (side B) | 37 | 0.88 | 1.00 | 0.82 | 0.99 | -0.27 | yes |
| Global Atmospheric Methane (CH₄) (SVS 5116) (side B) | 24 | 0.97 | 1.00 | 0.93 | 1.00 | -1.00 | yes |

Pitch and density are below 1.00 only because they are rounded to ten notes and eight note counts. Where a record moves through a small part of its range, few notes are used: northern India and the eastern US play two pitches (E♭4 and F4). That is honest: their NO₂ changed by about 1.3–2 ×10¹⁵ on a scale that has to hold North China's 13.

## 4. Stereo is time: Duet and the sweep

Stereo carries one thing only. **Duet** (press **D**) sends the **oldest** and the **newest** frame of a theme through the identical mapping at the same time: oldest hard **left**, newest hard **right**, both starting on the same downbeat. Because the mapping is identical, whatever differs between your ears is the planet having changed. Played one year at a time, the **sweep** follows the same rule: the voice starts at the left (oldest) and travels to the right as the years advance (±0.8, so no year ever leaves one ear entirely). Guess the Year plays centred, so the ear cannot give the answer away.

What each Duet plays (side A):

| Theme | Oldest (left) | Newest (right) | The measurement |
|---|---|---|---|
| **Greenhouse Gases** 2003 → 2026 | C4, 1 note a bar, 80 BPM, sine, calm fifth | E♭5, 4 notes a bar, 115 BPM, sawtooth, tense third, louder | 1,769 → 1,887 ppb; air ≥ 1,900 ppb 0 % → 49 % |
| **Sea Level Change** 1992 → 2018 | F3, 2 notes, 80 BPM, sine | E♭4, 4 notes, 104 BPM, sawtooth, tense third, louder | −0.6 → +5.3 cm; ocean ≥ 10 cm above the mean 8.7 % → 25 % |
| **Air Quality, North China** 2005 → 2025 | E♭5, 6 notes, sawtooth | C5, 5 notes, 90 BPM, triangle | 9.28 → 7.01 ×10¹⁵ (peak 12.97 in 2011) |
| **Air Quality, northern India** 2005 → 2025 | E♭4, 2 notes, sine | F4, 4 notes, 86 BPM | 2.13 → 3.44 ×10¹⁵; polluted share 4.2 % → 19 % |
| **Wildfires** 2001 → 2025 | G5, 7 notes, 80 BPM | B♭5, 8 notes, 85 BPM | 269 → 293 separate fire areas |

**Wildfires: global fire hasn't simply risen.** Listen to the record jump year to year. The count runs from 234 (2006) to 295 (2022), and burned area worldwide fell by about a quarter from 1998 to 2015 as savanna became farmland (Andela et al. 2017), while the most extreme fires grew more frequent (Cunningham et al. 2024). The music follows the count, so it shows the jumps, not a straight climb.

**Terra's orbit drift, checked.** MODIS on Terra left its formation in October 2022 and has drifted to an earlier overpass, away from the afternoon fire peak. `scripts/check_fire_drift.py` counts the same thing, the same way, from MODIS on Aqua. Before the drift (2003–2021) Terra/Aqua ran 0.91–1.10; in 2023, 2024 and 2025 it was 1.03, 1.07 and 1.03, still inside that range (`data/fire_check.json`). Aqua drifts too, so this is a cross-check, not proof.

**Accessibility inside Duet.** Hard panning hides one year from anyone listening on one speaker, one earbud, or with hearing in one ear. Duet therefore also offers **Take turns** (one bar of each year, centred, alternating), **Oldest only** and **Newest only**.

## 5. Data sources

| Theme | Dataset (NASA) | GIBS layer | Frames |
|---|---|---|---|
| Wildfires | MODIS/Terra Thermal Anomalies & Fires | `MODIS_Terra_Thermal_Anomalies_All` | 8-day union, Aug 8–15, 2001–2025 (25) |
| Sea Level Change | JPL MEaSUREs Gridded Sea Surface Height Anomalies (TOPEX/Poseidon, Jason-1/2/3) | `JPL_MEaSUREs_L4_Sea_Surface_Height_Anomalies` | 5-day grid date nearest Oct 1, 1992–2018 (27) |
| Air Quality | OMI/Aura Tropospheric NO₂ Column | `OMI_Nitrogen_Dioxide_Tropo_Column` | 3-day gap-filling mosaic, Mar 15–17, 2005–2025 (21); the sound follows each region's mean over all of March |
| Greenhouse Gases | AIRS/Aqua Methane at 400 hPa, monthly | `AIRS_L3_Methane_400hPa_Volume_Mixing_Ratio_Monthly_Day` | August mean, 2003–2026 (24) |

- **Imagery:** [NASA GIBS](https://nasa-gibs.github.io/gibs-api-docs/), the imagery service behind [NASA Worldview](https://worldview.earthdata.nasa.gov). Global equirectangular WMS frames, 1024 × 512. Colormaps from `gibs.earthdata.nasa.gov/colormaps/v1.3/`. Every frame's source URLs are recorded in `data/features/<theme>/<date>.json`.
- **Why side A uses GIBS:** most EIC visualizations cover a single year or a few days, so on their own they cannot supply a decades-long oldest-vs-newest pair. GIBS serves the same instruments' imagery by date.
- **Side B, the EIC visualizations themselves** (`scripts/fetch_eic.py`, `data/eic.json`), one NASA SVS movie per theme, sampled evenly:
  - **Fires (SVS 5113):** VIIRS fire radiative power over a moving 5-day window, 40 frames from 30 Oct 2024 to 30 Oct 2026, dated from NASA's stamp on each frame.
  - **Porthole (SVS 5235):** sea level 1993–2023. The water line is read against the ruler drawn in the frame. The final frame reads 11.2 cm; NASA's own "2023 sea level" marker sits at about 10.8.
  - **TEMPO (SVS 5175):** hourly NO₂ scans over North America, 28–31 Aug 2023, stamped in EDT. Every pixel is matched to the colour bar drawn in the frame, and the bar's six tick marks fix its scale. The bar's darkest end cannot be told from space, so values above about 10 ×10¹⁵ are left out, and TEMPO only scans in daylight, so 11 of the 48 sampled frames (night) are skipped.
  - **Methane (SVS 5116):** GEOS model methane through 2021; the share of the globe under dense haze.
- **Field guide** (`scripts/fetch_reference.py`, `data/reference.json`): NOAA GML global surface methane, NOAA LSA global mean sea level, and March OMI NO₂ for four regions and the globe, computed by Terra Vox by inverting the GIBS colormap over every day of March, weighted by cos(latitude). Not an official NASA product.
- **What the "mean" values are:** the headline methane and sea-level means are unweighted averages over the map's data pixels. An equirectangular map over-represents the poles. They are a consistent yardstick across our frames, not a substitute for NASA's official area-weighted global means.

## 6. Reproduce it

```bash
python -m venv .venv && .venv/Scripts/activate      # or: source .venv/bin/activate
pip install -r requirements.txt
python scripts/fetch_frames.py       # ~100 GIBS frames, colormaps, EIC covers
python scripts/fetch_reference.py    # NOAA records, regional OMI NO2
python scripts/extract_features.py   # measurements + the three sound inputs -> data/
python scripts/fetch_eic.py          # side B (needs ffmpeg)
python scripts/check_fire_drift.py   # Terra against Aqua
python scripts/validate_mapping.py   # the table above; exits 1 if any r < 0.8
```

`data/raw_frames/` is not in the repository (24 MB); `fetch_frames.py` rebuilds it from GIBS.
