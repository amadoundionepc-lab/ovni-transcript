from fastapi import APIRouter, HTTPException
from fastapi.responses import Response
from pydantic import BaseModel
from typing import List

from services.exporter import export_txt, export_docx, export_pdf, export_srt, export_vtt

router = APIRouter()


class Segment(BaseModel):
    id: int
    start: float
    end: float
    start_formatted: str
    end_formatted: str
    text: str
    words: list = []


class ExportRequest(BaseModel):
    segments: List[Segment]
    title: str = ""
    format: str  # txt, docx, pdf


@router.post("/export")
async def export_transcript(req: ExportRequest):
    segs = [s.model_dump() for s in req.segments]
    fmt = req.format.lower()

    if fmt == "txt":
        data = export_txt(segs, req.title)
        return Response(
            content=data,
            media_type="text/plain; charset=utf-8",
            headers={"Content-Disposition": f'attachment; filename="transcript.txt"'},
        )
    elif fmt == "docx":
        data = export_docx(segs, req.title)
        return Response(
            content=data,
            media_type="application/vnd.openxmlformats-officedocument.wordprocessingml.document",
            headers={"Content-Disposition": f'attachment; filename="transcript.docx"'},
        )
    elif fmt == "pdf":
        data = export_pdf(segs, req.title)
        return Response(
            content=data,
            media_type="application/pdf",
            headers={"Content-Disposition": f'attachment; filename="transcript.pdf"'},
        )
    elif fmt == "srt":
        data = export_srt(segs, req.title)
        return Response(content=data, media_type="text/plain; charset=utf-8",
                        headers={"Content-Disposition": 'attachment; filename="transcript.srt"'})
    elif fmt == "vtt":
        data = export_vtt(segs, req.title)
        return Response(content=data, media_type="text/vtt; charset=utf-8",
                        headers={"Content-Disposition": 'attachment; filename="transcript.vtt"'})
    else:
        raise HTTPException(status_code=400, detail="Unsupported format.")
