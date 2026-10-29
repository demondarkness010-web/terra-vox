"""Turn every downloaded NASA frame into the visual features Terra Vox plays.

    python scripts/extract_features.py

Reads data/raw_frames/<theme>/*.png (from fetch_frames.py) and writes
    data/features/<theme>/<YYYY-MM-DD>.json   raw + normalized features per frame
    data/display/<theme>/<YYYY-MM-DD>.jpg     the frame as a person sees it
    data/themes.json                          theme metadata + normalization ranges

Feature definitions (all measured over the frame's valid data pixels):

  hue            Colour warmth of the frame in degrees, 0-360. Each pixel's
                 HSV hue is placed on a cool -> warm axis (blue 0, cyan 60,
                 green 120, yellow 180, red 240+, magenta-red 360) and averaged,
                 weighted by saturation x value so grey pixels carry no hue.
                 A plain circular-mean hue would put red at 0 and average a
                 blue-to-red palette out to magenta; the warmth axis keeps the
                 build plan's "cool = low notes, warm = high notes" true.
  brightness     Mean Rec.709 relative luminance, 0-1.
  colorVariance  Mean per-channel RGB standard deviation / 127.5, 0-1.
  pixelDensity   Share of valid pixels that are "active" (theme rule in
                 theme_defs.py: a detected fire, sea >= +10 cm, NO2 >= 5e15,
                 CH4 >= 1,900 ppb), 0-1.
  frameDelta     Mean absolute RGB change from the previous frame / 255, 0-1.
                 The first frame has no predecessor, so it uses the change to
                 the second frame (otherwise the oldest frame would always be
                 silent-tempo by construction, which would bias Duet mode).
  latBand        'north' | 'equatorial' | 'south' from the mean latitude of the
                 active pixels (tropics = within 23.44 degrees of the equator).

Normalization: each of hue, brightness, colorVariance, pixelDensity and
frameDelta is min-max scaled against that theme's own history, so every
theme spans the same 0-1 range (hue: 0-360) before the sonification
formulas run. Without this, wildfire frames (black map, small bright
markers) and methane frames (wall-to-wall colour) would sit in completely
different parts of every formula and switching themes would jump in
loudness and density.
"""

import json
import re
import sys
from datetime import datetime, timezone
from pathlib import Path

import cv2
import numpy as np
from PIL import Image

sys.path.insert(0, str(Path(__file__).resolve().parent))
from theme_defs import THEMES, frame_label  # noqa: E402

ROOT = Path(__file__).resolve().parent.parent
RAW = ROOT / "data" / "raw_frames"
FEATURES = ROOT / "data" / "features"
DISPLAY = ROOT / "data" / "display"

TROPIC = 23.44
NORMALIZED = ["hue", "brightness", "colorVariance", "pixelDensity", "frameDelta"]


# ---------------------------------------------------------------- colormaps

def parse_colormap(path):
    """GIBS colormap XML -> (rgb array Nx3, value array N) for the data entries."""
    xml = path.read_text(encoding="utf-8")
    rgbs, values = [], []
    for m in re.finditer(r'<ColorMapEntry rgb="(\d+),(\d+),(\d+)" transparent="false"[^>]*value="\[([^,]+),([^)\]]+)[)\]]"', xml):
        r, g, b, lo, hi = m.groups()
        lo = None if "INF" in lo else float(lo)
        hi = None if "INF" in hi else float(hi)
        mid = hi if lo is None else lo if hi is None else (lo + hi) / 2
        rgbs.append((int(r), int(g), int(b)))
        values.append(mid)
    return np.array(rgbs, dtype=np.int32), np.array(values, dtype=np.float64)


def pixels_to_values(rgb, mask, cmap):
    """Look every masked pixel's colour up in the palette (nearest entry)."""
    pal_rgb, pal_val = cmap
    px = rgb[mask].astype(np.int32)
    uniq, inverse = np.unique(px, axis=0, return_inverse=True)
    d = ((uniq[:, None, :] - pal_rgb[None, :, :]) ** 2).sum(-1)
    nearest = d.argmin(1)
    exact = float((d[np.arange(len(uniq)), nearest] == 0)[inverse.ravel()].mean()) if len(px) else 1.0
    return pal_val[nearest][inverse.ravel()], exact


# ---------------------------------------------------------------- features

CRIMSON = 315.0          # hues from here up to 360 continue past red (dark reds)
WARM_SPAN = 240.0 + (360.0 - CRIMSON)


def warmth(rgb):
    """Per-pixel cool->warm position (0..1), its weight (saturation) and raw hue.

    blue 240 -> 0, cyan -> 0.21, green -> 0.42, yellow -> 0.63, red 0/360 -> 0.84,
    crimson 315 -> 1. Violets (240-315) sit at the cool end: in NASA palettes
    violet marks the lowest values (e.g. the bottom of the sea-level scale),
    while dark crimson marks the highest (top of the NO2 and CH4 scales).
    """
    hsv = cv2.cvtColor(rgb, cv2.COLOR_RGB2HSV_FULL).astype(np.float64)
    h = hsv[..., 0] * (360.0 / 256.0)
    s = hsv[..., 1] / 255.0
    t = np.where(h <= 240, 240.0 - h,
        np.where(h < CRIMSON, 0.0, 240.0 + (360.0 - h)))
    return t / WARM_SPAN, s, h


def frame_features(rgb, valid, active):
    lat = np.linspace(90, -90, rgb.shape[0])[:, None] * np.ones((1, rgb.shape[1]))
    px = rgb[valid].astype(np.float64)

    w, weight, h = warmth(rgb)
    wv, ww = w[valid], weight[valid]
    hue = float((wv * ww).sum() / ww.sum() * 360) if ww.sum() > 0 else 0.0

    # Standard circular-mean HSV hue, kept for transparency only.
    rad = np.deg2rad(h[valid])
    hsv_hue = float(np.rad2deg(np.arctan2((np.sin(rad) * ww).sum(), (np.cos(rad) * ww).sum())) % 360)

    lum = (0.2126 * px[:, 0] + 0.7152 * px[:, 1] + 0.0722 * px[:, 2]) / 255.0
    variance = float(px.std(axis=0).mean() / 127.5)
    density = float(active[valid].mean()) if valid.any() else 0.0

    if active.any():
        centroid = float(lat[active].mean())
    else:
        centroid = float((lat[valid] * w[valid]).sum() / max(w[valid].sum(), 1e-9))
    band = "north" if centroid > TROPIC else "south" if centroid < -TROPIC else "equatorial"

    return {
        "hue": hue,
        "brightness": float(lum.mean()),
        "colorVariance": variance,
        "pixelDensity": density,
        "hsvHueMean": hsv_hue,
        "activeCentroidLat": centroid,
    }, band


def frame_delta(a_rgb, a_valid, b_rgb, b_valid, domain):
    both = np.ones(a_valid.shape, bool) if domain == "frame" else (a_valid & b_valid)
    if not both.any():
        return 0.0
    diff = np.abs(a_rgb[both].astype(np.float64) - b_rgb[both].astype(np.float64))
    return float(diff.mean() / 255.0)


# ---------------------------------------------------------------- display

def load_bases():
    bm = np.array(Image.open(RAW / "_base" / "black_marble.png").convert("RGB")).astype(np.float64)
    coast = np.array(Image.open(RAW / "_base" / "coastlines.png").convert("RGBA"))
    return (bm * 0.55).astype(np.uint8), coast


def compose(rgba, base):
    """Data layer over the darkened Black Marble base (no coastlines)."""
    a = rgba[..., 3:4].astype(np.float64) / 255.0
    out = rgba[..., :3].astype(np.float64) * a + base.astype(np.float64) * (1 - a)
    return out.astype(np.uint8)


def with_coastlines(rgb, coast):
    a = coast[..., 3:4].astype(np.float64) / 255.0 * 0.55
    line = np.full_like(rgb, 235, dtype=np.float64)
    return (line * a + rgb.astype(np.float64) * (1 - a)).astype(np.uint8)


# ---------------------------------------------------------------- driver

def normalize(series):
    lo, hi = float(min(series)), float(max(series))
    span = hi - lo
    return lo, hi, [0.5 if span == 0 else (x - lo) / span for x in series]


def process_theme(theme, base, coast):
    tid = theme["id"]
    manifest = json.loads((RAW / tid / "manifest.json").read_text())
    cmap = parse_colormap(RAW / tid / "colormap.xml") if theme["colormap"] else None
    rule = theme["active_rule"]
    phys_cfg = theme["physical"]

    (FEATURES / tid).mkdir(parents=True, exist_ok=True)
    (DISPLAY / tid).mkdir(parents=True, exist_ok=True)

    frames, composed, valids = [], [], []
    for entry in manifest["frames"]:
        rgba = np.array(Image.open(ROOT / entry["file"]).convert("RGBA"))
        rgb_data = rgba[..., :3]
        opaque = rgba[..., 3] > 0
        valid = np.ones_like(opaque) if theme["valid_domain"] == "frame" else opaque
        seen = composed_rgb = compose(rgba, base)

        physical = {"label": phys_cfg["label"], "units": phys_cfg["units"]}
        if rule["kind"] == "opaque":
            active = opaque
            n_clusters = cv2.connectedComponents(opaque.astype(np.uint8), connectivity=8)[0] - 1
            physical["value"] = round(float(opaque.mean()) * 100, 2)
            physical["clusters"] = int(n_clusters)
        else:
            values, exact = pixels_to_values(rgb_data, opaque, cmap)
            vmap = np.full(opaque.shape, np.nan)
            vmap[opaque] = values
            active = np.zeros_like(opaque)
            active[opaque] = values >= rule["value"]
            physical["value"] = round(float(np.nanmean(values)) * phys_cfg["scale"], phys_cfg["digits"])
            physical["p90"] = round(float(np.nanpercentile(values, 90)) * phys_cfg["scale"], phys_cfg["digits"])
            physical["paletteExactMatch"] = round(exact, 4)
        physical["activeThreshold"] = rule.get("value")

        feats, band = frame_features(seen, valid, active)
        Image.fromarray(with_coastlines(composed_rgb, coast)).save(
            DISPLAY / tid / f"{entry['date']}.jpg", quality=82, optimize=True)

        frames.append({"entry": entry, "raw": feats, "latBand": band, "physical": physical})
        composed.append(composed_rgb)
        valids.append(valid)

    # Frame-to-frame change (first frame borrows the change to the second).
    for i, f in enumerate(frames):
        j = i - 1 if i > 0 else 1
        f["raw"]["frameDelta"] = frame_delta(composed[i], valids[i], composed[j], valids[j], theme["valid_domain"])

    # Per-theme normalization against this theme's own history.
    ranges = {}
    for key in NORMALIZED:
        lo, hi, scaled = normalize([f["raw"][key] for f in frames])
        ranges[key] = {"min": lo, "max": hi}
        for f, s in zip(frames, scaled):
            f.setdefault("normalized", {})[key] = s
    for f in frames:
        # Hue is degrees: scale to [0, 360) so the warmest frame lands on the
        # top scale degree instead of wrapping back to the first.
        f["normalized"]["hue"] = min(f["normalized"]["hue"], 0.9999) * 360

    first_year = int(frames[0]["entry"]["date"][:4])
    for idx, f in enumerate(frames):
        e = f["entry"]
        out = {
            "theme": tid,
            "index": idx,
            "date": e["date"],
            "year": int(e["date"][:4]),
            "label": e["label"],
            "image": f"data/display/{tid}/{e['date']}.jpg",
            "hue": round(f["normalized"]["hue"], 3),
            "brightness": round(f["normalized"]["brightness"], 4),
            "colorVariance": round(f["normalized"]["colorVariance"], 4),
            "pixelDensity": round(f["normalized"]["pixelDensity"], 4),
            "frameDelta": round(f["normalized"]["frameDelta"], 4),
            "latBand": f["latBand"],
            "raw": {k: round(v, 5) for k, v in f["raw"].items()},
            "physical": f["physical"],
            "source": {"layer": theme["layer"], "days": e["days"], "urls": e["source_urls"]},
        }
        (FEATURES / tid / f"{e['date']}.json").write_text(json.dumps(out, indent=2))

    return {
        "id": tid,
        "name": theme["name"],
        "signature": theme["signature"],
        "dataset": theme["dataset"],
        "instrument": theme["instrument"],
        "layer": theme["layer"],
        "unitsNote": theme["units_note"],
        "physical": {"label": phys_cfg["label"], "units": phys_cfg["units"]},
        "activeRule": rule,
        "composite": theme["composite"],
        "compositeDays": theme["composite_days"],
        "thumbnail": f"assets/thumbnails/{tid}.jpg",
        "eic": theme["eic"],
        "dateRange": {"start": frames[0]["entry"]["date"], "end": frames[-1]["entry"]["date"]},
        "yearRange": [first_year, int(frames[-1]["entry"]["date"][:4])],
        "frameCount": len(frames),
        "frames": [f["entry"]["date"] for f in frames],
        "normalization": ranges,
    }


def main():
    base, coast = load_bases()
    out = {
        "generatedAt": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "source": "NASA GIBS (Worldview) imagery; NASA SVS Earth Information Center cover art",
        "scale": "C minor pentatonic",
        "themes": [],
    }
    for theme in THEMES:
        meta = process_theme(theme, base, coast)
        out["themes"].append(meta)
        print(f"{meta['id']:17s} {meta['frameCount']:2d} frames  "
              + "  ".join(f"{k}[{v['min']:.3f}..{v['max']:.3f}]" for k, v in meta["normalization"].items()))
    (ROOT / "data" / "themes.json").write_text(json.dumps(out, indent=2))


if __name__ == "__main__":
    main()
