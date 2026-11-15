"""The 30-second demo, version 3: live footage and the app's real sound.

Needs recordings made with the app (see cdp_rec.mjs in the notes): rec_methane, rec_methane_a and rec_sea,
each with f*.jpg frames of the globe canvas, meta.json (frame times in ms) and audio.wav.
The picture is composed frame by frame here (globe footage blended to a steady 25 fps, dimmed half for the
single-ear phases, kinetic text from the .ass file), then ffmpeg joins it with the mixed sound.

usage: python build_v3.py <recordings dir> <out.mp4>
"""
import bisect, json, os, subprocess, sys, wave
import numpy as np
from PIL import Image

REC = sys.argv[1] if len(sys.argv) > 1 else "rec"
OUT = sys.argv[2] if len(sys.argv) > 2 else "demo30_v3.mp4"
HERE = os.path.dirname(os.path.abspath(__file__))
VO = os.path.join(HERE, "vo")
FPS, W, H = 25, 1280, 720
LAT = 0.128          # the app shows a note this long after it reaches the output; shift sound to match the picture
BS = chr(92)

# ----------------------------------------------------------------------------- recordings
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
        self.db = 20 * np.log10(np.sqrt((a[:n * hop].reshape(n, hop, 2) ** 2).mean(axis=1)) + 1e-9)   # per 10 ms, L and R
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
        """The globe canvas at recording time t, blended between the two nearest captured frames."""
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
    """First frame time (after `after`) whose globe is the bright map texture, not the dark fire globe left over from the previous theme."""
    for t, f in zip(run.t, run.files):
        if t >= after:
            a = np.asarray(Image.open(f).convert("L").crop((400, 150, 640, 350)), dtype=np.float32)
            if a.mean() > lo:
                return t
    raise SystemExit("no bright globe found")


M = Run("rec_methane")      # intro phases and the first bars of the Duet
MA = Run("rec_methane_a")   # a longer Duet, for the later scenes
S = Run("rec_sea")

onL = M.first(0, 1.0)
texL = texture_time(M, onL - 0.5)
tL = max(onL + LAT - 0.05, texL + 0.05)          # first picture of the methane globe, and the sound that matches it
onR = M.first(1, onL + 1.0)
onBoth = M.first(0, onR + 1.0)
sL = S.first(0, 1.0)
sR = S.first(1, sL + 1.0)
sBoth = S.first(0, sR + 1.0)
aB = MA.first(1, MA.first(0, 1.0) + 1.0)
aBoth = MA.first(0, aB + 1.0)
print(f"methane texture shows from {texL:.2f}, left scene starts at {tL:.2f}")
print(f"methane: left {onL:.2f} right {onR:.2f} both {onBoth:.2f} | sea: left {sL:.2f} right {sR:.2f} both {sBoth:.2f} | methane-a both {aBoth:.2f}")

# ----------------------------------------------------------------------------- the edit
# (name, video start, video end, footage run, footage start in that run (a frame time), mode)
PRE = 0.05
SCENES = [
    ("title",  0.0,  1.8, MA, aBoth + 3.0, "backdrop"),
    ("left",   1.8,  5.2, M,  tL, "left"),
    ("right",  5.2,  7.4, M,  onR + LAT - PRE, "right"),
    ("both",   7.4, 13.0, M,  onBoth + LAT - PRE, "both"),
    ("sea",   13.0, 18.4, S,  sBoth + LAT - PRE, "both"),
    ("proof", 18.4, 23.2, MA, aBoth + 6.0 + LAT, "backdrop"),
    ("access", 23.2, 26.4, MA, aBoth + 10.8 + LAT, "backdrop"),
    ("end",   26.4, 29.0, MA, aBoth + 14.0 + LAT, "backdrop"),
]
TOTAL = SCENES[-1][2]

# sound: (run, start inside the recording, length, where it goes in the video, fade in, fade out, gain dB)
MUSIC = [
    (M,  tL - LAT,          3.4, 1.8,  0.02, 0.12, 0),
    (M,  onR - PRE,       2.2, 5.2,  0.02, 0.12, 0),
    (M,  onBoth - PRE,    5.6, 7.4,  0.02, 0.10, 0),
    (S,  sBoth - PRE,     5.4, 13.0, 0.02, 0.10, 0),
    (MA, aBoth + 6.0,     4.8, 18.4, 0.02, 0.10, -4),
    (MA, aBoth + 10.8,    3.2, 23.2, 0.02, 0.10, -5),
    (MA, aBoth + 14.0,    2.6, 26.4, 0.02, 1.60, -7),
]
VOICE = [("A1", 1.95), ("A2", 5.32), ("A3", 7.52)]
CAPTION = {"A1": "This is the planet in 2003.", "A2": "And this is 2026.", "A3": "Both at once. That gap is 23 years of methane."}

# ----------------------------------------------------------------------------- sound
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
    for j, (vid, at) in enumerate(VOICE):
        ins += ["-i", os.path.join(VO, f"{vid}.mp3")]
        ms = int(at * 1000)
        fl.append(f"[{len(MUSIC) + j}:a]aresample=44100,aformat=channel_layouts=stereo,volume=2dB,adelay={ms}|{ms}[v{j}]")
        vl.append(f"[v{j}]")
    fl.append("".join(vl) + f"amix=inputs={len(vl)}:normalize=0,apad=whole_dur={TOTAL},asplit=2[vk][vm]")
    fl.append("[music][vk]sidechaincompress=threshold=0.02:ratio=6:attack=15:release=400[duck]")
    fl.append(f"[duck][vm]amix=inputs=2:normalize=0,loudnorm=I=-16:TP=-1.5:LRA=9,alimiter=limit=0.9,atrim=0:{TOTAL}[aout]")
    subprocess.run(["ffmpeg", "-hide_banner", "-loglevel", "error", "-y", *ins, "-filter_complex", ";".join(fl),
                    "-map", "[aout]", "-ar", "44100", "-ac", "2", path], check=True)

# ----------------------------------------------------------------------------- text (ASS)
BLUE, AMBER, WHITE, GREY = "&HFFA34A&", "&H3AA3F2&", "&HFFFFFF&", "&HC8C8C8&"

def ts(x):
    return f"{int(x // 3600)}:{int(x % 3600 // 60):02d}:{x % 60:05.2f}"

EV = []
def ev(a, b, text, pos, an=7, style="Txt", size=40, color=WHITE, fad=(120, 120), pop=False, alpha=None, bold=1, spacing=0, extra=""):
    t = f"{{{BS}an{an}{BS}pos({pos[0]},{pos[1]}){BS}fs{size}{BS}1c{color}{BS}fsp{spacing}{BS}b{bold}"
    if alpha:
        t += f"{BS}alpha&H{alpha}&"
    if fad:
        t += f"{BS}fad({fad[0]},{fad[1]})"
    if pop:
        t += f"{BS}fscx70{BS}fscy70{BS}t(0,220,{BS}fscx100{BS}fscy100)"
    t += extra + "}" + text
    EV.append(f"Dialogue: 1,{ts(a)},{ts(b)},{style},,0,0,0,,{t}")

def ease(x):
    x = min(1, max(0, x))
    return 1 - (1 - x) ** 3

def counter(a, b, v0, v1, fmt, pos, an, size, color, hold_until):
    """Number that counts from v0 to v1 between a and b, then stays until hold_until."""
    n = max(1, int(round((b - a) * FPS)))
    for k in range(n):
        v = v0 + (v1 - v0) * ease((k + 1) / n)
        ev(a + k / FPS, a + (k + 1) / FPS, fmt(v), pos, an, size=size, color=color, fad=None, style="Big")
    ev(b, hold_until, fmt(v1), pos, an, size=size, color=color, fad=(0, 150), style="Big")

def year_cols(a, b, ly, ry, lbright=True, rbright=True, sub=None):
    la = None if lbright else "90"
    ra = None if rbright else "90"
    ev(a, b, "LEFT EAR", (52, 178), 7, size=28, color=BLUE, alpha=la, spacing=5, fad=(150, 100))
    ev(a, b, ly, (46, 212), 7, style="Big", size=112, color=BLUE, alpha=la, pop=lbright, fad=(150, 100))
    ev(a, b, "RIGHT EAR", (1228, 178), 9, size=28, color=AMBER, alpha=ra, spacing=5, fad=(150, 100))
    ev(a, b, ry, (1234, 212), 9, style="Big", size=112, color=AMBER, alpha=ra, pop=rbright, fad=(150, 100))

def caption(a, b, text):
    ev(a, b, text, (640, 668), 2, size=40, color=WHITE, fad=(120, 120), extra=f"{BS}bord3{BS}3c&H000000&{BS}4a&H60&")

def build_ass(path):
    # title
    ev(0.0, 1.8, f"23 YEARS", (640, 215), 8, style="Big", size=150, pop=True, fad=(120, 200))
    ev(0.05, 1.8, f"OF METHANE", (640, 360), 8, style="Big", size=150, color=AMBER, pop=True, fad=(120, 200))
    ev(0.5, 1.8, "Put on headphones.", (640, 560), 8, size=40, color=GREY, spacing=3, fad=(200, 200))
    # left alone
    year_cols(1.8, 5.2, "2003", "2026", True, False)
    ev(2.0, 5.2, "low · slow · calm", (50, 345), 7, size=36, color=WHITE)
    ev(2.2, 5.2, "C4 · one note a bar · 80 BPM", (50, 392), 7, size=26, color=GREY)
    caption(1.95, 4.3, CAPTION["A1"])
    # right alone
    year_cols(5.2, 7.4, "2003", "2026", False, True)
    ev(5.3, 7.4, "higher · busier · tense", (1230, 345), 9, size=36, color=WHITE)
    ev(5.4, 7.4, "E♭5 · four notes a bar · 118 BPM", (1230, 392), 9, size=26, color=GREY)
    caption(5.32, 7.2, CAPTION["A2"])
    # both
    year_cols(7.4, 13.0, "2003", "2026", True, True)
    caption(7.52, 11.1, CAPTION["A3"])
    ev(10.3, 13.0, "1,756", (52, 360), 7, style="Big", size=64, color=BLUE, pop=True)
    ev(10.3, 13.0, "ppb, January to September", (52, 432), 7, size=24, color=GREY)
    counter(10.6, 12.0, 1756, 1881, lambda v: f"{v:,.0f}", (1228, 360), 9, 64, AMBER, 13.0)
    ev(10.6, 13.0, "ppb, January to September", (1228, 432), 9, size=24, color=GREY)
    ev(11.9, 13.0, "+125 ppb in 23 years", (640, 656), 2, style="Big", size=44, color=WHITE, pop=True, fad=(100, 150))
    ev(10.4, 13.0, "NASA AIRS satellite, methane at 400 hPa (about 7 km up)", (640, 704), 2, size=22, color=GREY, fad=(150, 100))
    # sea level
    year_cols(13.0, 18.4, "1993", "2018", True, True)
    ev(13.3, 18.4, "SEA LEVEL", (52, 50), 7, size=30, color=GREY, spacing=8)
    ev(13.5, 18.4, "NASA JPL MEaSUREs, sea surface height", (52, 92), 7, size=22, color=GREY)
    ev(13.5, 18.4, "−3.4 cm", (52, 360), 7, style="Big", size=64, color=BLUE, pop=True)
    counter(13.9, 15.4, -3.4, 4.2, lambda v: ("+" if v >= 0 else "−") + f"{abs(v):.1f} cm", (1228, 360), 9, 64, AMBER, 18.4)
    ev(15.2, 18.4, "1993 to 2018: sea level rose 7.6 cm.", (640, 628), 2, style="Big", size=44, color=WHITE, pop=True, fad=(100, 150))
    ev(16.2, 18.4, "Hear the bass climb an octave.", (640, 676), 2, size=34, color=GREY, fad=(150, 150))
    # proof
    ev(18.4, 23.2, "DOES THE SOUND CARRY THE DATA?", (640, 86), 8, size=34, color=AMBER, spacing=6, fad=(150, 150))
    counter(18.7, 19.9, 0, 0.992, lambda v: f"{v:.3f}", (360, 190), 8, 150, BLUE, 23.2)
    counter(18.9, 20.1, 0, 0.997, lambda v: f"{v:.3f}", (920, 190), 8, 150, AMBER, 23.2)
    ev(19.4, 23.2, "methane vs NOAA ground stations", (360, 372), 8, size=30, color=WHITE, fad=(150, 150))
    ev(19.4, 23.2, "2003 to 2025", (360, 414), 8, size=26, color=GREY, fad=(150, 150))
    ev(19.6, 23.2, "sea level vs NOAA satellite altimetry", (920, 372), 8, size=30, color=WHITE, fad=(150, 150))
    ev(19.6, 23.2, "1993 to 2018", (920, 414), 8, size=26, color=GREY, fad=(150, 150))
    ev(20.6, 23.2, "r = how closely the yearly trends match (1.000 is perfect)", (640, 520), 8, size=28, color=GREY, fad=(150, 150))
    ev(21.2, 23.2, "Pitch, loudness, busyness and tempo follow the data on all 11 tracks.", (640, 600), 8, size=34, color=WHITE, fad=(150, 150))
    # access
    ev(23.2, 26.4, "BUILT FOR LISTENERS FIRST", (640, 92), 8, size=34, color=AMBER, spacing=6, fad=(150, 150))
    ev(23.3, 26.4, "338 million", (640, 170), 8, style="Big", size=150, pop=True, fad=(100, 150))
    ev(23.5, 26.4, "people are blind or have moderate to severe vision loss", (640, 352), 8, size=44, color=WHITE, fad=(150, 150))
    ev(24.0, 26.4, "Keyboard only  ·  Captions  ·  Speech  ·  English, Hindi, Spanish", (640, 470), 8, size=34, color=GREY, fad=(150, 150))
    # end card
    ev(26.4, 29.0, "TERRA VOX", (640, 150), 8, style="Big", size=124, pop=True, fad=(100, 250))
    ev(26.6, 29.0, "Hear how the planet changed", (640, 310), 8, size=46, color=WHITE, fad=(150, 250))
    ev(26.8, 29.0, "demondarkness010-web.github.io/terra-vox", (640, 400), 8, size=40, color=AMBER, fad=(150, 250))
    ev(26.8, 29.0, f"Data: NASA GIBS (AIRS methane, JPL MEaSUREs sea level). Checked against NOAA GML and NOAA LSA.{BS}N"
                   f"Narration: AI voice (ElevenLabs). Built with Claude Code. NASA and NOAA do not endorse this project.",
       (640, 620), 8, size=22, color=GREY, fad=(150, 250))
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
GLOBE_X0, GLOBE_W = 241, 560          # centre strip of the 1043 x 495 canvas that holds the globe
SC = 1.2
GW, GH = int(GLOBE_W * SC), int(495 * SC)
GX, GY = (W - GW) // 2, 18

def globe(run, t, mode):
    img = run.at(t).crop((GLOBE_X0, 0, GLOBE_X0 + GLOBE_W, 495)).resize((GW, GH), Image.LANCZOS)
    a = np.asarray(img, dtype=np.float32)
    if mode in ("left", "right"):
        mid = GW // 2
        ramp = np.ones(GW, dtype=np.float32)
        dim = 0.22
        if mode == "left":      # the right ear is silent: dim its half, with a soft edge at the seam
            ramp[mid:] = dim
            ramp[mid - 6:mid + 6] = np.linspace(1, dim, 12)
        else:
            ramp[:mid] = dim
            ramp[mid - 6:mid + 6] = np.linspace(dim, 1, 12)
        a = a * ramp[None, :, None]
    return a.astype(np.uint8)

def backdrop(run, t):
    # a close crop of the globe's colours, blurred and darkened, fills the whole frame behind the text
    img = run.at(t).crop((331, 140, 711, 354)).resize((640, 360), Image.LANCZOS)
    small = img.resize((48, 27), Image.BILINEAR).resize((W, H), Image.BICUBIC)
    a = np.asarray(small, dtype=np.float32) * 0.30
    return a.astype(np.uint8)

def frame(T):
    for name, a, b, run, start, mode in SCENES:
        if a <= T < b + 1e-9:
            break
    t = start + (T - a)
    canvas = np.zeros((H, W, 3), dtype=np.uint8)
    if mode == "backdrop":
        canvas[:] = backdrop(run, t)
    else:
        canvas[GY:GY + GH, GX:GX + GW] = globe(run, t, mode)
    return canvas

def main():
    os.makedirs(os.path.join(HERE, "video"), exist_ok=True)
    ass = os.path.join(HERE, "video", "v3.ass")
    wav = os.path.join(HERE, "video", "v3_sound.wav")
    build_ass(ass)
    build_audio(wav)
    fonts = os.path.join(HERE, "fonts")
    cmd = ["ffmpeg", "-hide_banner", "-loglevel", "error", "-y", "-f", "rawvideo", "-pix_fmt", "rgb24", "-s", f"{W}x{H}", "-r", str(FPS), "-i", "-",
           "-i", wav, "-vf", f"ass=video/v3.ass:fontsdir=fonts,format=yuv420p", "-c:v", "libx264", "-preset", "veryfast", "-crf", "19", "-profile:v", "high",
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
