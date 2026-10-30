"""Sample where each frame's signal is, for the note sparks on the globe.

    python scripts/extract_points.py

Reads data/raw_frames/<theme>/*.png and writes data/points/<theme>.json:

    { "<YYYY-MM-DD>": { "kind": "active" | "peak", "points": [[lat, lon], ...] }, ... }

"active" points are a seeded random sample of the frame's active pixels, using
the same rule as pixelDensity in extract_features.py (a detected fire, sea
>= +10 cm, NO2 >= 5e15, CH4 >= 1,900 ppb). A frame with no active pixels
(e.g. methane in 2003, before any air reached 1,900 ppb) falls back to its
"peak" pixels, the top 1% of its values, so the sparks still show where the
signal is strongest and the file says which it is.
"""

import json
import sys
from pathlib import Path

import numpy as np
from PIL import Image

sys.path.insert(0, str(Path(__file__).resolve().parent))
from extract_features import RAW, ROOT, parse_colormap, pixels_to_values  # noqa: E402
from theme_defs import THEMES  # noqa: E402

POINTS = ROOT / "data" / "points"
SAMPLES = 240


def to_latlon(ys, xs, shape):
    h, w = shape
    lat = 90 - (ys + 0.5) * 180 / h
    lon = -180 + (xs + 0.5) * 360 / w
    return np.round(np.stack([lat, lon], 1), 1).tolist()


def sample(mask, rng):
    ys, xs = np.nonzero(mask)
    if len(ys) > SAMPLES:
        pick = rng.choice(len(ys), SAMPLES, replace=False)
        ys, xs = ys[pick], xs[pick]
    return to_latlon(ys, xs, mask.shape)


def process_theme(theme):
    tid = theme["id"]
    manifest = json.loads((RAW / tid / "manifest.json").read_text())
    cmap = parse_colormap(RAW / tid / "colormap.xml") if theme["colormap"] else None
    rule = theme["active_rule"]
    out = {}
    for entry in manifest["frames"]:
        rgba = np.array(Image.open(ROOT / entry["file"]).convert("RGBA"))
        opaque = rgba[..., 3] > 0
        rng = np.random.default_rng(int(entry["date"].replace("-", "")))
        if rule["kind"] == "opaque":
            out[entry["date"]] = {"kind": "active", "points": sample(opaque, rng)}
            continue
        values, _ = pixels_to_values(rgba[..., :3], opaque, cmap)
        vmap = np.full(opaque.shape, -np.inf)
        vmap[opaque] = values
        active = vmap >= rule["value"]
        if active.any():
            out[entry["date"]] = {"kind": "active", "points": sample(active, rng)}
        else:
            peak = vmap >= np.percentile(values, 99)
            out[entry["date"]] = {"kind": "peak", "points": sample(peak, rng)}
    POINTS.mkdir(parents=True, exist_ok=True)
    (POINTS / f"{tid}.json").write_text(json.dumps(out, separators=(",", ":")))
    kinds = [v["kind"] for v in out.values()]
    print(f"{tid:17s} {len(out):2d} frames  active {kinds.count('active'):2d}  peak {kinds.count('peak'):2d}")


if __name__ == "__main__":
    for t in THEMES:
        process_theme(t)
