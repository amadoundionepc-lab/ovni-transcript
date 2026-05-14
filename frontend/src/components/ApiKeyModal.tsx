"use client";

import { useState, useEffect, useRef } from "react";
import { Key, Eye, EyeOff, Check, X } from "lucide-react";

interface Props {
  apiKey: string;
  onChange: (key: string) => void;
}

export function ApiKeyButton({ apiKey, onChange }: Props) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(apiKey);
  const [showKey, setShowKey] = useState(false);
  const [saved, setSaved] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => { setDraft(apiKey); }, [apiKey]);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const save = () => {
    onChange(draft.trim());
    setSaved(true);
    setTimeout(() => { setSaved(false); setOpen(false); }, 1000);
  };

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen(!open)}
        className={`flex items-center gap-2 px-3 py-1.5 rounded-lg border text-xs font-medium transition-colors ${
          apiKey
            ? "border-accent/50 text-accent-light bg-accent/10 hover:bg-accent/20"
            : "border-border text-muted hover:text-text hover:border-accent/50"
        }`}
      >
        <Key size={12} />
        {apiKey ? "API connected" : "Groq API Key"}
      </button>

      {open && (
        <div className="absolute right-0 top-10 w-80 bg-surface border border-border rounded-xl shadow-2xl shadow-black/50 p-4 z-50">
          <div className="flex items-center justify-between mb-3">
            <span className="text-sm font-semibold text-text">Groq API Key</span>
            <button onClick={() => setOpen(false)} className="text-muted hover:text-text">
              <X size={14} />
            </button>
          </div>
          <p className="text-xs text-muted mb-3">
            Free at{" "}
            <a href="https://console.groq.com/keys" target="_blank" rel="noopener noreferrer" className="text-accent-light hover:underline">
              console.groq.com
            </a>
            . Saved locally in your browser.
          </p>
          <div className="relative mb-3">
            <input
              type={showKey ? "text" : "password"}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && save()}
              placeholder="gsk_..."
              autoFocus
              className="w-full bg-bg border border-border rounded-lg px-3 py-2.5 text-text placeholder-muted text-sm focus:outline-none focus:border-accent transition-colors pr-9"
            />
            <button
              onClick={() => setShowKey(!showKey)}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted hover:text-text"
            >
              {showKey ? <EyeOff size={14} /> : <Eye size={14} />}
            </button>
          </div>
          <button
            onClick={save}
            disabled={!draft.trim()}
            className="w-full py-2 rounded-lg bg-accent text-white text-sm font-medium hover:bg-violet-600 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
          >
            {saved ? <><Check size={14} /> Saved!</> : "Save"}
          </button>
        </div>
      )}
    </div>
  );
}
