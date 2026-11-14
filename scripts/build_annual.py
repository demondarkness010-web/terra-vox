"""Turn the downloaded windows into one yearly value and one picture per year.

    python scripts/fetch_annual.py      # first: the frames (about 130 MB)
    python scripts/fetch_reference.py   # first: NOAA records + yearly NO2 by region
    python scripts/build_annual.py

One window a year (one August month of methane, three March days of NO2,
eight August days of fire) can land on an odd year by chance, so each year
is now an average:

    Greenhouse Gases  the mean of the year's AIRS monthly maps (12; the
                      current year is partial: January to the latest month,
                      and its Duet partner is compared over the same months)
    Sea Level Change  the mean of 12 JPL MEaSUREs maps, one per month
    Air Quality       the mean of 12 three-day OMI composites, one per month
                      (regions: data/reference.json, fetch_reference.py)
    Wildfires         fifteen 8-day MODIS composites, June 1 - September 27:
                      the value is their mean count of separate fire areas;
                      the picture is their union, the whole season's fires.
                      (Counting areas in the union itself would merge
                      neighbouring fires into one blob as the season fills
                      in, so a busier season could count fewer areas.)

Every mean is weighted by cos(latitude), so a pixel near the pole does not
count as much as one at the equator. Pixels with no data that month (cloud,
swath gaps, land for the ocean layers) are skipped.

Writes
    data/features/<theme>/<YYYY>-01-01.json   per-year values + sound inputs
    data/display/<theme>/<YYYY>-01-01.jpg     the year's averaged map
    data/points/<theme>.json                  where the signal is, for sparks
    data/themes.json                          + averaging, referenceCheck,
                                              knownIssues per theme
The single-window data this replaced is in data/legacy/.

Then it checks the yearly records against NOAA's independent ones (methane
against NOAA's global surface network, sea level against NOAA's altimetry
record) and prints Pearson r over the shared years, for the single-window
data and the yearly data side by side. Nothing is tuned to pass.
"""

import io
import json
import shutil
import sys
from datetime import date, datetime, timezone
from pathlib import Path

import cv2
import numpy as np
from PIL import Image

sys.path.insert(0, str(Path(__file__).resolve().parent))
from theme_defs import SOUND, THEMES, unit01  # noqa: E402
from extract_features import (  # noqa: E402
    DISPLAY, FEATURES, NORMALIZED, RAW, ROOT, add_sound, compose, frame_delta, frame_features,
    load_bases, normalize, parse_colormap, pixels_to_values, sound_meta, with_coastlines,
)

ANNUAL = RAW / "_annual"
OMI = ROOT / ".cache" / "reference" / "omi_no2"
POINTS = ROOT / "data" / "points"
LEGACY = ROOT / "data" / "legacy"
MIN_COVER = 0.2          # a map with less than 20 % of its domain filled is "no data yet"
SAMPLES = 240            # spark points per year

KNOWN_ISSUES = {
    "wildfires": ["terra_drift"],          # Terra's orbit drifts later from 2020 (NASA NTRS 20250000522)
    "air_quality": ["omi_row_anomaly"],    # OMI's row anomaly blanks part of every swath since 2007
}


def cos_weights(h, w):
    lat = np.linspace(90 - 90 / h, -90 + 90 / h, h)
    return np.cos(np.deg2rad(lat))[:, None] * np.ones((1, w))


def wmean(values, mask, weight):
    w = weight[mask]
    return float((values[mask] * w).sum() / w.sum()) if w.sum() else float("nan")


def palette_image(vgrid, valid, cmap):
    """Values back to colours through the GIBS palette (nearest entry): the averaged map."""
    pal_rgb, pal_val = cmap
    finite = np.isfinite(pal_val)
    rgb_f, val_f = pal_rgb[finite], pal_val[finite]
    order = np.argsort(val_f)
    rgb_f, val_f = rgb_f[order], val_f[order]
    out = np.zeros(vgrid.shape + (4,), np.uint8)
    idx = np.clip(np.searchsorted(val_f, vgrid[valid]), 1, len(val_f) - 1)
    left = val_f[idx - 1]
    right = val_f[idx]
    idx = np.where(np.abs(vgrid[valid] - left) <= np.abs(right - vgrid[valid]), idx - 1, idx)
    out[valid, :3] = rgb_f[idx]
    out[valid, 3] = 255
    return out


def to_latlon(ys, xs, shape):
    h, w = shape
    return np.round(np.stack([90 - (ys + 0.5) * 180 / h, -180 + (xs + 0.5) * 360 / w], 1), 1).tolist()


def spark_points(active, values, valid, seed):
    rng = np.random.default_rng(seed)
    kind = "active"
    mask = active
    if not mask.any():
        # nothing past the threshold: the top 1 % of the year's values instead
        kind = "peak"
        cut = np.nanpercentile(values[valid], 99) if valid.any() else np.inf
        mask = valid & (values >= cut)
    ys, xs = np.nonzero(mask)
    if len(ys) > SAMPLES:
        pick = rng.choice(len(ys), SAMPLES, replace=False)
        ys, xs = ys[pick], xs[pick]
    return {"kind": kind, "points": to_latlon(ys, xs, mask.shape)}


# ------------------------------------------------------------ one year per theme

def gridded_year(theme, files, cmap, scale, threshold):
    """Mean map + monthly means of a palette layer (methane, sea level)."""
    weight = None
    vsum = vcount = None
    monthly, monthly_share, months = [None] * 12, [None] * 12, []
    for f in files:
        rgba = np.array(Image.open(f).convert("RGBA"))
        if weight is None:
            weight = cos_weights(*rgba.shape[:2])
            vsum = np.zeros(rgba.shape[:2])
            vcount = np.zeros(rgba.shape[:2])
        valid = rgba[..., 3] > 0
        if valid.mean() < MIN_COVER:
            continue                     # GIBS answers future months with an empty map
        vals = np.zeros(valid.shape)
        vals[valid], _ = pixels_to_values(rgba[..., :3], valid, cmap)
        m = int(f.stem[5:7])
        monthly[m - 1] = round(wmean(vals, valid, weight) * scale, 3)
        monthly_share[m - 1] = round(float(weight[valid & (vals >= threshold)].sum() / weight[valid].sum() * 100), 3)
        months.append(m)
        vsum[valid] += vals[valid]
        vcount[valid] += 1
    if not months:
        return None
    valid = vcount > 0
    vgrid = np.full(vsum.shape, np.nan)
    vgrid[valid] = vsum[valid] / vcount[valid]
    got = [x for x in monthly if x is not None]
    shares = [x for x in monthly_share if x is not None]
    return {
        "value": float(np.mean(got)), "share": float(np.mean(shares)), "months": sorted(months),
        "monthly": monthly, "monthlyShare": monthly_share,
        "image": palette_image(vgrid, valid, cmap), "vgrid": vgrid, "valid": valid,
        "active": valid & (vgrid >= threshold), "windows": len(months),
    }


def no2_year(year, cmap, threshold):
    """Global mean map from the 12 monthly three-day composites (0.5 degrees)."""
    weight = None
    vsum = vcount = None
    months, monthly = [], []
    for m in range(1, 13):
        days = [OMI / f"{year}-{m:02d}-{d}.png" for d in (14, 15, 16)]
        msum = mw = 0.0
        for p in days:
            if not p.exists():
                continue
            rgba = np.array(Image.open(p).convert("RGBA"))
            if weight is None:
                weight = cos_weights(*rgba.shape[:2])
                vsum = np.zeros(rgba.shape[:2])
                vcount = np.zeros(rgba.shape[:2])
            valid = rgba[..., 3] > 0
            if not valid.any():
                continue
            vals = np.zeros(valid.shape)
            vals[valid], _ = pixels_to_values(rgba[..., :3], valid, cmap)
            msum += float((vals[valid] * weight[valid]).sum())
            mw += float(weight[valid].sum())
            vsum[valid] += vals[valid]
            vcount[valid] += 1
        if mw:
            months.append(m)
            monthly.append(msum / mw)
    if len(months) < 10:
        return None
    valid = vcount > 0
    vgrid = np.full(vsum.shape, np.nan)
    vgrid[valid] = vsum[valid] / vcount[valid]
    image = palette_image(vgrid, valid, cmap)
    # up to the 1024 x 512 grid the other themes use (nearest: no new colours)
    big = np.array(Image.fromarray(image).resize((1024, 512), Image.NEAREST))
    big_valid = big[..., 3] > 0
    big_vals = np.array(Image.fromarray(np.nan_to_num(vgrid).astype(np.float32), mode="F").resize((1024, 512), Image.NEAREST))
    return {"value": float(np.mean(monthly)), "months": months, "image": big, "vgrid": big_vals,
            "valid": big_valid, "active": big_valid & (big_vals >= threshold), "windows": len(months)}


def fire_year(year):
    files = sorted((ANNUAL / "wildfires").glob(f"{year}-*.png"))
    counts, union = [], None
    for f in files:
        rgba = np.array(Image.open(f).convert("RGBA"))
        opaque = rgba[..., 3] > 0
        counts.append(cv2.connectedComponents(opaque.astype(np.uint8), connectivity=8)[0] - 1)
        union = rgba if union is None else np.where((union[..., 3:4] > 0), union, rgba)
    if not counts:
        return None
    opaque = union[..., 3] > 0
    return {"value": float(np.mean(counts)), "counts": counts, "image": union, "valid": np.ones_like(opaque),
            "active": opaque, "vgrid": opaque.astype(float), "windows": len(counts),
            "mapPct": round(float(opaque.mean()) * 100, 2)}


# ------------------------------------------------------------ per theme

def build_theme(theme, base, coast, reference):
    tid = theme["id"]
    cmap = parse_colormap(RAW / tid / "colormap.xml") if theme["colormap"] else None
    phys = theme["physical"]
    threshold = theme["active_rule"].get("value")
    years = []
    if tid == "greenhouse_gases":
        files = sorted((ANNUAL / tid).glob("*.png"))
        for y in sorted({int(f.stem[:4]) for f in files}):
            r = gridded_year(theme, [f for f in files if f.stem.startswith(str(y))], cmap, phys["scale"], threshold)
            if r:
                years.append((y, r))
    elif tid == "sea_level":
        files = sorted((ANNUAL / tid).glob("*.png"))
        for y in range(1993, 2019):
            r = gridded_year(theme, [f for f in files if f.stem.startswith(str(y))], cmap, phys["scale"], threshold)
            if r:
                years.append((y, r))
    elif tid == "air_quality":
        for y in range(2005, 2026):
            r = no2_year(y, cmap, threshold)
            if r:
                years.append((y, r))
    else:
        for y in range(2001, 2027):
            r = fire_year(y)
            if r:
                years.append((y, r))

    # the current year is partial when it has fewer months than a full year
    this_year = date.today().year
    for f in (FEATURES / tid).glob("*.json"):
        f.unlink()
    for f in (DISPLAY / tid).glob("*.jpg"):
        f.unlink()
    (FEATURES / tid).mkdir(parents=True, exist_ok=True)
    (DISPLAY / tid).mkdir(parents=True, exist_ok=True)

    frames, composed, valids, points = [], [], [], {}
    for y, r in years:
        d = f"{y}-01-01"
        rgba = r["image"]
        seen = compose(rgba, base)
        Image.fromarray(with_coastlines(seen, coast)).save(DISPLAY / tid / f"{d}.jpg", quality=80, optimize=True)
        feats, band = frame_features(seen, r["valid"], r["active"])
        physical = {"label": phys["label"], "units": phys["units"], "activeThreshold": threshold}
        if tid == "wildfires":
            physical.update({"value": round(r["value"], 1), "clusters": round(r["value"], 1),
                             "windowCounts": r["counts"], "mapPct": r["mapPct"]})
            feats["pixelDensity"] = r["mapPct"] / 100
            kind, months = "season", [6, 9]
        else:
            # methane and sea level arrive scaled (ppb, cm); NO2 in molecules/cm2
            physical["value"] = round(r["value"] * (phys["scale"] if tid == "air_quality" else 1), phys["digits"])
            if "share" in r:
                feats["pixelDensity"] = r["share"] / 100
            months = r["months"]
            kind = "partial" if (y == this_year and len(months) < 12) else "year"
        window = {"kind": kind, "months": months, "windows": r["windows"]}
        frames.append({"year": y, "date": d, "raw": feats, "band": band, "physical": physical, "window": window,
                       "monthly": r.get("monthly"), "monthlyShare": r.get("monthlyShare")})
        composed.append(seen)
        valids.append(r["valid"])
        points[d] = spark_points(r["active"], r["vgrid"], r["valid"], y)

    for i, f in enumerate(frames):
        j = i - 1 if i > 0 else 1
        f["raw"]["frameDelta"] = frame_delta(composed[i], valids[i], composed[j], valids[j], theme["valid_domain"])

    ranges = {}
    for key in NORMALIZED:
        lo, hi, scaled = normalize([f["raw"][key] for f in frames])
        ranges[key] = {"min": lo, "max": hi}
        for f, s in zip(frames, scaled):
            f.setdefault("normalized", {})[key] = s
    for f in frames:
        f["normalized"]["hue"] = min(f["normalized"]["hue"], 0.9999) * 360

    outs = []
    for idx, f in enumerate(frames):
        out = {
            "theme": tid, "index": idx, "date": f["date"], "year": f["year"],
            "label": f"{f['year']} yearly average",
            "window": f["window"],
            "image": f"data/display/{tid}/{f['date']}.jpg",
            **{k: round(f["normalized"][k], 4 if k != "hue" else 3) for k in NORMALIZED},
            "latBand": f["band"],
            "raw": {k: round(v, 5) for k, v in f["raw"].items()},
            "physical": f["physical"],
            "source": {"layer": theme["layer"], "averaging": f["window"]},
        }
        if f["monthly"]:
            out["monthly"] = f["monthly"]
            out["monthlyShare"] = f["monthlyShare"]
        outs.append(out)

    add_sound(tid, outs)
    # A partial year is compared with the oldest year over the same months.
    last = outs[-1]
    if last["window"]["kind"] == "partial" and outs[0].get("monthly"):
        lo, hi = SOUND[tid]["range"]
        same = [outs[0]["monthly"][m - 1] for m in last["window"]["months"] if outs[0]["monthly"][m - 1] is not None]
        if same:
            last["fromFirst01"] = round(abs(last["value01"] - unit01(float(np.mean(same)), lo, hi)), 4)

    for out in outs:
        (FEATURES / tid / f"{out['date']}.json").write_text(json.dumps(out, indent=1))
    POINTS.mkdir(exist_ok=True)
    (POINTS / f"{tid}.json").write_text(json.dumps(points))

    meta = {
        "id": tid, "name": theme["name"], "signature": theme["signature"], "dataset": theme["dataset"],
        "instrument": theme["instrument"], "layer": theme["layer"], "unitsNote": theme["units_note"],
        "physical": {"label": phys["label"], "units": phys["units"]}, "activeRule": theme["active_rule"],
        "composite": theme["composite"], "compositeDays": theme["composite_days"],
        "thumbnail": f"assets/thumbnails/{tid}.jpg", "eic": theme["eic"],
        "dateRange": {"start": frames[0]["date"], "end": frames[-1]["date"]},
        "yearRange": [frames[0]["year"], frames[-1]["year"]],
        "frameCount": len(frames), "frames": [f["date"] for f in frames],
        "normalization": ranges, "sound": sound_meta(tid),
        "averaging": AVERAGING[tid],
        "knownIssues": KNOWN_ISSUES.get(tid, []),
    }
    return meta, outs


AVERAGING = {
    "greenhouse_gases": {"kind": "yearly", "windows": "12 monthly maps a year (the current year: January to the latest month)"},
    "sea_level": {"kind": "yearly", "windows": "12 maps a year, one per month"},
    "air_quality": {"kind": "yearly", "windows": "12 three-day composites a year, one per month"},
    "wildfires": {"kind": "season", "windows": "15 eight-day composites, June 1 to September 27"},
}


# ------------------------------------------------------------ checks against NOAA

def pearson(a, b):
    a, b = np.asarray(a, float), np.asarray(b, float)
    return float(np.corrcoef(a, b)[0, 1])


def check(name, ours, theirs):
    shared = sorted(set(ours) & set(theirs))
    r = pearson([ours[y] for y in shared], [theirs[y] for y in shared])
    return {"source": name, "r": round(r, 3), "years": [shared[0], shared[-1]], "n": len(shared)}


def reference_checks(outs_by_theme, reference):
    out = {}
    legacy = json.loads((LEGACY / "themes.json").read_text())
    legacy_vals = {}
    for t in legacy["themes"]:
        vals = {}
        for d in t["frames"]:
            f = json.loads((LEGACY / "features" / t["id"] / f"{d}.json").read_text())
            vals[f["year"]] = f["physical"]["value"]
        legacy_vals[t["id"]] = vals

    noaa_ch4 = {p["year"]: p["value"] for p in reference["greenhouse_gases"]["series"]}
    noaa_sea = {p["year"]: p["value"] for p in reference["sea_level"]["series"] if not p.get("partial")}
    yearly_ch4 = {o["year"]: o["physical"]["value"] for o in outs_by_theme["greenhouse_gases"] if o["window"]["kind"] == "year"}
    yearly_sea = {o["year"]: o["physical"]["value"] for o in outs_by_theme["sea_level"]}
    out["greenhouse_gases"] = {**check("NOAA GML global surface CH4, annual mean", yearly_ch4, noaa_ch4),
                               "singleWindow": check("same, single August month", legacy_vals["greenhouse_gases"], noaa_ch4)}
    out["sea_level"] = {**check("NOAA LSA global mean sea level, annual mean", yearly_sea, noaa_sea),
                        "singleWindow": check("same, single October map", legacy_vals["sea_level"], noaa_sea)}
    return out


def main():
    reference = json.loads((ROOT / "data" / "reference.json").read_text(encoding="utf-8"))
    if reference["air_quality"]["id"] != "omi_no2_yearly":
        raise SystemExit("data/reference.json still has March NO2: run scripts/fetch_reference.py first")
    if not (LEGACY / "themes.json").exists():
        raise SystemExit("data/legacy is missing: copy the single-window data/features and themes.json there first")
    base, coast = load_bases()
    meta_out = {"generatedAt": datetime.now(timezone.utc).isoformat(timespec="seconds"),
                "source": "NASA GIBS (Worldview) imagery, yearly averages (scripts/build_annual.py); NASA SVS Earth Information Center cover art",
                "scale": "C minor pentatonic", "themes": []}
    outs_by_theme = {}
    for theme in THEMES:
        meta, outs = build_theme(theme, base, coast, reference)
        outs_by_theme[theme["id"]] = outs
        meta_out["themes"].append(meta)
        first, last = outs[0], outs[-1]
        print(f"{theme['id']:17s} {len(outs):2d} years  {first['year']}: {first['physical']['value']}  "
              f"{last['year']}: {last['physical']['value']} ({last['window']['kind']}, {len(last['window']['months'])} months)  "
              f"value01 {first['value01']:.3f} -> {last['value01']:.3f}", flush=True)
    checks = reference_checks(outs_by_theme, reference)
    for t in meta_out["themes"]:
        if t["id"] in checks:
            t["referenceCheck"] = checks[t["id"]]
    (ROOT / "data" / "themes.json").write_text(json.dumps(meta_out, indent=2))
    for tid, c in checks.items():
        print(f"{tid:17s} yearly r = {c['r']:.3f} ({c['years'][0]}-{c['years'][1]}, n={c['n']})   "
              f"single window r = {c['singleWindow']['r']:.3f}")


if __name__ == "__main__":
    main()
