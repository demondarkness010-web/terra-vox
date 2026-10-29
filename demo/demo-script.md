# Terra Vox: 90-second demo video

**One idea only: Duet mode makes climate change audible.** Open cold on the sound, prove it twice, state the accessibility stat once, end. Do not tour features: no Guess the Year, no readout walkthrough, no settings.

- **Format:** 1920×1080, 30 fps, **stereo** (Duet depends on it). Put "🎧 Headphones on" in the first frame.
- **Audio:** the app's own output only, with no music bed. Voice-over (VO) is sparse and sits about 6 dB over the app audio, never over the first 6 seconds.
- **The video must itself be accessible:** burn in open captions for every VO line, and write the VO so it also serves as audio description of what is on screen.

---

## Before recording

1. Run `npm run build && npm run preview` in `web/` and open it full-screen in Chrome at 100% zoom.
2. Set **Describe** to *Off* and **Speak aloud** to off, so the app's own speech doesn't cross the VO.
3. Make sure the page has keyboard focus (click empty background once). The first key press, **4**, unlocks audio and starts the theme; **D** then switches straight into Duet. (Rehearsed: 4 → D → 2 → Space runs the whole video.)
4. Record system audio in stereo (OBS: Desktop Audio, stereo, 48 kHz).

---

## Shot list

| Time | Picture | Sound | VO / on-screen text |
|---|---|---|---|
| **0:00–0:06** | **Black.** Small white text, centred: *🎧 Headphones on*. | Press **4** then **D** off-camera. Methane Duet starts. **Left ear:** one low, calm C4 on a soft triangle. **Right ear:** fast, buzzy B♭5 sawtooth runs over a tense third. | No VO. At 0:03 the text changes to *Left ear: 2003 · Right ear: 2026*. |
| **0:06–0:20** | Fade up on the Terra Vox **Duet** view: two NASA methane maps, pale-green **2003** (blue frame, "◀ LEFT") beside deep-red **2026** (orange frame, "RIGHT ▶"), split waveform below (smooth blue line vs dense orange line). | Duet continues. | "That's methane, measured by NASA's AIRS satellite. Left ear, 2003. Right ear, 2026. Same instrument, same rules turning pixels into sound. The difference you hear is the planet." |
| **0:20–0:34** | Slow push-in on the **gap panel** and caption: *1,769 ppb → 1,887 ppb*, *air above 1,900 ppb: 0% → 49%*, *"2026 sounds higher, busier, faster, harsher, more tense…"* | Duet continues. | "Warmer colours play higher notes. More methane-rich air, more notes per bar. More change, more tension. Every note comes from real NASA data, and it always stays in key." |
| **0:34–0:52** | Press **2** (Sea Level Change); still in Duet. Maps flip to **1992 vs 2018** sea-surface height: blue-green on the left, yellow-red on the right. | **Left:** G4, two buzzy notes a bar. **Right:** B♭5, eight flowing notes a bar, louder. | "Sea level, 1992 to 2018. The ocean surface rose almost six centimetres on average, and the share of ocean ten centimetres above normal nearly tripled. You don't need to see the map to hear it." |
| **0:52–1:02** | **Accessibility (10 s).** Keyboard close-up: a hand presses **D**, the yellow focus ring and live caption bar visible. Lower-third: *Keyboard + screen reader · sound first, visuals optional*. | Duet fades to −12 dB under VO. | "2.2 billion people live with a vision impairment. Climate data almost always arrives as a chart. Terra Vox is built to be heard first." *(on screen: "2.2 billion: WHO, World Report on Vision, 2019")* |
| **1:02–1:20** | Back to the **methane Duet**, full frame. At 1:12 the picture slowly fades to black while the audio keeps playing. | Methane Duet at full level, unbroken. | At 1:05: "Close your eyes." At 1:12, on black: "Twenty-three years of change, in one chord." |
| **1:20–1:30** | End card on black: **Terra Vox**, *An Earth Information Jukebox · NASA Space Apps Challenge 2026*, `github.com/demondarkness010-web/terra-vox`, *Data: NASA GIBS / Worldview, NASA SVS Earth Information Center*. | Duet resolves: press **Space** at 1:22 to stop; let the reverb tail ring out. | No VO. |

Total: 90 seconds.

---

## Keep / cut rules for the edit

- **Keep** the first six seconds without VO, whatever else gets trimmed. The cold, audio-only gap is the hook.
- **Keep** the stereo image intact; never mix down to mono, even for social cuts. For a mono platform, re-record that segment with Duet set to **Take turns** and say so on screen.
- **Cut** anything that isn't Duet or the single accessibility beat. If over time, shorten the sea-level segment first, never the cold open or the stat.
- **Say the stat once.** No other numbers about the audience.

## Sources for on-screen facts

- Methane values: `data/features/greenhouse_gases/2003-08-01.json` and `2026-08-01.json` (AIRS/Aqua methane at 400 hPa, monthly mean, via NASA GIBS).
- Sea level values: `data/features/sea_level/1992-09-30.json` and `2018-09-29.json` (JPL MEaSUREs SSH anomaly; mean −0.6 → +5.3 cm; ocean ≥ 10 cm above mean 8.7% → 24.8%).
- Vision impairment: World Health Organization, *World Report on Vision* (2019): "at least 2.2 billion people have a near or distance vision impairment."
