# NASA Space Apps submission form: what to type in each field

Copy each block as plain text. Links must be full URLs and publicly reachable.

## Project Name
Terra Vox: The Earth Information Jukebox

## Summary (50-200 words, max 1,500 characters; this one is 149 words, 885 characters)
Terra Vox is an Earth Information Jukebox that lets anyone hear how the planet changed. It turns NASA satellite imagery back into the numbers NASA's colour scales encode, then plays those numbers as music, live in the browser. In Duet mode the oldest year of a theme plays in the left ear and the newest in the right, through the same fixed mapping, so the change is the difference you hear. Four themes use NASA GIBS records from 1993 to 2026: wildfires (MODIS), sea level (JPL MEaSUREs), nitrogen dioxide (OMI) and methane (AIRS). Side B plays four NASA Earth Information Center visualizations. Each year is an average that tracks NOAA's independent records (methane r = 0.992, sea level r = 0.997), and a script shows pitch, loudness, density and tempo following the data on all 11 tracks. Built for blind and low-vision listeners first: keyboard, captions, speech, three languages.

## Project Details
**What it does.** Terra Vox plays NASA Earth data as live music. Each year of a satellite record is read back into the real number behind NASA's colour scale (parts per billion of methane, centimetres of sea level, fire areas, nitrogen dioxide), and that number sets the pitch, loudness, busyness and tempo of a short melody in C minor pentatonic, so any combination still sounds like music. In Duet mode, the oldest and newest year of a theme play at the same time, one in each ear, through the identical mapping. The change is the difference you hear. A second side plays four NASA Earth Information Center visualizations frame by frame.

**Who benefits.** 338 million people are blind or have moderate to severe vision loss, and climate data almost always arrives as a chart. Terra Vox works by keyboard alone, with captions generated from the data, spoken descriptions, a one-ear listening mode, reduced motion, and English, Hindi and Spanish. It also works for classrooms, radio and anyone who learns by ear.

**How we know the sound carries the data.** Each year is an average of NASA GIBS maps and tracks NOAA's independent records (methane r = 0.992, 2003-2025; sea level r = 0.997, 1993-2018). A script runs every frame through the app's own mapping and checks that pitch, loudness, density and tempo follow the measured value (r of at least 0.82 on all 11 tracks). Another script counts how many cues separate the two ears for each theme. Limits are stated up front in the documentation.

**Tools.** Vanilla JavaScript, Tone.js and the Web Audio API for sound, three.js for the 3D globe, Vite, a Python data pipeline (NumPy, OpenCV) that reads NASA GIBS imagery, GitHub Pages for hosting. Lighthouse accessibility 100; axe-core with no violations. Built solo with Claude Code (AI coding assistant) for implementation; the concept, data choices, mapping design and testing are mine. The demo video's narration is an AI-generated voice (ElevenLabs).

**What is not done yet.** It has been checked by automated tools and by the author, but not yet by a blind or low-vision listener.

**Creativity.** Other sonifications play a chart over time. Terra Vox plays two moments of the planet at once, one in each ear.

## Use of Super Intelligence (SI): select every option that applies
Pick the options that match what you did (names may differ on the form):
- Code and data: Claude Code (Anthropic) wrote and edited the code and helped with the data scripts.
- Text: Claude helped write the README and documentation.
- Audio: the demo video narration is an ElevenLabs AI voice.

Do NOT pick "I did not use SI". Images and videos: the video's pictures are real screenshots of the app, with no AI-generated imagery; the video's end card already says the narration is an AI voice.

The form says audio and code must be acknowledged "in descriptive text and metadata": put this line in the YouTube description of the demo (it is already in the README and the repository):

"Narration is an AI-generated voice (ElevenLabs). The app was built with Claude Code (Anthropic), an AI coding assistant. NASA and NOAA do not endorse this project."

## Project Demonstration (link)
https://youtu.be/g190lvPtNrM  (28 s, unlisted; update its description first: delete the old chapter list and add the AI disclosure line)

## Project (link)
https://demondarkness010-web.github.io/terra-vox/

(If there is a source-code field: https://github.com/demondarkness010-web/terra-vox)

## NASA Data (required): Link Text -> Link URL
| Link Text | Link URL |
|---|---|
| NASA Worldview / GIBS: MODIS Terra and Aqua Thermal Anomalies (wildfires) | https://worldview.earthdata.nasa.gov |
| NASA Worldview / GIBS: JPL MEaSUREs Sea Surface Height Anomalies (sea level) | https://worldview.earthdata.nasa.gov |
| NASA Worldview / GIBS: OMI Nitrogen Dioxide Tropospheric Column (air quality) | https://worldview.earthdata.nasa.gov |
| NASA Worldview / GIBS: AIRS L3 Methane 400 hPa (greenhouse gases) | https://worldview.earthdata.nasa.gov |
| NASA Earth Information Center visualizations (SVS gallery) | https://svs.gsfc.nasa.gov/gallery/earth-information-center/ |
| NASA SVS 5113: Active Fires As Observed by VIIRS, 2024-Present | https://svs.gsfc.nasa.gov/5113/ |
| NASA SVS 5235: Sea Level Through a Porthole (2023) | https://svs.gsfc.nasa.gov/5235/ |
| NASA SVS 5175: TEMPO Nitrogen Dioxide Air Pollution Over North America | https://svs.gsfc.nasa.gov/5175/ |
| NASA SVS 5116: Global Atmospheric Methane (CH4) | https://svs.gsfc.nasa.gov/5116/ |
| NASA Sea Level Change portal | https://sealevel.nasa.gov |
| NASA AIRS project | https://airs.jpl.nasa.gov |
| NASA FIRMS (fire information) | https://firms.modaps.eosdis.nasa.gov |
| NASA Earth Observatory | https://earthobservatory.nasa.gov |
| NASA Earthdata | https://www.earthdata.nasa.gov |

## Space Agency Partner & Other Data: Link Text -> Link URL
| Link Text | Link URL |
|---|---|
| Terra Vox source code (this project, MIT licence) | https://github.com/demondarkness010-web/terra-vox |
| NOAA GML global methane (check record) | https://gml.noaa.gov/ccgg/trends_ch4/ |
| NOAA Laboratory for Satellite Altimetry, global mean sea level (check record) | https://www.star.nesdis.noaa.gov/socd/lsa/SeaLevelRise/ |
| WMO Greenhouse Gas Bulletin (No. 21 and No. 22) | https://wmo.int |
| IPCC AR6 Working Group I | https://www.ipcc.ch/report/ar6/wg1/ |
| US Greenhouse Gas Center | https://earth.gov/ghgcenter |
| WHO ambient air quality fact sheet | https://www.who.int/news-room/fact-sheets/detail/ambient-(outdoor)-air-quality-and-health |
| GBD 2019 Blindness and Vision Impairment Collaborators (Bourne et al.), Lancet Global Health 2021 | https://doi.org/10.1016/S2214-109X(20)30425-3 |
| Andela et al. 2017, Science (global fire trends) | https://doi.org/10.1126/science.aal4108 |
| Cunningham, Williamson and Bowman 2024, Nature Ecology and Evolution | https://doi.org/10.1038/s41559-024-02452-2 |
| Hamlington et al. 2024, Communications Earth and Environment (sea level) | https://doi.org/10.1038/s43247-024-01761-5 |
| Duncan et al. 2016, JGR Atmospheres (OMI nitrogen dioxide) | https://doi.org/10.1002/2015JD024121 |
| Tone.js (MIT), audio library | https://github.com/Tonejs/Tone.js |
| three.js (MIT), 3D graphics | https://github.com/mrdoob/three.js |
| Vite (MIT), build tool | https://github.com/vitejs/vite |
| Anybody font via Fontsource (SIL OFL) | https://fontsource.org/fonts/anybody |
| Atkinson Hyperlegible Next font via Fontsource (SIL OFL) | https://fontsource.org/fonts/atkinson-hyperlegible-next |
| NumPy, OpenCV, Pillow (Python data pipeline) | https://opencv.org |
| ffmpeg (video assembly) | https://ffmpeg.org |
| Claude Code (Anthropic), AI coding assistant | https://www.anthropic.com/claude-code |
| ElevenLabs, AI voice for the demo narration | https://elevenlabs.io |

## Project Submission Verification (two boxes, only you can tick them)
1. Terms and Conditions: tick after reading the Submission Guide, Participant Terms and Privacy Policy.
2. Original work: tick only if true. The app, data pipeline and documents are the author's work built with an AI assistant (disclosed above); every external resource is in the two lists above; the video uses no music and no copyrighted images, only screenshots of the app and NASA images used with their SVS credit.

## Order of clicking
Fill everything, then **Save Progress**, then reload the page and check the fields kept their text, then **Submit for Judging**. Only the final click on Submit for Judging is reviewed. Submission is final after the deadline (Sunday, Nov 15, 11:59 p.m. local time).
