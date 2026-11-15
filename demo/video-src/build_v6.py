"""The 30-second demo, version 6: a "how it works" film that fits itself to whatever narrator you give it.

Pictures: live footage of the app, animation drawn in code, kinetic text, a progress bar, small transition
flashes. Sound: the app's own recorded Duet sound, a narrator, and a few synthesised transition sounds.
Nothing here is AI-generated imagery.

The narrator is eight short files, vo6/L1_<voice>.mp3 (or .wav) ... L8_<voice>.mp3. The film measures them,
speeds them up a little if needed, and lays out every scene, caption and animation around the real lengths,
so any voice (ElevenLabs, your own recording, the Windows voice) produces a film that fits in 30 seconds.

usage: python build_v6.py <recordings dir> <out.mp4> <voice name, the suffix of the narrator files>
"""
import bisect, glob, json, math, os, subprocess, sys, wave
import numpy as np
from PIL import Image, ImageDraw, ImageFilter

REC = sys.argv[1] if len(sys.argv) > 1 else "rec"
OUT = sys.argv[2] if len(sys.argv) > 2 else "demo30_v6.mp4"
VOICE = sys.argv[3] if len(sys.argv) > 3 else "zira"
HERE = os.path.dirname(os.path.abspath(__file__))
FPS, W, H = 25, 1280, 720
LAT, PRE = 0.128, 0.05
BS = chr(92)
MAX_TOTAL = 29.7

LINES = [
    ("L1", "Close your eyes. This is Earth in 2003."),
    ("L2", "Now. This is 2026."),
    ("L3", "One year in each ear. That gap? Twenty-three years of methane."),
    ("L4", "How? Satellite colours become real numbers, and every number becomes a note."),
    ("L5", "Sea level rose 7.6 centimetres. Hear the bass climb."),
    ("L6", "It matches NOAA's own records."),
    ("L7", "338 million people can't read a chart. Now they can hear one."),
    ("L8", "Terra Vox. Press play."),
]

# ----------------------------------------------------------------------------- recordings
class Run:
    def __init__(self, name):
        self.dir = os.path.join(REC, name)
        meta = json.load(open(os.path.join(self.dir, "meta.json")))
        order = sorted(range(len(meta["stamps"])), key=lambda i: meta["stamps"][i])
        self.t = [meta["stamps"][i] / 1000 for i in order]
        self.files = [os.path.join(self.dir, f"f{i:05d}.jpg") for i in order]
        w = wave.open(os.path.join(self.dir, "audio.wav"))
        hop = int(w.getframerate() * 0.01)
        rows = []
        while True:                                   # in small blocks: this laptop has little free memory
            raw = w.readframes(hop * 400)
            if not raw:
                break
            a = np.frombuffer(raw, dtype=np.int16).astype(np.float32).reshape(-1, 2) / 32768
            n = len(a) // hop
            if n:
                rows.append(20 * np.log10(np.sqrt((a[:n * hop].reshape(n, hop, 2) ** 2).mean(axis=1)) + 1e-9))
        self.db = np.concatenate(rows)
        self.wav = os.path.join(self.dir, "audio.wav")
        self.cache = {}

    def first(self, ch, after=0.0, floor=-45.0):
        i = int(after * 100)
        while i < len(self.db) and self.db[i, ch] < floor:
            i += 1
        return i / 100

    def img(self, i):
        if i not in self.cache:
            if len(self.cache) > 24:
                self.cache.pop(next(iter(self.cache)))
            self.cache[i] = Image.open(self.files[i]).convert("RGB")
        return self.cache[i]

    def at(self, t):
        k = bisect.bisect_right(self.t, t)
        if k <= 0:
            return self.img(0)
        if k >= len(self.t):
            return self.img(len(self.t) - 1)
        a, b = self.t[k - 1], self.t[k]
        if b - a > 0.7 or b == a:
            return self.img(k - 1 if t - a < b - t else k)
        return Image.blend(self.img(k - 1), self.img(k), (t - a) / (b - a))


def texture_time(run, after, lo=90.0):
    for t, f in zip(run.t, run.files):
        if t >= after:
            a = np.asarray(Image.open(f).convert("L").crop((400, 150, 640, 350)), dtype=np.float32)
            if a.mean() > lo:
                return t
    raise SystemExit("no bright globe found")


M, MA, S = Run("rec_methane"), Run("rec_methane_a"), Run("rec_sea")
onL = M.first(0, 1.0)
tL = max(onL + LAT - PRE, texture_time(M, onL - 0.5) + 0.05)
onR = M.first(1, onL + 1.0)
onBoth = M.first(0, onR + 1.0)
sBoth = S.first(0, S.first(1, S.first(0, 1.0) + 1.0) + 1.0)
aBoth = MA.first(0, MA.first(1, MA.first(0, 1.0) + 1.0) + 1.0)

# ----------------------------------------------------------------------------- narrator and timeline
def probe(path):
    return float(subprocess.check_output(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", path]).decode().strip())


def find_voice(lid):
    for ext in ("mp3", "wav", "m4a"):
        p = os.path.join(HERE, "vo6", f"{lid}_{VOICE}.{ext}")
        if os.path.exists(p):
            return p
    raise SystemExit(f"missing narrator file vo6/{lid}_{VOICE}.mp3 (or .wav)")


def process_voice(speed):
    os.makedirs(os.path.join(HERE, "vo6", "proc"), exist_ok=True)
    out = {}
    for lid, _ in LINES:
        dst = os.path.join(HERE, "vo6", "proc", f"{lid}_{VOICE}.wav")
        trim = "silenceremove=start_periods=1:start_threshold=-45dB:start_silence=0.03"
        af = f"{trim},areverse,{trim},areverse" + (f",atempo={speed:.4f}" if speed > 1.001 else "") + ",loudnorm=I=-16:TP=-2:LRA=7,aresample=44100,aformat=channel_layouts=stereo"
        subprocess.run(["ffmpeg", "-hide_banner", "-loglevel", "error", "-y", "-i", find_voice(lid), "-af", af, dst], check=True)
        out[lid] = (dst, probe(dst))
    return out


LEAD, GAP, TAIL = 0.25, 0.20, 1.7
speed = 1.0
VO = process_voice(speed)
raw = sum(d for _, d in VO.values())
avail = MAX_TOTAL - LEAD - GAP * (len(LINES) - 1) - TAIL
if raw > avail:
    speed = min(1.18, raw / avail)
    VO = process_voice(speed)
    print(f"narrator sped up x{speed:.2f} to fit")
START, END, t = {}, {}, LEAD
for lid, _ in LINES:
    START[lid] = t
    END[lid] = t + VO[lid][1]
    t = END[lid] + GAP
TOTAL = min(MAX_TOTAL, round(END["L8"] + TAIL, 2))
if END["L8"] + 0.6 > TOTAL:
    print("WARNING: the narrator is too long for 30 s even when sped up; shorten the lines")
print(f"narration ends {END['L8']:.2f}s, film {TOTAL:.2f}s, voice speed x{speed:.2f}")

# scenes follow the lines: scene k starts just before line k
BOUND = [0.0] + [START[l] - 0.12 for l, _ in LINES[1:]] + [TOTAL]
SC_NAMES = ["left", "right", "both", "how", "sea", "proof", "people", "end"]
SA = {n: BOUND[i] for i, n in enumerate(SC_NAMES)}
SB = {n: BOUND[i + 1] for i, n in enumerate(SC_NAMES)}
DUR = {n: SB[n] - SA[n] for n in SC_NAMES}


def scene_of(T):
    for i, n in enumerate(SC_NAMES):
        if T < BOUND[i + 1] or i == len(SC_NAMES) - 1:
            return n


FOOT = {  # name: (run, footage start, longest stretch the footage supports, mode)
    "left": (M, tL, 3.2, "left"),
    "right": (M, onR + LAT - PRE, 3.3, "right"),
    "both": (M, onBoth + LAT - PRE, 8.0, "both"),
    "how": (MA, aBoth + 2.0 + LAT, 30, "backdrop"),
    "sea": (S, sBoth + LAT - PRE, 8.0, "both"),
    "proof": (MA, aBoth + 6.0 + LAT, 30, "backdrop"),
    "people": (MA, aBoth + 8.5 + LAT, 30, "backdrop"),
    "end": (MA, aBoth + 12.5 + LAT, 30, "backdrop"),
}
MUSIC_SRC = {  # name: (run, start in the recording, gain dB)
    "left": (M, tL - LAT, 0), "right": (M, onR - PRE, 0), "both": (M, onBoth - PRE, 0), "how": (MA, aBoth + 2.0, -3),
    "sea": (S, sBoth - PRE, 0), "proof": (MA, aBoth + 6.0, -5), "people": (MA, aBoth + 8.5, -6), "end": (MA, aBoth + 12.5, -7),
}

# ----------------------------------------------------------------------------- sound
def synth_sfx():
    d = os.path.join(HERE, "video")
    os.makedirs(d, exist_ok=True)
    whoosh, hit = os.path.join(d, "sfx_whoosh.wav"), os.path.join(d, "sfx_hit.wav")
    subprocess.run(["ffmpeg", "-hide_banner", "-loglevel", "error", "-y", "-f", "lavfi", "-i", "anoisesrc=d=0.5:c=pink:r=44100:a=0.6",
                    "-af", "highpass=f=700,lowpass=f=7000,afade=t=in:d=0.38,afade=t=out:st=0.38:d=0.12,volume=-3dB", "-ac", "2", whoosh], check=True)
    subprocess.run(["ffmpeg", "-hide_banner", "-loglevel", "error", "-y", "-f", "lavfi", "-i", "sine=f=52:d=0.5:r=44100",
                    "-af", "afade=t=in:d=0.004,afade=t=out:st=0.04:d=0.46,volume=6dB", "-ac", "2", hit], check=True)
    return whoosh, hit


def build_audio(path):
    whoosh, hit = synth_sfx()
    ins, fl, labels = [], [], []
    k = 0
    for n in SC_NAMES:
        run, st, gain = MUSIC_SRC[n]
        ln = min(DUR[n], FOOT[n][2] + 0.2)
        ins += ["-i", run.wav]
        ms = int(SA[n] * 1000) + (200 if n == "left" else 0)
        fo = 2.0 if n == "end" else 0.12
        fl.append(f"[{k}:a]atrim=start={st:.3f}:end={st + ln:.3f},asetpts=PTS-STARTPTS,afade=t=in:d=0.03,"
                  f"afade=t=out:st={max(0, ln - fo):.3f}:d={fo},volume={gain}dB,adelay={ms}|{ms}[m{k}]")
        labels.append(f"[m{k}]")
        k += 1
    for n in SC_NAMES[1:]:                       # a whoosh into every cut, a low hit when both ears start and at the end card
        ins += ["-i", whoosh]
        ms = max(0, int((SA[n] - 0.28) * 1000))
        fl.append(f"[{k}:a]volume=-26dB,adelay={ms}|{ms}[m{k}]")
        labels.append(f"[m{k}]")
        k += 1
    for n in ("both", "end"):
        ins += ["-i", hit]
        ms = int(SA[n] * 1000)
        fl.append(f"[{k}:a]volume=-16dB,adelay={ms}|{ms}[m{k}]")
        labels.append(f"[m{k}]")
        k += 1
    fl.append("".join(labels) + f"amix=inputs={len(labels)}:normalize=0,apad=whole_dur={TOTAL}[music]")
    vl = []
    for j, (lid, _) in enumerate(LINES):
        ins += ["-i", VO[lid][0]]
        ms = int(START[lid] * 1000)
        fl.append(f"[{k + j}:a]adelay={ms}|{ms}[v{j}]")
        vl.append(f"[v{j}]")
    fl.append("".join(vl) + f"amix=inputs={len(vl)}:normalize=0,apad=whole_dur={TOTAL},asplit=2[vk][vm]")
    fl.append("[music][vk]sidechaincompress=threshold=0.015:ratio=7:attack=12:release=350[duck]")
    fl.append(f"[duck][vm]amix=inputs=2:normalize=0,loudnorm=I=-16:TP=-1.5:LRA=9,alimiter=limit=0.9,atrim=0:{TOTAL}[aout]")
    subprocess.run(["ffmpeg", "-hide_banner", "-loglevel", "error", "-y", *ins, "-filter_complex", ";".join(fl),
                    "-map", "[aout]", "-ar", "44100", "-ac", "2", path], check=True)


# ----------------------------------------------------------------------------- text (ASS)
BLUE, AMBER, WHITE, GREY = "&HFFA34A&", "&H3AA3F2&", "&HFFFFFF&", "&HC8C8C8&"
EV = []


def ts(x):
    x = max(0.0, x)
    return f"{int(x // 3600)}:{int(x % 3600 // 60):02d}:{x % 60:05.2f}"


def ev(a, b, text, pos, an=7, style="Txt", size=40, color=WHITE, fad=(120, 120), pop=False, alpha=None, spacing=0, extra=""):
    t = f"{{{BS}an{an}{BS}pos({pos[0]},{pos[1]}){BS}fs{size}{BS}1c{color}{BS}fsp{spacing}"
    if alpha:
        t += f"{BS}alpha&H{alpha}&"
    if fad:
        t += f"{BS}fad({fad[0]},{fad[1]})"
    if pop:
        t += f"{BS}fscx70{BS}fscy70{BS}t(0,220,{BS}fscx100{BS}fscy100)"
    EV.append(f"Dialogue: 1,{ts(a)},{ts(b)},{style},,0,0,0,,{t}{extra}}}{text}")


def ease(x):
    x = min(1, max(0, x))
    return 1 - (1 - x) ** 3


def counter(a, b, v0, v1, fmt, pos, an, size, color, hold_until):
    n = max(1, int(round((b - a) * FPS)))
    for k in range(n):
        v = v0 + (v1 - v0) * ease((k + 1) / n)
        ev(a + k / FPS, a + (k + 1) / FPS, fmt(v), pos, an, size=size, color=color, fad=None, style="Big")
    ev(b, hold_until, fmt(v1), pos, an, size=size, color=color, fad=(0, 150), style="Big")


def year_cols(a, b, ly, ry, lb=True, rb=True):
    la, ra = (None if lb else "90"), (None if rb else "90")
    ev(a, b, "LEFT EAR", (52, 178), 7, size=28, color=BLUE, alpha=la, spacing=5, fad=(150, 100))
    ev(a, b, ly, (46, 212), 7, style="Big", size=112, color=BLUE, alpha=la, pop=lb, fad=(150, 100))
    ev(a, b, "RIGHT EAR", (1228, 178), 9, size=28, color=AMBER, alpha=ra, spacing=5, fad=(150, 100))
    ev(a, b, ry, (1234, 212), 9, style="Big", size=112, color=AMBER, alpha=ra, pop=rb, fad=(150, 100))


def captions():
    import re
    for lid, text in LINES:
        parts = [p for p in re.split(r"(?<=[.?!])\s+", text.strip()) if p]
        a, b = START[lid] - 0.04, END[lid] + 0.12
        wts = [max(6, len(p)) for p in parts]
        pos = a
        for p, w in zip(parts, wts):
            seg = (b - a) * w / sum(wts)
            ev(pos, pos + seg, p, (640, 668), 2, size=40, fad=(60, 60), extra=f"{BS}bord3{BS}3c&H000000&{BS}4a&H60&")
            pos += seg


def at(name, frac, over=0.0):
    return SA[name] + DUR[name] * frac + over


def build_ass(path):
    captions()
    L, R, B, HOW, SEA, PR, PE, EN = (SA[n] for n in SC_NAMES)
    # 1 and 2: one ear at a time
    year_cols(0.5, SB["left"], "2003", "2026", True, False)
    ev(1.0, SB["left"], "low · slow · calm", (50, 345), 7, size=36)
    ev(1.2, SB["left"], "C4 · one note a bar · 80 BPM", (50, 392), 7, size=26, color=GREY)
    year_cols(R, SB["right"], "2003", "2026", False, True)
    ev(R + 0.1, SB["right"], "higher · busier · tense", (1230, 345), 9, size=36)
    ev(R + 0.2, SB["right"], "E♭5 · four notes a bar · 118 BPM", (1230, 392), 9, size=26, color=GREY)
    # 3: both, and the gap in numbers (timed to "twenty-three years of methane")
    year_cols(B, SB["both"], "2003", "2026", True, True)
    g = at("both", 0.38)
    ev(g, SB["both"], "1,756", (52, 360), 7, style="Big", size=64, color=BLUE, pop=True)
    ev(g, SB["both"], "ppb, January to September", (52, 432), 7, size=24, color=GREY)
    counter(g + 0.3, g + 1.5, 1756, 1881, lambda v: f"{v:,.0f}", (1228, 360), 9, 64, AMBER, SB["both"])
    ev(g + 0.3, SB["both"], "ppb, January to September", (1228, 432), 9, size=24, color=GREY)
    ev(g + 1.4, SB["both"], "+125 ppb", (640, 560), 2, style="Big", size=54, pop=True, fad=(100, 150))
    ev(g, SB["both"], "NASA AIRS satellite, methane at 400 hPa", (640, 612), 2, size=22, color=GREY, fad=(150, 100))
    # 4: how it works, three steps
    d = DUR["how"]
    ev(HOW + 0.05 * d, SB["how"], "1  SATELLITE COLOUR", (140, 262), 7, size=30, color=WHITE, spacing=3, fad=(120, 100))
    ev(HOW + 0.33 * d, SB["how"], "2  REAL NUMBER", (520, 262), 7, size=30, color=AMBER, spacing=3, fad=(120, 100))
    ev(HOW + 0.62 * d, SB["how"], "3  NOTE", (940, 262), 7, size=30, color=BLUE, spacing=3, fad=(120, 100))
    for val, x in (("1,700", 140), ("1,800", 640), ("1,900", 1140)):
        ev(HOW + 0.33 * d, SB["how"], val, (x, 166), 8, size=22, color=GREY, fad=(120, 100))
    ev(HOW + 0.36 * d, SB["how"], "2003: 1,756 ppb", (140 + 1000 * 0.28, 212), 8, size=26, color=BLUE, fad=(120, 100))
    ev(HOW + 0.42 * d, SB["how"], "2026: 1,881 ppb", (140 + 1000 * 0.905, 212), 8, size=26, color=AMBER, fad=(120, 100))
    ev(HOW + 0.7 * d, SB["how"], "C4 · one note a bar · 80 BPM", (140, 580), 7, size=26, color=BLUE, fad=(120, 100))
    ev(HOW + 0.76 * d, SB["how"], "E♭5 · four notes a bar · 118 BPM", (1140, 580), 9, size=26, color=AMBER, fad=(120, 100))
    # 5: sea level
    year_cols(SEA, SB["sea"], "1993", "2018", True, True)
    ev(SEA + 0.1, SB["sea"], "SEA LEVEL", (52, 50), 7, size=30, color=GREY, spacing=8)
    ev(SEA + 0.2, SB["sea"], "NASA JPL MEaSUREs, sea surface height", (52, 92), 7, size=22, color=GREY)
    ev(SEA + 0.3, SB["sea"], "−3.4 cm", (52, 360), 7, style="Big", size=64, color=BLUE, pop=True)
    counter(at("sea", 0.22), at("sea", 0.22, 1.2), -3.4, 4.2, lambda v: ("+" if v >= 0 else "−") + f"{abs(v):.1f} cm", (1228, 360), 9, 64, AMBER, SB["sea"])
    ev(at("sea", 0.45), SB["sea"], "+7.6 cm", (640, 30), 8, style="Big", size=70, pop=True, fad=(100, 150))
    ev(at("sea", 0.45), SB["sea"], "E♭4", (1186, 470), 6, size=26, color=AMBER, fad=(100, 100))
    ev(at("sea", 0.45), SB["sea"], "E♭3", (1186, 668), 6, size=26, color=BLUE, fad=(100, 100))
    # 6: proof
    ev(PR, SB["proof"], "DOES THE SOUND CARRY THE DATA?", (640, 86), 8, size=34, color=AMBER, spacing=6, fad=(150, 150))
    counter(PR + 0.2, PR + 1.1, 0, 0.992, lambda v: f"{v:.3f}", (360, 190), 8, 150, BLUE, SB["proof"])
    counter(PR + 0.3, PR + 1.2, 0, 0.997, lambda v: f"{v:.3f}", (920, 190), 8, 150, AMBER, SB["proof"])
    ev(PR + 0.6, SB["proof"], "methane vs NOAA ground stations", (360, 372), 8, size=30, fad=(120, 120))
    ev(PR + 0.6, SB["proof"], "sea level vs NOAA satellite altimetry", (920, 372), 8, size=30, fad=(120, 120))
    ev(PR + 0.9, SB["proof"], "r = how closely the yearly trends match (1.000 is perfect)", (640, 520), 8, size=26, color=GREY, fad=(120, 120))
    # 7: the people it is for
    counter(PE + 0.1, PE + 1.3, 0, 338, lambda v: f"{v:,.0f} million", (640, 70), 8, 120, WHITE, SB["people"])
    ev(PE + 0.9, SB["people"], "people are blind or have moderate to severe vision loss", (640, 215), 8, size=34, color=GREY, fad=(150, 150))
    ev(at("people", 0.66), SB["people"], "NOW THEY CAN HEAR IT", (640, 556), 8, style="Big", size=44, color=AMBER, pop=True, fad=(80, 100))
    # 8: end card
    ev(EN, TOTAL, "TERRA VOX", (640, 130), 8, style="Big", size=124, pop=True, fad=(100, 250))
    ev(EN + 0.3, TOTAL, "Press play. Hear how the planet changed.", (640, 290), 8, size=46, fad=(150, 250))
    ev(EN + 0.6, TOTAL, "demondarkness010-web.github.io/terra-vox", (640, 380), 8, size=40, color=AMBER, fad=(150, 250))
    credit = f"Footage: the live app. Animation: drawn in code. Narration: {NARRATOR_CREDIT}. Built with Claude Code."
    ev(EN + 0.8, TOTAL, f"Data: NASA GIBS (AIRS methane, JPL MEaSUREs sea level). Checked against NOAA GML and NOAA LSA.{BS}N"
                        f"{credit}{BS}N" f"NASA and NOAA do not endorse this project.", (640, 470), 8, size=22, color=GREY, fad=(150, 250))
    head = f"""[Script Info]
ScriptType: v4.00+
PlayResX: {W}
PlayResY: {H}
ScaledBorderAndShadow: yes
WrapStyle: 2

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Txt,Segoe UI,40,&H00FFFFFF,&H000000FF,&H00000000,&H80000000,1,0,0,0,100,100,0,0,3,3,0,2,20,20,20,1
Style: Big,Segoe UI Black,100,&H00FFFFFF,&H000000FF,&H00000000,&H00000000,0,0,0,0,100,100,0,0,1,0,0,7,20,20,20,1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
"""
    open(path, "w", encoding="utf-8").write(head + "\n".join(EV) + "\n")


NARRATOR_CREDIT = {"eleven": "AI voice (ElevenLabs)", "zira": "synthetic voice (Windows text-to-speech)", "me": "recorded by the author"}.get(VOICE, "see description")

# ----------------------------------------------------------------------------- picture
GLOBE_X0, GLOBE_W = 241, 560
GW0, GH0 = int(GLOBE_W * 1.2), int(495 * 1.2)


def globe(run, t, mode, push):
    sc = 1.2 + 0.05 * push                     # a slow push-in on the footage
    gw, gh = int(GLOBE_W * sc), int(495 * sc)
    img = run.at(t).crop((GLOBE_X0, 0, GLOBE_X0 + GLOBE_W, 495)).resize((gw, gh), Image.LANCZOS)
    a = np.asarray(img, dtype=np.float32)
    if mode in ("left", "right"):
        mid, dim = gw // 2, 0.22
        ramp = np.ones(gw, dtype=np.float32)
        if mode == "left":
            ramp[mid:] = dim
            ramp[mid - 6:mid + 6] = np.linspace(1, dim, 12)
        else:
            ramp[:mid] = dim
            ramp[mid - 6:mid + 6] = np.linspace(dim, 1, 12)
        a = a * ramp[None, :, None]
    return a.astype(np.uint8)


def backdrop(run, t, gain=0.30):
    img = run.at(t).crop((331, 140, 711, 354)).resize((640, 360), Image.LANCZOS)
    small = img.resize((48, 27), Image.BILINEAR).resize((W, H), Image.BICUBIC)
    return (np.asarray(small, dtype=np.float32) * gain).astype(np.uint8)


STOPS = [(0.0, (110, 200, 130)), (0.4, (205, 215, 90)), (0.7, (242, 160, 60)), (1.0, (225, 65, 55))]


def ramp_color(s):
    s = min(1, max(0, s))
    for (a, ca), (b, cb) in zip(STOPS, STOPS[1:]):
        if s <= b:
            f = (s - a) / (b - a)
            return tuple(int(ca[i] + (cb[i] - ca[i]) * f) for i in range(3))
    return STOPS[-1][1]


def glow(img, layer, radius=9, strength=1.0):
    soft = layer.resize((W // 2, H // 2)).filter(ImageFilter.GaussianBlur(radius / 2)).resize((W, H))
    a = np.asarray(img, dtype=np.float32) + np.asarray(layer, dtype=np.float32) + np.asarray(soft, dtype=np.float32) * strength
    return np.clip(a, 0, 255).astype(np.uint8)


def how_scene(canvas, u, T):
    """Colour bar -> real numbers on a ppb scale -> a wave that gets higher and busier."""
    img = Image.fromarray(canvas)
    layer = Image.new("RGB", (W, H), (0, 0, 0))
    d = ImageDraw.Draw(layer)
    x0, x1, y0 = 140, 1140, 120
    reveal = ease(u / 0.28)
    for k in range(60):
        s = k / 59
        if s <= reveal:
            xa = x0 + (x1 - x0) * k / 60
            d.rectangle([xa, y0, xa + (x1 - x0) / 60 - 2, y0 + 38], fill=ramp_color(s))
    numb = ease((u - 0.33) / 0.2)
    if numb > 0:
        for xv in (140, 640, 1140):
            d.line([(xv, y0 + 42), (xv, y0 + 54)], fill=(150, 150, 160), width=2)
        for frac, col in ((0.28, (74, 163, 255)), (0.905, (242, 163, 58))):
            xm = x0 + (x1 - x0) * frac
            ym = y0 + 46 + 12 * numb
            d.polygon([(xm, y0 + 42), (xm - 10, ym + 8), (xm + 10, ym + 8)], fill=col)
    prog = ease((u - 0.6) / 0.38)
    base, n, phase, cum = 470, 260, T * 5.0, 0.0
    pts = {0: [], 1: []}
    for i in range(n + 1):
        s = i / n
        if s > prog:
            break
        x = x0 + (x1 - x0) * s
        cum += (1.5 + 14.0 * s ** 1.4) / n * 2 * math.pi
        amp = 14 + 82 * s
        for r in (0, 1):
            pts[r].append((x, base + amp * math.sin(cum + phase * (1 + 0.15 * r) + r * 1.1) * (1 - 0.35 * r), s))
    for r, wd in ((0, 7), (1, 4)):
        for (xa, ya, sa), (xb, yb2, sb) in zip(pts[r], pts[r][1:]):
            d.line([(xa, ya), (xb, yb2)], fill=ramp_color(sa), width=wd)
    return glow(img, layer, 12, 0.9)


def ladder(canvas, T):
    img = Image.fromarray(canvas)
    layer = Image.new("RGB", (W, H), (0, 0, 0))
    d = ImageDraw.Draw(layer)
    x, y0, y1 = 1215, 668, 470
    f = ease((T - at("sea", 0.4)) / 1.6)
    f = f * f * (3 - 2 * f) if 0 < f < 1 else f
    d.line([(x, y1), (x, y0)], fill=(90, 90, 100), width=3)
    for k in range(13):
        yy = y0 + (y1 - y0) * k / 12
        e = 12 if k in (0, 12) else 7
        d.line([(x - e, yy), (x + e, yy)], fill=(130, 130, 140), width=2)
    my = y0 + (y1 - y0) * f
    col = tuple(int(a + (b - a) * f) for a, b in zip((74, 163, 255), (242, 163, 58)))
    d.line([(x, y0), (x, my)], fill=col, width=7)
    d.ellipse([x - 15, my - 15, x + 15, my + 15], fill=col)
    return glow(img, layer, 14, 1.0)


def people_scene(canvas, T):
    img = Image.fromarray(canvas)
    layer = Image.new("RGB", (W, H), (0, 0, 0))
    d = ImageDraw.Draw(layer)
    t_hp = at("people", 0.62)
    chart = ease((T - SA["people"] - 0.5) / 0.5) * (1 - ease((T - t_hp + 0.3) / 0.6))
    if chart > 0:
        for i, h in enumerate([0.35, 0.55, 0.45, 0.8, 0.65, 0.95, 0.7]):
            bx = 450 + i * 56
            bh = 260 * h * ease((T - SA["people"] - 0.5 - i * 0.05) / 0.5)
            c = int(120 * chart)
            d.rectangle([bx, 560 - bh, bx + 36, 560], fill=(c, c, c + 10))
        d.line([(430, 562), (850, 562)], fill=(int(140 * chart),) * 3, width=3)
    hp = ease((T - t_hp) / 0.7)
    if hp > 0:
        cx, cy = 640, 400
        d.arc([cx - 150, cy - 170, cx + 150, cy + 100], 180, 360, fill=tuple(int(200 * hp) for _ in range(3)), width=16)
        d.rounded_rectangle([cx - 190, cy - 40, cx - 120, cy + 100], 26, fill=tuple(int(v * hp) for v in (74, 163, 255)))
        d.rounded_rectangle([cx + 120, cy - 40, cx + 190, cy + 100], 26, fill=tuple(int(v * hp) for v in (242, 163, 58)))
        for side, col in ((-1, (74, 163, 255)), (1, (242, 163, 58))):
            for k in range(4):
                ph = ((T * 0.9) + k / 4) % 1.0
                r, a = 40 + 190 * ph, (1 - ph) * hp
                ccx = cx + side * 190
                bbox = [ccx - r, cy + 30 - r, ccx + r, cy + 30 + r]
                d.arc(bbox, 100 if side < 0 else -80, 260 if side < 0 else 80, fill=tuple(int(c * a) for c in col), width=4)
    return glow(img, layer, 12, 0.8)


def frame(T):
    name = scene_of(T)
    run, start, span, mode = FOOT[name]
    local = T - SA[name]
    t = start + min(local, span)
    canvas = np.zeros((H, W, 3), dtype=np.uint8)
    if mode == "backdrop":
        canvas[:] = backdrop(run, t, 0.22 if name in ("how", "people") else 0.30)
    else:
        g = globe(run, t, mode, local / max(0.1, DUR[name]))
        gh, gw = g.shape[:2]
        y = 18 + (GH0 - gh) // 2
        canvas[y:y + gh, (W - gw) // 2:(W - gw) // 2 + gw] = g
    if name == "left" and T < 0.9:
        canvas = (canvas.astype(np.float32) * ease(T / 0.9)).astype(np.uint8)
    if name == "how":
        canvas = how_scene(canvas, local / DUR[name], T)
    elif name == "sea":
        canvas = ladder(canvas, T)
    elif name == "people":
        canvas = people_scene(canvas, T)
    if name != "left" and local < 0.14:                      # a brief flash on every cut
        canvas = np.clip(canvas.astype(np.float32) * (1 + 0.5 * (1 - local / 0.14)), 0, 255).astype(np.uint8)
    canvas[H - 5:H, : int(W * T / TOTAL)] = (242, 163, 58)    # progress bar
    return canvas


def main():
    os.makedirs(os.path.join(HERE, "video"), exist_ok=True)
    ass, wav = os.path.join(HERE, "video", "v6.ass"), os.path.join(HERE, "video", "v6_sound.wav")
    build_ass(ass)
    build_audio(wav)
    cmd = ["ffmpeg", "-hide_banner", "-loglevel", "error", "-y", "-f", "rawvideo", "-pix_fmt", "rgb24", "-s", f"{W}x{H}", "-r", str(FPS), "-i", "-",
           "-i", wav, "-vf", "ass=video/v6.ass:fontsdir=fonts,format=yuv420p", "-c:v", "libx264", "-preset", "veryfast", "-crf", "19", "-profile:v", "high",
           "-c:a", "aac", "-b:a", "192k", "-t", f"{TOTAL}", "-movflags", "+faststart", OUT]
    os.chdir(HERE)
    p = subprocess.Popen(cmd, stdin=subprocess.PIPE)
    n = int(round(TOTAL * FPS))
    for k in range(n):
        p.stdin.write(frame(k / FPS).tobytes())
        if k % 100 == 0:
            print(f"frame {k}/{n}", flush=True)
    p.stdin.close()
    p.wait()
    print("done", OUT, round(os.path.getsize(OUT) / 1e6, 2), "MB", TOTAL, "s")


if __name__ == "__main__":
    main()
