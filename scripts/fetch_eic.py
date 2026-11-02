"""Side B: frames from NASA Earth Information Center visualizations.

    python scripts/fetch_eic.py            # download, sample, extract
    python scripts/fetch_eic.py --sheets   # also write date-stamp contact sheets
    python scripts/fetch_eic.py --sound-only  # only recompute what the sound follows

The Space Apps brief asks for a jukebox that pairs EIC visual frames with
sonification. Side A plays a calibrated year-by-year record built from the
same NASA layers (GIBS); side B plays the EIC visualizations themselves,
frame by frame, through the same mapping. One EIC visualization per
theme, each from its theme's EIC dashboard on NASA's Scientific Visualization
Studio (SVS):

  wildfires         SVS 5113  Active Fires As Observed by VIIRS, 2024-present
  sea_level         SVS 5235  Sea Level Through a Porthole (1993-2023)
  air_quality       SVS 5175  TEMPO NO2 over North America, Aug 28-31 2023
  greenhouse_gases  SVS 5116  Global Atmospheric Methane (GEOS, 2021)

Each track reads one real quantity out of the picture, and that quantity is
what the sound follows (on a fixed range per track, SOUND below):

  fires     share of land pixels where VIIRS saw fire (moving 5-day window)
  porthole  sea level above 1993 in cm, read off the visualization's own
            ruler from the height of the water line
  TEMPO     mean tropospheric NO2, by matching every pixel to the colour
            bar drawn in the frame (0-150 x10^14 molecules/cm2), its scale
            fixed by the bar's own tick marks. TEMPO scans in daylight only,
            so the movie's overnight frames carry no NO2 and are skipped.
  methane   share of the globe covered by dense methane haze

On side B that one quantity drives pitch, loudness and density together
(value01 = activeShare01), and tempo follows its distance from the first
frame, as on side A. The colour features (hue, brightness, variance, change)
are still measured and kept for reference, but no longer drive the sound.

Dates: the fire and TEMPO frames carry NASA's date stamp in the corner. They
were transcribed from contact sheets (--sheets) into scripts/eic_labels.json.
Methane runs linearly through 2021 (the frame's own timeline bar confirms
it). The porthole has no clock, so its frames are labelled by water level.

Writes data/eic.json and data/eic/<track>/<NN>.jpg. Movies are cached in
.cache/eic/ (gitignored).
"""

import argparse
import json
import subprocess
import sys
from datetime import date, datetime, timedelta, timezone
from pathlib import Path

import cv2
import numpy as np
import requests
from PIL import Image, ImageDraw

sys.path.insert(0, str(Path(__file__).resolve().parent))
from extract_features import frame_features, normalize, warmth, NORMALIZED, TROPIC  # noqa: E402
from theme_defs import unit01  # noqa: E402

ROOT = Path(__file__).resolve().parent.parent
CACHE = ROOT / ".cache" / "eic"
OUT_DIR = ROOT / "data" / "eic"
OUT = ROOT / "data" / "eic.json"
LABELS = Path(__file__).resolve().parent / "eic_labels.json"
TEMPO_MIN_OBSERVED = 2.0      # % of the frame holding NO2 data; below it, TEMPO saw nothing (night)
TEMPO_DARK = 64               # brightest channel below this is too close to black to read
SVS = "https://svs.gsfc.nasa.gov"
VIS = f"{SVS}/vis/a000000"

TRACKS = [
    {
        "id": "wildfires_eic", "theme": "wildfires", "svs": 5113, "kind": "fires",
        "title": "Active Fires As Observed by VIIRS, 2024–Present",
        "movie": f"{VIS}/a005100/a005113/fires_frp_VIIRS_2048p30.mp4",
        "samples": 40, "analysis": (2048, 1024), "display": (1024, 512),
        "credits": "NASA's Scientific Visualization Studio. Visualizer: Trent L. Schindler (USRA). Scientist: Doug C. Morton (NASA/GSFC).",
        "dataset": "VIIRS active fires (fire radiative power), moving 5-day window, over Blue Marble",
        "signature": "seasonal pulse",
        "physical": {"label": "fire pixels", "units": "% of land"},
        "activeRule": "land pixels where VIIRS saw fire in the 5-day window",
    },
    {
        "id": "sea_level_eic", "theme": "sea_level", "svs": 5235, "kind": "porthole",
        "title": "Sea Level Through a Porthole (2023)",
        "movie": f"{VIS}/a005200/a005235/seaLevelWaveTankComp_noWW_3-5-5-2024a_2160p30.mp4",
        "samples": 31, "analysis": (1080, 1080), "display": (720, 720),
        "credits": "NASA's Scientific Visualization Studio. Visualizer: AJ Christensen (SSAI).",
        "dataset": "Global mean sea level, TOPEX/Poseidon, Jason-1, OSTM/Jason-2 and Jason-3, 1993–2023",
        "signature": "slow, rising",
        "physical": {"label": "sea level above 1993", "units": "cm"},
        "activeRule": "porthole pixels below the water line",
    },
    {
        "id": "air_quality_eic", "theme": "air_quality", "svs": 5175, "kind": "tempo",
        "title": "TEMPO – Nitrogen Dioxide Air Pollution Over North America",
        "movie": f"{VIS}/a005100/a005175/tempo_no2_north-america_1080p60.mp4",
        "samples": 48, "analysis": (1920, 1080), "display": (1280, 720),
        "credits": "NASA's Scientific Visualization Studio. Data provided by the Smithsonian Astrophysical Observatory at the Center for Astrophysics | Harvard & Smithsonian. Visualizers: Kel Elkins, Trent L. Schindler (USRA), Cindy Starr (GST).",
        "dataset": "TEMPO tropospheric NO2 column, hourly daylight scans, August 28–31, 2023",
        "signature": "rush-hour rhythm",
        "physical": {"label": "mean NO₂ in view", "units": "x10^15 molecules/cm2"},
        "activeRule": "observed air at or above 5 ×10¹⁵ molec/cm² (same threshold as side A)",
    },
    {
        "id": "greenhouse_gases_eic", "theme": "greenhouse_gases", "svs": 5116, "kind": "methane",
        "title": "Global Atmospheric Methane (CH₄)",
        "frames_url": f"{VIS}/a005100/a005116/frames/1920x1920_1x1_30p/VolumetricCH4_Composite/TotalCH4_Comp_1920x19020p30_{{:05d}}.png",
        "total_frames": 3600, "samples": 24, "analysis": (960, 960), "display": (720, 720),
        "credits": "NASA's Scientific Visualization Studio. Visualizers: Helen-Nicole Kostis (USRA), AJ Christensen (SSAI). Scientists: Lesley Ott (NASA/GSFC), Brad Weir (Morgan State University).",
        "dataset": "NASA GEOS model atmospheric methane, volumetric, through 2021",
        "signature": "slow seasonal swell",
        "physical": {"label": "globe under dense methane haze", "units": "%"},
        "activeRule": "globe pixels inside the dense purple methane haze",
    },
]

# What the sound follows on side B: each track's one quantity on a FIXED
# range, stated in the README, never the min and max of the frames. TEMPO's
# number is a mean over the whole continent in view, mostly clean air, so its
# range is narrower than side A's regional one.
SOUND = {
    "wildfires_eic": {"range": (0.0, 5.0), "rangeLabel": "0 to 5% of land"},
    "sea_level_eic": {"range": (0.0, 15.0), "rangeLabel": "0 to 15 cm above 1993"},
    "air_quality_eic": {"range": (0.0, 1.5), "rangeLabel": "0 to 1.5 x10^15 molecules/cm2 (continent-wide mean; record 0.90)"},
    "greenhouse_gases_eic": {"range": (0.0, 100.0), "rangeLabel": "0 to 100% of the globe"},
}

session = requests.Session()
session.headers["User-Agent"] = "terra-vox/1.0 (NASA Space Apps)"


def download(url, path):
    if path.exists() and path.stat().st_size > 0:
        return path
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_suffix(path.suffix + ".part")
    with session.get(url, stream=True, timeout=120) as r:
        r.raise_for_status()
        with open(tmp, "wb") as f:
            for chunk in r.iter_content(1 << 20):
                f.write(chunk)
    tmp.replace(path)
    return path


def probe_frames(movie):
    out = subprocess.run(["ffprobe", "-v", "error", "-select_streams", "v:0", "-count_packets",
                          "-show_entries", "stream=nb_read_packets", "-of", "csv=p=0", str(movie)],
                         capture_output=True, text=True, check=True).stdout
    return int(out.strip().split(",")[0])


def extract(movie, indices, size, dest):
    """Decode the movie once and keep only the wanted frame numbers."""
    dest.mkdir(parents=True, exist_ok=True)
    for old in dest.glob("*.png"):
        old.unlink()
    expr = "+".join(f"eq(n\\,{i})" for i in indices)
    subprocess.run(["ffmpeg", "-v", "error", "-y", "-i", str(movie),
                    "-vf", f"select='{expr}',scale={size[0]}:{size[1]}:flags=area",
                    "-fps_mode", "passthrough", str(dest / "f_%03d.png")], check=True)
    files = sorted(dest.glob("f_*.png"))
    if len(files) != len(indices):
        raise RuntimeError(f"expected {len(indices)} frames from {movie.name}, got {len(files)}")
    return [np.array(Image.open(p).convert("RGB")) for p in files]


def hsv(rgb):
    h = cv2.cvtColor(rgb, cv2.COLOR_RGB2HSV_FULL).astype(np.float64)
    return h[..., 0] * (360 / 256), h[..., 1] / 255, h[..., 2] / 255


def lum(rgb):
    return (0.2126 * rgb[..., 0] + 0.7152 * rgb[..., 1] + 0.0722 * rgb[..., 2]) / 255


def band_for(lat):
    return "north" if lat > TROPIC else "south" if lat < -TROPIC else "equatorial"


# ------------------------------------------------------------ fires (Robinson map)

# Robinson projection: relative parallel length and distance from the equator
# every 5 degrees (Snyder 1993), used to tell land from the frame's black
# corners and to read latitude back from a pixel row.
ROB_LAT = np.arange(0, 95, 5)
ROB_PLEN = np.array([1, .9986, .9954, .99, .9822, .973, .96, .9427, .9216, .8962, .8679, .835, .7986, .7597, .7186, .6732, .6213, .5722, .5322])
ROB_PDFE = np.array([0, .062, .124, .186, .248, .31, .372, .434, .4958, .5571, .6176, .6769, .7346, .7903, .8435, .8936, .9394, .9761, 1])


def fires_geometry(shape):
    h, w = shape[:2]
    map_w = w * 0.985          # the map ellipse spans almost the full width
    half_h = 0.5072 * map_w / 2
    cy, cx = h / 2, w / 2
    ys = np.arange(h)
    rel = np.clip(np.abs(cy - ys) / half_h, 0, 1)
    lat = np.interp(rel, ROB_PDFE, ROB_LAT) * np.sign(cy - ys)
    half_w = 0.5 * map_w * np.interp(np.abs(lat), ROB_LAT, ROB_PLEN)
    inside = np.abs(np.arange(w)[None, :] - cx) <= half_w[:, None]
    inside &= (rel <= 1)[:, None]
    # NASA's date stamp and colour bar, bottom left
    inside[int(h * 0.82):, : int(w * 0.17)] = False
    return inside, lat


def fires_masks(rgb, geom):
    inside, lat = geom
    r, g, b = (rgb[..., i].astype(np.int32) for i in range(3))
    ocean = (b > r + 12) & (b > 45)
    land = inside & ~ocean
    fire = land & (lum(rgb) > 0.2)
    rows = np.repeat(lat[:, None], rgb.shape[1], 1)
    centroid = float(rows[fire].mean()) if fire.any() else 0.0
    return land, fire, {"value": round(float(fire.sum() / max(land.sum(), 1)) * 100, 3)}, band_for(centroid)


# ------------------------------------------------------------ porthole

def porthole_geometry(shape):
    h, w = shape[:2]
    yy, xx = np.mgrid[0:h, 0:w]
    disk = (xx - w / 2) ** 2 + (yy - h / 2) ** 2 <= (0.495 * min(h, w)) ** 2
    ruler = np.abs(xx - w / 2) < w * 0.012
    return disk & ~ruler


def water_line(rgb, valid):
    hue, sat, val = hsv(rgb)
    under = valid & (sat > 0.55) & (hue > 175) & (hue < 235)
    h, w = under.shape
    cols = [x for x in range(int(w * 0.1), int(w * 0.9), 4) if abs(x - w / 2) > w * 0.03]
    tops = []
    for x in cols:
        col = under[:, x]
        run = np.convolve(col.astype(int), np.ones(12, int), "valid") == 12
        idx = np.argmax(run) if run.any() else None
        if idx is not None:
            tops.append(idx)
    return float(np.median(tops)) if tops else float("nan"), under


def porthole_masks(rgb, valid, scale):
    top, under = water_line(rgb, valid)
    cm = (scale["zero"] - top) / scale["px_per_cm"]
    return valid, under, {"value": round(cm, 2), "waterLinePx": round(top, 1)}, "equatorial"


def porthole_scale(shape):
    # The ruler: 0 cm (the 1993 mark) at mid-height, 10 cm per 0.0951 of the
    # frame height (measured from the 10 cm and -10 cm ticks of SVS 5235).
    h = shape[0]
    return {"zero": h * 0.5, "px_per_cm": h * 0.009514}


# ------------------------------------------------------------ TEMPO

def tempo_palette(rgb):
    """Read the colour bar NASA drew in the frame: 0..150 x10^14 molec/cm2.

    The bar carries white tick marks at 25, 50 ... 150. Their positions give
    the value of every column, so each colour is read against NASA's own
    scale rather than an assumed one.
    """
    h, w = rgb.shape[:2]
    y0, y1, x1 = int(h * 0.80), int(h * 0.93), int(w * 0.40)
    _, sat, val = hsv(rgb[y0:y1, :x1])
    # the bar body: the band of rows with the most saturated colour
    counts = ((sat > 0.3) & (val > 0.3)).sum(1)
    peak = int(np.argmax(counts))
    top = bot = peak
    while top > 0 and counts[top - 1] > 0.5 * counts[peak]:
        top -= 1
    while bot < len(counts) - 1 and counts[bot + 1] > 0.5 * counts[peak]:
        bot += 1
    # ticks: thin anti-aliased white lines across the band, so look for
    # columns whiter than the columns 3-5 px either side of them
    whiteness = (val * (1 - sat))[top: bot + 1].mean(0)
    pad = np.pad(whiteness, 5, mode="edge")
    sides = np.stack([pad[i: i + len(whiteness)] for i in (0, 1, 2, 8, 9, 10)]).max(0)
    contrast = whiteness - sides
    cols = np.where(contrast > 0.08)[0]
    groups = np.split(cols, np.where(np.diff(cols) > 2)[0] + 1) if len(cols) else []
    ticks = np.array([g[np.argmax(contrast[g])] for g in groups if len(g)], float)
    gaps = np.diff(ticks)
    if len(ticks) != 6 or gaps.std() > 0.05 * gaps.mean():
        raise ValueError(f"TEMPO colour bar: expected 6 even ticks (25..150), found {ticks.tolist()}")
    per = gaps.mean() / 25.0                              # px per 10^14 molec/cm2
    x0 = ticks[0] - 25 * per
    x150 = ticks[-1]
    row = (top + bot) // 2
    xs = np.array([x for x in range(int(round(x0)), int(round(x150)))
                   if np.abs(ticks - x).min() > 1.5])     # leave the tick lines out
    colours = rgb[y0 + row, xs].astype(np.int32)
    values = np.clip((xs - x0) / per, 0, 150)
    # The top of the bar fades to black, the same as the space around the
    # globe, so it cannot be read: keep only the part brighter than DARK.
    readable = colours.max(1) >= TEMPO_DARK
    colours, values = colours[readable], values[readable]
    return colours, values, {"row": y0 + row, "x": [int(round(x0)), int(round(x150))],
                             "ticks": [round(float(t), 1) for t in ticks],
                             "readableMax": round(float(values.max()), 1)}


def tempo_masks(rgb, palette):
    colours, values, _ = palette
    h, w = rgb.shape[:2]
    keep = np.ones((h, w), bool)
    keep[int(h * 0.76):, : int(w * 0.40)] = False       # date, title and colour bar
    px = rgb[keep].astype(np.int32)
    packed = (px[:, 0] << 16) | (px[:, 1] << 8) | px[:, 2]
    codes, inv = np.unique(packed, return_inverse=True)
    uniq = np.stack([(codes >> 16) & 255, (codes >> 8) & 255, codes & 255], 1)
    # nearest colour-bar entry for each distinct colour, in chunks to bound memory
    bar = colours.astype(np.float32)
    nearest = np.empty(len(uniq), np.int64)
    dist = np.empty(len(uniq), np.float32)
    for s in range(0, len(uniq), 4096):
        d = ((uniq[s: s + 4096, None, :].astype(np.float32) - bar[None]) ** 2).sum(-1)
        nearest[s: s + 4096] = d.argmin(1)
        dist[s: s + 4096] = d.min(1)
    ok = (dist < 30 ** 2) & (uniq.max(1) >= TEMPO_DARK)  # near-black is space, not data
    _, sat, _ = hsv(uniq[None].astype(np.uint8))
    ok &= sat[0] > 0.12                                   # grey borders are not data
    pv = np.full(len(uniq), np.nan)
    pv[ok] = values[nearest[ok]]
    vals = np.full((h, w), np.nan)
    vals[keep] = pv[inv.ravel()]
    valid = np.isfinite(vals)
    active = valid & (vals >= 50.0)                       # 5 x10^15, side A's rule
    mean = float(np.nanmean(vals)) / 10 if valid.any() else 0.0
    return valid, active, {"value": round(mean, 3), "observedPct": round(float(valid.mean()) * 100, 2)}, "north"


# ------------------------------------------------------------ methane

def methane_masks(rgb):
    h, w = rgb.shape[:2]
    hue, sat, val = hsv(rgb)
    valid = val > 0.06
    valid[: int(h * 0.1), : int(w * 0.45)] = False        # title
    valid[int(h * 0.88):, :] = False                       # month timeline
    haze = valid & (hue > 250) & (hue < 305) & (sat > 0.45) & (val > 0.25)
    yy = np.mgrid[0:h, 0:w][0]
    radius = 0.36 * w
    lat = np.degrees(np.arcsin(np.clip((h / 2 - yy) / radius, -1, 1)))
    centroid = float(lat[haze].mean()) if haze.any() else 0.0
    globe = valid & (((np.mgrid[0:h, 0:w][1] - w / 2) ** 2 + (yy - h / 2) ** 2) <= radius ** 2)
    share = float((haze & globe).sum() / max(globe.sum(), 1)) * 100
    return valid, haze, {"value": round(share, 2)}, band_for(centroid)


# ------------------------------------------------------------ driver

def sample_indices(total, n, lo=0.0, hi=1.0):
    a, b = int(total * lo), int(total * hi) - 1
    return sorted({int(round(x)) for x in np.linspace(a, b, n)})


def contact_sheet(frames, box, path, cols=8):
    crops = []
    for i, f in enumerate(frames):
        h, w = f.shape[:2]
        c = Image.fromarray(f[int(h * box[1]): int(h * box[3]), int(w * box[0]): int(w * box[2])])
        c = c.resize((360, int(360 * c.height / c.width)))
        d = ImageDraw.Draw(c)
        d.rectangle([0, 0, 34, 18], fill=(255, 0, 0))
        d.text((3, 3), f"{i:02d}", fill=(255, 255, 255))
        crops.append(c)
    rows = (len(crops) + cols - 1) // cols
    sheet = Image.new("RGB", (cols * 360, rows * crops[0].height), (40, 40, 40))
    for i, c in enumerate(crops):
        sheet.paste(c, ((i % cols) * 360, (i // cols) * c.height))
    sheet.save(path)
    return path


def process(track, labels, sheets):
    tid = track["id"]
    work = CACHE / tid
    if track["kind"] == "methane":
        idx = sample_indices(track["total_frames"], track["samples"])
        frames = []
        for i in idx:
            p = download(track["frames_url"].format(i), work / "src" / f"{i:05d}.png")
            frames.append(np.array(Image.open(p).convert("RGB").resize(track["analysis"], Image.LANCZOS)))
        total = track["total_frames"]
    else:
        movie = download(track["movie"], CACHE / Path(track["movie"]).name)
        total = probe_frames(movie)
        lo, hi = 0.0, 1.0
        if track["kind"] == "porthole":
            # The water only rises for part of the movie: scan it, then sample the rise.
            scan_idx = sample_indices(total, 100)
            scan = extract(movie, scan_idx, (360, 360), work / "scan")
            valid = porthole_geometry(scan[0].shape)
            sc = porthole_scale(scan[0].shape)
            levels = np.array([(sc["zero"] - water_line(f, valid)[0]) / sc["px_per_cm"] for f in scan])
            start = levels[: 5].mean()
            end = levels[-5:].mean()
            rising = np.where((levels > start + 0.15) & (levels < end - 0.15))[0]
            lo = max(0, scan_idx[max(0, rising.min() - 1)]) / total
            hi = min(total, scan_idx[min(len(scan_idx) - 1, rising.max() + 1)] + 1) / total
        idx = sample_indices(total, track["samples"], lo, hi)
        frames = extract(movie, idx, track["analysis"], work / "frames")

    if sheets and track["kind"] in ("fires", "tempo"):
        box = (0.0, 0.80, 0.17, 0.88) if track["kind"] == "fires" else (0.02, 0.76, 0.36, 0.83)
        print("contact sheet:", contact_sheet(frames, box, CACHE / f"{tid}_labels.png"))

    # Track-wide geometry
    geom = fires_geometry(frames[0].shape) if track["kind"] == "fires" else None
    pvalid = porthole_geometry(frames[0].shape) if track["kind"] == "porthole" else None
    pscale = porthole_scale(frames[0].shape) if track["kind"] == "porthole" else None
    palette = tempo_palette(frames[len(frames) // 2]) if track["kind"] == "tempo" else None

    rows, valids = [], []
    for k, (i, rgb) in enumerate(zip(idx, frames)):
        if track["kind"] == "fires":
            valid, active, phys, band = fires_masks(rgb, geom)
        elif track["kind"] == "porthole":
            valid, active, phys, band = porthole_masks(rgb, pvalid, pscale)
        elif track["kind"] == "tempo":
            valid, active, phys, band = tempo_masks(rgb, palette)
        else:
            valid, active, phys, band = methane_masks(rgb)
        if track["kind"] == "tempo" and phys["observedPct"] < TEMPO_MIN_OBSERVED:
            continue                                      # night: TEMPO only scans in daylight
        feats, _ = frame_features(rgb, valid, active)
        rows.append({"frame": i, "raw": feats, "latBand": band, "physical": phys, "rgb": rgb})
        valids.append(valid)
    frames = [r.pop("rgb") for r in rows]

    for k, r in enumerate(rows):
        j = k - 1 if k > 0 else 1
        both = valids[k] & valids[j]
        diff = np.abs(frames[k][both].astype(np.float64) - frames[j][both].astype(np.float64))
        r["raw"]["frameDelta"] = float(diff.mean() / 255) if both.any() else 0.0

    ranges = {}
    for key in NORMALIZED:
        lo_v, hi_v, scaled = normalize([r["raw"][key] for r in rows])
        ranges[key] = {"min": lo_v, "max": hi_v}
        for r, s in zip(rows, scaled):
            r.setdefault("norm", {})[key] = s
    for r in rows:
        r["norm"]["hue"] = min(r["norm"]["hue"], 0.9999) * 360

    out_dir = OUT_DIR / tid
    out_dir.mkdir(parents=True, exist_ok=True)
    for old in out_dir.glob("*.jpg"):
        old.unlink()
    track_labels = labels.get(tid, {})
    out_frames = []
    for k, (r, rgb) in enumerate(zip(rows, frames)):
        Image.fromarray(rgb).resize(track["display"], Image.LANCZOS).save(out_dir / f"{k:02d}.jpg", quality=84, optimize=True)
        stamp = track_labels.get(str(r["frame"]))
        out_frames.append({
            "theme": tid, "index": k, "sourceFrame": r["frame"], "sourceFrames": total,
            **label_for(track, r, stamp, total),
            "image": f"data/eic/{tid}/{k:02d}.jpg",
            "hue": round(r["norm"]["hue"], 3),
            "brightness": round(r["norm"]["brightness"], 4),
            "colorVariance": round(r["norm"]["colorVariance"], 4),
            "pixelDensity": round(r["norm"]["pixelDensity"], 4),
            "frameDelta": round(r["norm"]["frameDelta"], 4),
            "latBand": r["latBand"],
            "raw": {key: round(v, 5) for key, v in r["raw"].items()},
            "physical": {**track["physical"], **r["physical"]},
        })
    if palette is not None:
        extra = {"colourBar": {"row": palette[2]["row"], "x": palette[2]["x"], "ticks": palette[2]["ticks"], "range": [0, 150], "readableMax": palette[2]["readableMax"], "units": "x10^14 molecules/cm2"}}
    elif pscale is not None:
        extra = {"ruler": {k: round(v, 2) for k, v in pscale.items()}}
    else:
        extra = {}
    page = f"{SVS}/{track['svs']}/"
    return add_sound({
        "id": tid, "theme": track["theme"], "side": "b", "svs": track["svs"], "title": track["title"],
        "page": page, "source": track.get("movie") or track["frames_url"].format(0), "credits": track["credits"],
        "dataset": track["dataset"], "signature": track["signature"], "physical": track["physical"],
        "activeRule": track["activeRule"], "frameCount": len(out_frames), "normalization": ranges,
        "aspect": round(track["display"][0] / track["display"][1], 4), **extra, "frames": out_frames,
    })


def add_sound(meta):
    """value01 / activeShare01 / fromFirst01 for every frame of a side B track."""
    cfg = SOUND[meta["id"]]
    lo, hi = cfg["range"]
    first = None
    for f in meta["frames"]:
        v01 = round(unit01(f["physical"]["value"], lo, hi), 4)
        first = v01 if first is None else first
        f.update(value01=v01, activeShare01=v01, fromFirst01=round(abs(v01 - first), 4))
    meta["sound"] = {"range": [lo, hi], "rangeLabel": cfg["rangeLabel"], "share": "value"}
    return meta


def label_for(track, row, stamp, total):
    kind = track["kind"]
    if kind == "methane":
        # frames 0 .. total-1 run evenly from Jan 1 to Dec 31, 2021
        day = date(2021, 1, 1) + timedelta(days=round(row["frame"] / (total - 1) * 364))
        return {"date": day.isoformat(), "year": 2021, "label": f"{day:%B} {day.day}, 2021", "short": f"{day:%b} {day.day}",
                "big": f"{day:%b} {day.day:02d}"}
    if kind == "porthole":
        cm = row["physical"]["value"]
        sign = "+" if cm >= 0 else "−"
        return {"date": None, "year": None, "label": f"Sea level {sign}{abs(cm):.1f} cm above 1993",
                "short": f"{sign}{abs(cm):.1f} cm", "big": f"{sign}{abs(cm):.1f}"}
    if not stamp:
        return {"date": None, "year": None, "label": f"Frame {row['frame'] + 1} of {total}", "short": f"#{row['frame'] + 1}",
                "big": f"{row['frame'] + 1}"}
    if kind == "fires":
        d = date.fromisoformat(stamp)
        return {"date": stamp, "year": d.year, "label": f"{d:%B} {d.day}, {d.year}", "short": f"{d:%b} {d.day}, {d.year}",
                "big": f"{d:%b} {d.day:02d}"}
    t = datetime.fromisoformat(stamp)
    return {"date": stamp, "year": t.year, "label": f"{t:%B} {t.day}, {t.year}, {t:%H:%M} EDT",
            "short": f"{t:%b} {t.day} {t:%H:%M}", "big": f"{t:%H:%M}"}


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--sheets", action="store_true", help="write date-stamp contact sheets for transcription")
    ap.add_argument("--only", help="process one track id")
    ap.add_argument("--sound-only", action="store_true", help="recompute value01 etc. in data/eic.json without downloading")
    args = ap.parse_args()
    labels = json.loads(LABELS.read_text(encoding="utf-8")) if LABELS.exists() else {}
    existing = json.loads(OUT.read_text(encoding="utf-8")) if OUT.exists() else {"tracks": []}
    if args.sound_only:
        for meta in existing["tracks"]:
            add_sound(meta)
            f0, f1 = meta["frames"][0], meta["frames"][-1]
            print(f"{meta['id']:22s} value01 {f0['value01']:.3f} -> {f1['value01']:.3f}  fromFirst01 max "
                  f"{max(f['fromFirst01'] for f in meta['frames']):.3f}")
        OUT.write_text(json.dumps(existing, indent=1, ensure_ascii=False) + "\n", encoding="utf-8")
        return
    done = {t["id"]: t for t in existing.get("tracks", [])}
    for track in TRACKS:
        if args.only and track["id"] != args.only:
            continue
        meta = process(track, labels, args.sheets)
        done[track["id"]] = meta
        vals = [f["physical"]["value"] for f in meta["frames"]]
        print(f"{track['id']:22s} {meta['frameCount']:2d} frames  {track['physical']['label']}: "
              f"{vals[0]} -> {vals[-1]} (min {min(vals)}, max {max(vals)})  "
              + "  ".join(f"{k}[{v['min']:.3f}..{v['max']:.3f}]" for k, v in meta["normalization"].items()))
    order = [t["id"] for t in TRACKS]
    out = {"generatedAt": datetime.now(timezone.utc).isoformat(timespec="seconds"),
           "source": "NASA Scientific Visualization Studio, Earth Information Center visualizations",
           "tracks": [done[i] for i in order if i in done]}
    OUT.write_text(json.dumps(out, indent=1, ensure_ascii=False) + "\n", encoding="utf-8")


if __name__ == "__main__":
    main()
