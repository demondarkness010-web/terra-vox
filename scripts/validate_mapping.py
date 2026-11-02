"""Prove the mapping: does the sound carry the measurement?

    python scripts/validate_mapping.py              # print the table; exit 1 on a failure
    python scripts/validate_mapping.py --markdown   # the same table as Markdown

Runs every frame of every track through the app's own mapping
(web/src/audio/mapping.js, imported in Node, so there is no second copy of
the formulas to drift from the one you hear) and prints Pearson's r between
the measured value and each musical parameter, per track:

  pitch     scale degree     carries the value
  loudness  velocity         carries the value
  density   notes per bar    carries the share past the "active" threshold,
                             which on these records moves with the value
  tempo     BPM              carries the distance from the oldest frame, so
                             it is checked against |value - oldest value|
                             (its r with the value itself is printed too)

Fails if any of those four is below 0.8 on any track: side A, the
year-by-year record Duet plays (each theme, and each Air Quality region),
and side B, the four NASA Earth Information Center visualizations.
"""

import argparse
import json
import subprocess
import sys
from pathlib import Path

import numpy as np

ROOT = Path(__file__).resolve().parent.parent
MAPPING = ROOT / "web" / "src" / "audio" / "mapping.js"
GATE = 0.8

NODE = """
import { readFileSync } from 'node:fs';
import { mapFeatures } from '%s';
const frames = JSON.parse(readFileSync(0, 'utf8'));
process.stdout.write(JSON.stringify(frames.map(mapFeatures)));
"""


def mapped(frames):
    """The app's own mapFeatures() for every frame, run in Node."""
    inputs = [{k: f[k] for k in ("theme", "value01", "activeShare01", "fromFirst01")} for f in frames]
    out = subprocess.run(["node", "--input-type=module", "-e", NODE % MAPPING.as_uri()],
                         input=json.dumps(inputs), capture_output=True, text=True, check=True)
    return json.loads(out.stdout)


def side_a():
    themes = json.loads((ROOT / "data" / "themes.json").read_text(encoding="utf-8"))["themes"]
    for t in themes:
        frames = [json.loads((ROOT / "data" / "features" / t["id"] / f"{d}.json").read_text(encoding="utf-8"))
                  for d in t["frames"]]
        regions = (t.get("sound") or {}).get("regions")
        if not regions:
            yield t["name"], [f["physical"]["value"] for f in frames], frames
            continue
        for r in regions:
            fr = [{**f, **f["regions"][r["id"]]} for f in frames]
            yield f"{t['name']}: {r['name']}", [f["value"] for f in fr], fr


def side_b():
    path = ROOT / "data" / "eic.json"
    if not path.exists():
        return
    for t in json.loads(path.read_text(encoding="utf-8"))["tracks"]:
        yield f"{t['title']} (SVS {t['svs']})", [f["physical"]["value"] for f in t["frames"]], t["frames"]


def r(x, y):
    x, y = np.asarray(x, float), np.asarray(y, float)
    if x.std() == 0 or y.std() == 0:
        return float("nan")
    return float(np.corrcoef(x, y)[0, 1])


def score(name, values, frames):
    p = mapped(frames)
    moved = [abs(v - values[0]) for v in values]
    row = {
        "track": name,
        "frames": len(frames),
        "pitch": r(values, [q["scaleDegree"] for q in p]),
        "loudness": r(values, [q["velocity"] for q in p]),
        "density": r(values, [q["notesPerBar"] for q in p]),
        "tempo": r(moved, [q["tempoBPM"] for q in p]),
        "tempo_vs_value": r(values, [q["tempoBPM"] for q in p]),
        "notes": sorted({q["note"] for q in p}, key=lambda n: p[[q["note"] for q in p].index(n)]["scaleDegree"]),
    }
    row["ok"] = all(row[k] >= GATE for k in ("pitch", "loudness", "density", "tempo"))  # NaN fails
    return row


def fmt(x):
    return "  n/a" if np.isnan(x) else f"{x:5.2f}"


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--markdown", action="store_true")
    args = ap.parse_args()

    a = [score(*t) for t in side_a()]
    b = [score(*t) for t in side_b()]

    if args.markdown:
        print("| Track | Frames | Pitch | Loudness | Density | Tempo (vs distance) | Tempo vs value | Pass |")
        print("|---|---:|---:|---:|---:|---:|---:|:---:|")
        for side, rows in (("A", a), ("B", b)):
            for row in rows:
                print(f"| {row['track']}{' (side B)' if side == 'B' else ''} | {row['frames']} | "
                      + " | ".join(fmt(row[k]).strip() for k in ("pitch", "loudness", "density", "tempo", "tempo_vs_value"))
                      + f" | {'yes' if row['ok'] else 'no'} |")
    else:
        head = f"{'track':48s} {'n':>3s} {'pitch':>6s} {'loud':>6s} {'dens':>6s} {'tempo':>6s} {'t~val':>6s}  notes used"
        for side, rows in (("Side A, the year-by-year record", a), ("Side B, NASA EIC visualizations", b)):
            print(f"\n{side}, Pearson r with the measured value (tempo: with the distance from the oldest)\n{head}")
            for row in rows:
                print(f"{row['track'][:48]:48s} {row['frames']:3d} "
                      + " ".join(f"{fmt(row[k]):>6s}" for k in ("pitch", "loudness", "density", "tempo", "tempo_vs_value"))
                      + f"  {'ok  ' if row['ok'] else 'FAIL'} {' '.join(row['notes'])}")

    failed = [row["track"] for row in a + b if not row["ok"]]
    if failed:
        print(f"\nFAIL: below {GATE}: {', '.join(failed)}", file=sys.stderr)
        sys.exit(1)
    print(f"\nPASS: all {len(a) + len(b)} tracks carry their measurement at r >= {GATE} "
          "in pitch, loudness, density and tempo.", file=sys.stderr)


if __name__ == "__main__":
    main()
