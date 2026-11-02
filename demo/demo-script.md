# Terra Vox: 90-second demo video

**One idea only: Duet mode makes climate change audible.** Open cold on the sound, prove it twice, state the accessibility stat once, end. Do not tour features: no Guess the Year, no readout walkthrough, no settings.

- **Format:** 1920×1080, 30 fps, **stereo** (Duet depends on it). Put "🎧 Headphones on" in the first frame.
- **Audio:** the app's own output only, with no music bed. Voice-over (VO) is sparse and sits about 6 dB over the app audio, never over the first 6 seconds.
- **The video must itself be accessible:** burn in open captions for every VO line, and write the VO so it also serves as audio description of what is on screen.

---

## Before recording

1. Run `npm run build && npm run preview` in `web/` and open it full-screen in Chrome at 100% zoom.
2. Set **Describe** to *Off* and **Speak aloud** to off, so the app's own speech doesn't cross the VO.
3. Clear the saved settings (open in a private window) so the intro shows. **Put on headphones and start** unlocks audio and drops straight into the methane Duet; that one click is the whole cold open. Then **2** switches to sea level while Duet stays on, and **Space** stops. (Rehearsed: intro → 2 → 4 → Space runs the whole video.)
4. Record system audio in stereo (OBS: Desktop Audio, stereo, 48 kHz).

---

## Shot list

| Time | Picture | Sound | VO / on-screen text |
|---|---|---|---|
| **0:00–0:06** | **Black.** Small white text, centred: *🎧 Headphones on*. | Click **Put on headphones and start** off-camera. Methane Duet starts on the soft pad. **Left ear:** one low, calm C4 on a sine, 80 BPM. **Right ear:** E♭5, four buzzy sawtooth notes a bar at 115 BPM over a tense third, louder. | No VO. At 0:03 the text changes to *Left ear: 2003 · Right ear: 2026*. |
| **0:06–0:20** | Fade up on the Terra Vox **Duet** view: the globe cut down the middle by a seam, the left half tinted blue under *Left ear, oldest year* **2003**, the right half amber under *Right ear, newest year* **2026**, rings pulsing on each half where that year's methane is densest. | Duet continues. | "That's methane, measured by NASA's AIRS satellite. Left ear, 2003. Right ear, 2026. Same instrument, same rules turning the measurement into sound. The difference you hear is the planet." |
| **0:20–0:34** | Slow push-in on the caption and the gap table under **Listen**: *2003 1,769 ppb ⟷ 2026 1,887 ppb*, *"2026 sounds higher, busier, faster, harsher, more tense and louder than 2003."* | Duet continues. | "More methane, higher and louder. More of the sky past nineteen hundred parts per billion, more notes per bar. The further from 2003, the faster and more tense. Every note comes from the measured value, and it always stays in key." |
| **0:34–0:52** | Press **2** (Sea Level Change); still in Duet. The globe halves flip to **1992 vs 2018** sea-surface height. | The instrument changes to the deep bass. **Left:** F3, two soft sine notes a bar, 80 BPM. **Right:** E♭4, four buzzy notes a bar at 104 BPM over a tense third, louder. | "Sea level, 1992 to 2018. The ocean surface rose almost six centimetres on average, and the share of ocean ten centimetres above normal nearly tripled. You don't need to see the map to hear it." |
| **0:52–1:02** | **Accessibility (10 s).** Keyboard close-up: a hand presses **4**, the focus ring and live caption visible. Lower-third: *Keyboard + screen reader · sound first, visuals optional*. | Duet fades to −12 dB under VO. | "338 million people are blind or have moderate to severe vision loss, and climate data almost always arrives as a chart. Terra Vox is built to be heard first." *(on screen: "338 million: Bourne et al., Lancet Global Health, 2021")* |
| **1:02–1:20** | Press **4**: back to the **methane Duet**, full frame. At 1:12 the picture slowly fades to black while the audio keeps playing. | Methane Duet at full level, unbroken. | At 1:05: "Close your eyes." At 1:12, on black: "Twenty-three years of change, in one chord." |
| **1:20–1:30** | End card on black: **Terra Vox**, *An Earth Information Jukebox · NASA Space Apps Challenge 2026*, `github.com/demondarkness010-web/terra-vox`, *Data: NASA GIBS / Worldview, NASA SVS Earth Information Center*. | Duet resolves: press **Space** at 1:22 to stop; let the reverb tail ring out. | No VO. |

Total: 90 seconds.

---

## Keep / cut rules for the edit

- **Keep** the first six seconds without VO, whatever else gets trimmed. The cold, audio-only gap is the hook.
- **Keep** the stereo image intact; never mix down to mono, even for social cuts. For a mono platform, re-record that segment with Duet set to **Take turns** and say so on screen.
- **Cut** anything that isn't Duet or the single accessibility beat. Guess the Year, side B and the field guide live behind **More** and stay out of the video. If over time, shorten the sea-level segment first, never the cold open or the stat.
- **Say the stat once.** No other numbers about the audience.
- **Tester:** once the tester session in `docs/submission.md` has happened, put a 5-second clip of the tester or their quote on screen during 0:52–1:02, with their permission. Only what they actually said.
- **Mono check:** before uploading, play the finished video once on a phone speaker. If Duet means nothing there, keep the on-screen text "Headphones: left = 2003, right = 2026" up for the whole first Duet.
- **Upload** to YouTube as unlisted, with the captions burned in, and put the link on the README's first screen.

## Sources for on-screen facts

- Methane values: `data/features/greenhouse_gases/2003-08-01.json` and `2026-08-01.json` (AIRS/Aqua methane at 400 hPa, monthly mean, via NASA GIBS).
- Methane sound: C4, 1 note, 80 BPM, sine, calm fifth → E♭5, 4 notes, 115 BPM, sawtooth, tense third (from `web/src/audio/mapping.js`; `python scripts/validate_mapping.py` prints the same mapping for every year).
- Sea level values: `data/features/sea_level/1992-09-30.json` and `2018-09-29.json` (JPL MEaSUREs SSH anomaly; mean −0.6 → +5.3 cm; ocean ≥ 10 cm above mean 8.7% → 24.8%). Sound: F3, 2 notes, 80 BPM, sine → E♭4, 4 notes, 104 BPM, sawtooth, tense third.
- Vision loss: Bourne R. et al., "Trends in prevalence of blindness and distance and near vision impairment over 30 years", *The Lancet Global Health* 9(2), 2021, e130–e143, [doi:10.1016/S2214-109X(20)30425-3](https://doi.org/10.1016/S2214-109X(20)30425-3): 43.3 million blind and 295 million with moderate or severe distance vision impairment in 2020, 338 million together.
