'use client';

import React, { useEffect, useRef, useState } from 'react';

interface GlobeMenuProps {
  missions: string[];
  mission: string;
  tier: string;
  maxMarkers: number;
  /** Encounters in the selected mission (the most you can show) */
  totalCount: number;
  tierCounts: { critical: number; elevated: number; safe: number };
  onMission: (mission: string) => void;
  onTier: (tier: string) => void;
  onMaxMarkers: (n: number) => void;
  rotating: boolean;
  onToggleRotate: () => void;
  onZoom: (delta: number) => void;
  onReset: () => void;
}

export const missionLabel = (m: string) => (/^\d+$/.test(m) ? `Mission ${m}` : m);

const selectClass =
  'w-full px-2 py-1 rounded bg-[#061426] border border-[#243B55] text-[#F5F7FA] focus:outline-none focus:border-[#245BFF]';

/** One dropdown in the top-right corner holding every globe filter and view control. */
export function GlobeMenu(p: GlobeMenuProps) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  // Close on outside click or Escape
  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('pointerdown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const shown = Math.min(p.maxMarkers, p.totalCount);
  const summary = [p.mission === 'all' ? 'All missions' : missionLabel(p.mission), p.tier === 'all' ? 'All tiers' : p.tier]
    .join(' · ');

  return (
    <div ref={rootRef} className="absolute top-2 right-2 z-30 text-[11px] flex flex-col items-end gap-1.5">
      {/* Risk summary: encounters per class for the selected mission */}
      <div className="flex items-stretch gap-1.5">
        {([
          ['CRITICAL', p.tierCounts.critical, '#EF4444', true],
          ['ELEVATED', p.tierCounts.elevated, '#FBBF24', false],
          ['SAFE', p.tierCounts.safe, '#10B981', false],
        ] as const).map(([label, count, color, strong]) => (
          <div
            key={label}
            className="px-2.5 py-1 rounded-lg border text-center shadow-lg bg-[#0B1E35]/95"
            style={{ borderColor: color, boxShadow: strong ? `0 0 12px ${color}55` : undefined }}
          >
            <div className="text-[9px] font-bold tracking-wider" style={{ color }}>
              {label}
            </div>
            <div className={`${strong ? 'text-xl' : 'text-lg'} font-bold leading-tight`} style={{ color }}>
              {count.toLocaleString()}
            </div>
          </div>
        ))}
      </div>

      <button
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-2 px-2.5 py-1.5 bg-[#0B1E35]/95 border border-[#243B55] hover:border-[#A8B6CB] rounded shadow text-[#F5F7FA]"
      >
        <span className="text-[#A8B6CB]">{summary}</span>
        <span className="font-bold">{shown.toLocaleString()} shown</span>
        <span className="text-[#A8B6CB]">{open ? '▴' : '▾'}</span>
      </button>

      {open && (
        <div className="w-64 p-3 space-y-3 bg-[#0B1E35] border border-[#243B55] rounded-lg shadow-2xl">
          <label className="block space-y-1">
            <span className="text-[#A8B6CB]">Mission</span>
            <select value={p.mission} onChange={(e) => p.onMission(e.target.value)} className={selectClass}>
              <option value="all">All missions ({p.missions.length})</option>
              {p.missions.map((m) => (
                <option key={m} value={m}>
                  {missionLabel(m)}
                </option>
              ))}
            </select>
          </label>

          <label className="block space-y-1">
            <span className="text-[#A8B6CB]">Risk tier</span>
            <select value={p.tier} onChange={(e) => p.onTier(e.target.value)} className={selectClass}>
              <option value="all">All ({p.totalCount.toLocaleString()})</option>
              <option value="critical">Critical ({p.tierCounts.critical.toLocaleString()})</option>
              <option value="elevated">Elevated ({p.tierCounts.elevated.toLocaleString()})</option>
              <option value="safe">Safe ({p.tierCounts.safe.toLocaleString()})</option>
            </select>
          </label>

          <div className="space-y-1">
            <div className="flex items-center justify-between">
              <span className="text-[#A8B6CB]">Encounters shown</span>
              <input
                type="number"
                min={1}
                max={Math.max(1, p.totalCount)}
                value={shown}
                onChange={(e) => p.onMaxMarkers(Number(e.target.value))}
                className="w-20 px-2 py-0.5 rounded bg-[#061426] border border-[#243B55] text-[#F5F7FA] text-right focus:outline-none focus:border-[#245BFF]"
              />
            </div>
            <input
              type="range"
              min={1}
              max={Math.max(10, p.totalCount)}
              step={Math.max(1, Math.round(p.totalCount / 200))}
              value={shown}
              onChange={(e) => p.onMaxMarkers(Number(e.target.value))}
              className="w-full accent-[#245BFF]"
            />
          </div>

          <div className="flex items-center gap-1.5 pt-2 border-t border-[#243B55]">
            <button
              onClick={p.onToggleRotate}
              className="flex-1 flex items-center justify-center gap-1.5 px-2 py-1 bg-[#061426] border border-[#243B55] rounded hover:border-[#245BFF] text-[#F5F7FA]"
            >
              <span className={`w-1.5 h-1.5 rounded-full ${p.rotating ? 'bg-[#10B981]' : 'bg-[#FBBF24]'}`} />
              Rotate {p.rotating ? 'on' : 'off'}
            </button>
            <button
              onClick={() => p.onZoom(-0.15)}
              className="px-2.5 py-1 bg-[#061426] border border-[#243B55] rounded hover:border-[#A8B6CB] text-[#F5F7FA] font-bold"
              title="Zoom out"
            >
              &minus;
            </button>
            <button
              onClick={() => p.onZoom(0.15)}
              className="px-2.5 py-1 bg-[#061426] border border-[#243B55] rounded hover:border-[#A8B6CB] text-[#F5F7FA] font-bold"
              title="Zoom in"
            >
              +
            </button>
            <button
              onClick={p.onReset}
              className="px-2 py-1 bg-[#061426] border border-[#243B55] rounded hover:border-[#A8B6CB] text-[#A8B6CB]"
            >
              Reset
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
