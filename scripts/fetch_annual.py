"""Download the frames behind Terra Vox's yearly averages.

    python scripts/fetch_annual.py                 # all four themes
    python scripts/fetch_annual.py greenhouse_gases

One window a year (one August month of methane, three March days of NO2,
eight August days of fire) can be unrepresentative, so each year is now an
average over many windows. This script only downloads; build_annual.py
turns the frames into yearly values and pictures.

Writes (ignored by git, rebuildable)
    data/raw_frames/_annual/<theme>/<YYYY-MM-DD>.png
    .cache/reference/omi_no2/<YYYY-MM-DD>.png        (Air Quality, shared with
                                                     fetch_reference.py)

    Greenhouse Gases  every AIRS monthly methane layer, Jan 2003 to the
                      latest month GIBS has (12 a year; the current year is
                      partial and is labelled so)
    Sea Level Change  the JPL MEaSUREs 5-day grid date nearest the 15th of
                      every month, 1993-2018 (12 a year)
    Wildfires         fifteen 8-day MODIS Terra composites a year, June 1 to
                      September 27, 2001-2026 (the northern fire season); each
                      composite is the union of its eight days, as before
    Air Quality       OMI NO2 on the 14th-16th of every month, 2005-2025, at
                      0.5 degrees (12 three-day composites a year)
"""

import io
import shutil
import sys
import time
from concurrent.futures import ThreadPoolExecutor
from datetime import date, timedelta
from pathlib import Path

import numpy as np
import requests
from PIL import Image

sys.path.insert(0, str(Path(__file__).resolve().parent))
from theme_defs import gibs_url, theme_by_id  # noqa: E402

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "data" / "raw_frames" / "_annual"
OMI_CACHE = ROOT / ".cache" / "reference" / "omi_no2"
NO2_W, NO2_H = 720, 360

session = requests.Session()
session.headers["User-Agent"] = "TerraVox/0.2 (NASA Space Apps 2026; github.com/demondarkness010-web/terra-vox)"


def fetch_png(url, attempts=4):
    """PNG bytes, or None when GIBS has no data for that date (it answers with XML)."""
    for i in range(attempts):
        try:
            r = session.get(url, timeout=90)
            if r.status_code == 200 and r.content.startswith(b"\x89PNG"):
                return r.content
            if r.status_code == 200:
                return None   # ServiceException: no imagery for this TIME
        except requests.RequestException:
            pass
        time.sleep(2 * (i + 1))
    raise RuntimeError(f"failed after {attempts} attempts: {url}")


# ------------------------------------------------------------ the windows

def methane_months():
    today = date.today()
    return [date(y, m, 1) for y in range(2003, today.year + 1) for m in range(1, 13) if date(y, m, 1) < today]


def ssh_months():
    origin = date(1992, 9, 30)
    out = []
    for y in range(1993, 2019):
        for m in range(1, 13):
            steps = round((date(y, m, 15) - origin).days / 5)
            out.append(origin + timedelta(days=5 * steps))
    return out


FIRE_WINDOWS = 15   # 8-day composites from June 1: the last ends September 27


def fire_windows():
    return [date(y, 6, 1) + timedelta(days=8 * k) for y in range(2001, 2027) for k in range(FIRE_WINDOWS)]


def no2_days():
    return [date(y, m, d) for y in range(2005, 2026) for m in range(1, 13) for d in (14, 15, 16)]


WINDOWS = {
    "greenhouse_gases": methane_months,
    "sea_level": ssh_months,
    "wildfires": fire_windows,
    "air_quality": no2_days,
}


# ------------------------------------------------------------ download

def one_simple(theme, day):
    path = OUT / theme["id"] / f"{day.isoformat()}.png"
    miss = path.with_suffix(".none")
    if path.exists() or miss.exists():
        return path.exists()
    data = fetch_png(gibs_url(theme["layer"], day))
    if data is None:
        miss.touch()
        return False
    path.write_bytes(data)
    return True


def one_fire(theme, start):
    path = OUT / theme["id"] / f"{start.isoformat()}.png"
    if path.exists():
        return True
    out = None
    for i in range(8):
        data = fetch_png(gibs_url(theme["layer"], start + timedelta(days=i)))
        if data is None:
            continue
        rgba = np.array(Image.open(io.BytesIO(data)).convert("RGBA"))
        if out is None:
            out = rgba
        else:
            empty = out[..., 3] == 0
            out[empty] = rgba[empty]
    if out is None:
        return False
    Image.fromarray(out).save(path, optimize=True)
    return True


def one_no2(theme, day):
    path = OMI_CACHE / f"{day.isoformat()}.png"
    miss = path.with_suffix(".none")
    if path.exists() or miss.exists():
        return path.exists()
    data = fetch_png(gibs_url(theme["layer"], day, width=NO2_W, height=NO2_H))
    if data is None:
        miss.touch()
        return False
    path.write_bytes(data)
    return True


MIN_FREE = 300 * 2**20   # stop rather than fill the disk


def fetch(theme_id):
    if shutil.disk_usage(ROOT).free < MIN_FREE:
        raise SystemExit(f"less than {MIN_FREE >> 20} MB free on the disk: stopping")
    theme = theme_by_id(theme_id)
    (OUT / theme_id).mkdir(parents=True, exist_ok=True)
    OMI_CACHE.mkdir(parents=True, exist_ok=True)
    days = WINDOWS[theme_id]()
    fn = {"wildfires": one_fire, "air_quality": one_no2}.get(theme_id, one_simple)
    got, t0 = 0, time.time()
    with ThreadPoolExecutor(6) as pool:
        for i, ok in enumerate(pool.map(lambda d: fn(theme, d), days), 1):
            got += bool(ok)
            if i % 50 == 0 and shutil.disk_usage(ROOT).free < MIN_FREE:
                raise SystemExit(f"less than {MIN_FREE >> 20} MB free on the disk: stopping")
            if i % 50 == 0 or i == len(days):
                print(f"  {theme_id}: {i}/{len(days)} windows, {got} with data, {time.time() - t0:.0f}s", flush=True)


def main():
    ids = sys.argv[1:] or list(WINDOWS)
    for tid in ids:
        fetch(tid)


if __name__ == "__main__":
    main()
