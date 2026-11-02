"""Official reference records that sit beside the frames Terra Vox plays.

    python scripts/fetch_reference.py            # uses .cache/ for OMI days
    python scripts/fetch_reference.py --force    # re-download everything

The frames are snapshots (one window per year), so on their own they cannot
say whether the trend they suggest matches the official record. This script
pulls the records scientists actually cite and stores them next to the
frames, so the app can draw both on one chart and say where they agree.

Writes
    data/reference.json   one series per theme + every source URL and date
    data/legends.json     colour keys (value ticks) from the GIBS colormaps

Sources
    Greenhouse Gases  NOAA Global Monitoring Laboratory, global marine-surface
                      monthly/annual mean CH4 (also CO2 and N2O, for context)
    Sea Level Change  NOAA Laboratory for Satellite Altimetry, global mean sea
                      level from TOPEX/Poseidon, Jason-1/2/3 and Sentinel-6MF
                      (seasonal signal removed, no GIA correction)
    Air Quality       NASA OMI tropospheric NO2 (the same GIBS layer the app
                      plays), averaged over every day of March each year for
                      four polluted regions and the whole globe. March matches
                      the app's frames, which sit on March 15-17.
    Wildfires         No single official "global fire" series exists that
                      matches 8-day MODIS snapshots; the app cites published
                      MODIS studies instead (see data/context.json).
"""

import argparse
import csv
import io
import json
import re
import sys
import time
from concurrent.futures import ThreadPoolExecutor
from datetime import date, datetime, timedelta, timezone
from pathlib import Path

import numpy as np
import requests
from PIL import Image

sys.path.insert(0, str(Path(__file__).resolve().parent))
from theme_defs import gibs_url, theme_by_id  # noqa: E402
from extract_features import parse_colormap, pixels_to_values  # noqa: E402

ROOT = Path(__file__).resolve().parent.parent
RAW = ROOT / "data" / "raw_frames"
CACHE = ROOT / ".cache" / "reference"
OUT = ROOT / "data" / "reference.json"
LEGENDS = ROOT / "data" / "legends.json"

NOAA_GML = "https://gml.noaa.gov/webdata/ccgg/trends"
NOAA_LSA = "https://www.star.nesdis.noaa.gov/socd/lsa/SeaLevelRise/slr/slr_sla_gbl_free_ref_90.csv"

# Lat/lon boxes (south, north, west, east). Chosen to match the regions in the
# OMI trend literature (e.g. Duncan et al. 2016, JGR Atmospheres).
NO2_REGIONS = [
    {"id": "eastern_us", "name": "Eastern United States", "box": (32, 43, -92, -72)},
    {"id": "western_europe", "name": "Western Europe", "box": (45, 55, -2, 16)},
    {"id": "north_china", "name": "North China Plain", "box": (32, 41, 112, 121)},
    {"id": "northern_india", "name": "Northern India", "box": (21, 30, 77, 88)},
]
NO2_YEARS = range(2005, 2026)
NO2_W, NO2_H = 720, 360  # 0.5 degree grid: plenty for regional means
MIN_DAYS = 20
NO2_ACTIVE = 5e15   # "polluted" air, the same threshold as the app's Air Quality frames

session = requests.Session()
session.headers["User-Agent"] = "terra-vox/1.0 (NASA Space Apps; github.com/demondarkness010-web/terra-vox)"


FORCE = False
OFFLINE = False


def get(url, attempts=5, binary=False):
    last = None
    for i in range(attempts):
        try:
            r = session.get(url, timeout=60)
            r.raise_for_status()
            return r.content if binary else r.text
        except requests.RequestException as e:
            last = e
            time.sleep(2 * (i + 1))
    raise RuntimeError(f"GET failed: {url}: {last}")


def get_text_cached(url):
    """Text downloads are cached too, so a flaky connection can resume."""
    path = CACHE / "text" / re.sub(r"[^A-Za-z0-9._-]", "_", url.split("//", 1)[1])
    if path.exists() and not FORCE:
        return path.read_text(encoding="utf-8")
    text = get(url)
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(text, encoding="utf-8")
    return text


def now_iso():
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat()


# ------------------------------------------------------------ NOAA GML

def noaa_csv(name):
    gas = name.split("_")[0]
    url = f"{NOAA_GML}/{gas}/{name}.csv"
    text = get_text_cached(url)
    created = re.search(r"#\s*File Creation:\s*(.+)", text)
    rows = [r for r in csv.reader(io.StringIO("\n".join(l for l in text.splitlines() if not l.startswith("#")))) if r]
    header, body = rows[0], rows[1:]
    return url, (created.group(1).strip() if created else None), header, body


def greenhouse():
    url, created, _, body = noaa_csv("ch4_annmean_gl")
    annual = [{"year": int(r[0]), "value": round(float(r[1]), 2), "unc": round(float(r[2]), 2)} for r in body]
    gurl, _, _, gbody = noaa_csv("ch4_gr_gl")
    growth = [{"year": int(r[0]), "value": round(float(r[1]), 2)} for r in gbody]
    murl, mcreated, _, mbody = noaa_csv("ch4_mm_gl")
    last = mbody[-1]
    latest_month = {"year": int(last[0]), "month": int(last[1]), "value": round(float(last[3]), 2), "trend": round(float(last[5]), 2)}
    context = {}
    for gas, unit in (("co2", "ppm"), ("n2o", "ppb")):
        curl, _, _, cbody = noaa_csv(f"{gas}_annmean_gl")
        y, v = cbody[-1][0], cbody[-1][1]
        context[gas] = {"year": int(y), "value": round(float(v), 2), "units": unit, "url": curl}
    return {
        "id": "noaa_gml_ch4",
        "title": "Global surface methane (NOAA marine boundary layer network)",
        "units": "ppb",
        "kind": "annual",
        "series": annual,
        "growth": growth,
        "latestMonth": latest_month,
        "context": context,
        "note": "Surface air. AIRS frames measure the mid-troposphere (400 hPa, about 7 km up), where methane is lower, so the app's values sit below this line; the trend is what to compare.",
        "source": {"name": "NOAA Global Monitoring Laboratory", "url": url, "monthly": murl, "growth": gurl,
                   "page": "https://gml.noaa.gov/ccgg/trends_ch4/", "fileCreated": created, "retrieved": now_iso(),
                   "credit": "Lan, X., K.W. Thoning, and E.J. Dlugokencky: Trends in globally-averaged CH4, N2O, and SF6 determined from NOAA Global Monitoring Laboratory measurements."},
    }


# ------------------------------------------------------------ sea level

def sea_level():
    text = get_text_cached(NOAA_LSA)
    trend = re.search(r"#trend\s*=\s*([\d.]+)\s*mm/year", text)
    lines = [l for l in text.splitlines() if l and not l.startswith("#")]
    header = lines[0].split(",")
    by_year = {}
    missions = {}
    for line in lines[1:]:
        cells = line.split(",")
        t = float(cells[0])
        vals = [(header[i], float(c)) for i, c in enumerate(cells[1:], start=1) if c.strip()]
        if not vals:
            continue
        y = int(t)
        by_year.setdefault(y, []).append((t, float(np.mean([v for _, v in vals]))))
        for name, _ in vals:
            missions.setdefault(name, [t, t])
            missions[name][1] = t
    series = []
    for y in sorted(by_year):
        pts = by_year[y]
        span = max(t for t, _ in pts) - min(t for t, _ in pts)
        series.append({"year": y, "value": round(float(np.mean([v for _, v in pts])), 1), "samples": len(pts),
                       "partial": span < 0.75})
    full = [s for s in series if not s["partial"]]
    x = np.array([s["year"] for s in full], float)
    yv = np.array([s["value"] for s in full], float)
    slope, _ = np.polyfit(x, yv, 1)
    quad = np.polyfit(x - x.mean(), yv, 2)
    first, last = full[0], full[-1]
    return {
        "id": "noaa_lsa_gmsl",
        "title": "Global mean sea level (satellite altimetry)",
        "units": "mm",
        "kind": "annual",
        "series": series,
        "riseFirstToLast": {"from": first["year"], "to": last["year"], "mm": round(last["value"] - first["value"], 1)},
        "trendMmPerYear": round(float(slope), 2),
        "accelerationMmPerYear2": round(float(2 * quad[0]), 3),
        "publishedTrend": float(trend.group(1)) if trend else None,
        "missions": [{"name": k, "from": round(v[0], 2), "to": round(v[1], 2)} for k, v in missions.items()],
        "note": "Seasonal cycle removed; no glacial isostatic adjustment, so the trend is about 0.3 mm/yr below NASA's GIA-corrected figure.",
        "source": {"name": "NOAA Laboratory for Satellite Altimetry", "url": NOAA_LSA,
                   "page": "https://www.star.nesdis.noaa.gov/socd/lsa/SeaLevelRise/", "retrieved": now_iso(),
                   "credit": "Altimetry data are provided by NOAA Laboratory for Satellite Altimetry."},
    }


# ------------------------------------------------------------ OMI NO2

def omi_day(day, layer, force):
    path = CACHE / "omi_no2" / f"{day.isoformat()}.png"
    if path.exists() and not force:
        return path.read_bytes()
    if OFFLINE:
        return None
    try:
        data = get(gibs_url(layer, day, width=NO2_W, height=NO2_H), binary=True)
    except RuntimeError:
        return None
    if not data.startswith(b"\x89PNG"):
        return None  # GIBS answers missing days with an XML exception
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(data)
    return data


def air_quality(force):
    theme = theme_by_id("air_quality")
    cmap = parse_colormap(RAW / "air_quality" / "colormap.xml")
    lat = np.linspace(90 - 90 / NO2_H, -90 + 90 / NO2_H, NO2_H)
    lon = np.linspace(-180 + 180 / NO2_W, 180 - 180 / NO2_W, NO2_W)
    weight = np.cos(np.deg2rad(lat))[:, None] * np.ones((1, NO2_W))
    masks = {r["id"]: ((lat[:, None] >= r["box"][0]) & (lat[:, None] <= r["box"][1]) &
                       (lon[None, :] >= r["box"][2]) & (lon[None, :] <= r["box"][3])) for r in NO2_REGIONS}

    days = [date(y, 3, d) for y in NO2_YEARS for d in range(1, 32)]
    with ThreadPoolExecutor(8) as pool:
        blobs = list(pool.map(lambda d: omi_day(d, theme["layer"], force), days))

    sums = {}
    for day, blob in zip(days, blobs):
        if blob is None:
            continue
        rgba = np.array(Image.open(io.BytesIO(blob)).convert("RGBA"))
        valid = rgba[..., 3] > 0
        if not valid.any():
            continue
        vals = np.zeros(valid.shape)
        vals[valid], _ = pixels_to_values(rgba[..., :3], valid, cmap)
        acc = sums.setdefault(day.year, {k: [0.0, 0.0, 0.0] for k in ["global", *masks]})
        acc.setdefault("days", 0)
        acc["days"] += 1
        for key, m in [("global", valid), *[(k, valid & mk) for k, mk in masks.items()]]:
            w = weight[m]
            acc[key][0] += float((vals[m] * w).sum())
            acc[key][1] += float(w.sum())
            acc[key][2] += float(w[vals[m] >= NO2_ACTIVE].sum())   # polluted share, side A's rule

    def series(key):
        out = []
        for y in NO2_YEARS:
            s = sums.get(y)
            # a March mean needs most of March: skip years the network or the
            # satellite left short
            if not s or s["days"] < MIN_DAYS or s[key][1] == 0:
                continue
            out.append({"year": y, "value": round(s[key][0] / s[key][1] / 1e15, 3),
                        "share": round(s[key][2] / s[key][1] * 100, 2)})
        return out

    regions = [{"id": "global", "name": "Whole globe", "series": series("global")}]
    for r in NO2_REGIONS:
        regions.append({"id": r["id"], "name": r["name"], "box": dict(zip(("south", "north", "west", "east"), r["box"])),
                        "series": series(r["id"])})
    regions = [r for r in regions if r["series"]]
    for r in regions:
        s = r["series"]
        peak = max(s, key=lambda p: p["value"])
        r["first"], r["last"], r["peak"] = s[0], s[-1], peak
        r["changePct"] = round((s[-1]["value"] / s[0]["value"] - 1) * 100, 1)
        r["fromPeakPct"] = round((s[-1]["value"] / peak["value"] - 1) * 100, 1)
    return {
        "id": "omi_no2_march",
        "title": "March mean tropospheric NO2 by region (OMI / Aura)",
        "units": "x10^15 molecules/cm2",
        "kind": "annual-regions",
        "regions": regions,
        "daysUsed": {str(y): sums[y]["days"] for y in sorted(sums)},
        "method": "Every day of March, GIBS layer OMI_Nitrogen_Dioxide_Tropo_Column at 0.5 degrees, colours inverted through the GIBS colormap, cloud and swath gaps skipped, means weighted by cos(latitude). share = % of the region's observed air at or above 5 x10^15 molecules/cm2.",
        "note": "Derived by Terra Vox from NASA's OMI layer, not an official NASA product. The top of the GIBS palette saturates, so the most polluted cells are under-counted and peaks read low.",
        "source": {"name": "NASA OMI / Aura via NASA GIBS (derived by Terra Vox)", "layer": theme["layer"],
                   "url": gibs_url(theme["layer"], date(2025, 3, 1), width=NO2_W, height=NO2_H),
                   "page": "https://www.earthdata.nasa.gov/data/instruments/omi", "retrieved": now_iso()},
    }


# ------------------------------------------------------------ legends

LEGEND_UNITS = {
    "sea_level": {"units": "cm", "scale": 100.0, "fmt": "{:+.0f}"},
    "air_quality": {"units": "×10¹⁵ molec/cm²", "scale": 1e-15, "fmt": "{:.0f}"},
    "greenhouse_gases": {"units": "ppb", "scale": 1.0, "fmt": "{:,.0f}"},
}


def legends():
    out = {"wildfires": {"kind": "marker", "title": "Active fire detected", "color": "#ff7a1a",
                         "note": "Each dot is a 1 km MODIS pixel where a fire burned during the 8-day window."}}
    for theme_id, u in LEGEND_UNITS.items():
        xml = (RAW / theme_id / "colormap.xml").read_text(encoding="utf-8")
        title = re.findall(r'<ColorMap title="([^"]+)" units="([^"]+)"', xml)[-1]
        rgb, val = parse_colormap(RAW / theme_id / "colormap.xml")
        finite = np.isfinite(val)
        rgb, val = rgb[finite], val[finite]
        idx = np.linspace(0, len(val) - 1, 24).round().astype(int)
        stops = [{"at": round(i / (len(val) - 1), 4), "color": "#%02x%02x%02x" % tuple(rgb[i])} for i in idx]
        ticks = []
        for m in re.finditer(r'<LegendEntry rgb="(\d+),(\d+),(\d+)"[^>]*showLabel="true" label="([^"]+)"', xml):
            c = np.array([int(m.group(1)), int(m.group(2)), int(m.group(3))])
            i = int(((rgb - c) ** 2).sum(1).argmin())
            v = float(val[i]) * u["scale"]
            label = u["fmt"].format(round(v, 6))
            ticks.append({"at": round(i / (len(val) - 1), 4), "label": "0" if label in ("+0", "-0") else label})
        out[theme_id] = {"kind": "gradient", "title": title[0], "units": u["units"], "stops": stops, "ticks": ticks,
                         "min": round(float(val.min()) * u["scale"], 3), "max": round(float(val.max()) * u["scale"], 3)}
    return out


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--force", action="store_true")
    ap.add_argument("--offline", action="store_true", help="use cached downloads only")
    args = ap.parse_args()
    global FORCE, OFFLINE
    FORCE, OFFLINE = args.force, args.offline
    old = json.loads(OUT.read_text(encoding="utf-8")) if OUT.exists() else {}
    ref = {"generatedAt": now_iso(), "greenhouse_gases": greenhouse(), "sea_level": sea_level()}
    aq = air_quality(args.force)
    complete = len(aq["regions"][0]["series"]) == len(NO2_YEARS)
    if complete or "air_quality" not in old:
        ref["air_quality"] = aq
    else:
        print("WARNING: OMI March means incomplete (network?); keeping the previous air_quality section")
        ref["air_quality"] = old["air_quality"]
    if not complete:
        print(f"WARNING: only {len(aq['regions'][0]['series'])} of {len(NO2_YEARS)} years of OMI March means")
    OUT.write_text(json.dumps(ref, indent=1, ensure_ascii=False) + "\n", encoding="utf-8")
    LEGENDS.write_text(json.dumps(legends(), indent=1, ensure_ascii=False) + "\n", encoding="utf-8")
    g, s, a = ref["greenhouse_gases"], ref["sea_level"], ref["air_quality"]
    print(f"CH4 {g['series'][-1]}  growth {g['growth'][-1]}  latest month {g['latestMonth']}")
    print(f"GMSL rise {s['riseFirstToLast']}  trend {s['trendMmPerYear']} mm/yr  accel {s['accelerationMmPerYear2']}")
    for r in a["regions"]:
        print(f"NO2 {r['name']:24s} {r['first']} -> {r['last']}  {r['changePct']:+}%  peak {r['peak']}  from peak {r['fromPeakPct']:+}%")
    print("days used", a["daysUsed"])


if __name__ == "__main__":
    main()
