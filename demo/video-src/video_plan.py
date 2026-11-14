"""The edit: one place that says what is shown, what is said and when.

Every number in the narration is read off the app on 2026-11-13/14
(see demo/demo-script.md, "Sources for the on-screen numbers").
"""

import os
S = os.path.dirname(os.path.abspath(__file__))
SHOTS = S + r"\video\shots"
SHOTS2 = S + r"\video\shots2"

VOICE_ID = "JBFqnCBsd6RMkjVDRZzb"  # George, built-in voice (the requested library voice 2oMnzJn2otqHVjyCboYJ needs a paid plan)
MODEL_ID = "eleven_multilingual_v2"
VOICE_SETTINGS = {"stability": 0.5, "similarity_boost": 0.8, "style": 0.25, "use_speaker_boost": True}

# Narration lines. id -> text (spelled the way it should be spoken).
LINES = {
    "A1": "This is the planet in two thousand three.",
    "A2": "And this is twenty twenty-six.",
    "A3": "Both at once. That gap is twenty-three years of methane.",
    "B1": "This is Terra Vox. It turns real NASA satellite data into sound, so anyone, even without seeing a chart, can hear how Earth is changing.",
    "C1": "A satellite measures every pixel. We read NASA's colours back into real numbers, and average each year.",
    "C2": "Then the number plays. How much sets the pitch and loudness. How widespread it is sets how busy the music is. And how far it has moved sets the tempo.",
    "D1a": "Is it right? NASA's satellite says methane rose from seventeen fifty-four to eighteen seventy-nine parts per billion.",
    "D1b": "NOAA's ground stations, a completely separate record, say seventeen seventy-five to nineteen thirty-eight. Same direction.",
    "D2": "Across every year, our values match NOAA at zero point nine nine two for methane, and zero point nine nine seven for sea level.",
    "E1a": "The ocean tells the same story.",
    "E1b": "Between nineteen ninety-three and twenty eighteen, sea level rose seven point six centimetres. Listen to the bass climb an octave.",
    "H1": "It also plays NASA's own Earth Information Center animations, frame by frame, like this global methane map.",
    "F1": "It is built first for the three hundred thirty-eight million people who are blind or have low vision. Everything works by keyboard, with spoken descriptions, in three languages.",
    "G1": "Pick a theme. Press D. Close your eyes. And listen to the planet change.",
}

# Shown on screen as captions (digits are easier to read than spelled-out numbers).
CAPTIONS = {
    "A1": "This is the planet in 2003.",
    "A2": "And this is 2026.",
    "A3": "Both at once. That gap is 23 years of methane.",
    "B1": LINES["B1"],
    "C1": LINES["C1"],
    "C2": LINES["C2"],
    "D1a": "Is it right? NASA's satellite says methane rose from 1,754 to 1,879 parts per billion.",
    "D1b": "NOAA's ground stations, a completely separate record, say 1,775 to 1,938. Same direction.",
    "D2": "Across every year, our values match NOAA: r = 0.992 for methane, r = 0.997 for sea level.",
    "E1a": LINES["E1a"],
    "E1b": "Between 1993 and 2018, sea level rose 7.6 cm. Listen to the bass climb an octave.",
    "H1": "It also plays NASA's own Earth Information Center animations, frame by frame, like this global methane map.",
    "F1": "It is built first for the 338 million people who are blind or have low vision. Everything works by keyboard, with spoken descriptions, in three languages.",
    "G1": LINES["G1"],
}

# crop = (x, y, w, h) in the source image; the crop is scaled up to fill the frame (a sharp
# punch-in, never an animated zoom).
# beat = (id, image, crop, voice line, minimum seconds, vo offset seconds)
BEATS = [
    ("hook_l", SHOTS + r"\s1_left.png",        None,                "A1",  3.3, 0.25),
    ("hook_r", SHOTS + r"\s2_right.png",       None,                "A2",  2.1, 0.20),
    ("hook_b", SHOTS + r"\s3_both_b.png",      None,                "A3",  6.6, 0.45),
    ("what",   SHOTS2 + r"\n1_single.png",     None,                "B1",  7.0, 0.40),
    ("how1",   SHOTS2 + r"\n_flow.png",        (0, 0, 2560, 800, "letterbox"), "C1", 7.5, 0.40),
    ("how2",   SHOTS2 + r"\n2_flow.png",       None,                "C2",  9.5, 0.40),
    ("proof1", SHOTS2 + r"\g_gap.png",         (560, 40, 1920, 1080), "D1a", 6.5, 0.40),
    ("proof2", SHOTS2 + r"\n4_chart.png",      None,                "D1b", 7.0, 0.40),
    ("proof3", SHOTS2 + r"\n_proof.png",       None,                "D2",  7.0, 0.40),
    ("sea1",   SHOTS + r"\s5_sea_both_b.png",  None,                "E1a", 3.0, 0.30),
    ("sea2",   SHOTS2 + r"\g_sea.png",         (560, 40, 1920, 1080), "E1b", 7.5, 0.40),
    ("eic",    SHOTS2 + r"\eic_methane.png",   None,                "H1",  6.0, 0.40),
    ("who",    SHOTS2 + r"\n5_keys.png",       None,                "F1",  9.5, 0.40),
    ("close",  SHOTS + r"\s3_both_b.png",      None,                "G1",  6.5, 0.50),
    ("end",    None,                           None,                None,  6.0, 0.0),
]

# Real Duet audio rendered offline from the app's own code (silence everywhere else).
# (file, start inside the clip, length, beat where it starts, offset into that beat)
DEMOS = [
    ("methane_intro.wav", 0.0, 12.5, "hook_l", 0.0),     # left alone, right alone, then both
    ("sealevel_intro.wav", 5.4, 10.5, "sea1", 0.2),      # sea level, both ears (the climb)
    ("methane_both.wav", 0.0, 16.0, "close", 0.0),       # the closing chord
]

END_CARD = [
    ("Big", "TERRA VOX"),
    ("Mid", "An Earth Information Jukebox\\NNASA Space Apps Challenge 2026"),
    ("Small", "demondarkness010-web.github.io/terra-vox   |   github.com/demondarkness010-web/terra-vox\\N"
              "Data: NASA GIBS / Worldview and NASA SVS Earth Information Center. Checks: NOAA GML and NOAA LSA.\\N"
              "Narration: AI voice (ElevenLabs). NASA and NOAA do not endorse this project."),
]
