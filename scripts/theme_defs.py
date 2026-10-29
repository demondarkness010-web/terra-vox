"""The four locked Terra Vox themes and where their frames come from.

Shared by fetch_frames.py and extract_features.py so the download step and
the feature step can never disagree about dates, layers or "active" rules.

Every theme is a yearly series of global, equirectangular NASA GIBS frames
(the imagery service behind NASA Worldview). Sampling the same calendar
window every year removes the seasonal cycle, so frame-to-frame change is
year-over-year change, which is the thing Duet mode is about.
"""

from datetime import date, timedelta

GIBS_WMS = "https://gibs.earthdata.nasa.gov/wms/epsg4326/best/wms.cgi"

# Static layers used only to draw the human-viewable display frames.
# Feature extraction never sees them: features come from the data layer alone.
BASE_LAYERS = {
    "black_marble": "VIIRS_Black_Marble",
    "coastlines": "Coastlines_15m",
}

FRAME_WIDTH = 1024
FRAME_HEIGHT = 512


def _yearly(years, month, day):
    return [date(y, month, day) for y in years]


def _ssh_dates():
    # JPL MEaSUREs SSH anomalies sit on a fixed 5-day grid starting 1992-09-30.
    # Take the grid date nearest 1 October of each year.
    origin = date(1992, 9, 30)
    out = []
    for y in range(1992, 2019):
        target = date(y, 10, 1)
        steps = round((target - origin).days / 5)
        out.append(origin + timedelta(days=5 * steps))
    return out


THEMES = [
    {
        "id": "wildfires",
        "name": "Wildfires",
        "signature": "spiky, event-driven",
        "layer": "MODIS_Terra_Thermal_Anomalies_All",
        "dataset": "MODIS Terra Thermal Anomalies and Fires (day + night)",
        "instrument": "MODIS / Terra",
        "units_note": "each orange dot is a satellite-detected active fire",
        # Peak northern fire season, one 8-day composite per year.
        "frame_dates": _yearly(range(2001, 2026), 8, 8),
        "composite_days": 8,
        "composite": "union",  # a fire seen on any of the 8 days counts
        "label_fmt": "{start:%b %d}-{end:%d}, {year}",
        # Transparent pixels mean "no fire detected" which is real data, so the
        # whole planet is the valid domain and every opaque pixel is active.
        "valid_domain": "frame",
        "active_rule": {"kind": "opaque"},
        "colormap": None,
        "physical": {"label": "fire detections", "units": "% of map"},
        "eic": {
            "dashboard": "https://svs.gsfc.nasa.gov/gallery/wildland-fires/",
            "visualization": "https://svs.gsfc.nasa.gov/5113/",
            "thumbnail": "https://svs.gsfc.nasa.gov/vis/a000000/a005100/a005113/fires_frp_VIIRS.892_print.jpg",
        },
    },
    {
        "id": "sea_level",
        "name": "Sea Level Change",
        "signature": "slow, monotonic",
        "layer": "JPL_MEaSUREs_L4_Sea_Surface_Height_Anomalies",
        "dataset": "JPL MEaSUREs Gridded Sea Surface Height Anomalies (TOPEX/Poseidon, Jason-1/2/3)",
        "instrument": "Satellite radar altimetry",
        "units_note": "warmer colours mean the sea surface sits higher than the 20-year mean",
        "frame_dates": _ssh_dates(),
        "composite_days": 1,
        "composite": "single",
        "label_fmt": "{start:%b %d}, {year}",
        "valid_domain": "opaque",  # land and polar gaps carry no ocean data
        # "Active" = ocean standing at least 10 cm above the 1993-2012 mean.
        "active_rule": {"kind": "value_at_least", "value": 0.10},
        "colormap": "https://gibs.earthdata.nasa.gov/colormaps/v1.3/MEaSUREs_Sea_Surface_Height_Anomalies.xml",
        "physical": {"label": "mean sea surface height anomaly", "units": "cm", "scale": 100.0, "digits": 1},
        "eic": {
            "dashboard": "https://svs.gsfc.nasa.gov/gallery/climate-vital-signs-dashboard/",
            "visualization": "https://svs.gsfc.nasa.gov/5235/",
            "thumbnail": "https://svs.gsfc.nasa.gov/vis/a000000/a005200/a005235/seaLevelWaveTankComp_noWW_3-5-5-2024a.01500_print.jpg",
        },
    },
    {
        "id": "air_quality",
        "name": "Air Quality",
        "signature": "noisy, daily-fluctuating",
        "layer": "OMI_Nitrogen_Dioxide_Tropo_Column",
        "dataset": "OMI Tropospheric Nitrogen Dioxide (NO2) Column, daily",
        "instrument": "OMI / Aura",
        "units_note": "darker orange and red mark heavier NO2 pollution",
        # A 3-day gap-filling mosaic around the March equinox keeps the daily
        # weather noise (that is this theme's signature) while filling the
        # swath gaps that a single OMI day leaves.
        "frame_dates": _yearly(range(2005, 2026), 3, 15),
        "composite_days": 3,
        "composite": "first_valid",
        "label_fmt": "{start:%b %d}-{end:%d}, {year}",
        "valid_domain": "opaque",
        # "Active" = polluted air: tropospheric NO2 above 5 x 10^15 molecules/cm2.
        "active_rule": {"kind": "value_at_least", "value": 5e15},
        "colormap": "https://gibs.earthdata.nasa.gov/colormaps/v1.3/OMI_Nitrogen_Dioxide_Tropo_Column.xml",
        "physical": {"label": "mean tropospheric NO2", "units": "x10^15 molecules/cm2", "scale": 1e-15, "digits": 2},
        "eic": {
            "dashboard": "https://svs.gsfc.nasa.gov/gallery/air-quality-dashboard/",
            "visualization": "https://svs.gsfc.nasa.gov/5175/",
            "thumbnail": "https://svs.gsfc.nasa.gov/vis/a000000/a005100/a005175/tempo_no2_north-america.02402_print.jpg",
        },
    },
    {
        "id": "greenhouse_gases",
        "name": "Greenhouse Gases",
        "signature": "smooth, trending",
        "layer": "AIRS_L3_Methane_400hPa_Volume_Mixing_Ratio_Monthly_Day",
        "dataset": "AIRS Methane (CH4) at 400 hPa, monthly mean",
        "instrument": "AIRS / Aqua",
        "units_note": "deeper red means more methane in the mid-troposphere",
        "frame_dates": _yearly(range(2003, 2027), 8, 1),
        "composite_days": 1,
        "composite": "single",
        "label_fmt": "{start:%B} {year}",
        "valid_domain": "opaque",
        # "Active" = air holding at least 1,900 ppb of methane at 400 hPa.
        "active_rule": {"kind": "value_at_least", "value": 1900.0},
        "colormap": "https://gibs.earthdata.nasa.gov/colormaps/v1.3/AIRS_Methane_Volume_Mixing_Ratio.xml",
        "physical": {"label": "mean methane at 400 hPa", "units": "ppb", "scale": 1.0, "digits": 0},
        "eic": {
            "dashboard": "https://svs.gsfc.nasa.gov/gallery/greenhouse-gases-dashboard/",
            "visualization": "https://svs.gsfc.nasa.gov/5116/",
            "thumbnail": "https://svs.gsfc.nasa.gov/vis/a000000/a005100/a005116/TotalCH4_Volume_1920x1920.00080_print.jpg",
        },
    },
]


def theme_by_id(theme_id):
    for t in THEMES:
        if t["id"] == theme_id:
            return t
    raise KeyError(theme_id)


def frame_days(theme, start):
    """The calendar days that feed one frame (1 for single, N for composites)."""
    return [start + timedelta(days=i) for i in range(theme["composite_days"])]


def frame_label(theme, start):
    days = frame_days(theme, start)
    return theme["label_fmt"].format(start=days[0], end=days[-1], year=start.year)


def gibs_url(layer, day=None, width=FRAME_WIDTH, height=FRAME_HEIGHT, fmt="image/png"):
    params = {
        "SERVICE": "WMS",
        "REQUEST": "GetMap",
        "VERSION": "1.1.1",
        "SRS": "EPSG:4326",
        "BBOX": "-180,-90,180,90",
        "WIDTH": str(width),
        "HEIGHT": str(height),
        "FORMAT": fmt,
        "TRANSPARENT": "TRUE",
        "STYLES": "",
        "LAYERS": layer,
    }
    if day is not None:
        params["TIME"] = day.isoformat()
    query = "&".join(f"{k}={v}" for k, v in params.items())
    return f"{GIBS_WMS}?{query}"
