# Terra Vox: 90-second demo video

**Three beats, one idea: Duet makes climate change audible.** Beat 1, hear it. Beat 2, trust it. Beat 3, anyone can use it. Then five seconds of NASA's own Earth Information Center visualization, and the end card. No feature tour.

- **Format:** 1920×1080, 30 fps, **stereo** (Duet depends on it). First frame: "Headphones on".
- **Audio:** the app's own output only, no music bed. Voice-over (VO) sits about 6 dB over the app and never covers the first 6 seconds.
- **Accessible video:** burn in open captions for every VO line, and write the VO so it also describes what is on screen.
- **Every number below was read off the app on November 13, 2026.** If you rebuild the data, re-read them before recording.
- **The published video predates the November 14 data refresh.** It says methane rose from 1,754 to 1,879 ppb and the right ear plays three notes a bar; the live app now reads 1,756 to 1,881 ppb (January to September of both years, because 2026 is incomplete) and four notes a bar. Direction, years and every other number are unchanged. Re-record before relying on the video's exact methane figures.

---

## Before recording

1. Open the live site, https://demondarkness010-web.github.io/terra-vox/, in a private Chrome window (so the intro shows), full screen, 100% zoom.
2. Set **Describe** to *Off* and leave **Speak aloud** off, so the app's speech doesn't cross the VO.
3. Rehearse once: **Put on headphones and start** (methane Duet) → **2** (sea level, Duet stays on) → **4** (methane again) → **F** (side B) → **Space** (stop).
4. Record system audio in stereo (OBS: Desktop Audio, stereo, 48 kHz).

---

## Shot list

| Time | Picture | Sound | VO / on-screen text |
|---|---|---|---|
| **0:00–0:06** | Black. Small text: *Headphones on*. | Click **Put on headphones and start** off camera. Methane Duet starts. **Left:** one low, calm C4 on a sine, 80 BPM. **Right:** E♭5, three notes a bar on a triangle, 118 BPM, tense third, louder. | None. Let the sound land. |
| **BEAT 1: HEAR IT** | | | |
| **0:06–0:22** | (The app introduces each ear: *Left ear only: 2003*, then *Right ear only: 2026*, then both, about 5 s in all. Say the VO over the intro, then let both play.) Fade up on the Duet: the globe cut by the seam, *Left ear* **2003** in blue, *Right ear* **2026** in orange, rings where each year's methane is densest. | Duet continues. | "Left ear: methane in 2003. Right ear: 2026. Same instrument, same rules. The difference you hear is the change." |
| **BEAT 2: TRUST IT** | | | |
| **0:22–0:36** | Push in on the text under the stage: *1,754 ppb → 1,879 ppb*, then *"NOAA ground stations: 1,775 ppb → 1,938 ppb, the same direction."* | Duet continues, −6 dB. | "NASA's satellite, seven kilometres up. NOAA's ground stations. Both say the same thing." |
| **0:36–0:50** | Press **2**: sea level, still in Duet, 1993 against 2018. Text: *−3.4 cm → +4.2 cm*. | The deep bass climbs an octave: E♭3, two notes a bar, 80 BPM → E♭4, four notes, 110 BPM. | "Sea level, 1993 to 2018. Seven and a half centimetres, one octave." |
| **0:50–0:56** | Scroll to the black band: *0.997* and *0.992*. | Duet under VO. | "Our yearly values track NOAA's records almost exactly." |
| **BEAT 3: ANYONE CAN USE IT** | | | |
| **0:56–1:10** | Keyboard close-up: press **4** (methane), the focus ring and the live caption visible. Lower third: *Keyboard and screen reader, sound first*. At 1:04 the picture fades to black; the audio keeps playing. | Methane Duet at full level. | "338 million people are blind or have moderate to severe vision loss. Climate data almost always arrives as a chart." At 1:05, on black: "Close your eyes. Twenty-three years of methane, in one chord." |
| **NASA EIC (5 s)** | | | |
| **1:10–1:15** | Fade up and press **F**: side B, NASA's Global Atmospheric Methane visualization (SVS 5116), credit visible. | Side B plays NASA's own animation through the same rules. | On screen only: *NASA Earth Information Center, SVS 5116, played as sound*. |
| **1:15–1:30** | End card on black: **Terra Vox**, *An Earth Information Jukebox, NASA Space Apps Challenge 2026*, `github.com/demondarkness010-web/terra-vox`, *Data: NASA GIBS / Worldview and NASA SVS Earth Information Center; NOAA GML and NOAA LSA for checks*. | Press **Space** at 1:17; let the tail ring out. | None. |

Total: 90 seconds.

---

## Keep / cut rules for the edit

- **Keep** the silent first six seconds and the stereo image. Never mix to mono. For a mono platform, re-record the Duet with **Take turns** and say so on screen.
- **If over time,** shorten the sea-level shot first, then the black band. Never the cold open, the NOAA line or the accessibility stat.
- **Say the audience stat once.** No other numbers about people.
- **Tester:** only once the session in `docs/submission.md` has happened, add their quote or a 5-second clip during 0:56–1:10, with permission. Only what they actually said.
- **No NASA logo** in the video. The SVS credit line stays visible during side B.
- **Mono check:** play the finished video once on a phone speaker. If Duet means nothing there, keep "Headphones: left = 2003, right = 2026" on screen for the whole first Duet.
- **Upload** to YouTube as unlisted, with captions burned in, and put the link on the README's first screen.

## Sources for the on-screen numbers

- **Methane:** `data/features/greenhouse_gases/2003-01-01.json` and `2026-01-01.json` (AIRS/Aqua methane at 400 hPa, yearly mean of monthly maps via NASA GIBS). The Duet compares January to September of both years because 2026 is incomplete, so 2003 shows 1,756 ppb in Duet and 1,759 ppb for its full year. NOAA line: `data/reference.json` (NOAA GML global surface CH₄, same months).
- **Methane sound:** C4, 1 note a bar, 80 BPM, sine, calm fifth → E♭5, 3 notes, 118 BPM, triangle, tense third (from `web/src/audio/mapping.js`, shown in the app's "How the sound changed" table).
- **Sea level:** `data/features/sea_level/1993-01-01.json` and `2018-01-01.json` (JPL MEaSUREs sea surface height anomaly, yearly mean): −3.4 → +4.2 cm (+7.6 cm). Sound: E♭3, 2 notes, 80 BPM, sine → E♭4, 4 notes, 110 BPM, triangle, tense third.
- **Agreement with NOAA:** `referenceCheck` in `data/themes.json`: sea level r = 0.997 (NOAA LSA, 1993–2018, n = 26); methane r = 0.992 (NOAA GML, 2003–2025, n = 23).
- **Vision loss:** Bourne R. et al., *The Lancet Global Health* 9(2), 2021, e130–e143, [doi:10.1016/S2214-109X(20)30425-3](https://doi.org/10.1016/S2214-109X(20)30425-3): 43.3 million blind and 295 million with moderate to severe vision impairment in 2020 (338 million together).
