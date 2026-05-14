import re
import sys
import requests

INVIDIOUS_INSTANCES = [
    "https://inv.nadeko.net",
    "https://invidious.fdn.fr",
    "https://yt.artemislena.eu",
    "https://iv.datura.network",
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


def _try_instance(instance: str, video_id: str, language: str) -> dict | None:
    try:
        # Get caption list
        r = requests.get(
            f"{instance}/api/v1/captions/{video_id}",
            timeout=8,
            headers={"User-Agent": "Mozilla/5.0"},
        )
        if not r.ok:
            return None
        data = r.json()
        captions = data.get("captions", [])
        if not captions:
            return None

        # Pick best caption track
        label = None
        if language and language != "auto":
            for c in captions:
                if c.get("languageCode", "").startswith(language):
                    label = c["label"]
                    break
        if not label:
            # prefer auto-generated in any language
            for c in captions:
                label = c["label"]
                break

        if not label:
            return None

        # Fetch VTT content
        vtt_r = requests.get(
            f"{instance}/api/v1/captions/{video_id}",
            params={"label": label},
            timeout=10,
            headers={"User-Agent": "Mozilla/5.0"},
        )
        if not vtt_r.ok:
            return None

        segments = _parse_vtt(vtt_r.text)
        if not segments:
            return None

        lang_code = next(
            (c.get("languageCode", "unknown") for c in captions if c["label"] == label),
            "unknown",
        )
        return {
            "text": " ".join(s["text"] for s in segments),
            "language": lang_code,
            "segments": segments,
        }
    except Exception as e:
        print(f"[youtube_transcript] {instance} failed: {e}", file=sys.stderr)
        return None


def fetch_youtube_transcript(url: str, language: str = "auto") -> dict | None:
    video_id = _extract_video_id(url)
    if not video_id:
        return None

    for instance in INVIDIOUS_INSTANCES:
        result = _try_instance(instance, video_id, language)
        if result:
            print(f"[youtube_transcript] success via {instance}", file=sys.stderr)
            return result

    print("[youtube_transcript] all instances failed", file=sys.stderr)
    return None
