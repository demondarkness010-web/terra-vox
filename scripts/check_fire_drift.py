"""Is the Wildfires record still trustworthy after Terra's orbit drift?

    python scripts/check_fire_drift.py

Side A counts separate fire areas from MODIS on Terra. Terra left its
morning formation in October 2022 and has drifted to an earlier overpass,
away from the afternoon fire peak, so its recent years could under-count.
This script counts the same thing, the same way (same 8-day mid-August
window, same union composite, same 1024x512 GIBS frame, same 8-connected
clusters) from MODIS on Aqua, the identical instrument on a different
satellite, and compares the two year by year.

If the ratio Terra / Aqua in the drift years (2023-2025) stays inside the
range it held before the drift (2003-2021), the drift has not visibly bent
Terra's count. Aqua has drifted since 2022 too, toward a later afternoon
pass, so this is a cross-check, not a ground truth.

Writes data/fire_check.json. Raw Aqua frames are cached in .cache/fire_check/.
"""

import json
import sys
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

import cv2
import numpy as np
from PIL import Image

sys.path.insert(0, str(Path(__file__).resolve().parent))
from fetch_frames import composite, get, load_rgba  # noqa: E402
from theme_defs import frame_days, gibs_url, theme_by_id  # noqa: E402

ROOT = Path(__file__).resolve().parent.parent
CACHE = ROOT / ".cache" / "fire_check"
OUT = ROOT / "data" / "fire_check.json"
AQUA = "MODIS_Aqua_Thermal_Anomalies_All"
BEFORE = range(2003, 2022)   # both satellites in formation
DRIFT = range(2023, 2026)    # Terra drifting


def clusters(rgba):
    opaque = (rgba[..., 3] > 0).astype(np.uint8)
    return cv2.connectedComponents(opaque, connectivity=8)[0] - 1


def aqua_frame(theme, start):
    path = CACHE / f"{start.isoformat()}.png"
    if not path.exists():
        days = [load_rgba(get(gibs_url(AQUA, d))) for d in frame_days(theme, start)]
        Image.fromarray(composite(days, theme["composite"])).save(path, optimize=True)
    return np.array(Image.open(path).convert("RGBA"))


def main():
    CACHE.mkdir(parents=True, exist_ok=True)
    theme = theme_by_id("wildfires")
    starts = [d for d in theme["frame_dates"] if d.year >= 2003]   # Aqua's record starts mid-2002
    with ThreadPoolExecutor(max_workers=4) as pool:
        aqua = dict(zip([d.year for d in starts], pool.map(lambda d: clusters(aqua_frame(theme, d)), starts)))
    terra = {}
    for d in starts:
        f = json.loads((ROOT / "data" / "features" / "wildfires" / f"{d.isoformat()}.json").read_text())
        terra[d.year] = f["physical"]["clusters"]

    rows = [{"year": y, "terra": terra[y], "aqua": aqua[y], "ratio": round(terra[y] / aqua[y], 3)} for y in sorted(aqua)]
    before = np.array([r["ratio"] for r in rows if r["year"] in BEFORE])
    drift = [r for r in rows if r["year"] in DRIFT]
    lo, hi = float(before.min()), float(before.max())
    inside = all(lo <= r["ratio"] <= hi for r in drift)
    t, a = np.array([terra[y] for y in sorted(aqua)]), np.array([aqua[y] for y in sorted(aqua)])

    for r in rows:
        mark = " *" if r["year"] in DRIFT else ""
        print(f"{r['year']}  Terra {r['terra']:4d}  Aqua {r['aqua']:4d}  ratio {r['ratio']:.3f}{mark}")
    print(f"\nratio before the drift (2003-2021): {before.mean():.3f} (range {lo:.3f}-{hi:.3f})")
    print("drift years: " + ", ".join(f"{r['year']} {r['ratio']:.3f}" for r in drift))
    print(f"year-to-year r(Terra, Aqua) = {np.corrcoef(t, a)[0, 1]:.2f}")
    print("verdict:", "inside the pre-drift range" if inside else "OUTSIDE the pre-drift range")

    OUT.write_text(json.dumps({
        "method": "Separate fire areas (8-connected clusters of opaque pixels) in the same 8-day mid-August union "
                  "composite at 1024x512, from GIBS layers MODIS_Terra_Thermal_Anomalies_All and "
                  f"{AQUA}.",
        "before": {"years": [BEFORE.start, BEFORE.stop - 1], "meanRatio": round(float(before.mean()), 3),
                   "minRatio": round(lo, 3), "maxRatio": round(hi, 3)},
        "drift": [{"year": r["year"], "ratio": r["ratio"]} for r in drift],
        "insidePreDriftRange": inside,
        "yearToYearR": round(float(np.corrcoef(t, a)[0, 1]), 3),
        "years": rows,
    }, indent=1) + "\n", encoding="utf-8")


if __name__ == "__main__":
    main()
