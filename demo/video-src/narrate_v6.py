"""Makes the eight narrator files for build_v6.py with an ElevenLabs voice.

Run it yourself, on your own computer, with your own ElevenLabs key. The key is read from the
ELEVENLABS_API_KEY environment variable or from the line ELEVENLABS_API_KEY=... in OpenMontage/.env,
and is never printed or written anywhere.

    python narrate_v6.py [voice id]          (default voice: 2oMnzJn2otqHVjyCboYJ)

Writes vo6/L1_eleven.mp3 ... L8_eleven.mp3. Note: ElevenLabs may refuse Voice Library voices over the API on
the free plan (error 402 or 403). Then either upgrade, or make the eight files on the ElevenLabs website
(see docs/narration-script.md) and save them under the same names.
"""
import json, os, re, sys, urllib.error, urllib.request
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
VOICE_ID = sys.argv[1] if len(sys.argv) > 1 else "2oMnzJn2otqHVjyCboYJ"
LINES = [
    ("L1", "Close your eyes. This is Earth in 2003."),
    ("L2", "Now. This is 2026."),
    ("L3", "One year in each ear. That gap? Twenty-three years of methane."),
    ("L4", "How? Satellite colours become real numbers, and every number becomes a note."),
    ("L5", "Sea level rose seven point six centimetres. Hear the bass climb."),
    ("L6", "It matches NOAA's own records."),
    ("L7", "Three hundred thirty-eight million people can't read a chart. Now they can hear one."),
    ("L8", "Terra Vox. Press play."),
]
SETTINGS = {"stability": 0.45, "similarity_boost": 0.8, "style": 0.25, "use_speaker_boost": True}


def key():
    k = os.environ.get("ELEVENLABS_API_KEY", "").strip()
    if k:
        return k
    env = Path.home() / "OpenMontage" / ".env"
    if env.exists():
        for line in env.read_text(encoding="utf-8", errors="ignore").splitlines():
            if line.startswith("ELEVENLABS_API_KEY="):
                return line.split("=", 1)[1].strip().strip("\"'")
    return ""


def main():
    k = key()
    if not k:
        sys.exit("No ELEVENLABS_API_KEY found (environment variable or OpenMontage/.env).")
    out = HERE / "vo6"
    out.mkdir(exist_ok=True)
    for lid, text in LINES:
        body = json.dumps({"text": text, "model_id": "eleven_multilingual_v2", "voice_settings": SETTINGS}).encode()
        req = urllib.request.Request(f"https://api.elevenlabs.io/v1/text-to-speech/{VOICE_ID}?output_format=mp3_44100_128", data=body, method="POST",
                                     headers={"xi-api-key": k, "Content-Type": "application/json", "Accept": "audio/mpeg"})
        try:
            with urllib.request.urlopen(req, timeout=120) as r:
                (out / f"{lid}_eleven.mp3").write_bytes(r.read())
            print(lid, "ok")
        except urllib.error.HTTPError as e:
            msg = e.read().decode("utf-8", "ignore")[:300]
            sys.exit(f"{lid}: ElevenLabs answered {e.code}. {msg}\nIf this is 402/403 the voice needs a paid plan; see docs/narration-script.md for the website route.")


if __name__ == "__main__":
    main()
