# Narration for the 30-second demo (ElevenLabs voice 2oMnzJn2otqHVjyCboYJ)

The film (`demo/video-src/build_v6.py`) fits itself to whatever narrator files it is given, so you only need eight short audio files.

## The eight lines (about 69 words, 25 to 27 seconds when spoken)

| File | Line |
|---|---|
| `L1_eleven.mp3` | Close your eyes. This is Earth in 2003. |
| `L2_eleven.mp3` | Now. This is 2026. |
| `L3_eleven.mp3` | One year in each ear. That gap? Twenty-three years of methane. |
| `L4_eleven.mp3` | How? Satellite colours become real numbers, and every number becomes a note. |
| `L5_eleven.mp3` | Sea level rose seven point six centimetres. Hear the bass climb. |
| `L6_eleven.mp3` | It matches NOAA's own records. |
| `L7_eleven.mp3` | Three hundred thirty-eight million people can't read a chart. Now they can hear one. |
| `L8_eleven.mp3` | Terra Vox. Press play. |

Direction for the voice: quiet, close to the microphone, like telling a secret; a short pause after "2003", after "Now.", and after "That gap?"; lean on "Twenty-three years of methane" and "Press play".

Suggested settings on the ElevenLabs page: model Multilingual v2, stability about 45 %, similarity about 80 %, style about 25 %, speaker boost on.

## Two ways to get the files

**A. On the ElevenLabs website (works on a free account).** Open https://elevenlabs.io/voices/2oMnzJn2otqHVjyCboYJ, add the voice to your voices, open Text to Speech, choose it, paste one line at a time, download each result, and save it in `demo/video-src/vo6/` with the names above.

**B. With the script.** Put your key in `OpenMontage/.env` as `ELEVENLABS_API_KEY=...` (or set it as an environment variable) and run `python demo/video-src/narrate_v6.py`. ElevenLabs may refuse Voice Library voices over the API on a free plan (error 402 or 403); then use A. The key is read locally and is never printed.

## Build the film

```
python demo/video-src/build_v6.py <folder with rec_methane, rec_methane_a, rec_sea> demo/terra-vox-demo-30s-eleven.mp4 eleven
```

If the lines are a little long, the film speeds the narrator up by up to 18 % to stay under 30 seconds and tells you. The end card then says "AI voice (ElevenLabs)", which the NASA form's AI-use rules require; keep the same sentence in the video description.
