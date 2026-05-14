import os
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


def download_audio(url: str, job_id: str):
    out_path = os.path.join(TEMP_DIR, job_id)
    os.makedirs(out_path, exist_ok=True)

    ydl_opts = {
        "format": "bestaudio[ext=m4a]/bestaudio[ext=webm]/bestaudio[acodec!=none]/best[ext=mp4][acodec!=none]/best[acodec!=none]",
        "outtmpl": os.path.join(out_path, "audio.%(ext)s"),
        "quiet": True,
        "no_warnings": True,
        "socket_timeout": 15,
        "retries": 3,
        "concurrent_fragment_downloads": 4,
        "buffersize": 1024 * 16,
        # Bypass YouTube bot detection on server IPs
        "extractor_args": {"youtube": {"player_client": ["android", "web"]}},
        "http_headers": {
            "User-Agent": "Mozilla/5.0 (Linux; Android 11; Pixel 5) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/90.0.4430.91 Mobile Safari/537.36",
        },
    }

    with yt_dlp.YoutubeDL(ydl_opts) as ydl:
        info = ydl.extract_info(url, download=True)
        title = info.get("title", "video")

    # Find any downloaded audio file
    for fname in os.listdir(out_path):
        ext = os.path.splitext(fname)[1].lower()
        if ext in AUDIO_EXTENSIONS:
            return os.path.join(out_path, fname), title

    raise FileNotFoundError(f"No audio file found in {out_path}")
