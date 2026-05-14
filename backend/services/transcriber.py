import os
import re
import subprocess
import sys
import time
from groq import Groq
from typing import Optional


def _retry(fn, retries=3, delay=2):
    for attempt in range(retries):
        try:
            return fn()
        except Exception as e:
            if attempt == retries - 1:
                raise
            print(f"[retry] attempt {attempt + 1} failed: {e}, retrying in {delay}s...", file=sys.stderr)
            time.sleep(delay)

MAX_GROQ_BYTES = 24 * 1024 * 1024


def format_timestamp(seconds: float) -> str:
    h = int(seconds // 3600)
    m = int((seconds % 3600) // 60)
    s = seconds % 60
    if h > 0:
        return f"{h:02d}:{m:02d}:{s:06.3f}"
    return f"{m:02d}:{s:06.3f}"


def _get(obj, key, default=None):
    if isinstance(obj, dict):
        return obj.get(key, default)
    return getattr(obj, key, default)


def compress_audio_if_needed(audio_path: str) -> str:
    if os.path.getsize(audio_path) <= MAX_GROQ_BYTES:
        return audio_path
    compressed = audio_path + "_compressed.mp3"
    subprocess.run(
        ["ffmpeg", "-y", "-i", audio_path, "-b:a", "64k", compressed],
        check=True, capture_output=True,
    )
    return compressed


def refine_text(text: str, language: str, api_key: str) -> str:
    """Post-process full transcript text with LLaMA."""
    client = Groq(api_key=api_key)
    response = client.chat.completions.create(
        model="llama-3.1-8b-instant",
        messages=[{
            "role": "user",
            "content": (
                f"You are a professional transcript editor. Language: {language}.\n\n"
                f"Fix the transcript below:\n"
                f"1. Correct proper nouns: names of people, sports clubs, cities, brands "
                f"based on context (e.g. 'Geeks' → 'Giggs', 'Van Persie' → 'van Persie')\n"
                f"2. Fix punctuation and capitalization\n"
                f"3. Keep numbers as digits\n"
                f"4. Never change the meaning, never add or remove sentences\n\n"
                f"Return ONLY the corrected text, no explanation.\n\n"
                f"{text}"
            ),
        }],
        temperature=0.1,
        max_tokens=4096,
    )
    return response.choices[0].message.content.strip()


def transcribe_audio(audio_path: str, api_key: str, language: Optional[str] = None) -> dict:
    audio_path = compress_audio_if_needed(audio_path)
    client = Groq(api_key=api_key)

    options: dict = {
        "model": "whisper-large-v3-turbo",
        "response_format": "verbose_json",
        "timestamp_granularities": ["segment", "word"],
    }
    if language and language != "auto":
        options["language"] = language

    with open(audio_path, "rb") as f:
        audio_bytes = f.read()
    result = _retry(lambda: client.audio.transcriptions.create(
        file=(os.path.basename(audio_path), audio_bytes), **options
    ))

    raw_segments = _get(result, "segments") or []
    raw_words = _get(result, "words") or []

    segments = []
    seg_list = list(raw_segments)
    word_list = list(raw_words)

    for i, seg in enumerate(seg_list):
        seg_start = _get(seg, "start", 0.0)
        seg_end = _get(seg, "end", 0.0)
        seg_text = (_get(seg, "text") or "").strip()

        words = []
        for w in word_list:
            w_start = _get(w, "start", 0.0)
            if seg_start <= w_start < seg_end:
                words.append({
                    "word": _get(w, "word", ""),
                    "start": round(w_start, 3),
                    "end": round(_get(w, "end", w_start), 3),
                    "probability": 1.0,
                })

        segments.append({
            "id": i,
            "start": round(seg_start, 3),
            "end": round(seg_end, 3),
            "start_formatted": format_timestamp(seg_start),
            "end_formatted": format_timestamp(seg_end),
            "text": seg_text,
            "words": words,
        })

    detected_language = _get(result, "language") or "unknown"
    raw_text = " ".join(s["text"] for s in segments)

    # LLM post-processing: fix proper nouns, numbers, punctuation
    log_path = os.path.join(os.path.dirname(__file__), "..", "refine_debug.txt")
    try:
        print(f"[refine] Calling LLM, text length={len(raw_text)}", file=sys.stderr)
        refined_text = _retry(lambda: refine_text(raw_text, detected_language, api_key))
        with open(log_path, "w", encoding="utf-8") as f:
            f.write(f"RAW:\n{raw_text}\n\nREFINED:\n{refined_text}\n")
        print(f"[refine] Done, refined length={len(refined_text)}", file=sys.stderr)
    except Exception as e:
        print(f"[refine] LLM error: {e}", file=sys.stderr)
        with open(log_path, "w", encoding="utf-8") as f:
            f.write(f"ERROR: {e}\n\nRAW:\n{raw_text}\n")
        refined_text = raw_text

    return {
        "text": refined_text,
        "language": detected_language,
        "segments": segments,
    }
