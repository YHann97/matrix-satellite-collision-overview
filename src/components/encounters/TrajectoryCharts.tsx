'use client';

import React from 'react';
import { TelemetryRow } from '@/types/telemetry';

interface Series {
  label: string;
  color: string;
  values: (number | null)[];
}

/** Model inputs are limited to CDMs at least this many days before closest approach. */
const MODEL_CUTOFF_DAYS = 2;
/** Warning window: closest approach within the next day (a time_to_tca window, not a clock time). */
const WARNING_DAYS = 1;

const W = 360;
const H = 170;
const PAD = { l: 52, r: 10, t: 10, b: 26 };

const fmt = (v: number) => (Math.abs(v) >= 1000 ? `${(v / 1000).toFixed(1)}k` : v.toFixed(0));

/** One line chart against time_to_tca. The x axis runs from far (left) to closest approach (right). */
function Chart({ title, unit, xs, series }: { title: string; unit: string; xs: number[]; series: Series[] }) {
  const all = series.flatMap((s) => s.values).filter((v): v is number => v !== null);
  if (xs.length === 0 || all.length === 0) {
    return <div className="p-3 bg-[#061426] border border-[#243B55] rounded text-[#A8B6CB]">{title}: no data</div>;
  }
  const xMax = Math.max(...xs, MODEL_CUTOFF_DAYS);
  const xMin = Math.min(...xs, 0);
  let yMin = Math.min(...all);
  let yMax = Math.max(...all);
  if (yMin === yMax) {
    yMin -= 1;
    yMax += 1;
  }
  const px = (x: number) => PAD.l + ((xMax - x) / (xMax - xMin || 1)) * (W - PAD.l - PAD.r);
  const py = (y: number) => PAD.t + ((yMax - y) / (yMax - yMin)) * (H - PAD.t - PAD.b);
  const ticksY = [yMin, (yMin + yMax) / 2, yMax];

  return (
    <div className="p-3 bg-[#061426] border border-[#243B55] rounded space-y-1">
      <div className="flex items-center justify-between">
        <span className="font-bold text-[#F5F7FA] text-[11px]">{title}</span>
        <span className="flex items-center gap-2 text-[10px]">
          {series.map((s) => (
            <span key={s.label} className="flex items-center gap-1 text-[#A8B6CB]">
              <span className="w-2 h-0.5 inline-block" style={{ backgroundColor: s.color }} />
              {s.label}
            </span>
          ))}
        </span>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full">
        {/* Warning window: closest approach within the next day */}
        {xMin <= WARNING_DAYS && (
          <rect
            x={px(WARNING_DAYS)}
            y={PAD.t}
            width={px(xMin) - px(WARNING_DAYS)}
            height={H - PAD.t - PAD.b}
            fill="#EF4444"
            fillOpacity={0.1}
          />
        )}
        {/* Model cutoff: only CDMs on the left of this line are model inputs */}
        <line x1={px(MODEL_CUTOFF_DAYS)} x2={px(MODEL_CUTOFF_DAYS)} y1={PAD.t} y2={H - PAD.b} stroke="#245BFF" strokeDasharray="3 3" />
        <text x={px(MODEL_CUTOFF_DAYS) + 3} y={PAD.t + 9} fontSize="8" fill="#245BFF">
          model uses &ge; 2 d
        </text>

        {ticksY.map((t, i) => (
          <g key={i}>
            <line x1={PAD.l} x2={W - PAD.r} y1={py(t)} y2={py(t)} stroke="#243B55" strokeWidth={0.5} />
            <text x={PAD.l - 4} y={py(t) + 3} fontSize="8" fill="#A8B6CB" textAnchor="end">
              {fmt(t)}
            </text>
          </g>
        ))}
        {[xMax, (xMax + xMin) / 2, xMin].map((t, i) => (
          <text key={i} x={px(t)} y={H - 10} fontSize="8" fill="#A8B6CB" textAnchor={i === 0 ? 'start' : i === 2 ? 'end' : 'middle'}>
            {t.toFixed(1)} d
          </text>
        ))}
        <text x={PAD.l} y={H - 1} fontSize="8" fill="#A8B6CB">
          time to closest approach &rarr;
        </text>
        <text x={4} y={PAD.t + 4} fontSize="8" fill="#A8B6CB">
          {unit}
        </text>

        {series.map((s) => {
          const pts = xs
            .map((x, i) => (s.values[i] === null || s.values[i] === undefined ? null : [px(x), py(s.values[i] as number)]))
            .filter((p): p is number[] => p !== null);
          if (pts.length === 0) return null;
          return (
            <g key={s.label}>
              <polyline fill="none" stroke={s.color} strokeWidth={1.5} points={pts.map((p) => p.join(',')).join(' ')} />
              {pts.map((p, i) => (
                <circle key={i} cx={p[0]} cy={p[1]} r={1.8} fill={s.color} />
              ))}
            </g>
          );
        })}
      </svg>
    </div>
  );
}

/** Relative position (r, t, n) and miss distance against time_to_tca, from the encounter's CDM history. */
export function TrajectoryCharts({ messages }: { messages: TelemetryRow[] }) {
  const rows = messages.filter((m) => typeof m.time_to_tca === 'number');
  if (rows.length === 0) {
    return <div className="p-4 text-[#A8B6CB]">No update history loaded for this encounter.</div>;
  }
  const xs = rows.map((m) => m.time_to_tca as number);
  const col = (k: string) => rows.map((m) => (typeof m[k] === 'number' ? (m[k] as number) : null));

  return (
    <div className="p-4 space-y-3 text-[11px]">
      <div className="flex items-center justify-between text-[#A8B6CB]">
        <span>RELATIVE GEOMETRY OVER TIME ({rows.length} updates)</span>
        <span className="flex items-center gap-1">
          <span className="w-2.5 h-2.5 inline-block bg-[#EF4444]/25 border border-[#EF4444]/40" /> within 1 day of closest approach
        </span>
      </div>
      <Chart
        title="Miss distance"
        unit="m"
        xs={xs}
        series={[{ label: 'miss', color: '#FBBF24', values: col('miss_distance') }]}
      />
      <Chart
        title="Relative position (RTN)"
        unit="m"
        xs={xs}
        series={[
          { label: 'r', color: '#60A5FA', values: col('relative_position_r') },
          { label: 't', color: '#F472B6', values: col('relative_position_t') },
          { label: 'n', color: '#34D399', values: col('relative_position_n') },
        ]}
      />
    </div>
  );
}
