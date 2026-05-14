"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import { Upload, Link2, X, AlertCircle, ChevronDown, Trash2, Clock, List, Menu } from "lucide-react";
import clsx from "clsx";
import { submitUrl, submitFile, pollJob, validateVideoUrl, checkBackendOnline } from "@/lib/api";
import type { TranscriptResult } from "@/lib/api";
import { TranscriptEditor } from "@/components/TranscriptEditor";
import { PlatformIcon } from "@/components/PlatformIcon";
import { saveToHistory, getHistory, deleteFromHistory, formatDate } from "@/lib/history";
import type { HistoryEntry } from "@/lib/history";

type Tab = "url" | "file" | "batch";

interface BatchItem {
  url: string;
  status: "pending" | "processing" | "done" | "error";
  title?: string;
  error?: string;
}

const LANGUAGES = [
  { value: "auto", label: "Auto-detect" },
  { value: "fr", label: "Français" },
  { value: "en", label: "English" },
  { value: "es", label: "Español" },
  { value: "de", label: "Deutsch" },
  { value: "it", label: "Italiano" },
  { value: "pt", label: "Português" },
  { value: "ar", label: "العربية" },
  { value: "zh", label: "中文" },
  { value: "ja", label: "日本語" },
  { value: "ko", label: "한국어" },
  { value: "ru", label: "Русский" },
];

const STATUS_LABELS: Record<string, string> = {
  queued: "Queued...",
  downloading: "Downloading video...",
  transcribing: "Transcribing...",
  done: "Done!",
};

const OvniLogo = () => (
  <svg width="28" height="28" viewBox="0 0 28 28" fill="none">
    <circle cx="14" cy="14" r="14" fill="url(#g1)" />
    <ellipse cx="14" cy="16" rx="8" ry="3.5" fill="white" fillOpacity="0.15" />
    <ellipse cx="14" cy="13" rx="5" ry="4" fill="white" fillOpacity="0.9" />
    <circle cx="12" cy="12" r="1.2" fill="#7c3aed" />
    <circle cx="14.5" cy="11" r="0.8" fill="#a78bfa" />
    <defs>
      <linearGradient id="g1" x1="0" y1="0" x2="28" y2="28" gradientUnits="userSpaceOnUse">
        <stop stopColor="#7c3aed" />
        <stop offset="1" stopColor="#4f1fb8" />
      </linearGradient>
    </defs>
  </svg>
);

function newCaptcha() {
  const a = Math.floor(Math.random() * 9) + 1;
  const b = Math.floor(Math.random() * 9) + 1;
  return { a, b, answer: a + b };
}

export default function Home() {
  const [tab, setTab] = useState<Tab>("url");
  const [url, setUrl] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [language, setLanguage] = useState("auto");
  const [captcha, setCaptcha] = useState(newCaptcha);
  const [captchaInput, setCaptchaInput] = useState("");
  const [captchaPassed, setCaptchaPassed] = useState(() => sessionStorage.getItem("captcha_ok") === "1");
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState("");
  const [elapsed, setElapsed] = useState(0);
  const [error, setError] = useState("");
  const [result, setResult] = useState<TranscriptResult | null>(null);
  const [title, setTitle] = useState("");
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [currentJobId, setCurrentJobId] = useState<string | null>(null);
  const [backendOffline, setBackendOffline] = useState(false);
  const [batchUrls, setBatchUrls] = useState("");
  const [batchItems, setBatchItems] = useState<BatchItem[]>([]);
  const [batchRunning, setBatchRunning] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setHistory(getHistory());
    checkBackendOnline().then((ok) => setBackendOffline(!ok));
  }, []);

  const openEntry = (entry: HistoryEntry) => {
    setResult({ text: entry.text, language: entry.language, segments: entry.segments });
    setTitle(entry.title);
    setActiveId(entry.id);
    setCurrentJobId(entry.jobId ?? null);
    setError("");
  };

  const removeEntry = (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    deleteFromHistory(id);
    setHistory(getHistory());
    if (activeId === id) { setResult(null); setActiveId(null); }
  };

  const reset = () => {
    setResult(null);
    setError("");
    setStatus("");
    setUrl("");
    setFile(null);
    setActiveId(null);
  };

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const dropped = e.dataTransfer.files[0];
    if (dropped) setFile(dropped);
  }, []);

  const checkCaptcha = () => {
    if (captchaPassed) return true;
    if (parseInt(captchaInput) !== captcha.answer) {
      setError("Incorrect answer, please try again.");
      setCaptcha(newCaptcha());
      setCaptchaInput("");
      return false;
    }
    sessionStorage.setItem("captcha_ok", "1");
    setCaptchaPassed(true);
    return true;
  };

  const handleSubmit = async () => {
    if (!checkCaptcha()) return;
    if (tab === "url") {
      const urlError = validateVideoUrl(url);
      if (urlError) { setError(urlError); return; }
    }
    setError(""); setResult(null); setElapsed(0); setLoading(true); setActiveId(null);
    const startTime = Date.now();
    const timer = setInterval(() => setElapsed(Math.floor((Date.now() - startTime) / 1000)), 1000);
    try {
      let jobId: string;
      if (tab === "url") {
        jobId = await submitUrl(url.trim(), language);
      } else {
        if (!file) throw new Error("Please select a file");
        jobId = await submitFile(file, language);
      }
      const job = await pollJob(jobId, (s) => setStatus(STATUS_LABELS[s] || s));
      const res = job.result!;
      const t = job.title || "Transcript";
      setResult(res); setTitle(t); setCurrentJobId(jobId);
      if (Notification.permission === "granted") {
        new Notification("Transcription complete ✓", { body: t, icon: "/favicon.ico" });
      } else if (Notification.permission !== "denied") {
        Notification.requestPermission().then((p) => {
          if (p === "granted") new Notification("Transcription complete ✓", { body: t });
        });
      }
      const entry = saveToHistory({ title: t, language: res.language, text: res.text, segments: res.segments, wordCount: res.text.split(/\s+/).filter(Boolean).length, duration: res.segments[res.segments.length - 1]?.end ?? 0, jobId });
      setActiveId(entry.id);
      setHistory(getHistory());
    } catch (e) {
      setError((e as Error).message);
    } finally {
      clearInterval(timer); setLoading(false); setStatus("");
    }
  };

  const canSubmit = !loading && (tab === "url" ? !!url.trim() : tab === "file" ? !!file : false);

  const handleBatch = async () => {
    if (!checkCaptcha()) return;
    const urls = batchUrls.split("\n").map((u) => u.trim()).filter(Boolean);
    if (urls.length === 0) return;
    const items: BatchItem[] = urls.map((url) => ({ url, status: "pending" }));
    setBatchItems(items);
    setBatchRunning(true);
    setError("");
    for (let i = 0; i < items.length; i++) {
      setBatchItems((prev) => prev.map((it, idx) => idx === i ? { ...it, status: "processing" } : it));
      try {
        const jobId = await submitUrl(items[i].url, language);
        const job = await pollJob(jobId, () => {});
        const res = job.result!;
        const t = job.title || "Transcript";
        saveToHistory({ title: t, language: res.language, text: res.text, segments: res.segments, wordCount: res.text.split(/\s+/).filter(Boolean).length, duration: res.segments[res.segments.length - 1]?.end ?? 0, jobId });
        setHistory(getHistory());
        setBatchItems((prev) => prev.map((it, idx) => idx === i ? { ...it, status: "done", title: t } : it));
      } catch (e) {
        setBatchItems((prev) => prev.map((it, idx) => idx === i ? { ...it, status: "error", error: (e as Error).message } : it));
      }
    }
    setBatchRunning(false);
    if (Notification.permission === "granted") new Notification("Batch complete ✓", { body: `${urls.length} transcriptions added to history` });
  };

  return (
    <div className="min-h-screen bg-bg flex flex-col">
      {/* Navbar */}
      <nav className="flex items-center justify-between px-4 py-3 border-b border-border bg-surface/80 backdrop-blur-sm sticky top-0 z-40">
        <div className="flex items-center gap-2">
          <button onClick={() => setSidebarOpen(true)} className="md:hidden p-1.5 text-muted hover:text-text transition-colors">
            <Menu size={20} />
          </button>
          <button onClick={reset} className="flex items-center gap-2 hover:opacity-80 transition-opacity">
            <OvniLogo />
            <span className="font-bold text-lg tracking-tight">
              <span className="gradient-text">OVNI</span>
              <span className="text-text"> Transcript</span>
            </span>
          </button>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted hidden sm:flex items-center gap-1.5 px-2.5 py-1 rounded-full border border-border">
            Powered by Groq
          </span>
        </div>
      </nav>

      {backendOffline && (
        <div className="bg-red-500/10 border-b border-red-500/20 px-4 py-2 text-center text-sm text-red-400 flex items-center justify-center gap-2">
          <AlertCircle size={14} />
          Backend offline — run <code className="font-mono bg-red-500/10 px-1 rounded">Start.vbs</code> then reload the page.
        </div>
      )}
      <div className="flex flex-1 overflow-hidden">
        {/* Mobile overlay */}
        {sidebarOpen && (
          <div className="fixed inset-0 bg-black/60 z-40 md:hidden" onClick={() => setSidebarOpen(false)} />
        )}

        {/* Sidebar */}
        <aside className={clsx(
          "flex-shrink-0 border-r border-border flex flex-col bg-surface overflow-y-auto transition-transform duration-300 z-50",
          "fixed inset-y-0 left-0 w-72 md:relative md:w-60 md:translate-x-0",
          sidebarOpen ? "translate-x-0" : "-translate-x-full"
        )}>
          <div className="p-3 border-b border-border flex items-center gap-2">
            <button onClick={() => { reset(); setSidebarOpen(false); }} className="flex-1 py-2.5 rounded-xl bg-accent text-white text-sm font-semibold hover:bg-violet-600 transition-colors flex items-center justify-center gap-2">
              <span className="text-lg leading-none">+</span> New transcription
            </button>
            <button onClick={() => setSidebarOpen(false)} className="md:hidden p-2 text-muted hover:text-text">
              <X size={16} />
            </button>
          </div>

          <div className="p-3 flex-1">
            <p className="text-[10px] font-bold text-muted uppercase tracking-widest px-1 mb-2">History</p>
            {history.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-10 gap-2 text-center">
                <Clock size={20} className="text-muted/50" />
                <p className="text-xs text-muted">Your transcriptions<br />will appear here</p>
              </div>
            ) : (
              <div className="space-y-0.5">
                {history.map((entry) => (
                  <div
                    key={entry.id}
                    onClick={() => { openEntry(entry); setSidebarOpen(false); }}
                    className={clsx(
                      "group flex items-start justify-between gap-2 px-2.5 py-2.5 rounded-xl cursor-pointer transition-all",
                      activeId === entry.id
                        ? "bg-accent/20 border border-accent/30"
                        : "hover:bg-white/[0.04] border border-transparent"
                    )}
                  >
                    <div className="flex-1 min-w-0">
                      <p className={clsx("text-xs font-semibold truncate leading-snug", activeId === entry.id ? "text-accent-light" : "text-text")}>
                        {entry.title}
                      </p>
                      <p className="text-[10px] text-muted mt-0.5">{formatDate(entry.createdAt)} · {entry.wordCount} words</p>
                    </div>
                    <button onClick={(e) => removeEntry(e, entry.id)} className="opacity-0 group-hover:opacity-100 text-muted hover:text-red-400 transition-all flex-shrink-0 mt-0.5">
                      <Trash2 size={12} />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </aside>

        {/* Main content */}
        <main className="flex-1 overflow-y-auto">
          {result ? (
            <div className="px-4 py-6 md:px-8 md:py-8 max-w-4xl mx-auto">
              <TranscriptEditor key={activeId ?? "current"} segments={result.segments} title={title} language={result.language} jobId={currentJobId ?? undefined} />
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center min-h-full px-4 py-8 md:px-8 md:py-10">
              {/* Hero */}
              <div className="text-center mb-8 w-full max-w-2xl">
                <div className="flex justify-center mb-5">
                  <div className="relative">
                    <div className="w-20 h-20 rounded-2xl bg-accent/20 border border-accent/30 flex items-center justify-center">
                      <OvniLogo />
                    </div>
                    <div className="absolute -inset-1 rounded-2xl bg-accent/10 blur-lg -z-10" />
                  </div>
                </div>
                <h1 className="text-4xl md:text-5xl font-extrabold text-text leading-tight mb-3">
                  <span className="gradient-text">OVNI</span> Transcript
                </h1>
                <p className="text-muted text-base md:text-lg mt-2">
                  TikTok · YouTube · Instagram · Facebook · Local file
                </p>
              </div>

              {/* Card */}
              <div className="w-full max-w-2xl bg-card border border-border rounded-2xl p-4 md:p-7 glow">
                {/* Tabs */}
                <div className="flex gap-1 p-1 bg-bg rounded-xl mb-5">
                  {([["url", "Video link", Link2], ["file", "File", Upload], ["batch", "Batch", List]] as const).map(([t, label, Icon]) => (
                    <button
                      key={t}
                      onClick={() => setTab(t as Tab)}
                      className={clsx(
                        "flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-lg text-sm font-medium transition-all duration-150 focus:outline-none",
                        tab === t
                          ? "bg-accent/20 text-accent-light border border-accent/30"
                          : "text-muted hover:text-text hover:bg-white/[0.04]"
                      )}
                    >
                      <Icon size={15} />
                      {label}
                    </button>
                  ))}
                </div>

                {/* URL */}
                {tab === "url" && (
                  <div className="flex items-stretch mb-4 bg-bg border border-border rounded-xl overflow-hidden focus-within:border-accent/60 transition-colors">
                    <div className="flex items-center pl-3.5 text-muted flex-shrink-0">
                      {url ? <PlatformIcon url={url} /> : <Link2 size={16} />}
                    </div>
                    <input
                      type="url"
                      value={url}
                      onChange={(e) => setUrl(e.target.value)}
                      onKeyDown={(e) => e.key === "Enter" && canSubmit && handleSubmit()}
                      placeholder="Paste a TikTok, YouTube, Instagram link..."
                      className="flex-1 bg-transparent pl-2.5 pr-2 py-4 text-text placeholder-muted text-base focus:outline-none min-w-0"
                    />
                    <button
                      onClick={async () => { const t = await navigator.clipboard.readText(); setUrl(t); }}
                      className="flex-shrink-0 px-4 py-2 my-2 mr-2 rounded-lg bg-accent/15 hover:bg-accent/30 text-accent-light text-sm font-semibold transition-all"
                    >
                      Paste
                    </button>
                  </div>
                )}

                {/* File */}
                {tab === "file" && (
                  <div
                    onDrop={handleDrop}
                    onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
                    onDragLeave={() => setDragOver(false)}
                    onClick={() => fileRef.current?.click()}
                    className={clsx(
                      "mb-4 border-2 border-dashed rounded-xl p-6 text-center cursor-pointer transition-all",
                      dragOver ? "border-accent bg-accent/10" : "border-border hover:border-accent/40",
                      file && "border-accent/40 bg-accent/5"
                    )}
                  >
                    <input ref={fileRef} type="file" accept="video/*,audio/*" className="hidden" onChange={(e) => setFile(e.target.files?.[0] || null)} />
                    {file ? (
                      <div className="flex items-center gap-3">
                        <div className="w-9 h-9 rounded-lg bg-accent/20 flex items-center justify-center flex-shrink-0">
                          <Upload size={15} className="text-accent-light" />
                        </div>
                        <div className="text-left flex-1 min-w-0">
                          <p className="text-sm font-medium text-text truncate">{file.name}</p>
                          <p className="text-xs text-muted">{(file.size / 1024 / 1024).toFixed(1)} MB</p>
                        </div>
                        <button onClick={(e) => { e.stopPropagation(); setFile(null); }} className="text-muted hover:text-text flex-shrink-0"><X size={15} /></button>
                      </div>
                    ) : (
                      <>
                        <Upload size={24} className="text-muted mx-auto mb-2" />
                        <p className="text-sm text-text font-medium">Drag & drop or click</p>
                        <p className="text-xs text-muted mt-1">MP4, MOV, MP3, WAV — max 25 MB</p>
                      </>
                    )}
                  </div>
                )}

                {/* Batch */}
                {tab === "batch" && (
                  <div className="mb-4">
                    <textarea
                      value={batchUrls}
                      onChange={(e) => setBatchUrls(e.target.value)}
                      placeholder={"One link per line:\nhttps://www.tiktok.com/...\nhttps://www.youtube.com/..."}
                      rows={5}
                      className="w-full bg-bg border border-border rounded-xl px-4 py-3 text-text placeholder-muted text-sm focus:outline-none focus:border-accent/60 transition-colors resize-none"
                    />
                    {batchItems.length > 0 && (
                      <div className="mt-3 space-y-2">
                        {batchItems.map((item, i) => (
                          <div key={i} className="flex items-center gap-3 px-3 py-2 rounded-lg bg-bg border border-border">
                            <div className={clsx("w-2 h-2 rounded-full flex-shrink-0", {
                              "bg-muted": item.status === "pending",
                              "bg-accent animate-pulse": item.status === "processing",
                              "bg-green-400": item.status === "done",
                              "bg-red-400": item.status === "error",
                            })} />
                            <span className="text-xs text-muted truncate flex-1">{item.title || item.url}</span>
                            <span className="text-xs text-muted flex-shrink-0">{item.status === "done" ? "✓" : item.status === "error" ? "✗" : item.status === "processing" ? "..." : ""}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {/* Language */}
                <div className="relative mb-4">
                  <select value={language} onChange={(e) => setLanguage(e.target.value)} className="w-full appearance-none bg-bg border border-border rounded-xl px-4 py-4 text-base text-text focus:outline-none focus:border-accent/60 pr-8 transition-colors">
                    {LANGUAGES.map((l) => <option key={l.value} value={l.value}>{l.label}</option>)}
                  </select>
                  <ChevronDown size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted pointer-events-none" />
                </div>

                {/* Captcha — only shown once per session */}
                {!loading && !captchaPassed && (
                  <div className="flex items-center gap-3 mb-4 px-4 py-3 bg-bg border border-border rounded-xl">
                    <span className="text-sm text-muted flex-shrink-0">
                      {captcha.a} + {captcha.b} =
                    </span>
                    <input
                      type="number"
                      value={captchaInput}
                      onChange={(e) => setCaptchaInput(e.target.value)}
                      onKeyDown={(e) => e.key === "Enter" && canSubmit && handleSubmit()}
                      placeholder="?"
                      className="w-16 bg-transparent text-text text-sm text-center focus:outline-none border-b border-border focus:border-accent transition-colors"
                    />
                    <span className="text-xs text-muted ml-auto">Anti-spam</span>
                  </div>
                )}

                {/* Error */}
                {error && (
                  <div className="flex items-start gap-2.5 p-3 bg-red-500/10 border border-red-500/20 rounded-xl mb-4 text-sm text-red-400">
                    <AlertCircle size={15} className="flex-shrink-0 mt-0.5" />
                    <div>
                      {error.includes("no available captions") || error.includes("not a bot") ? (
                        <>
                          <p className="font-medium mb-1">YouTube is blocked on our server.</p>
                          <p className="text-red-400/80">
                            Download the audio for free on{" "}
                            <a href="https://cobalt.tools" target="_blank" rel="noopener noreferrer" className="underline text-red-300 hover:text-white transition-colors">cobalt.tools</a>
                            {" "}→ then use the <button onClick={() => setTab("file")} className="underline text-red-300 hover:text-white transition-colors">File tab</button>.
                          </p>
                        </>
                      ) : error}
                    </div>
                  </div>
                )}

                {/* Loading */}
                {loading && (
                  <div className="mb-4 px-4 py-3 bg-accent/10 border border-accent/20 rounded-xl">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2.5">
                        <div className="w-1.5 h-1.5 rounded-full bg-accent-light animate-pulse" />
                        <span className="text-sm text-accent-light">{status || "Starting..."}</span>
                      </div>
                      <span className="text-xs text-muted font-mono">{Math.floor(elapsed / 60)}:{String(elapsed % 60).padStart(2, "0")}</span>
                    </div>
                    <div className="mt-2.5 h-0.5 bg-border rounded-full overflow-hidden">
                      <div className="h-full bg-accent-light rounded-full animate-pulse w-2/3 transition-all" />
                    </div>
                  </div>
                )}

                {/* Submit button */}
                <button
                  onClick={tab === "batch" ? handleBatch : handleSubmit}
                  disabled={tab === "batch" ? (batchRunning || !batchUrls.trim()) : !canSubmit}
                  className={clsx(
                    "w-full py-4 rounded-xl font-bold text-base transition-all",
                    (tab === "batch" ? (batchRunning || !batchUrls.trim()) : !canSubmit)
                      ? "bg-accent/30 text-white/40 cursor-not-allowed"
                      : "bg-accent text-white hover:bg-violet-500 shadow-lg shadow-accent/25 active:scale-[0.99]"
                  )}
                >
                  {tab === "batch" ? (batchRunning ? "Processing..." : "Transcribe batch") : loading ? "Transcribing..." : "Transcribe"}
                </button>
              </div>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
