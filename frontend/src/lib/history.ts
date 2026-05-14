import type { Segment } from "./api";

export interface HistoryEntry {
  id: string;
  jobId?: string;
  title: string;
  language: string;
  text: string;
  segments: Segment[];
  createdAt: number;
  wordCount: number;
  duration: number;
}

const KEY = "transcript_history";
const MAX = 50;
const TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

export function saveToHistory(entry: Omit<HistoryEntry, "id" | "createdAt">): HistoryEntry {
  const full: HistoryEntry = { ...entry, id: crypto.randomUUID(), createdAt: Date.now() };
  const list = getHistory();
  list.unshift(full);
  localStorage.setItem(KEY, JSON.stringify(list.slice(0, MAX)));
  return full;
}

export function getHistory(): HistoryEntry[] {
  try {
    const all: HistoryEntry[] = JSON.parse(localStorage.getItem(KEY) || "[]");
    const cutoff = Date.now() - TTL_MS;
    const fresh = all.filter((e) => e.createdAt > cutoff);
    // Persist pruned list if any entries were removed
    if (fresh.length !== all.length) {
      localStorage.setItem(KEY, JSON.stringify(fresh));
    }
    return fresh;
  } catch {
    return [];
  }
}

export function deleteFromHistory(id: string) {
  const list = getHistory().filter((e) => e.id !== id);
  localStorage.setItem(KEY, JSON.stringify(list));
}

export function formatDate(ts: number): string {
  const d = new Date(ts);
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffMin = Math.floor(diffMs / 60000);
  if (diffMin < 1) return "Just now";
  if (diffMin < 60) return `${diffMin}m ago`;
  if (diffMin < 1440) return `${Math.floor(diffMin / 60)}h ago`;
  return d.toLocaleDateString("en-US", { day: "numeric", month: "short" });
}
