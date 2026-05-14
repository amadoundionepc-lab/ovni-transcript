import os
import re
import sys
import tempfile
import requests

INVIDIOUS_INSTANCES = [
    "https://inv.thepixora.com",
    "https://inv.nadeko.net",
    "https://invidious.fdn.fr",
    "https://yt.artemislena.eu",
]


def _extract_video_id(url: str) -> str | None:
    patterns = [
        r"(?:youtube\.com/watch\?v=|youtu\.be/)([a-zA-Z0-9_-]{11})",
        r"youtube\.com/shorts/([a-zA-Z0-9_-]{11})",
        r"youtube\.com/embed/([a-zA-Z0-9_-]{11})",
    ]
    for p in patterns:
        m = re.search(p, url)
        if m:
            return m.group(1)
    return None


def _format_time(seconds: float) -> str:
    h = int(seconds // 3600)
    m = int((seconds % 3600) // 60)
    s = seconds % 60
    if h > 0:
        return f"{h:02d}:{m:02d}:{s:06.3f}"
    return f"{m:02d}:{s:06.3f}"


def _vtt_time_to_seconds(t: str) -> float:
    t = t.strip()
    parts = t.split(":")
    if len(parts) == 3:
        return int(parts[0]) * 3600 + int(parts[1]) * 60 + float(parts[2])
    elif len(parts) == 2:
        return int(parts[0]) * 60 + float(parts[1])
    return float(t)


def _parse_vtt(vtt: str) -> list:
    segments = []
    lines = vtt.strip().split("\n")
    i = 0
    seg_id = 0
    while i < len(lines):
        line = lines[i].strip()
        if "-->" in line:
            parts = line.split("-->")
            if len(parts) == 2:
                start = _vtt_time_to_seconds(parts[0].strip())
                end = _vtt_time_to_seconds(parts[1].strip().split()[0])
                text_lines = []
                i += 1
                while i < len(lines) and lines[i].strip() and "-->" not in lines[i]:
                    text = re.sub(r"<[^>]+>", "", lines[i].strip())
                    if text:
                        text_lines.append(text)
                    i += 1
                if text_lines:
                    segments.append({
                        "id": seg_id,
                        "start": round(start, 3),
                        "end": round(end, 3),
                        "start_formatted": _format_time(start),
                        "end_formatted": _format_time(end),
                        "text": " ".join(text_lines),
                        "words": [],
                    })
                    seg_id += 1
        else:
            i += 1
    return segments


def _try_invidious(video_id: str, language: str) -> dict | None:
    for instance in INVIDIOUS_INSTANCES:
        try:
            r = requests.get(
                f"{instance}/api/v1/captions/{video_id}",
                timeout=8,
                headers={"User-Agent": "Mozilla/5.0"},
            )
            if not r.ok:
                continue
            data = r.json()
            captions = data.get("captions", [])
            if not captions:
                continue

            label = None
            if language and language != "auto":
                for c in captions:
                    if c.get("languageCode", "").startswith(language):
                        label = c["label"]
                        break
            if not label:
                label = captions[0]["label"]

            vtt_r = requests.get(
                f"{instance}/api/v1/captions/{video_id}",
                params={"label": label},
                timeout=10,
                headers={"User-Agent": "Mozilla/5.0"},
            )
            if not vtt_r.ok:
                continue

            segments = _parse_vtt(vtt_r.text)
            if not segments:
                continue

            lang_code = next(
                (c.get("languageCode", "unknown") for c in captions if c["label"] == label),
                "unknown",
            )
            print(f"[youtube_transcript] invidious success via {instance}", file=sys.stderr)
            return {
                "text": " ".join(s["text"] for s in segments),
                "language": lang_code,
                "segments": segments,
            }
        except Exception as e:
            print(f"[youtube_transcript] invidious {instance} failed: {e}", file=sys.stderr)

    return None


def _try_ytdlp_subs(url: str, language: str) -> dict | None:
    """Download subtitles only via yt-dlp (no audio download) — much lighter, less blocked."""
    try:
        import yt_dlp

        with tempfile.TemporaryDirectory() as tmpdir:
            langs = [language] if language and language != "auto" else ["en", "fr", "es", "de", "pt", "ar", "zh", "ja", "ko", "ru"]
            ydl_opts = {
                "writeautomaticsub": True,
                "writesubtitles": True,
                "subtitleslangs": langs,
                "skip_download": True,
                "outtmpl": os.path.join(tmpdir, "video"),
                "quiet": True,
                "no_warnings": True,
                "extractor_args": {"youtube": {"player_client": ["tv_embedded", "ios", "android"]}},
                "http_headers": {
                    "User-Agent": "com.google.ios.youtube/19.29.1 (iPhone16,2; U; CPU iOS 17_5_1 like Mac OS X;)",
                },
            }

            with yt_dlp.YoutubeDL(ydl_opts) as ydl:
                ydl.download([url])

            for fname in os.listdir(tmpdir):
                if fname.endswith(".vtt"):
                    with open(os.path.join(tmpdir, fname), "r", encoding="utf-8") as f:
                        content = f.read()
                    segments = _parse_vtt(content)
                    if segments:
                        lang_code = fname.split(".")[-2] if fname.count(".") >= 2 else "unknown"
                        print(f"[youtube_transcript] yt-dlp subs success: {fname}", file=sys.stderr)
                        return {
                            "text": " ".join(s["text"] for s in segments),
                            "language": lang_code,
                            "segments": segments,
                        }
    except Exception as e:
        print(f"[youtube_transcript] yt-dlp subs failed: {e}", file=sys.stderr)

    return None


def fetch_youtube_transcript(url: str, language: str = "auto") -> dict | None:
    video_id = _extract_video_id(url)
    if not video_id:
        return None

    # Try Invidious first
    result = _try_invidious(video_id, language)
    if result:
        return result

    # Fallback: yt-dlp subtitle-only download
    result = _try_ytdlp_subs(url, language)
    if result:
        return result

    print("[youtube_transcript] all methods failed", file=sys.stderr)
    return None
