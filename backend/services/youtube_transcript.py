import re
from youtube_transcript_api import YouTubeTranscriptApi, NoTranscriptFound, TranscriptsDisabled


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


def fetch_youtube_transcript(url: str, language: str = "auto") -> dict | None:
    """
    Try to fetch YouTube's built-in transcript. Returns None if unavailable.
    Result matches the TranscriptResult format used by the rest of the app.
    """
    video_id = _extract_video_id(url)
    if not video_id:
        return None

    try:
        transcript_list = YouTubeTranscriptApi.list_transcripts(video_id)

        transcript = None
        detected_lang = "unknown"

        if language and language != "auto":
            # Try requested language first, then any
            try:
                transcript = transcript_list.find_transcript([language])
                detected_lang = language
            except NoTranscriptFound:
                pass

        if transcript is None:
            # Pick the first available (manual preferred, then generated)
            try:
                transcript = transcript_list.find_manually_created_transcript(
                    [t.language_code for t in transcript_list]
                )
            except NoTranscriptFound:
                transcript = transcript_list.find_generated_transcript(
                    [t.language_code for t in transcript_list]
                )
            detected_lang = transcript.language_code

        entries = transcript.fetch()

        segments = []
        for i, entry in enumerate(entries):
            start = round(float(entry["start"]), 3)
            duration = round(float(entry.get("duration", 0)), 3)
            end = round(start + duration, 3)
            text = entry["text"].strip()
            segments.append({
                "id": i,
                "start": start,
                "end": end,
                "start_formatted": _format_time(start),
                "end_formatted": _format_time(end),
                "text": text,
                "words": [],
            })

        full_text = " ".join(s["text"] for s in segments)
        return {
            "text": full_text,
            "language": detected_lang,
            "segments": segments,
        }

    except (NoTranscriptFound, TranscriptsDisabled):
        return None
    except Exception:
        return None
