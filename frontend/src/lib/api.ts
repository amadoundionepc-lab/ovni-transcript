export interface Segment {
  id: number;
  start: number;
  end: number;
  start_formatted: string;
  end_formatted: string;
  text: string;
  words: Word[];
}

export interface Word {
  word: string;
  start: number;
  end: number;
  probability: number;
}

export interface TranscriptResult {
  text: string;
  language: string;
  segments: Segment[];
}

export interface Job {
  status: "queued" | "downloading" | "transcribing" | "done" | "error";
  result?: TranscriptResult;
  title?: string;
  error?: string;
}

const BASE = "/api";

export async function submitUrl(url: string, apiKey: string, language: string): Promise<string> {
  const form = new FormData();
  form.append("url", url);
  form.append("api_key", apiKey);
  form.append("language", language);

  const res = await fetch(`${BASE}/transcribe/url`, { method: "POST", body: form });
  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.detail || "Submission error");
  }
  return (await res.json()).job_id;
}

export async function submitFile(file: File, apiKey: string, language: string): Promise<string> {
  const form = new FormData();
  form.append("file", file);
  form.append("api_key", apiKey);
  form.append("language", language);

  const res = await fetch(`${BASE}/transcribe/file`, { method: "POST", body: form });
  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.detail || "Upload error");
  }
  return (await res.json()).job_id;
}

export async function getJob(jobId: string): Promise<Job> {
  const res = await fetch(`${BASE}/job/${jobId}`);
  if (!res.ok) throw new Error("Job not found");
  return res.json();
}

export async function pollJob(
  jobId: string,
  onProgress: (status: string) => void,
  intervalMs = 1500
): Promise<Job> {
  return new Promise((resolve, reject) => {
    const interval = setInterval(async () => {
      try {
        const job = await getJob(jobId);
        onProgress(job.status);
        if (job.status === "done") {
          clearInterval(interval);
          resolve(job);
        } else if (job.status === "error") {
          clearInterval(interval);
          reject(new Error(job.error || "Transcription error"));
        }
      } catch (e) {
        clearInterval(interval);
        reject(e);
      }
    }, intervalMs);
  });
}

export async function exportTranscript(
  segments: Segment[],
  title: string,
  format: "txt" | "docx" | "pdf" | "srt" | "vtt"
): Promise<void> {
  const res = await fetch(`${BASE}/export`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ segments, title, format }),
  });
  if (!res.ok) throw new Error("Export error");
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `transcript.${format}`;
  a.click();
  URL.revokeObjectURL(url);
}

const URL_PATTERN = /^https?:\/\/(www\.)?(tiktok\.com|youtube\.com|youtu\.be|instagram\.com|facebook\.com|fb\.watch|twitter\.com|x\.com|vimeo\.com)/i;

export function validateVideoUrl(url: string): string | null {
  if (!url.trim()) return "Please enter a URL";
  if (!url.startsWith("http")) return "URL must start with http:// or https://";
  if (!URL_PATTERN.test(url)) return "Unsupported platform (TikTok, YouTube, Instagram, Facebook...)";
  return null;
}

export async function checkBackendOnline(): Promise<boolean> {
  try {
    const res = await fetch("/health", { signal: AbortSignal.timeout(3000) });
    return res.ok;
  } catch {
    return false;
  }
}

export async function translateText(text: string, targetLang: string, apiKey: string): Promise<string> {
  const res = await fetch(`${BASE}/translate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text, target_lang: targetLang, api_key: apiKey }),
  });
  if (!res.ok) throw new Error("Translation error");
  return (await res.json()).text;
}
