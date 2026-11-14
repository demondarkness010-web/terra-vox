"""Builds the demo video from video_plan.py.

With narration (vo/durations.json) shot lengths follow the voice. Without it, lengths are
estimated from word counts and the video is captions-only. No zoom, no pan: cuts, soft
dissolves and sharp punch-in crops. The Duet audio plays only in three short moments and
is ducked under speech.
"""
import json, os, re, shutil, subprocess, sys
from pathlib import Path

sys.path.insert(0, os.path.dirname(__file__))
import video_plan as P

# ---- the 30-second cut (NASA Space Apps allows at most 30 s for the demo)
P.LINES["B1f"], P.CAPTIONS["B1f"] = P.LINES["B1"], P.CAPTIONS["B1"]
P.LINES["D2f"], P.CAPTIONS["D2f"] = P.LINES["D2"], P.CAPTIONS["D2"]
_B = {b[0]: b for b in P.BEATS}
P.BEATS = [
    _B["hook_l"], _B["hook_r"],
    ("hook_b", _B["hook_b"][1], None, "A3", 4.4, 0.45),
    ("what",   _B["what"][1],   None, "B1f", 5.0, 0.30),
    ("proof3", _B["proof3"][1], None, "D2f", 5.0, 0.30),
    ("end", None, None, None, 3.2, 0.0),
]
P.DEMOS = [("methane_intro.wav", 0.0, 9.6, "hook_l", 0.0), ("methane_both.wav", 0.0, 3.2, "end", 0.0)]
NL = chr(92) + "N"
P.END_CARD = [
    ("Big", "TERRA VOX"),
    ("Mid", "Hear how the planet changed" + NL + "NASA Space Apps Challenge 2026"),
    ("Small", "demondarkness010-web.github.io/terra-vox" + NL +
              "Data: NASA GIBS and NASA SVS Earth Information Center. Checked against NOAA." + NL +
              "Narration: AI voice (ElevenLabs). Not endorsed by NASA or NOAA."),
]

os.chdir(P.S)
FPS, XF = 25, 0.2
VO = Path("vo")
durs = json.loads((VO / "durations30.json").read_text()) if (VO / "durations30.json").exists() else None
HAVE_VO = durs is not None
OUT = "video/terra-vox-demo-30s.mp4"
FIXED = {"hook_l": 3.35, "hook_r": 2.05}   # these two stay locked to the left-only / right-only audio


def vo_len(lid):
    return durs[lid] if HAVE_VO else len(P.LINES[lid].split()) / 2.6 + 0.3


# ---- timeline
plan, t = [], 0.0
for bid, img, crop, line, mind, off in P.BEATS:
    if bid in FIXED:
        d = FIXED[bid]
    else:
        d = mind
        if line:
            d = max(mind, off + vo_len(line) + 0.35)
    plan.append(dict(id=bid, img=img, crop=crop, line=line, off=off, start=t, dur=d))
    t += d
TOTAL = t
byid = {b["id"]: b for b in plan}
for lid in ("A1", "A2"):
    if HAVE_VO and vo_len(lid) > {"A1": 3.0, "A2": 2.1}[lid]:
        print(f"WARNING: {lid} is {vo_len(lid):.2f}s, longer than its slot; shorten the line")
print(f"timeline: {TOTAL:.1f}s, {'with narration' if HAVE_VO else 'captions only (estimated)'}")

# ---- captions
def ass_time(x):
    h, m = int(x // 3600), int(x % 3600 // 60)
    return f"{h}:{m:02d}:{x % 60:05.2f}"


def chunks(text, limit=84):
    parts = re.split(r"(?<=[.?!])\s+", text.strip())
    out = []
    for p in parts:
        if len(p) <= limit:
            out.append(p)
            continue
        cuts = [m.start() for m in re.finditer(r", | and ", p)]
        mid = min(cuts, key=lambda c: abs(c - len(p) / 2)) if cuts else len(p) // 2
        cut = p.find(" ", mid + 1)
        out += [p[:cut + 1].strip(), p[cut + 1:].strip()] if cut > 0 else [p]
    return [c for c in out if c]


events = []
for b in plan:
    if not b["line"]:
        continue
    cs = chunks(P.CAPTIONS[b["line"]])
    start, total = b["start"] + b["off"], vo_len(b["line"]) + 0.15
    weights = [max(8, len(c)) for c in cs]
    pos = start
    for c, w in zip(cs, weights):
        seg = total * w / sum(weights)
        events.append(f"Dialogue: 0,{ass_time(pos)},{ass_time(pos + seg)},Cap,,0,0,0,,{c}")
        pos += seg
end = byid["end"]
for style, text in P.END_CARD:
    events.append(f"Dialogue: 0,{ass_time(end['start'] + 0.2)},{ass_time(TOTAL - 0.2)},{style},,0,0,0,,{text}")

hdr = Path("captions.ass").read_text(encoding="utf-8").split("[Events]")[0]
Path("captions30.ass").write_text(hdr + "[Events]\nFormat: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text\n"
                                 + "\n".join(events) + "\n", encoding="utf-8")

# ---- fonts for the burned-in captions
Path("fonts").mkdir(exist_ok=True)
for f in ("arial.ttf", "arialbd.ttf"):
    if not Path("fonts", f).exists():
        shutil.copy(rf"C:\Windows\Fonts\{f}", "fonts")

# ---- video graph
# Each shot is first reduced to a plain 1280x720 PNG, one small ffmpeg job at a time. The
# original screenshots are up to 2560x1440; decoding fourteen of them in one graph can exhaust
# memory on a small machine.
Path("beats").mkdir(exist_ok=True)


def prepare(b):
    c = b["crop"]
    crop = f"crop={c[2]}:{c[3]}:{c[0]}:{c[1]}," if c else ""
    if c and len(c) > 4 and c[4] == "letterbox":     # a wide band, centred on the paper colour
        h = round(1280 * c[3] / c[2] / 2) * 2
        fit = f"scale=1280:{h}:flags=lanczos,pad=1280:720:0:{(720 - h) // 2}:color=0xefebe3"
    else:
        fit = "scale=1280:720:flags=lanczos"
    out = f"beats/{b['id']}.png"
    r = subprocess.run(["ffmpeg", "-hide_banner", "-loglevel", "error", "-y", "-i", b["img"],
                        "-vf", crop + fit, "-frames:v", "1", out])
    if r.returncode:
        sys.exit(r.returncode)
    return out


inputs, vf = [], []
n = len(plan)
for i, b in enumerate(plan):
    L = b["dur"] + (XF if i < n - 1 else 0)
    if b["img"]:
        inputs += ["-loop", "1", "-framerate", str(FPS), "-t", f"{L:.3f}", "-i", prepare(b)]
        vf.append(f"[{i}:v]setsar=1,fps={FPS},format=yuv420p[v{i}]")
    else:
        inputs += ["-f", "lavfi", "-t", f"{L:.3f}", "-i", f"color=c=black:s=1280x720:r={FPS}"]
        vf.append(f"[{i}:v]setsar=1,format=yuv420p[v{i}]")
acc = "v0"
for i in range(1, n):
    vf.append(f"[{acc}][v{i}]xfade=transition=fade:duration={XF}:offset={plan[i]['start']:.3f}[x{i}]")
    acc = f"x{i}"
# The ass filter outputs a 4:4:4 format; most players (Windows, phones, browsers) only play 4:2:0.
vf.append(f"[{acc}]ass=captions30.ass:fontsdir=fonts,format=yuv420p[vout]")

# ---- audio graph
af, idx, a_inputs = [], 0, []
dm = []
for k, (wav, a, length, beat, off) in enumerate(P.DEMOS):
    start = byid[beat]["start"] + off
    length = min(length, TOTAL - start)
    a_inputs += ["-i", f"audio/{wav}"]
    ms = int(start * 1000)
    af.append(f"[{idx}:a]atrim=start={a}:end={a + length:.3f},asetpts=PTS-STARTPTS,afade=t=in:d=0.06,"
              f"afade=t=out:st={max(0, length - 0.6):.2f}:d=0.6,volume=0.9,adelay={ms}|{ms}[d{k}]")
    dm.append(f"[d{k}]")
    idx += 1
af.append("".join(dm) + f"amix=inputs={len(dm)}:normalize=0[demo]")

if HAVE_VO:
    vm = []
    for b in plan:
        if not b["line"]:
            continue
        a_inputs += ["-i", str(VO / f"{b['line']}.mp3")]
        ms = int((b["start"] + b["off"]) * 1000)
        af.append(f"[{idx}:a]aresample=44100,aformat=channel_layouts=stereo,adelay={ms}|{ms}[o{idx}]")
        vm.append(f"[o{idx}]")
        idx += 1
    af.append("".join(vm) + f"amix=inputs={len(vm)}:normalize=0[vom]")
    # Pad the voice with silence to full length: the ducking filter stops when its key stream ends,
    # which would cut the closing chord dead the moment the last word finished.
    af.append(f"[vom]apad=whole_dur={TOTAL:.2f},asplit=2[vk][vm]")
    af.append("[demo][vk]sidechaincompress=threshold=0.012:ratio=14:attack=15:release=500[duck]")
    af.append("[duck][vm]amix=inputs=2:normalize=0,loudnorm=I=-16:TP=-1.5:LRA=9,"
              f"apad=whole_dur={TOTAL:.2f},atrim=0:{TOTAL:.2f}[aout]")
else:
    af.append(f"[demo]loudnorm=I=-18:TP=-1.5:LRA=9,apad=whole_dur={TOTAL:.2f},atrim=0:{TOTAL:.2f}[aout]")

def run(args, label):
    print(f"running {label} ...", flush=True)
    r = subprocess.run(["ffmpeg", "-hide_banner", "-loglevel", "error", "-stats", "-y", *args])
    if r.returncode:
        print("exit", r.returncode)
        sys.exit(r.returncode)


if not (os.environ.get("REUSE_PICTURE") and os.path.exists("video/_picture30.mp4")):
    run([*inputs, "-filter_complex", ";".join(vf), "-map", "[vout]", "-an",
         "-c:v", "libx264", "-preset", "veryfast", "-crf", "23", "-pix_fmt", "yuv420p", "-profile:v", "high", "-r", str(FPS),
         "-t", f"{TOTAL:.2f}", "video/_picture30.mp4"], "picture")
run([*a_inputs, "-filter_complex", ";".join(af), "-map", "[aout]",
     "-c:a", "aac", "-b:a", "160k", "-ar", "44100", "-t", f"{TOTAL:.2f}", "video/_sound30.m4a"], "sound")
run(["-i", "video/_picture30.mp4", "-i", "video/_sound30.m4a", "-map", "0:v", "-map", "1:a",
     "-c", "copy", "-t", f"{TOTAL:.2f}", "-movflags", "+faststart", OUT], "join")
print("exit 0")
print(f"{OUT}: {os.path.getsize(OUT) / 1e6:.1f} MB, {TOTAL:.1f}s")
json.dump([{k: (round(v, 2) if isinstance(v, float) else v) for k, v in b.items() if k != 'img'} for b in plan],
          open("video/timeline30.json", "w"), indent=1)
