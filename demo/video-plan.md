# Demo video: plan, review, and how to rebuild it

The video is about 110 seconds (88 s of narration). It is narration-led, shows only real screenshots of the app, and
plays the app's own Duet sound only in three short moments. The build files are in `demo/video-src/` (ignored by git, rebuildable); this file records the
decisions so they can be redone.

## The idea in one line

*Hear it first, then learn why you can trust it.* The viewer's first 5 seconds are the sound itself
(left ear, right ear, both). Everything after answers a question the sound raises.

## Story and shots

| # | Beat | What is on screen (all real) | What is heard |
|---|---|---|---|
| 1 | Hook, 12 s | "Left ear only: 2003", "Right ear only: 2026", both together | The real Duet intro; narration names each ear |
| 2 | What it is, 9 s | The app in single mode, methane | Narration only |
| 3 | How it works, 20 s | The four-step diagram; the mapping desk (pitch, loudness, tone, notes per bar, tempo, harmony, stereo) | Narration only |
| 4 | Proof, 22 s | The gap table with NOAA's line; methane chart (satellite vs NOAA); the "checked against the record" band | Narration only |
| 5 | Second example, 11 s | Sea level Duet, then its gap table | The real sea-level climb |
| 6 | NASA's own animations, 7 s | A real NASA EIC visualization (SVS 5116, global methane) with its credit | Narration only |
| 7 | Who it is for, 11 s | The keyboard shortcuts | Narration only |
| 8 | Close, 13 s | Methane both ears, fade to the end card | The closing chord, then silence |

Rules the edit follows:

- **No continuous beat.** Duet audio appears only in beats 1, 5 and 7, and is ducked under speech.
- **No zoom or pan.** The old cut zoomed stills slowly; on a still image that makes the picture
  shimmer. Now: cuts, 0.2 s dissolves, and sharp punch-in crops taken from 2x screenshots.
- **Captions on every spoken line**, burned in, so the video works muted and for deaf viewers.
- **Every number is on screen when it is spoken**, and traces to `data/` (see
  `demo-script.md`, "Sources for the on-screen numbers").

## Review, as four readers

**Earth scientist.** Is anything overclaimed? The video says the yearly values "match NOAA at
r = 0.992 (methane) and 0.997 (sea level)": these are correlations of trends, not equality of values,
and the narration says "match" about the trend. The 400 hPa note ("7 km up") explains why the
satellite value sits below NOAA's surface value. It does not claim a causal story, only a measured
change. *Fix made:* the NOAA line says "same direction", not "same value".

**Sonification researcher.** Does the sound encode the data? The mapping desk shot shows each
parameter and its source. The opening teaches the ears before overlapping them (left alone, right
alone, then both).

**Video editor.** Does it hold attention? A sound hook in the first second; a new picture every
4 to 10 seconds; one open question ("Is it right?") answered with two independent sources; a
payoff that repeats the hook ("close your eyes"). *Fix made:* removed the constant music bed,
the zoom, and the repeated end-card.

**NASA judge and NASA's founders' test ("would a stranger understand it?").** Purpose in 10
seconds: yes (beat 1 and 2). Real NASA data: named on screen and in the end card. Accessible: the
video is captioned and the app is keyboard-first. No NASA logo; "NASA and NOAA do not endorse this
project" is in the end card. The narration is an AI voice and says so on the end card.

## What the video does not show (honest gaps)

- Only one of the four NASA EIC visualizations (SVS 5116, methane) is shown; the other three are in the app.
- A real blind or low-vision listener. Add their words and a short clip if you have a session.
- Hindi and Spanish screens.

## Rebuild

1. Put the ElevenLabs key in `OpenMontage\.env` as `ELEVENLABS_API_KEY=...` (the file already has the
   empty line). The voice must be usable on your plan.
2. From `demoideo-src`: `python narrate.py` makes one MP3 per line with the voice in `video_plan.py`
   (George, model `eleven_multilingual_v2`, about 1,300 characters in total). The voice first asked for,
   `2oMnzJn2otqHVjyCboYJ`, is a Voice Library voice and ElevenLabs blocks those through the API on the
   free plan; George is a built-in voice that works on it.
3. `python build2.py` (needs ffmpeg on the path) re-times every shot to the narration, ducks the Duet sound under it,
   burns in captions and writes `terra-vox-demo-v2.mp4`.

## Build notes

- On a low-memory machine `build2.py` runs three small ffmpeg jobs (picture, sound, join) and prepares each
  shot as a plain 1280x720 PNG first; one big job runs out of memory.
- `REUSE_PICTURE=1 python build2.py` skips the picture step if `video/_picture.mp4` exists.
- The Duet sound is ducked under the voice with a sidechain; the voice stream is padded to full length so the
  closing chord is not cut when the last word ends.
