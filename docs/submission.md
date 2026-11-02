# Submission kit

Everything to paste or check on submission day. Items marked **You** cannot be done from the code: they need you, a tester, or the event's organisers. Nothing here reports a result that hasn't happened.

**Submission window:** opens **Saturday, November 14, 2026 at 9:00 AM** and closes on **November 15** (check the exact closing time and time zone on your event page). Block an hour on one of those days even though the build is finished.

---

## 1. Disclosures (drafts: confirm or edit, then paste)

### AI use: **You** must confirm this is true before using it

> Built solo with Claude Code (AI coding assistant) for implementation; the concept, data choices, mapping design and testing are mine.

Every commit in the repository is co-authored by Claude, so this needs to be stated. If any part of the sentence isn't accurate (for example, if Claude proposed a design you then kept), change it until it is. Be ready to explain any part of the code in a live Q&A.

### Timeline: **You** ask your local event lead first

The repository's commits are dated **October 29 to November 2, 2026**, before the hackathon weekend. The official resources page says not to begin work on projects until the hackathon begins, and the judging guide doesn't address prior work. Ask your local lead before submitting. A message you can send:

> Hi, I'm entering The Earth Information Jukebox challenge solo. I built and committed a working version between October 29 and November 2 (public repo: github.com/demondarkness010-web/terra-vox). Is that allowed for my event, and if so how should I disclose it? I'm happy to submit only what I add during the hackathon if that's the rule.

Whatever the answer, put one honest line in the submission. Drafts:

- *If allowed:* "Development began October 29, 2026, before the event, with my local lead's approval; the commit history shows every change."
- *If only event-weekend work counts:* "The base app predates the event (commits from October 29); the work submitted for judging is the commits from November 14–15, listed in the README."

**Local lead's answer:** _(write it here when you have it)_

---

## 2. References (paste into the References field)

**NASA data**

- NASA EOSDIS Global Imagery Browse Services (GIBS) / Worldview layers: `MODIS_Terra_Thermal_Anomalies_All`, `MODIS_Aqua_Thermal_Anomalies_All` (drift check), `JPL_MEaSUREs_L4_Sea_Surface_Height_Anomalies`, `OMI_Nitrogen_Dioxide_Tropo_Column`, `AIRS_L3_Methane_400hPa_Volume_Mixing_Ratio_Monthly_Day`. https://worldview.earthdata.nasa.gov
- NASA Scientific Visualization Studio, for the Earth Information Center:
  - 5113, Active Fires As Observed by VIIRS, 2024–Present. NASA's Scientific Visualization Studio. Visualizer: Trent L. Schindler (USRA). Scientist: Doug C. Morton (NASA/GSFC). Blue Marble data courtesy of Reto Stöckli (NASA/GSFC). https://svs.gsfc.nasa.gov/5113/
  - 5235, Sea Level Through a Porthole (2023). NASA's Scientific Visualization Studio. Visualizer: AJ Christensen (SSAI). Global mean sea level computed at NASA GSFC under the NASA Sea Level Change program. https://svs.gsfc.nasa.gov/5235/
  - 5175, TEMPO: Nitrogen Dioxide Air Pollution Over North America. NASA's Scientific Visualization Studio. Data provided by the Smithsonian Astrophysical Observatory at the Center for Astrophysics | Harvard & Smithsonian. Visualizers: Kel Elkins, Trent L. Schindler (USRA), Cindy Starr (GST). https://svs.gsfc.nasa.gov/5175/
  - 5116, Global Atmospheric Methane (CH₄). NASA's Scientific Visualization Studio. Visualizers: Helen-Nicole Kostis (USRA), AJ Christensen (SSAI). Scientists: Lesley Ott (NASA/GSFC), Brad Weir (Morgan State University). https://svs.gsfc.nasa.gov/5116/
- NASA Sea Level Change portal; NASA AIRS project; NASA FIRMS; NASA Earth Observatory; NASA Earthdata (OMI, MODIS-to-VIIRS transition); NASA NTRS 20250000522 (Terra orbit drift); NASA SVS 5611.

**Other data and science**

- NOAA Global Monitoring Laboratory, global annual mean CH₄, CO₂ and N₂O. https://gml.noaa.gov/ccgg/trends_ch4/
- NOAA Laboratory for Satellite Altimetry, global mean sea level. https://www.star.nesdis.noaa.gov/socd/lsa/SeaLevelRise/
- GBD 2019 Blindness and Vision Impairment Collaborators (Bourne et al.), *Lancet Global Health* 9(2), e130–e143, 2021. https://doi.org/10.1016/S2214-109X(20)30425-3
- Andela et al. 2017, *Science*, https://doi.org/10.1126/science.aal4108; Cunningham, Williamson & Bowman 2024, *Nature Ecology & Evolution*, https://doi.org/10.1038/s41559-024-02452-2
- Hamlington et al. 2024, *Communications Earth & Environment*, https://doi.org/10.1038/s43247-024-01761-5; NASA JPL news, January 29, 2026
- Duncan et al. 2016, *JGR: Atmospheres*, https://doi.org/10.1002/2015JD024121; OMI row anomaly (FMI); WHO ambient air quality fact sheet, 2024
- WMO Greenhouse Gas Bulletin No. 21 (2025); IPCC AR6 WG I, chapter 7; US Greenhouse Gas Center

**Software and fonts**

- Tone.js 15.1.22 (MIT), three.js 0.186.1 (MIT), Vite 8.3.5 (MIT)
- Anybody and Atkinson Hyperlegible Next, via Fontsource (SIL Open Font License)
- Python: NumPy, OpenCV, Pillow, Requests; ffmpeg for side B frame sampling
- Claude Code (Anthropic), AI coding assistant (see the AI-use disclosure)

### Image rights: checked November 2, 2026

- Each SVS page's "Please give credit for this item to" line was compared with `data/eic.json`; all four match (5175's data line now uses the page's exact wording).
- No NASA logo, meatball or worm appears in the app, the README or the cover art (the four SVS covers were checked by eye). Keep it that way in the video.
- "NASA and NOAA do not endorse this project" stays in the README.

---

## 3. Tester session: **You** run it, then fill in only what happened

The plan's single highest-value hour. Reach out through a local blind association, a college disability office, or an online community of screen-reader users. A 20-minute video call is enough.

1. Send the live link: https://demondarkness010-web.github.io/terra-vox/. Don't explain how it works.
2. Ask them to press **4** and then **D**, and ask: *"Which ear sounds like more methane? Why?"*
3. Open Guess the Year (**G**) and play three rounds. Note how close each answer is.
4. Ask: *"What was confusing? What would you use this for?"*

| | Result |
|---|---|
| Tester (how they describe themselves, with permission) | |
| Screen reader / device / browser | |
| Methane Duet: picked the newer year? Their reason, in their words | |
| Guess the Year, round 1 / 2 / 3: answer vs truth | |
| What was confusing | |
| What they would use it for | |
| One thing changed because of them | |

Then add one line to the README's second bullet and to the video, for example *"A screen-reader user picked the newer year in 3 of 3 Duets."* Use the real numbers. If no tester is possible in time, run the same script with a sighted friend whose eyes are closed and say exactly that.

---

## 4. Before you submit: **You**

- [ ] **Enable Pages:** repo Settings → Pages → Source: **GitHub Actions**. The workflow in `.github/workflows/deploy.yml` then publishes every push to `main`. Open https://demondarkness010-web.github.io/terra-vox/ in a private window and confirm it plays sound within one click.
- [ ] **Tester session** done (section 3) and reported in the README with real numbers.
- [ ] **Video:** record from `demo/demo-script.md`, burn in captions, upload to YouTube as unlisted, put the link in the README's first screen. Play it once on a phone speaker (mono); if Duet means nothing there, add the on-screen text "Headphones: left = 2003, right = 2026".
- [ ] **GIF:** about 10 seconds of the methane Duet; replace `docs/media/duet.png` in the README with it (a still is there now).
- [ ] **README in your own voice:** rewrite the first screen (the line, the three bullets) yourself. Judges notice, and you'll present it better.
- [ ] **Screen-reader pass:** NVDA (Windows, free) or VoiceOver (Mac or iPhone): start, choose a theme, Duet, pause, Guess the Year. Fix anything that reads twice, reads nothing, or traps focus.
- [ ] **Browsers:** Chrome, Firefox, Safari and one phone. On iPhone, the first tap on **Put on headphones and start** must start the sound.
- [ ] **Disclosures** (section 1) pasted, local lead's answer noted.
- [ ] **References** (section 2) pasted.
- [ ] Submitted between **Nov 14, 9:00 AM** and the deadline on **Nov 15**.

### Already true in the repository

- Lighthouse accessibility 100 (mobile and desktop) and axe-core with 0 violations across the app's states (see Accessibility checks below).
- `python scripts/validate_mapping.py` passes: pitch, loudness, density and tempo correlate at r ≥ 0.82 with the measured value on all 11 tracks.
- In the methane Duet the right ear (2026) is higher (E♭5 vs C4) and louder (velocity 0.81 vs 0.46).
- Pan means only time: oldest left, newest right.
- The 2.2 billion figure and the "45 dB" claim are gone from the README, the video script and the app.
- Wildfires and Air Quality are reframed so the sound tells only what the data supports (fire areas jump year to year; air quality follows one region at a time).

---

## Accessibility checks

Run on the production build on November 2, 2026. Automated checks catch only part of what real users hit; the tester session (section 3) and the screen-reader pass (section 4) are still needed.

| Check | Result |
|---|---|
| Lighthouse 13.6 accessibility, mobile | 100 (audits the first load, with the welcome dialog open) |
| Lighthouse 13.6 accessibility, desktop | 100 (same) |
| axe-core 4.14, WCAG 2.0–2.2 A/AA and best practice, jukebox / Duet / Air Quality / More open / Guess the Year | 0 violations in every state (43–49 rules passing per state) |
| Keyboard: Tab from the skip link round the whole page | 13 stops, each with the 3px focus ring, no trap |
| No WebGL (Chrome with WebGL disabled) | flat NASA frames replace the globe; Duet, sound and captions keep working |
| No speech synthesis | Speak aloud hides itself; captions and the screen-reader live region keep working |
| 1440×900, 1366×657 and 375×812 | header, stage and transport fit one screen; no horizontal scroll |

Fixed along the way: Guess the Year buttons were named differently from what they show (WCAG 2.5.3); the scrolling reading panel shared a landmark name with the player.
