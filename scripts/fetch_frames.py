"""Download the NASA frames for the four locked Terra Vox themes.

Run once, offline from the demo:

    python scripts/fetch_frames.py            # all themes
    python scripts/fetch_frames.py wildfires  # one theme
    python scripts/fetch_frames.py --force    # re-download everything

Writes
    data/raw_frames/<theme>/<YYYY-MM-DD>.png   one transparent data-layer frame
    data/raw_frames/<theme>/manifest.json      every source URL, for provenance
    data/raw_frames/_base/*.png                basemap + coastlines (display only)
    assets/thumbnails/<theme>.jpg              the theme's NASA EIC cover image

Frames come from NASA GIBS, the imagery service behind NASA Worldview. The
EIC gallery on svs.gsfc.nasa.gov publishes its visualizations as undated
HDR (EXR) frame sequences spanning a single year, so it cannot give an
oldest-vs-newest pair; we pull the same instruments' imagery by date from
GIBS instead and use the EIC pages for cover art and context.
"""

import argparse
import io
import json
import sys
import time
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

import numpy as np
import requests
from PIL import Image

sys.path.insert(0, str(Path(__file__).resolve().parent))
from theme_defs import BASE_LAYERS, THEMES, frame_days, frame_label, gibs_url  # noqa: E402

ROOT = Path(__file__).resolve().parent.parent
RAW = ROOT / "data" / "raw_frames"
THUMBS = ROOT / "assets" / "thumbnails"

session = requests.Session()
session.headers["User-Agent"] = "TerraVox/0.1 (NASA Space Apps 2026; github.com/demondarkness010-web/terra-vox)"


def get(url, expect_image=True, attempts=4):
    for i in range(attempts):
        try:
            r = session.get(url, timeout=60)
            ctype = r.headers.get("content-type", "")
            if r.status_code == 200 and (not expect_image or ctype.startswith("image/")):
                return r.content
            # GIBS answers bad requests with an XML ServiceException and HTTP 200.
            reason = f"HTTP {r.status_code} {ctype} {r.text[:160]!r}"
        except requests.RequestException as e:
            reason = repr(e)
        time.sleep(1.5 * (i + 1))
    raise RuntimeError(f"failed after {attempts} attempts: {url}\n  last error: {reason}")


def load_rgba(png_bytes):
    return np.array(Image.open(io.BytesIO(png_bytes)).convert("RGBA"))


def composite(days_rgba, method):
    """Merge several days of one layer into a single frame.

    union / first_valid: per pixel, keep the first day that has data there.
    For the fire layer every opaque pixel is the same kind of mark, so this is
    the union of all detections; for NO2 it is a standard gap-filling mosaic.
    """
    if method == "single" or len(days_rgba) == 1:
        return days_rgba[0]
    out = days_rgba[0].copy()
    for img in days_rgba[1:]:
        empty = out[..., 3] == 0
        out[empty] = img[empty]
    return out


def fetch_theme(theme, force=False):
    tdir = RAW / theme["id"]
    tdir.mkdir(parents=True, exist_ok=True)
    manifest = {"theme": theme["id"], "layer": theme["layer"], "dataset": theme["dataset"],
                "composite": theme["composite"], "frames": []}

    def one(start):
        out_path = tdir / f"{start.isoformat()}.png"
        days = frame_days(theme, start)
        urls = [gibs_url(theme["layer"], d) for d in days]
        if force or not out_path.exists():
            frames = [load_rgba(get(u)) for u in urls]
            Image.fromarray(composite(frames, theme["composite"])).save(out_path, optimize=True)
        return {
            "date": start.isoformat(),
            "label": frame_label(theme, start),
            "days": [d.isoformat() for d in days],
            "file": f"data/raw_frames/{theme['id']}/{out_path.name}",
            "source_urls": urls,
        }

    with ThreadPoolExecutor(max_workers=4) as pool:
        manifest["frames"] = list(pool.map(one, theme["frame_dates"]))

    # The published GIBS colormap lets extract_features.py turn each pixel's
    # colour back into the physical value it encodes (ppb, metres, molecules/cm2).
    if theme["colormap"]:
        cm_path = tdir / "colormap.xml"
        if force or not cm_path.exists():
            cm_path.write_bytes(get(theme["colormap"], expect_image=False))
        manifest["colormap"] = theme["colormap"]

    (tdir / "manifest.json").write_text(json.dumps(manifest, indent=2))
    print(f"  {theme['id']}: {len(manifest['frames'])} frames "
          f"({manifest['frames'][0]['date']} .. {manifest['frames'][-1]['date']})")


def fetch_bases(force=False):
    bdir = RAW / "_base"
    bdir.mkdir(parents=True, exist_ok=True)
    for name, layer in BASE_LAYERS.items():
        p = bdir / f"{name}.png"
        if force or not p.exists():
            Image.fromarray(load_rgba(get(gibs_url(layer)))).save(p, optimize=True)
    print(f"  basemaps: {', '.join(BASE_LAYERS)}")


def fetch_thumbnails(themes, force=False):
    THUMBS.mkdir(parents=True, exist_ok=True)
    for theme in themes:
        p = THUMBS / f"{theme['id']}.jpg"
        if force or not p.exists():
            try:
                img = Image.open(io.BytesIO(get(theme["eic"]["thumbnail"]))).convert("RGB")
            except RuntimeError as e:
                print(f"  ! EIC thumbnail for {theme['id']} unavailable, tile will use its first frame: {e}")
                continue
            img.thumbnail((640, 640))
            img.save(p, quality=85, optimize=True)
    print("  EIC thumbnails done")


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("themes", nargs="*", help="theme ids (default: all four)")
    ap.add_argument("--force", action="store_true", help="re-download files that already exist")
    args = ap.parse_args()

    themes = [t for t in THEMES if not args.themes or t["id"] in args.themes]
    if not themes:
        ap.error(f"unknown theme; choose from {[t['id'] for t in THEMES]}")

    print("Fetching NASA GIBS frames ->", RAW)
    fetch_bases(args.force)
    for theme in themes:
        fetch_theme(theme, args.force)
    fetch_thumbnails(themes, args.force)


if __name__ == "__main__":
    main()
