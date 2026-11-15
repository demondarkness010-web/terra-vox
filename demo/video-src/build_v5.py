"""The 30-second demo, version 5: follows docs/animation-prompt.md.

Live footage of the app and its real recorded sound, plus animation drawn in code (colour bar turning into
sound, a climbing bass note, headphones), kinetic text, and a narrator. Nothing here is AI-generated imagery.
The narrator files are vo5/L1..L8_<voice>.wav; drop in your own recordings with the same names to replace them.

usage: python build_v5.py <recordings dir> <out.mp4> [voice]
"""
import bisect, json, math, os, subprocess, sys, wave
import numpy as np
from PIL import Image, ImageDraw, ImageFilter

REC = sys.argv[1] if len(sys.argv) > 1 else "rec"
OUT = sys.argv[2] if len(sys.argv) > 2 else "demo30_v5.mp4"
VOICE = sys.argv[3] if len(sys.argv) > 3 else "zira"
HERE = os.path.dirname(os.path.abspath(__file__))
FPS, W, H = 25, 1280, 720
LAT = 0.128
BS = chr(92)
TOTAL = 29.0

# ----------------------------------------------------------------------------- recordings (same as build_v3)
class Run:
    def __init__(self, name):
        self.dir = os.path.join(REC, name)
        meta = json.load(open(os.path.join(self.dir, "meta.json")))
        order = sorted(range(len(meta["stamps"])), key=lambda i: meta["stamps"][i])
        self.t = [meta["stamps"][i] / 1000 for i in order]
        self.files = [os.path.join(self.dir, f"f{i:05d}.jpg") for i in order]
        w = wave.open(os.path.join(self.dir, "audio.wav"))
        a = np.frombuffer(w.readframes(w.getnframes()), dtype=np.int16).reshape(-1, 2).astype(float) / 32768
        self.sr = w.getframerate()
        hop = int(self.sr * 0.01)
        n = len(a) // hop
        self.db = 20 * np.log10(np.sqrt((a[:n * hop].reshape(n, hop, 2) ** 2).mean(axis=1)) + 1e-9)
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
tL = max(onL + LAT - 0.05, texture_time(M, onL - 0.5) + 0.05)
onR = M.first(1, onL + 1.0)
onBoth = M.first(0, onR + 1.0)
sL = S.first(0, 1.0)
sBoth = S.first(0, S.first(1, sL + 1.0) + 1.0)
aBoth = MA.first(0, MA.first(1, MA.first(0, 1.0) + 1.0) + 1.0)
PRE = 0.05

# ----------------------------------------------------------------------------- the edit
# (name, start, end, footage run, footage start time, mode)
SCENES = [
    ("left",   0.0,  3.4, M,  tL, "left"),
    ("right",  3.4,  5.7, M,  onR + LAT - PRE, "right"),
    ("both",   5.7, 11.7, M,  onBoth + LAT - PRE, "both"),
    ("music", 11.7, 14.5, MA, aBoth + 2.0 + LAT, "backdrop"),
    ("sea",   14.5, 18.2, S,  sBoth + LAT - PRE, "both"),
    ("proof", 18.2, 20.3, MA, aBoth + 6.0 + LAT, "backdrop"),
    ("people", 20.3, 24.3, MA, aBoth + 8.5 + LAT, "backdrop"),
    ("end",   24.3, 29.0, MA, aBoth + 12.5 + LAT, "backdrop"),
]
# sound from the real recordings: (run, start in recording, length, video time, fade in, fade out, gain dB)
MUSIC = [
    (M,  tL - LAT,         3.2, 0.20, 0.03, 0.12, 0),
    (M,  onR - PRE,        2.3, 3.40, 0.02, 0.12, 0),
    (M,  onBoth - PRE,     6.0, 5.70, 0.02, 0.10, 0),
    (MA, aBoth + 2.0,      2.8, 11.7, 0.02, 0.10, -3),
    (S,  sBoth - PRE,      3.7, 14.5, 0.02, 0.10, 0),
    (MA, aBoth + 6.0,      2.1, 18.2, 0.02, 0.10, -5),
    (MA, aBoth + 8.5,      4.0, 20.3, 0.02, 0.10, -6),
    (MA, aBoth + 12.5,     4.7, 24.3, 0.02, 2.00, -7),
]
VOICE_AT = [("L1", 0.25), ("L2", 3.45), ("L3", 5.80), ("L4", 11.75), ("L5", 14.55), ("L6", 18.30), ("L7", 20.30), ("L8", 24.40)]
CAPTIONS = {
    "L1": ("Close your eyes. This is Earth in 2003.", 0.25, 3.25),
    "L2": ("Now. This is 2026.", 3.45, 5.65),
    "L3": ("Same planet. One year in each ear. That gap you hear?", 5.8, 9.2),
    "L3b": ("Twenty-three years of methane.", 9.3, 11.6),
    "L4": ("Terra Vox turns real NASA satellite data into music.", 11.75, 14.4),
    "L5": ("Sea level rose 7.6 centimetres. Hear the bass climb.", 14.55, 18.1),
    "L6": ("And it matches NOAA's own records.", 18.3, 20.1),
    "L7": ("338 million people can't read a chart.", 20.3, 22.4),
    "L7b": ("Now they can hear one.", 22.5, 24.2),
    "L8": ("Terra Vox. Press play.", 24.4, 26.3),
}


def build_audio(path):
    ins, fl, labels = [], [], []
    for k, (run, st, ln, at, fi, fo, gain) in enumerate(MUSIC):
        ins += ["-i", run.wav]
        ms = int(at * 1000)
        fl.append(f"[{k}:a]atrim=start={st:.3f}:end={st + ln:.3f},asetpts=PTS-STARTPTS,afade=t=in:d={fi},"
                  f"afade=t=out:st={max(0, ln - fo):.3f}:d={fo},volume={gain}dB,adelay={ms}|{ms}[m{k}]")
        labels.append(f"[m{k}]")
    fl.append("".join(labels) + f"amix=inputs={len(labels)}:normalize=0,apad=whole_dur={TOTAL}[music]")
    vl = []
    for j, (vid, at) in enumerate(VOICE_AT):
        ins += ["-i", os.path.join(HERE, "vo5", f"{vid}_{VOICE}.wav")]
        ms = int(at * 1000)
        fl.append(f"[{len(MUSIC) + j}:a]aresample=44100,aformat=channel_layouts=stereo,loudnorm=I=-16:TP=-2:LRA=7,adelay={ms}|{ms}[v{j}]")
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


def caption(text, a, b):
    ev(a, b, text, (640, 668), 2, size=40, color=WHITE, fad=(100, 100), extra=f"{BS}bord3{BS}3c&H000000&{BS}4a&H60&")


def build_ass(path):
    for _, (text, a, b) in CAPTIONS.items():
        caption(text, a, b)
    # 1 left alone (fades in from black with the first note)
    year_cols(0.5, 3.4, "2003", "2026", True, False)
    ev(1.0, 3.4, "low · slow · calm", (50, 345), 7, size=36)
    ev(1.2, 3.4, "C4 · one note a bar · 80 BPM", (50, 392), 7, size=26, color=GREY)
    # 2 right alone
    year_cols(3.4, 5.7, "2003", "2026", False, True)
    ev(3.5, 5.7, "higher · busier · tense", (1230, 345), 9, size=36)
    ev(3.6, 5.7, "E♭5 · four notes a bar · 118 BPM", (1230, 392), 9, size=26, color=GREY)
    # 3 both, then the gap in numbers
    year_cols(5.7, 11.7, "2003", "2026", True, True)
    ev(9.0, 11.7, "1,756", (52, 360), 7, style="Big", size=64, color=BLUE, pop=True)
    ev(9.0, 11.7, "ppb, January to September", (52, 432), 7, size=24, color=GREY)
    counter(9.3, 10.6, 1756, 1881, lambda v: f"{v:,.0f}", (1228, 360), 9, 64, AMBER, 11.7)
    ev(9.3, 11.7, "ppb, January to September", (1228, 432), 9, size=24, color=GREY)
    ev(10.5, 11.7, "+125 ppb", (640, 560), 2, style="Big", size=54, pop=True, fad=(100, 150))
    ev(9.0, 11.7, "NASA AIRS satellite, methane at 400 hPa", (640, 612), 2, size=22, color=GREY, fad=(150, 100))
    # 4 colour -> number -> note
    ev(11.8, 14.5, "NASA COLOUR", (180, 236), 7, size=32, color=WHITE, spacing=4, fad=(150, 100))
    ev(12.5, 14.5, "→  REAL NUMBER", (560, 236), 7, size=32, color=AMBER, spacing=4, fad=(150, 100))
    ev(13.2, 14.5, "→  NOTE", (1000, 236), 7, size=32, color=BLUE, spacing=4, fad=(150, 100))
    ev(12.0, 14.5, "more methane  =  higher, louder, busier", (640, 540), 8, size=34, color=GREY, fad=(200, 150))
    # 5 sea level
    year_cols(14.5, 18.2, "1993", "2018", True, True)
    ev(14.6, 18.2, "SEA LEVEL", (52, 50), 7, size=30, color=GREY, spacing=8)
    ev(14.7, 18.2, "NASA JPL MEaSUREs, sea surface height", (52, 92), 7, size=22, color=GREY)
    ev(14.8, 18.2, "−3.4 cm", (52, 360), 7, style="Big", size=64, color=BLUE, pop=True)
    counter(15.1, 16.3, -3.4, 4.2, lambda v: ("+" if v >= 0 else "−") + f"{abs(v):.1f} cm", (1228, 360), 9, 64, AMBER, 18.2)
    ev(16.2, 18.2, "+7.6 cm", (640, 30), 8, style="Big", size=70, pop=True, fad=(100, 150))
    ev(16.0, 18.2, "E♭4", (1186, 470), 6, size=26, color=AMBER, fad=(100, 100))
    ev(16.0, 18.2, "E♭3", (1186, 668), 6, size=26, color=BLUE, fad=(100, 100))
    # 6 proof
    ev(18.2, 20.3, "DOES THE SOUND CARRY THE DATA?", (640, 86), 8, size=34, color=AMBER, spacing=6, fad=(150, 150))
    counter(18.4, 19.4, 0, 0.992, lambda v: f"{v:.3f}", (360, 190), 8, 150, BLUE, 20.3)
    counter(18.5, 19.5, 0, 0.997, lambda v: f"{v:.3f}", (920, 190), 8, 150, AMBER, 20.3)
    ev(18.9, 20.3, "methane vs NOAA ground stations", (360, 372), 8, size=30, fad=(120, 120))
    ev(18.9, 20.3, "sea level vs NOAA satellite altimetry", (920, 372), 8, size=30, fad=(120, 120))
    ev(19.2, 20.3, "r = how closely the yearly trends match (1.000 is perfect)", (640, 520), 8, size=26, color=GREY, fad=(120, 120))
    # 7 people
    counter(20.4, 21.8, 0, 338, lambda v: f"{v:,.0f} million", (640, 70), 8, 120, WHITE, 24.3)
    ev(21.2, 24.3, "people are blind or have moderate to severe vision loss", (640, 215), 8, size=34, color=GREY, fad=(150, 150))
    ev(23.6, 24.3, "NOW THEY CAN HEAR IT", (640, 600), 8, style="Big", size=44, color=AMBER, pop=True, fad=(80, 100))
    # 8 end card
    ev(24.4, 29.0, "TERRA VOX", (640, 130), 8, style="Big", size=124, pop=True, fad=(100, 250))
    ev(24.7, 29.0, "Press play. Hear how the planet changed.", (640, 290), 8, size=46, fad=(150, 250))
    ev(25.0, 29.0, "demondarkness010-web.github.io/terra-vox", (640, 380), 8, size=40, color=AMBER, fad=(150, 250))
    ev(25.2, 29.0, f"Data: NASA GIBS (AIRS methane, JPL MEaSUREs sea level). Checked against NOAA GML and NOAA LSA.{BS}N"
                   f"Footage: the live app. Animation: drawn in code. Narration: synthetic voice (Windows text-to-speech). Built with Claude Code.{BS}N"
                   f"NASA and NOAA do not endorse this project.", (640, 470), 8, size=22, color=GREY, fad=(150, 250))
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


# ----------------------------------------------------------------------------- picture
GLOBE_X0, GLOBE_W = 241, 560
SC = 1.2
GW, GH = int(GLOBE_W * SC), int(495 * SC)
GX, GY = (W - GW) // 2, 18


def globe(run, t, mode):
    img = run.at(t).crop((GLOBE_X0, 0, GLOBE_X0 + GLOBE_W, 495)).resize((GW, GH), Image.LANCZOS)
    a = np.asarray(img, dtype=np.float32)
    if mode in ("left", "right"):
        mid, dim = GW // 2, 0.22
        ramp = np.ones(GW, dtype=np.float32)
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
    """Add `layer` (an RGB image on black) to img, with a soft glow around it."""
    soft = layer.resize((W // 2, H // 2)).filter(ImageFilter.GaussianBlur(radius / 2)).resize((W, H))
    a = np.asarray(img, dtype=np.float32) + np.asarray(layer, dtype=np.float32) + np.asarray(soft, dtype=np.float32) * strength
    return Image.fromarray(np.clip(a, 0, 255).astype(np.uint8))


def music_scene(canvas, T):
    """NASA colour -> number -> note: a colour bar that turns into a wave that gets higher and busier."""
    u = (T - 11.7) / 2.8
    img = Image.fromarray(canvas)
    layer = Image.new("RGB", (W, H), (0, 0, 0))
    d = ImageDraw.Draw(layer)
    x0, x1, yb = 140, 1140, 150
    reveal = ease(u / 0.35)
    for k in range(60):
        s = k / 59
        if s <= reveal:
            xa = x0 + (x1 - x0) * k / 60
            d.rectangle([xa, yb, xa + (x1 - x0) / 60 - 2, yb + 38], fill=ramp_color(s))
    # drops falling from the bar and the wave they become
    prog = ease((u - 0.25) / 0.6)
    base = 420
    pts = {0: [], 1: []}
    n = 260
    phase = T * 5.0
    cum = 0.0
    for i in range(n + 1):
        s = i / n
        if s > prog:
            break
        x = x0 + (x1 - x0) * s
        freq = 1.5 + 14.0 * s ** 1.4            # busier to the right
        cum += freq / n * 2 * math.pi
        amp = 14 + 82 * s
        for r in (0, 1):
            y = base + amp * math.sin(cum * 1.0 + phase * (1 + 0.15 * r) + r * 1.1) * (1 - 0.35 * r)
            pts[r].append((x, y, s))
    for r, wd in ((0, 7), (1, 4)):
        for (xa, ya, sa), (xb, yb2, sb) in zip(pts[r], pts[r][1:]):
            d.line([(xa, ya), (xb, yb2)], fill=ramp_color(sa), width=wd)
    # thin drops from bar to wave
    for k in range(0, 24):
        s = k / 23
        if s <= min(reveal, prog):
            x = x0 + (x1 - x0) * s
            d.line([(x, yb + 40), (x, base - 14 - 82 * s)], fill=tuple(int(c * 0.35) for c in ramp_color(s)), width=2)
    return np.asarray(glow(img, layer, 12, 0.9))


def ladder(canvas, T):
    """The bass climbing an octave: a marker rising up a 12-step ladder from E-flat 3 to E-flat 4."""
    img = Image.fromarray(canvas)
    layer = Image.new("RGB", (W, H), (0, 0, 0))
    d = ImageDraw.Draw(layer)
    x, y0, y1 = 1215, 668, 470
    f = min(1, max(0, (T - 16.0) / 2.0))
    f = f * f * (3 - 2 * f)
    d.line([(x, y1), (x, y0)], fill=(90, 90, 100), width=3)
    for k in range(13):
        yy = y0 + (y1 - y0) * k / 12
        d.line([(x - 12 if k in (0, 12) else x - 7, yy), (x + (12 if k in (0, 12) else 7), yy)], fill=(130, 130, 140), width=2)
    my = y0 + (y1 - y0) * f
    col = tuple(int(a + (b - a) * f) for a, b in zip((74, 163, 255), (242, 163, 58)))
    d.line([(x, y0), (x, my)], fill=col, width=7)
    d.ellipse([x - 15, my - 15, x + 15, my + 15], fill=col)
    return np.asarray(glow(img, layer, 14, 1.0))


def people_scene(canvas, T):
    """A bar chart you cannot read turns into sound: headphones with rings of sound in blue (left) and amber (right)."""
    img = Image.fromarray(canvas)
    layer = Image.new("RGB", (W, H), (0, 0, 0))
    d = ImageDraw.Draw(layer)
    chart = ease((T - 20.9) / 0.5) * (1 - ease((T - 23.0) / 0.6))
    if chart > 0:
        heights = [0.35, 0.55, 0.45, 0.8, 0.65, 0.95, 0.7]
        for i, h in enumerate(heights):
            bx = 450 + i * 56
            bh = 260 * h * ease((T - 20.9 - i * 0.05) / 0.5)
            c = int(120 * chart)
            d.rectangle([bx, 560 - bh, bx + 36, 560], fill=(c, c, c + 10))
        d.line([(430, 562), (850, 562)], fill=(int(140 * chart),) * 3, width=3)
    hp = ease((T - 22.7) / 0.7)
    if hp > 0:
        cx, cy = 640, 400
        bandc = tuple(int(200 * hp) for _ in range(3))
        d.arc([cx - 150, cy - 170, cx + 150, cy + 100], 180, 360, fill=bandc, width=16)
        d.rounded_rectangle([cx - 190, cy - 40, cx - 120, cy + 100], 26, fill=tuple(int(v * hp) for v in (74, 163, 255)))
        d.rounded_rectangle([cx + 120, cy - 40, cx + 190, cy + 100], 26, fill=tuple(int(v * hp) for v in (242, 163, 58)))
        for side, col in ((-1, (74, 163, 255)), (1, (242, 163, 58))):
            for k in range(4):
                ph = ((T * 0.9) + k / 4) % 1.0
                r = 40 + 190 * ph
                a = (1 - ph) * hp
                ccx = cx + side * 190
                bbox = [ccx - r, cy + 30 - r, ccx + r, cy + 30 + r]
                if side < 0:
                    d.arc(bbox, 100, 260, fill=tuple(int(c * a) for c in col), width=4)
                else:
                    d.arc(bbox, -80, 80, fill=tuple(int(c * a) for c in col), width=4)
    return np.asarray(glow(img, layer, 12, 0.8))


def frame(T):
    for name, a, b, run, start, mode in SCENES:
        if a <= T < b + 1e-9:
            break
    t = start + (T - a)
    canvas = np.zeros((H, W, 3), dtype=np.uint8)
    if mode == "backdrop":
        canvas[:] = backdrop(run, t, 0.22 if name in ("music", "people") else 0.30)
    else:
        canvas[GY:GY + GH, GX:GX + GW] = globe(run, t, mode)
    if name == "left" and T < 0.9:
        canvas = (canvas.astype(np.float32) * ease(T / 0.9)).astype(np.uint8)
    if name == "music":
        canvas = music_scene(canvas, T)
    elif name == "sea":
        canvas = ladder(canvas, T)
    elif name == "people":
        canvas = people_scene(canvas, T)
    return canvas


def main():
    os.makedirs(os.path.join(HERE, "video"), exist_ok=True)
    ass, wav = os.path.join(HERE, "video", "v5.ass"), os.path.join(HERE, "video", "v5_sound.wav")
    build_ass(ass)
    build_audio(wav)
    cmd = ["ffmpeg", "-hide_banner", "-loglevel", "error", "-y", "-f", "rawvideo", "-pix_fmt", "rgb24", "-s", f"{W}x{H}", "-r", str(FPS), "-i", "-",
           "-i", wav, "-vf", "ass=video/v5.ass:fontsdir=fonts,format=yuv420p", "-c:v", "libx264", "-preset", "veryfast", "-crf", "19", "-profile:v", "high",
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
    print("done", OUT, os.path.getsize(OUT) / 1e6, "MB")


if __name__ == "__main__":
    main()
