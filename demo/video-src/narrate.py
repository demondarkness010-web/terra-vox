"""Generate the narration with the chosen ElevenLabs voice (one call per line).

Provider: ElevenLabs direct API (tool equivalent: elevenlabs_tts)
Voice:    2oMnzJn2otqHVjyCboYJ   Model: eleven_multilingual_v2
Reads ELEVENLABS_API_KEY from the environment or OpenMontage/.env (never printed).
Writes vo/<id>.mp3 and vo/durations.json. Skips lines that already exist (use --force).
"""
import json, os, subprocess, sys, urllib.request, urllib.error
from pathlib import Path

sys.path.insert(0, os.path.dirname(__file__))
import video_plan as P

VO = Path(P.S) / "vo"
VO.mkdir(exist_ok=True)


def key():
    k = os.environ.get("ELEVENLABS_API_KEY", "").strip()
    if k:
        return k
    env = Path(r"C:\Users\vaibh\OpenMontage\.env")
    if env.exists():
        for line in env.read_text(encoding="utf-8", errors="ignore").splitlines():
            if line.startswith("ELEVENLABS_API_KEY="):
                return line.split("=", 1)[1].strip().strip("\"'")
    return ""


def speak(text, k):
    body = json.dumps({"text": text, "model_id": P.MODEL_ID, "voice_settings": P.VOICE_SETTINGS}).encode()
    req = urllib.request.Request(
        f"https://api.elevenlabs.io/v1/text-to-speech/{P.VOICE_ID}?output_format=mp3_44100_128",
        data=body, method="POST",
        headers={"xi-api-key": k, "Content-Type": "application/json", "Accept": "audio/mpeg"})
    with urllib.request.urlopen(req, timeout=120) as r:
        return r.read()


def duration(path):
    out = subprocess.run(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", str(path)],
                         capture_output=True, text=True).stdout.strip()
    return float(out)


def main():
    force = "--force" in sys.argv
    k = key()
    if not k:
        print("NO KEY: ELEVENLABS_API_KEY is empty. Add it to C:\\Users\\vaibh\\OpenMontage\\.env, then run again.")
        return 2
    durs = {}
    for lid, text in P.LINES.items():
        f = VO / f"{lid}.mp3"
        if force or not f.exists():
            try:
                f.write_bytes(speak(text, k))
            except urllib.error.HTTPError as e:
                msg = e.read().decode("utf-8", "ignore")[:300]
                print(f"{lid}: HTTP {e.code} {msg}")
                if e.code in (401, 403):
                    print("The key was refused. Check it, and that your plan allows this voice through the API.")
                if e.code == 402:
                    print("ElevenLabs says this voice needs a paid plan (Voice Library voices are blocked on the free tier).")
                if e.code == 404:
                    print("The voice id was not found in your ElevenLabs account: add it to My Voices first.")
                return 1
        durs[lid] = round(duration(f), 3)
        print(f"{lid}: {durs[lid]:.2f}s  {len(text.split())} words")
    (VO / "durations.json").write_text(json.dumps(durs, indent=1))
    print(f"total narration: {sum(durs.values()):.1f}s")
    return 0


if __name__ == "__main__":
    sys.exit(main())
