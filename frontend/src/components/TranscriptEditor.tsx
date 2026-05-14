"use client";

import { useState, useCallback, useRef, useEffect, useMemo } from "react";
import { Copy, Check, Download, AlignLeft, List, Search, X, Languages, ChevronDown, Pencil, Lock, RotateCcw } from "lucide-react";
import type { Segment } from "@/lib/api";
import { exportTranscript, translateText } from "@/lib/api";
import { AudioPlayer, type AudioPlayerHandle } from "./AudioPlayer";
import clsx from "clsx";

interface Props {
  segments: Segment[];
  title: string;
  language: string;
  jobId?: string;
  apiKey?: string;
}

const LANGUAGES = [
  { value: "english", label: "English" },
  { value: "french", label: "Français" },
  { value: "spanish", label: "Español" },
  { value: "arabic", label: "العربية" },
  { value: "portuguese", label: "Português" },
  { value: "german", label: "Deutsch" },
  { value: "italian", label: "Italiano" },
];

const FONT_SIZES = ["text-sm", "text-base", "text-lg", "text-xl"];
const FONT_LABELS = ["S", "M", "L", "XL"];

// Normalize a word for alignment comparison (strip punctuation, lowercase)
function norm(w: string) {
  return w.toLowerCase().replace(/[^a-z0-9À-ɏ]/g, "");
}

export function TranscriptEditor({ segments: initialSegments, title, language, jobId, apiKey }: Props) {
  const [segments, setSegments] = useState<Segment[]>(initialSegments);
  const [view, setView] = useState<"block" | "segments">("block");
  const [blockText, setBlockText] = useState(initialSegments.map((s) => s.text).join(" "));
  const [copied, setCopied] = useState(false);
  const [exporting, setExporting] = useState<string | null>(null);

  // Edit mode
  const [editMode, setEditMode] = useState(false);
  const blockEditRef = useRef<HTMLDivElement>(null);
  const undoStack = useRef<string[]>([]);
  const redoStack = useRef<string[]>([]);

  const placeCursorAtEnd = (el: HTMLDivElement) => {
    const range = document.createRange();
    const sel = window.getSelection();
    range.selectNodeContents(el);
    range.collapse(false);
    sel?.removeAllRanges();
    sel?.addRange(range);
  };

  // Initialize on edit mode enter
  useEffect(() => {
    if (editMode && blockEditRef.current) {
      blockEditRef.current.textContent = displayText;
      undoStack.current = [displayText];
      redoStack.current = [];
      placeCursorAtEnd(blockEditRef.current);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editMode]);

  const handleEditInput = () => {
    const current = blockEditRef.current?.textContent || "";
    const last = undoStack.current[undoStack.current.length - 1];
    if (current !== last) {
      undoStack.current.push(current);
      redoStack.current = [];
    }
  };

  const handleEditKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    const ctrl = e.ctrlKey || e.metaKey;
    if (ctrl && e.key === "z" && !e.shiftKey) {
      e.preventDefault();
      if (undoStack.current.length > 1) {
        redoStack.current.push(undoStack.current.pop()!);
        const prev = undoStack.current[undoStack.current.length - 1];
        if (blockEditRef.current) { blockEditRef.current.textContent = prev; placeCursorAtEnd(blockEditRef.current); }
      }
    } else if (ctrl && (e.key === "y" || (e.key === "z" && e.shiftKey))) {
      e.preventDefault();
      if (redoStack.current.length > 0) {
        const next = redoStack.current.pop()!;
        undoStack.current.push(next);
        if (blockEditRef.current) { blockEditRef.current.textContent = next; placeCursorAtEnd(blockEditRef.current); }
      }
    }
  };

  // Search
  const [searchQuery, setSearchQuery] = useState("");
  const [showSearch, setShowSearch] = useState(false);

  // Font size
  const [fontSizeIdx, setFontSizeIdx] = useState(1);

  // Translation
  const [translating, setTranslating] = useState(false);
  const [showTranslateMenu, setShowTranslateMenu] = useState(false);
  const [translatedText, setTranslatedText] = useState<string | null>(null);
  const translateMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!showTranslateMenu) return;
    const handler = (e: MouseEvent) => {
      if (translateMenuRef.current && !translateMenuRef.current.contains(e.target as Node)) {
        setShowTranslateMenu(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [showTranslateMenu]);

  // Audio player state (lifted here for sync)
  const [audioPlaying, setAudioPlaying] = useState(false);
  const [audioTime, setAudioTime] = useState(0);
  const [audioDuration, setAudioDuration] = useState(0);
  const [audioReady, setAudioReady] = useState(false);
  const playerRef = useRef<AudioPlayerHandle>(null);

  // Flatten raw word timestamps from all segments
  const allWords = useMemo(() => segments.flatMap((s) => s.words ?? []), [segments]);

  // Align refined text words to raw Whisper timestamps via greedy fuzzy matching.
  // Pure positional mapping drifts whenever the LLM adds/removes a word;
  // this anchors each refined word to the closest matching raw word instead.
  const displayWords = useMemo((): { displayWord: string; start: number; end: number }[] => {
    if (allWords.length === 0) return [];
    const refined = blockText.trim().split(/\s+/).filter(Boolean);
    const rawNorm = allWords.map((w) => norm(w.word));
    const refNorm = refined.map(norm);

    const result: { displayWord: string; start: number; end: number }[] = [];
    let rawCursor = 0;

    for (let i = 0; i < refined.length; i++) {
      // Look ahead up to 4 raw words for a normalized text match
      let best = rawCursor;
      const lookahead = Math.min(allWords.length, rawCursor + 4);
      for (let j = rawCursor; j < lookahead; j++) {
        if (refNorm[i].length > 0 && rawNorm[j] === refNorm[i]) { best = j; break; }
      }
      const raw = allWords[Math.min(best, allWords.length - 1)];
      result.push({ displayWord: refined[i], start: raw.start, end: raw.end });
      rawCursor = Math.min(best + 1, allWords.length - 1);
    }
    return result;
  }, [blockText, allWords]);

  const activeWordIdx = useMemo(() => {
    if (audioTime === 0 && !audioPlaying) return -1;
    // Prefer exact range match [start, end] for precise highlighting
    const exact = displayWords.findIndex((w) => audioTime >= w.start && audioTime <= w.end);
    if (exact !== -1) return exact;
    // Fallback: last word whose start is before current time
    return displayWords.findLastIndex((w) => audioTime >= w.start);
  }, [displayWords, audioTime, audioPlaying]);

  const wordCount = blockText.trim().split(/\s+/).filter(Boolean).length;
  const charCount = blockText.length;
  const duration = segments.length > 0 ? segments[segments.length - 1].end : 0;
  const durationStr = duration >= 60 ? `${Math.floor(duration / 60)}m ${Math.round(duration % 60)}s` : `${Math.round(duration)}s`;

  const displayText = translatedText ?? blockText;

  const updateSegment = useCallback((id: number, text: string) => {
    setSegments((prev) => prev.map((s) => (s.id === id ? { ...s, text } : s)));
  }, []);

  const copyAll = async () => {
    const text = view === "block" ? displayText : segments.map((s) => s.text).join(" ");
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const getSegsForExport = () =>
    view === "block"
      ? [{ ...segments[0], id: 0, text: displayText, end: segments[segments.length - 1]?.end ?? 0, end_formatted: segments[segments.length - 1]?.end_formatted ?? "" }]
      : segments;

  const handleExport = async (format: "txt" | "docx" | "pdf" | "srt" | "vtt") => {
    setExporting(format);
    try { await exportTranscript(getSegsForExport(), title, format); }
    catch (e) { alert("Error: " + (e as Error).message); }
    finally { setExporting(null); }
  };

  const handleTranslate = async (lang: string) => {
    if (!apiKey) return;
    setShowTranslateMenu(false);
    setTranslating(true);
    try {
      const translated = await translateText(displayText, lang, apiKey);
      setTranslatedText(translated);
    } catch (e) {
      alert("Translation error: " + (e as Error).message);
    } finally {
      setTranslating(false);
    }
  };

  // Active segment based on audio time
  const activeSegIdx = segments.findIndex(
    (s, i) => audioTime >= s.start && (i === segments.length - 1 || audioTime < segments[i + 1].start)
  );

  // Keyboard shortcuts
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement).tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || (e.target as HTMLElement).isContentEditable) return;
      if (e.code === "Space" && jobId) {
        e.preventDefault();
        playerRef.current?.toggle();
      }
      if ((e.ctrlKey || e.metaKey) && e.key === "f") {
        e.preventDefault();
        setShowSearch((v) => !v);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [jobId]);

  // Highlight search matches
  const highlight = (text: string) => {
    if (!searchQuery.trim()) return text;
    const escaped = searchQuery.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    return text.replace(new RegExp(`(${escaped})`, "gi"), '<mark class="bg-accent/40 text-text rounded px-0.5">$1</mark>');
  };

  const matchCount = searchQuery.trim()
    ? (displayText.match(new RegExp(searchQuery.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "gi")) || []).length
    : 0;

  return (
    <div className="w-full">
      {/* Header */}
      <div className="mb-6">
        <h2 className="text-2xl font-bold text-text truncate">{title}</h2>
        <div className="flex gap-3 mt-1.5 text-sm text-muted flex-wrap">
          <span>{wordCount} words</span>
          <span>·</span>
          <span>{charCount} characters</span>
          <span>·</span>
          <span>{durationStr}</span>
          <span>·</span>
          <span className="uppercase">{language}</span>
          {translatedText && <span className="text-accent-light">· translated</span>}
        </div>
      </div>

      {/* Toolbar */}
      <div className="flex items-center justify-between gap-3 mb-4 flex-wrap">
        {/* Vue + Recherche + Police */}
        <div className="flex items-center gap-2">
          <div className="flex gap-0.5 p-1 bg-surface rounded-lg border border-border">
            <button onClick={() => setView("block")} title="Block text" className={clsx("flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-all", view === "block" ? "bg-accent text-white" : "text-muted hover:text-text")}>
              <AlignLeft size={13} /> Block
            </button>
            <button onClick={() => setView("segments")} title="Segments" className={clsx("flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-all", view === "segments" ? "bg-accent text-white" : "text-muted hover:text-text")}>
              <List size={13} /> Segments
            </button>
          </div>

          <button onClick={() => setShowSearch((v) => !v)} title="Search (Ctrl+F)" className={clsx("p-2 rounded-lg border text-sm transition-all", showSearch ? "border-accent/50 text-accent-light bg-accent/10" : "border-border text-muted hover:text-text")}>
            <Search size={14} />
          </button>

          <button
            onClick={() => setEditMode((v) => !v)}
            title={editMode ? "Lock" : "Edit text"}
            className={clsx("flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-medium transition-all", editMode ? "border-amber-500/50 text-amber-400 bg-amber-500/10" : "border-border text-muted hover:text-text")}
          >
            {editMode ? <><Pencil size={13} /> Editing</> : <><Lock size={13} /> Locked</>}
          </button>

          {editMode && (
            <button
              onClick={() => {
                const original = initialSegments.map((s) => s.text).join(" ");
                setBlockText(original);
                setSegments(initialSegments);
                setTranslatedText(null);
                if (blockEditRef.current) {
                  blockEditRef.current.textContent = original;
                  undoStack.current = [original];
                  redoStack.current = [];
                  placeCursorAtEnd(blockEditRef.current);
                }
              }}
              title="Reset to original text"
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-red-500/30 text-red-400 bg-red-500/10 hover:bg-red-500/20 text-xs font-medium transition-all"
            >
              <RotateCcw size={13} /> Reset
            </button>
          )}

          {/* Font size */}
          <div className="flex gap-0.5 p-1 bg-surface rounded-lg border border-border">
            {FONT_LABELS.map((label, i) => (
              <button key={i} onClick={() => setFontSizeIdx(i)} className={clsx("w-6 h-6 rounded text-[10px] font-bold transition-all", fontSizeIdx === i ? "bg-accent text-white" : "text-muted hover:text-text")}>
                {label}
              </button>
            ))}
          </div>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-2 flex-wrap">
          {/* Translation */}
          <div className="relative" ref={translateMenuRef}>
            <button
              onClick={() => setShowTranslateMenu((v) => !v)}
              disabled={translating || !apiKey}
              className="flex items-center gap-1.5 px-3 py-2 rounded-lg border border-border text-sm text-muted hover:text-text hover:border-accent/50 transition-all disabled:opacity-40"
            >
              <Languages size={14} />
              {translating ? "..." : "Translate"}
              <ChevronDown size={12} />
            </button>
            {showTranslateMenu && (
              <div className="absolute right-0 top-full mt-1 bg-card border border-border rounded-xl shadow-xl z-50 py-1 min-w-36">
                {translatedText && (
                  <button onClick={() => setTranslatedText(null)} className="w-full px-3 py-2 text-xs text-left text-red-400 hover:bg-white/5 transition-colors">
                    Restore original
                  </button>
                )}
                {LANGUAGES.map((l) => (
                  <button key={l.value} onClick={() => handleTranslate(l.value)} className="w-full px-3 py-2 text-xs text-left text-text hover:bg-white/5 transition-colors">
                    {l.label}
                  </button>
                ))}
              </div>
            )}
          </div>

          <button onClick={copyAll} className="flex items-center gap-1.5 px-3 py-2 rounded-lg border border-border text-sm text-muted hover:text-text hover:border-accent/50 transition-all">
            {copied ? <Check size={14} className="text-green-400" /> : <Copy size={14} />}
            {copied ? "Copied" : "Copy"}
          </button>

          {(["txt", "docx", "pdf", "srt", "vtt"] as const).map((fmt) => (
            <button key={fmt} onClick={() => handleExport(fmt)} disabled={exporting !== null}
              className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-accent text-white text-sm font-semibold hover:bg-violet-500 transition-all disabled:opacity-50 shadow-md shadow-accent/20">
              <Download size={13} />
              {exporting === fmt ? "..." : fmt.toUpperCase()}
            </button>
          ))}
        </div>
      </div>

      {/* Search bar */}
      {showSearch && (
        <div className="flex items-center gap-2 mb-4 px-4 py-2.5 bg-surface border border-border rounded-xl">
          <Search size={14} className="text-muted flex-shrink-0" />
          <input
            autoFocus
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search in transcript..."
            className="flex-1 bg-transparent text-text text-sm placeholder-muted focus:outline-none"
          />
          {searchQuery && <span className="text-xs text-muted">{matchCount} result{matchCount !== 1 ? "s" : ""}</span>}
          <button onClick={() => { setSearchQuery(""); setShowSearch(false); }} className="text-muted hover:text-text">
            <X size={14} />
          </button>
        </div>
      )}

{view === "block" && (
        <div className="rounded-2xl border border-border bg-card px-6 py-5 glow">
          {searchQuery ? (
            <div
              className={clsx("text-text leading-9 min-h-[200px] whitespace-pre-wrap", FONT_SIZES[fontSizeIdx])}
              dangerouslySetInnerHTML={{ __html: highlight(displayText) }}
            />
          ) : editMode ? (
            <div
              ref={blockEditRef}
              contentEditable
              suppressContentEditableWarning
              onInput={handleEditInput}
              onKeyDown={handleEditKeyDown}
              onBlur={(e) => {
                const t = e.currentTarget.textContent || "";
                setBlockText(t);
                setTranslatedText(null);
              }}
              className={clsx("text-text leading-9 focus:outline-none min-h-[200px] whitespace-pre-wrap cursor-text", FONT_SIZES[fontSizeIdx])}
            />
          ) : (
            <div className={clsx("text-text leading-9 min-h-[200px] cursor-default select-text", FONT_SIZES[fontSizeIdx])}>
              {jobId && displayWords.length > 0 && !translatedText
                ? displayWords.map((w, i) => {
                    const isActive = i === activeWordIdx;
                    return (
                      <span key={i}>
                        {i > 0 && " "}
                        <span
                          onClick={() => playerRef.current?.seek(w.start)}
                          className={clsx(
                            "cursor-pointer rounded-sm transition-colors duration-75",
                            isActive ? "bg-accent/50 text-white" : "text-text hover:bg-accent/15"
                          )}
                        >
                          {w.displayWord}
                        </span>
                      </span>
                    );
                  })
                : displayText
              }
            </div>
          )}
        </div>
      )}

      {view === "segments" && (
        <div className="rounded-2xl border border-border bg-card overflow-hidden">
          {segments.map((seg, i) => (
            <div
              key={seg.id}
              className={clsx(
                "flex gap-4 px-5 py-3.5 transition-colors border-b border-border last:border-b-0 group",
                i === activeSegIdx && jobId ? "bg-accent/10" : "hover:bg-white/[0.02]"
              )}
            >
              <button
                onClick={() => { playerRef.current?.seek(seg.start); }}
                className="text-[11px] font-mono text-muted flex-shrink-0 pt-[2px] w-16 text-left hover:text-accent-light transition-colors"
                title="Go to this moment"
              >
                {seg.start_formatted}
              </button>
              {editMode ? (
                <div
                  key={`edit-${seg.id}`}
                  contentEditable
                  suppressContentEditableWarning
                  onBlur={(e) => updateSegment(seg.id, e.currentTarget.textContent || "")}
                  className={clsx("flex-1 text-text leading-relaxed focus:outline-none cursor-text", FONT_SIZES[fontSizeIdx])}
                  dangerouslySetInnerHTML={{ __html: seg.text }}
                />
              ) : (
                <div
                  className={clsx("flex-1 text-text leading-relaxed cursor-default select-text", FONT_SIZES[fontSizeIdx])}
                  dangerouslySetInnerHTML={{ __html: searchQuery ? highlight(seg.text) : seg.text }}
                />
              )}
            </div>
          ))}
        </div>
      )}

      {/* Player audio */}
      {jobId && (
        <AudioPlayer
          ref={playerRef}
          jobId={jobId}
          playing={audioPlaying}
          currentTime={audioTime}
          duration={audioDuration}
          ready={audioReady}
          onPlayChange={setAudioPlaying}
          onTimeUpdate={setAudioTime}
          onDurationLoad={(d) => { setAudioDuration(d); setAudioReady(true); }}
        />
      )}
    </div>
  );
}
