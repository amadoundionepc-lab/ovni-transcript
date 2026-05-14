"use client";

import { useEffect, useImperativeHandle, useRef, forwardRef } from "react";
import { Play, Pause } from "lucide-react";

export interface AudioPlayerHandle {
  seek: (time: number) => void;
  toggle: () => void;
}

interface Props {
  jobId: string;
  playing: boolean;
  currentTime: number;
  duration: number;
  ready: boolean;
  onPlayChange: (v: boolean) => void;
  onTimeUpdate: (t: number) => void;
  onDurationLoad: (d: number) => void;
}

function fmt(s: number) {
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  return `${m}:${String(sec).padStart(2, "0")}`;
}

export const AudioPlayer = forwardRef<AudioPlayerHandle, Props>(
  ({ jobId, playing, currentTime, duration, ready, onPlayChange, onTimeUpdate, onDurationLoad }, ref) => {
    const audioRef = useRef<HTMLAudioElement>(null);

    useImperativeHandle(ref, () => ({
      seek(time: number) {
        if (audioRef.current) audioRef.current.currentTime = time;
      },
      toggle() {
        const a = audioRef.current;
        if (!a) return;
        if (playing) { a.pause(); onPlayChange(false); }
        else { a.play(); onPlayChange(true); }
      },
    }));

    const handleToggle = () => {
      const a = audioRef.current;
      if (!a) return;
      if (playing) { a.pause(); onPlayChange(false); }
      else { a.play(); onPlayChange(true); }
    };

    const handleSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
      const t = Number(e.target.value);
      if (audioRef.current) audioRef.current.currentTime = t;
      onTimeUpdate(t);
    };

    const pct = duration > 0 ? (currentTime / duration) * 100 : 0;

    return (
      <div className="mt-6 px-5 py-4 rounded-2xl border border-border bg-surface flex items-center gap-4">
        <audio
          ref={audioRef}
          src={`/api/job/${jobId}/audio`}
          onLoadedMetadata={(e) => onDurationLoad(e.currentTarget.duration)}
          onTimeUpdate={(e) => onTimeUpdate(e.currentTarget.currentTime)}
          onEnded={() => onPlayChange(false)}
        />
        <button
          onClick={handleToggle}
          disabled={!ready}
          className="w-10 h-10 rounded-full bg-accent flex items-center justify-center flex-shrink-0 hover:bg-violet-500 transition-all disabled:opacity-40 shadow-md shadow-accent/20"
        >
          {playing
            ? <Pause size={16} fill="white" className="text-white" />
            : <Play size={16} fill="white" className="text-white ml-0.5" />}
        </button>
        <div className="flex-1 flex items-center gap-3">
          <span className="text-xs font-mono text-muted w-10 flex-shrink-0">{fmt(currentTime)}</span>
          <div className="relative flex-1 h-1.5 bg-border rounded-full">
            <div className="absolute left-0 top-0 h-full bg-accent rounded-full" style={{ width: `${pct}%` }} />
            <input
              type="range" min={0} max={duration || 0} step={0.1} value={currentTime}
              onChange={handleSeek} disabled={!ready}
              className="absolute inset-0 w-full opacity-0 cursor-pointer disabled:cursor-default"
            />
          </div>
          <span className="text-xs font-mono text-muted w-10 flex-shrink-0 text-right">{fmt(duration)}</span>
        </div>
      </div>
    );
  }
);

AudioPlayer.displayName = "AudioPlayer";
