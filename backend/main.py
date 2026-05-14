import sys
import os

sys.path.insert(0, os.path.dirname(__file__))

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
import uvicorn

from routers import transcribe, export
from fastapi import FastAPI
from pydantic import BaseModel
from groq import Groq

app = FastAPI(title="Video Transcriber API", version="1.0.0")

_frontend = os.getenv("FRONTEND_URL", "http://localhost:3000")
app.add_middleware(
    CORSMiddleware,
    allow_origins=[_frontend, "http://localhost:3000", "http://127.0.0.1:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(transcribe.router, prefix="/api")
app.include_router(export.router, prefix="/api")


@app.get("/health")
def health():
    return {"status": "ok"}


class TranslateRequest(BaseModel):
    text: str
    target_lang: str
    api_key: str


@app.post("/api/translate")
async def translate(req: TranslateRequest):
    client = Groq(api_key=req.api_key)
    response = client.chat.completions.create(
        model="llama-3.1-8b-instant",
        messages=[{
            "role": "user",
            "content": (
                f"Translate the following transcript to {req.target_lang}. "
                f"Keep the same punctuation style. Return ONLY the translated text.\n\n{req.text}"
            ),
        }],
        temperature=0.2,
        max_tokens=4096,
    )
    return {"text": response.choices[0].message.content.strip()}


if __name__ == "__main__":
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
