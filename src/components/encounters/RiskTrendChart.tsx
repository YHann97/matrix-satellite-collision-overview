'use client';

import React, { useMemo } from 'react';
import {
  CartesianGrid,
  Line,
  LineChart,
  ReferenceArea,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { TelemetryRow } from '@/types/telemetry';

// risk = -30 is the dataset's placeholder for "too small to compute" (Pc ~ 0).
// Clamp it to a visible floor so one placeholder doesn't flatten the whole axis.
const RISK_FLOOR = -10;
const PLACEHOLDER_RISK = -29;

const C = {
  critical: '#EF4444',
  elevated: '#FBBF24',
  safe: '#10B981',
  line: '#F5F7FA',
  grid: '#243B55',
  muted: '#A8B6CB',
  surface: '#061426',
};

interface Point {
  t: number; // days to TCA
  risk: number | null; // clamped log10(Pc)
  rawRisk: number | null;
  missKm: number | null;
}

function ChartTooltip({ active, payload, kind }: any) {
  if (!active || !payload?.length) return null;
  const p: Point = payload[0].payload;
  return (
    <div className="px-2.5 py-1.5 bg-[#0B1E35] border border-[#243B55] rounded text-[11px] space-y-0.5 shadow-lg">
      <div className="text-[#A8B6CB]">
        {p.t.toFixed(2)} d to TCA ({(p.t * 24).toFixed(1)} h)
      </div>
      {kind === 'risk' ? (
        <div className="text-[#F5F7FA] font-bold">
          {p.rawRisk === null
            ? 'Pc: N/A'
            : p.rawRisk <= PLACEHOLDER_RISK
            ? 'Pc ≈ 0 (placeholder −30)'
            : `Pc = ${Math.pow(10, p.rawRisk).toExponential(2)}`}
        </div>
      ) : (
        <div className="text-[#F5F7FA] font-bold">
          Miss: {p.missKm === null ? 'N/A' : `${p.missKm.toFixed(3)} km`}
        </div>
      )}
    </div>
  );
}

/**
 * Two small charts sharing an x-axis (days to TCA, counting down to the right):
 * collision probability and miss distance. Separate charts rather than a dual axis.
 * Coloured bands mark the policy thresholds.
 */
export default function RiskTrendChart({ messages }: { messages: TelemetryRow[] }) {
  const data = useMemo<Point[]>(
    () =>
      messages
        .filter((m) => typeof m.time_to_tca === 'number')
        .map((m) => {
          const rawRisk = typeof m.risk === 'number' && Number.isFinite(m.risk) ? m.risk : null;
          return {
            t: m.time_to_tca as number,
            rawRisk,
            risk: rawRisk === null ? null : Math.max(RISK_FLOOR, Math.min(0, rawRisk)),
            missKm: typeof m.miss_distance === 'number' ? m.miss_distance / 1000 : null,
          };
        })
        .sort((a, b) => b.t - a.t),
    [messages]
  );

  if (data.length === 0) {
    return <div className="text-[11px] text-[#A8B6CB]">No telemetry with a time to TCA.</div>;
  }

  const maxT = Math.max(...data.map((d) => d.t));
  const tMax = Math.ceil(maxT);
  const maxMiss = Math.max(6, ...data.map((d) => d.missKm ?? 0));
  const missTop = Math.ceil(maxMiss * 1.1);

  const xAxis = (
    <XAxis
      dataKey="t"
      type="number"
      domain={[0, tMax]}
      reversed
      tickCount={Math.min(8, tMax + 1)}
      allowDecimals={false}
      tick={{ fill: C.muted, fontSize: 10 }}
      tickLine={false}
      axisLine={{ stroke: C.grid }}
      tickFormatter={(v) => `${v}d`}
    />
  );

  const dot = { r: 4, fill: C.line, stroke: C.surface, strokeWidth: 2 };
  const activeDot = { r: 5, fill: C.line, stroke: C.surface, strokeWidth: 2 };

  return (
    <div className="space-y-3">
      {/* Collision probability */}
      <div>
        <div className="flex items-center justify-between mb-1">
          <span className="text-[11px] font-bold text-[#F5F7FA]">COLLISION PROBABILITY (log₁₀ Pc)</span>
          <span className="text-[10px] text-[#A8B6CB]">floor shown at 1e-10</span>
        </div>
        <div className="h-32">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={data} margin={{ top: 4, right: 8, bottom: 0, left: -18 }}>
              <ReferenceArea y1={-4} y2={0} fill={C.critical} fillOpacity={0.1} ifOverflow="hidden" />
              <ReferenceArea y1={-6} y2={-4} fill={C.elevated} fillOpacity={0.08} ifOverflow="hidden" />
              <CartesianGrid stroke={C.grid} strokeOpacity={0.5} vertical={false} />
              <ReferenceLine y={-4} stroke={C.critical} strokeDasharray="3 3" strokeOpacity={0.7} />
              <ReferenceLine y={-6} stroke={C.elevated} strokeDasharray="3 3" strokeOpacity={0.7} />
              {xAxis}
              <YAxis
                domain={[RISK_FLOOR, 0]}
                ticks={[-10, -8, -6, -4, -2, 0]}
                tick={{ fill: C.muted, fontSize: 10 }}
                tickLine={false}
                axisLine={false}
              />
              <Tooltip content={<ChartTooltip kind="risk" />} cursor={{ stroke: C.muted, strokeDasharray: '2 2' }} />
              <Line
                type="monotone"
                dataKey="risk"
                stroke={C.line}
                strokeWidth={2}
                dot={dot}
                activeDot={activeDot}
                connectNulls
                isAnimationActive={false}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Miss distance */}
      <div>
        <div className="flex items-center justify-between mb-1">
          <span className="text-[11px] font-bold text-[#F5F7FA]">MISS DISTANCE (km)</span>
        </div>
        <div className="h-32">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={data} margin={{ top: 4, right: 8, bottom: 0, left: -18 }}>
              <ReferenceArea y1={0} y2={1} fill={C.critical} fillOpacity={0.1} ifOverflow="hidden" />
              <ReferenceArea y1={1} y2={5} fill={C.elevated} fillOpacity={0.08} ifOverflow="hidden" />
              <CartesianGrid stroke={C.grid} strokeOpacity={0.5} vertical={false} />
              <ReferenceLine y={1} stroke={C.critical} strokeDasharray="3 3" strokeOpacity={0.7} />
              <ReferenceLine y={5} stroke={C.elevated} strokeDasharray="3 3" strokeOpacity={0.7} />
              {xAxis}
              <YAxis
                domain={[0, missTop]}
                tick={{ fill: C.muted, fontSize: 10 }}
                tickLine={false}
                axisLine={false}
                allowDecimals={false}
              />
              <Tooltip content={<ChartTooltip kind="miss" />} cursor={{ stroke: C.muted, strokeDasharray: '2 2' }} />
              <Line
                type="monotone"
                dataKey="missKm"
                stroke={C.line}
                strokeWidth={2}
                dot={dot}
                activeDot={activeDot}
                connectNulls
                isAnimationActive={false}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Legend for the bands */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[10px] text-[#A8B6CB]">
        <span className="flex items-center gap-1.5">
          <span className="w-2.5 h-2.5 rounded-sm bg-[#EF4444]/40 border border-[#EF4444]" /> Critical zone
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-2.5 h-2.5 rounded-sm bg-[#FBBF24]/30 border border-[#FBBF24]" /> Elevated zone
        </span>
        <span>← further out · closest approach →</span>
      </div>
    </div>
  );
}
