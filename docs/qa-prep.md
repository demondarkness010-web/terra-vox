# Q&A prep: 15 questions a judge is likely to ask

Each answer is under 60 words. **Read these out loud once and change any answer that isn't true for you** (Y3 in the plan). A follow-up you can't answer about your own project costs more than any bug.

### 1. Why sonify the measured value instead of the image?

The image is NASA's colour choice; the value is the measurement. We invert NASA's own colormap back to ppb, cm or molecules/cm², put it on a fixed range per theme, and play that. So a louder, higher note means more methane, not a redder pixel. The same mapping plays every year, which makes the Duet a fair comparison.

### 2. Why does Wildfires show no clear trend? Isn't that a failure?

No, it's the finding. Global fire area swings with drought, El Niño and land use; it hasn't simply risen. The app's own rule compares the gap to year-to-year noise and says "no clear change" when it can't tell. Hearing a jumpy record next to steady methane teaches more than forcing every theme to rise.

### 3. How do you know a listener can hear the difference?

`scripts/validate_mapping.py` runs every frame through the app's mapping: pitch, loudness, density and tempo follow the measured value at r ≥ 0.82 on all tracks. Duet changes several cues at once (pitch, notes per bar, tempo, timbre, harmony). A real listener test is still needed; we report none until it has happened.

### 4. What did the AI write, and what did you decide?

Claude Code wrote most of the code and drafts of the docs. I chose the concept (two moments, one in each ear), the datasets, the fixed ranges, the accessibility goals, and which results to keep or reject, and I tested it. *(Edit to match what you actually did before the event.)*

### 5. Why did development start before the event?

*(Answer truthfully from your own situation; see the local-lead message in [submission.md](submission.md).)* The commit history is public and unedited: work ran Oct 29 to Nov 2, 2026. If the lead rules that only weekend work counts, we will say so and submit only what was done during the event.

### 6. What would you build next?

A real study with blind and low-vision students using the [classroom guide](classroom.md); more GIBS layers through the "add your own dataset" path; human-reviewed translations; and a reference record for NO₂ (ground stations) so Air Quality can earn "high confidence" too.

### 7. Are these yearly averages or single snapshots?

Yearly averages. Methane: the 12 AIRS monthly maps. Sea level: one frame a month. NO₂: one 3-day composite a month per region. Fire: the June–September season. The current year is partial, so it is compared with the oldest year over the same months, and the caption says so. The old snapshots are in `data/legacy/`.

### 8. Does it agree with independent records?

Methane against NOAA's global surface mean: r = 0.992 (2003–2025, 23 years). Sea level against NOAA's satellite altimetry: r = 0.997 (1993–2018, 26 years). Both numbers and how they were computed are in [mapping-explainer.md](mapping-explainer.md). Press **N** in a Duet to hear NOAA's values played through the same mapping.

### 9. Why do the satellite and NOAA levels differ?

AIRS measures methane about 7 km up (400 hPa); NOAA samples air at the surface, where methane is denser. Sea level: NOAA's record starts from 1993, our map from the 1993–2012 mean. The levels differ; the trend is what should match, and it does.

### 10. What does "high confidence" mean?

A written rule. High: yearly averages and agreement with an independent NOAA record at r ≥ 0.9. Medium: yearly averages, no reference. Low: one window per year, or a known instrument issue (Terra's orbit drift for fires, OMI's row anomaly for NO₂). The change class (clear, small, none) compares the gap with year-to-year noise.

### 11. How is this accessible?

Sound first: everything works by keyboard; captions and alt text are generated from the data; Speak aloud uses the browser voice; Take turns works on one speaker or one ear; reduced motion; Hindi and Spanish. axe-core reports no violations, and Lighthouse accessibility is 100.

### 12. Where's the Earth Information Center part?

On the first screen: the second switch, "NASA EIC visualizations". It plays four NASA SVS Earth Information Center visualizations frame by frame, each frame's reading turned into sound as it appears, with the title, credit and a link to the SVS page. Key **F** flips it.

### 13. Why these sounds? Isn't it arbitrary?

Higher, louder and buzzier for "more" follows common listener expectations; one instrument per theme so you know what you're hearing; every note in C minor pentatonic so nothing clashes. The ranges are fixed from physics, not stretched per year, so a quiet year really is quiet. The full reasoning is in the explainer.

### 14. Does it need the internet or an account?

No account and no backend. It's a static site; after one visit it installs as an app and plays offline, with every frame of data cached. The birth-year field stores and sends nothing; a shared link carries only the theme and the two years.

### 15. How big is the problem?

338 million people are blind or have moderate to severe vision loss (Bourne et al., Lancet Global Health 2021, via IAPB Vision Atlas), and climate data almost always arrives as a chart. Terra Vox makes the same NASA records usable by ear.

---

## How the code fits together

```
scripts/build_annual.py   NASA GIBS frames → yearly values per theme → data/features, themes.json
scripts/fetch_reference.py NOAA methane + sea level, OMI NO₂ by region → data/reference.json
scripts/validate_mapping.py runs every frame through the mapping, fails if any r < 0.8
web/src/data/loader.js    loads the JSON, formats values, picks years (frameForYear)
web/src/data/trust.js     NOAA line, confidence rule, change class, same-months averaging
web/src/audio/mapping.js  value → pitch, loudness, timbre; share → notes; distance → tempo, harmony
web/src/audio/duet.js     two voices (left/right) + optional NOAA voice, gap description
web/src/ui/captions.js    captions, alt text, spoken lines from the same numbers
web/src/i18n/             en / hi / es strings, t() and number formatting
web/src/main.js           wiring: view switch, keys, birth year, URL state, offline worker
```
