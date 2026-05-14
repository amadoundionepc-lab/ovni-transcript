import os
import sys
import uuid
import shutil
from fastapi import APIRouter, UploadFile, File, Form, BackgroundTasks, HTTPException
from fastapi.responses import FileResponse

from services.downloader import download_audio, is_supported_url
from services.transcriber import transcribe_audio
from services.youtube_transcript import fetch_youtube_transcript

router = APIRouter()

TEMP_DIR = os.path.join(os.path.dirname(__file__), "..", "temp")
jobs: dict = {}


def _api_key() -> str:
    key = os.getenv("GROQ_API_KEY", "")
    if not key:
        raise RuntimeError("GROQ_API_KEY not configured on server.")
    return key


def run_transcription(job_id: str, audio_path: str, title: str, language: str):
    try:
        jobs[job_id]["status"] = "transcribing"
        result = transcribe_audio(audio_path, api_key=_api_key(), language=language)
        jobs[job_id].update({"status": "done", "result": result, "title": title, "audio_path": audio_path})
    except Exception as e:
        jobs[job_id]["status"] = "error"
        jobs[job_id]["error"] = str(e)


def run_url_job(job_id: str, url: str, language: str):
    try:
        is_youtube = any(d in url for d in ["youtube.com", "youtu.be"])
        if is_youtube:
            # 1. Try native captions (fast, no Whisper needed)
            jobs[job_id]["status"] = "transcribing"
            result = fetch_youtube_transcript(url, language)
            if result:
                title = "YouTube video"
                try:
                    import requests as req
                    r = req.get("https://www.youtube.com/oembed", params={"url": url, "format": "json"}, timeout=5)
                    if r.ok:
                        title = r.json().get("title", title)
                except Exception:
                    pass
                jobs[job_id].update({"status": "done", "result": result, "title": title})
                return

            # 2. Fallback: download audio via cobalt + Whisper
            print("[youtube] captions unavailable, falling back to cobalt audio download", file=sys.stderr)

        jobs[job_id]["status"] = "downloading"
        audio_path, title = download_audio(url, job_id)
        run_transcription(job_id, audio_path, title, language)
    except Exception as e:
        jobs[job_id]["status"] = "error"
        jobs[job_id]["error"] = str(e)


@router.post("/transcribe/url")
async def transcribe_url(
    background_tasks: BackgroundTasks,
    url: str = Form(...),
    language: str = Form("auto"),
):
    if not is_supported_url(url):
        raise HTTPException(status_code=400, detail="Unsupported URL. Use TikTok, YouTube, Instagram or Facebook.")

    job_id = str(uuid.uuid4())
    jobs[job_id] = {"status": "queued", "url": url}
    background_tasks.add_task(run_url_job, job_id, url, language)
    return {"job_id": job_id}


@router.post("/transcribe/file")
async def transcribe_file(
    background_tasks: BackgroundTasks,
    file: UploadFile = File(...),
    language: str = Form("auto"),
):
    job_id = str(uuid.uuid4())
    out_dir = os.path.join(TEMP_DIR, job_id)
    os.makedirs(out_dir, exist_ok=True)

    ext = os.path.splitext(file.filename)[1] or ".mp4"
    audio_path = os.path.join(out_dir, f"upload{ext}")

    with open(audio_path, "wb") as f:
        content = await file.read()
        f.write(content)

    title = os.path.splitext(file.filename)[0]
    jobs[job_id] = {"status": "queued", "title": title}
    background_tasks.add_task(run_transcription, job_id, audio_path, title, language)
    return {"job_id": job_id}


@router.get("/job/{job_id}")
async def get_job(job_id: str):
    job = jobs.get(job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    return job


@router.get("/job/{job_id}/audio")
async def get_audio(job_id: str):
    job = jobs.get(job_id)
    if not job or not job.get("audio_path"):
        raise HTTPException(status_code=404, detail="Audio not found")
    audio_path = job["audio_path"]
    if not os.path.exists(audio_path):
        raise HTTPException(status_code=404, detail="Audio file not found")
    return FileResponse(audio_path, media_type="audio/mpeg")


@router.delete("/job/{job_id}")
async def delete_job(job_id: str):
    job_dir = os.path.join(TEMP_DIR, job_id)
    if os.path.exists(job_dir):
        shutil.rmtree(job_dir)
    jobs.pop(job_id, None)
    return {"ok": True}
