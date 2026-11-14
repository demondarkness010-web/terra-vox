"""Can a listener tell the two ears apart? A check on the Duet's default pair.

For every side A track, takes the oldest and the newest frame, runs both through
the app's own mapping.js (the same Node call validate_mapping.py uses), and
counts how many separate cues differ between the left and the right ear:

  pitch      at least 2 scale steps apart (one step is easy to miss)
  density    notes per bar differ by at least 2
  tempo      at least 8 BPM apart
  timbre     a different waveform (sine / triangle / sawtooth)
  harmony    a different interval (calm fifth vs tense third)

A pair is CLEAR when at least 3 cues differ, or when pitch differs by 4 or more
steps; it is SUBTLE otherwise. SUBTLE is not a failure: the data may simply have
changed little (northern India's NO2 is a small rise). It tells you where the
Duet introduction (left alone, right alone, then both) matters most.

Run:  python scripts/audibility_check.py
"""

import json
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
MAPPING = ROOT / "web" / "src" / "audio" / "mapping.js"

NODE = """
import { readFileSync } from 'node:fs';
import { mapFeatures } from '%s';
const frames = JSON.parse(readFileSync(0, 'utf8'));
process.stdout.write(JSON.stringify(frames.map(mapFeatures)));
"""

STEP_PITCH, STEP_NOTES, STEP_BPM = 2, 2, 8


def mapped(frames):
    inputs = [{k: f[k] for k in ("theme", "value01", "activeShare01", "fromFirst01")} for f in frames]
    out = subprocess.run(["node", "--input-type=module", "-e", NODE % MAPPING.as_uri()],
                         input=json.dumps(inputs), capture_output=True, text=True, check=True)
    return json.loads(out.stdout)


def tracks():
    themes = json.loads((ROOT / "data" / "themes.json").read_text(encoding="utf-8"))["themes"]
    for t in themes:
        frames = [json.loads((ROOT / "data" / "features" / t["id"] / f"{d}.json").read_text(encoding="utf-8"))
                  for d in t["frames"]]
        regions = (t.get("sound") or {}).get("regions")
        if not regions:
            yield t["name"], frames
            continue
        for r in regions:
            yield f"{t['name']}: {r['name']}", [{**f, **f["regions"][r["id"]]} for f in frames]


def cues(a, b):
    found = []
    if abs(b["scaleDegree"] - a["scaleDegree"]) >= STEP_PITCH:
        found.append("pitch")
    if abs(b["notesPerBar"] - a["notesPerBar"]) >= STEP_NOTES:
        found.append("density")
    if abs(b["tempoBPM"] - a["tempoBPM"]) >= STEP_BPM:
        found.append("tempo")
    if a["timbre"] != b["timbre"]:
        found.append("timbre")
    if a["interval"] != b["interval"]:
        found.append("harmony")
    return found


def main():
    print(f"{'track':44s} {'left':>5s} {'right':>5s}  {'steps':>5s}  cues that differ")
    subtle = []
    for name, frames in tracks():
        a, b = mapped([frames[0], frames[-1]])
        found = cues(a, b)
        steps = abs(b["scaleDegree"] - a["scaleDegree"])
        clear = len(found) >= 3 or steps >= 4
        if not clear:
            subtle.append(name)
        print(f"{name[:44]:44s} {a['note']:>5s} {b['note']:>5s}  {steps:5d}  "
              f"{'CLEAR ' if clear else 'SUBTLE'} {', '.join(found) or 'none'}")
    print()
    if subtle:
        print(f"{len(subtle)} subtle pair(s): " + "; ".join(subtle))
        print("The Duet introduction (left alone, right alone, then both) is what makes these readable.")
    else:
        print("Every default pair differs on at least 3 cues, or by 4+ pitch steps.")


if __name__ == "__main__":
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8")
    main()
