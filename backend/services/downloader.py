import os
import base64
import tempfile
import requests
import yt_dlp

TEMP_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "temp"))

SUPPORTED_DOMAINS = [
    "tiktok.com", "youtube.com", "youtu.be",
    "instagram.com", "facebook.com", "fb.watch",
    "twitter.com", "x.com", "vimeo.com",
]

AUDIO_EXTENSIONS = {".mp3", ".m4a", ".webm", ".ogg", ".opus", ".wav", ".mp4", ".aac"}


def is_supported_url(url: str) -> bool:
    return any(domain in url for domain in SUPPORTED_DOMAINS)


def _write_cookie_file() -> str | None:
    b64 = os.getenv("YT_COOKIES_B64", "").strip()
    if not b64:
        return None
    try:
        data = base64.b64decode(b64).decode("utf-8")
        f = tempfile.NamedTemporaryFile(mode="w", suffix=".txt", delete=False)
        f.write(data)
        f.close()
        return f.name
    except Exception:
        return None


def _download_via_cobalt(url: str, out_path: str) -> tuple[str, str] | None:
    """Use cobalt.tools API to get a direct audio URL, then download it."""
    try:
        r = requests.post(
            "https://api.cobalt.tools/",
            json={"url": url, "downloadMode": "audio", "audioFormat": "mp3"},
            headers={
                "Accept": "application/json",
                "Content-Type": "application/json",
            },
            timeout=15,
        )
        if not r.ok:
            return None
        data = r.json()
        status = data.get("status")
        audio_url = data.get("url")
        if status not in ("stream", "redirect", "tunnel") or not audio_url:
            return None

        # Download the audio from the cobalt-provided URL
        audio_r = requests.get(audio_url, timeout=60, stream=True)
        if not audio_r.ok:
            return None

        audio_path = os.path.join(out_path, "audio.mp3")
        with open(audio_path, "wb") as f:
            for chunk in audio_r.iter_content(chunk_size=1024 * 64):
                f.write(chunk)

        # Get title from cobalt filename hint
        title = data.get("filename", "video").rsplit(".", 1)[0]
        return audio_path, title
    except Exception:
        return None


def download_audio(url: str, job_id: str):
    out_path = os.path.join(TEMP_DIR, job_id)
    os.makedirs(out_path, exist_ok=True)

    is_youtube = any(d in url for d in ["youtube.com", "youtu.be"])

    # For YouTube: try cobalt.tools first (bypasses bot detection)
    if is_youtube:
        result = _download_via_cobalt(url, out_path)
        if result:
            return result

    # For all platforms: yt-dlp
    cookie_file = _write_cookie_file()

    ydl_opts = {
        "format": "bestaudio[ext=m4a]/bestaudio[ext=webm]/bestaudio[acodec!=none]/best[ext=mp4][acodec!=none]/best[acodec!=none]",
        "outtmpl": os.path.join(out_path, "audio.%(ext)s"),
        "quiet": True,
        "no_warnings": True,
        "socket_timeout": 15,
        "retries": 3,
        "concurrent_fragment_downloads": 4,
        "buffersize": 1024 * 16,
        "extractor_args": {"youtube": {"player_client": ["android", "web"]}},
        "http_headers": {
            "User-Agent": "Mozilla/5.0 (Linux; Android 11; Pixel 5) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/90.0.4430.91 Mobile Safari/537.36",
        },
    }

    if cookie_file:
        ydl_opts["cookiefile"] = cookie_file

    try:
        with yt_dlp.YoutubeDL(ydl_opts) as ydl:
            info = ydl.extract_info(url, download=True)
            title = info.get("title", "video")
    finally:
        if cookie_file:
            try:
                os.unlink(cookie_file)
            except OSError:
                pass

    for fname in os.listdir(out_path):
        ext = os.path.splitext(fname)[1].lower()
        if ext in AUDIO_EXTENSIONS:
            return os.path.join(out_path, fname), title

    raise FileNotFoundError(f"No audio file found in {out_path}")
