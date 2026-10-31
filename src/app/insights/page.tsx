'use client';

import React, { useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useData } from '@/context/DataContext';
import { formatRiskScore } from '@/lib/classification/policy';

export default function InsightsPage() {
  const router = useRouter();
  const { encounters: allEncounters, activeDataset } = useData();
  const [mission, setMission] = useState<string>('all');

  const missions = useMemo(
    () =>
      [...new Set(allEncounters.map((e) => e.mission_id).filter((m): m is string => !!m))].sort((a, b) =>
        a.localeCompare(b, undefined, { numeric: true })
      ),
    [allEncounters]
  );
  const missionLabel = (m: string) => (/^\d+$/.test(m) ? `Mission ${m}` : m);
  const encounters = useMemo(
    () => (mission === 'all' ? allEncounters : allEncounters.filter((e) => e.mission_id === mission)),
    [allEncounters, mission]
  );
  const telemetryRows = encounters.reduce((sum, e) => sum + (e.message_count || 0), 0);

  // Per-mission breakdown (always across every mission so you can compare and pick one)
  const missionRows = useMemo(() => {
    const acc = new Map<string, { n: number; crit: number; elev: number; safe: number; debris: number; miss: number }>();
    for (const e of allEncounters) {
      const id = e.mission_id ?? 'unknown';
      const a = acc.get(id) ?? { n: 0, crit: 0, elev: 0, safe: 0, debris: 0, miss: 0 };
      a.n++;
      if (e.operational_tier === 'critical') a.crit++;
      else if (e.operational_tier === 'elevated') a.elev++;
      else if (e.operational_tier === 'safe') a.safe++;
      if (e.c_object_type === 'DEBRIS') a.debris++;
      a.miss += e.miss_distance;
      acc.set(id, a);
    }
    return [...acc.entries()].map(([id, a]) => ({ id, ...a })).sort((x, y) => y.n - x.n);
  }, [allEncounters]);

  const totalEncounters = encounters.length;
  const criticalEncounters = encounters.filter((e) => e.operational_tier === 'critical').length;
  const elevatedEncounters = encounters.filter((e) => e.operational_tier === 'elevated').length;
  const safeEncounters = encounters.filter((e) => e.operational_tier === 'safe').length;
  const pendingEncounters = encounters.filter((e) => e.operational_tier === 'incomplete').length;

  // Binned distribution by Time to TCA (Days)
  // Bins: 0-1d, 1-2d, 2-3d, 3-5d, 5-7d, >7d
  const bin0to1 = encounters.filter((e) => e.min_time_to_tca <= 1.0).length; // includes any already at/after TCA
  const bin1to2 = encounters.filter((e) => e.min_time_to_tca > 1.0 && e.min_time_to_tca <= 2.0).length;
  const bin2to3 = encounters.filter((e) => e.min_time_to_tca > 2.0 && e.min_time_to_tca <= 3.0).length;
  const bin3to5 = encounters.filter((e) => e.min_time_to_tca > 3.0 && e.min_time_to_tca <= 5.0).length;
  const bin5to7 = encounters.filter((e) => e.min_time_to_tca > 5.0 && e.min_time_to_tca <= 7.0).length;
  const binGt7 = encounters.filter((e) => e.min_time_to_tca > 7.0).length;

  const bins = [
    { label: '≤1d to TCA', count: bin0to1, filterKey: 'within_24h', color: '#EF4444' },
    { label: '1-2d', count: bin1to2, filterKey: '1_to_2d', color: '#245BFF' },
    { label: '2-3d', count: bin2to3, filterKey: '2_to_3d', color: '#245BFF' },
    { label: '3-5d', count: bin3to5, filterKey: '3_to_5d', color: '#245BFF' },
    { label: '5-7d', count: bin5to7, filterKey: '5_to_7d', color: '#245BFF' },
    { label: '>7d', count: binGt7, filterKey: 'gt_7d', color: '#245BFF' },
  ];

  const maxBinCount = Math.max(1, ...bins.map((b) => b.count));

  // Object Breakdown
  const debrisCount = encounters.filter((e) => e.c_object_type === 'DEBRIS').length;
  const payloadCount = encounters.filter((e) => e.c_object_type === 'PAYLOAD').length;
  const rocketCount = encounters.filter((e) => e.c_object_type === 'ROCKET BODY').length;
  // UNKNOWN plus any other/unlabelled type (e.g. 'TBA') so the four bars add up to the total
  const unknownCount = totalEncounters - debrisCount - payloadCount - rocketCount;

  const debrisPct = totalEncounters > 0 ? ((debrisCount / totalEncounters) * 100).toFixed(1) : '0';
  const payloadPct = totalEncounters > 0 ? ((payloadCount / totalEncounters) * 100).toFixed(1) : '0';
  const rocketPct = totalEncounters > 0 ? ((rocketCount / totalEncounters) * 100).toFixed(1) : '0';
  const unknownPct = totalEncounters > 0 ? ((unknownCount / totalEncounters) * 100).toFixed(1) : '0';

  // Risk score (10^risk) distribution, split at the policy thresholds (1e-4 critical, 1e-6 elevated)
  const scores = encounters.map((e) => e.predicted_pc ?? e.source_pc);
  const riskBins = [
    { label: '\u2265 1e-4 (critical threshold)', color: '#EF4444', count: scores.filter((x) => x !== null && x >= 1e-4).length },
    { label: '1e-5 to 1e-4', color: '#F97316', count: scores.filter((x) => x !== null && x >= 1e-5 && x < 1e-4).length },
    { label: '1e-6 to 1e-5 (elevated threshold)', color: '#FBBF24', count: scores.filter((x) => x !== null && x >= 1e-6 && x < 1e-5).length },
    { label: '1e-7 to 1e-6', color: '#34D399', count: scores.filter((x) => x !== null && x >= 1e-7 && x < 1e-6).length },
    { label: '< 1e-7', color: '#10B981', count: scores.filter((x) => x !== null && x < 1e-7).length },
  ];
  const maxRiskScore = scores.reduce<number | null>((m, x) => (x !== null && (m === null || x > m) ? x : m), null);
  const riskBinTotal = Math.max(1, riskBins.reduce((s, b) => s + b.count, 0));

  const handleBinClick = (filterKey: string) => {
    router.push(`/encounters?leadTime=${filterKey}`);
  };

  return (
    <main className="flex-1 flex flex-col bg-[#061426] p-6 space-y-6 overflow-y-auto text-xs">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-sm font-bold text-[#F5F7FA]">DATASET ANALYTICS &amp; INSIGHTS</h1>
          <p className="text-[#A8B6CB] text-[11px]">
            Aggregated metrics across {mission === 'all' ? 'all missions' : missionLabel(mission)} in {activeDataset?.filename || 'active dataset'}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[#A8B6CB]">MISSION:</span>
          <select
            value={mission}
            onChange={(e) => setMission(e.target.value)}
            className="px-2 py-1 rounded bg-[#061426] border border-[#243B55] text-[#F5F7FA] font-bold focus:outline-none focus:border-[#245BFF]"
          >
            <option value="all">All missions ({missions.length})</option>
            {missions.map((m) => (
              <option key={m} value={m}>
                {missionLabel(m)}
              </option>
            ))}
          </select>
          <span className="text-[#A8B6CB] pl-2">MODE:</span>
          <span className="px-2.5 py-1 bg-[#245BFF]/20 border border-[#245BFF] text-[#245BFF] font-bold rounded">
            Operational Policy Engine
          </span>
        </div>
      </div>

      {/* KPI Top Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-7 gap-3">
        <div className="p-3 bg-[#0B1E35] border border-[#243B55] rounded-lg">
          <span className="text-[10px] text-[#A8B6CB] block">TELEMETRY ROWS</span>
          <span className="text-base font-bold text-[#F5F7FA]">
            {telemetryRows.toLocaleString()}
          </span>
        </div>
        <div className="p-3 bg-[#0B1E35] border border-[#243B55] rounded-lg">
          <span className="text-[10px] text-[#A8B6CB] block">UNIQUE ENCOUNTERS</span>
          <span className="text-base font-bold text-[#245BFF]">
            {totalEncounters.toLocaleString()}
          </span>
        </div>
        <div className="p-3 bg-[#0B1E35] border border-[#EF4444]/40 rounded-lg">
          <span className="text-[10px] text-[#EF4444] block font-bold">CRITICAL</span>
          <span className="text-base font-bold text-[#EF4444]">
            {criticalEncounters.toLocaleString()}
          </span>
        </div>
        <div className="p-3 bg-[#0B1E35] border border-[#FBBF24]/40 rounded-lg">
          <span className="text-[10px] text-[#FBBF24] block font-bold">ELEVATED</span>
          <span className="text-base font-bold text-[#FBBF24]">
            {elevatedEncounters.toLocaleString()}
          </span>
        </div>
        <div className="p-3 bg-[#0B1E35] border border-[#10B981]/40 rounded-lg">
          <span className="text-[10px] text-[#10B981] block font-bold">SAFE</span>
          <span className="text-base font-bold text-[#10B981]">
            {safeEncounters.toLocaleString()}
          </span>
        </div>
        <div className="p-3 bg-[#0B1E35] border border-[#243B55] rounded-lg">
          <span className="text-[10px] text-[#A8B6CB] block">HIGHEST RISK SCORE</span>
          <span className="text-base font-bold text-[#F5F7FA]">{formatRiskScore(maxRiskScore)}</span>
        </div>
        <div className="p-3 bg-[#0B1E35] border border-[#243B55] rounded-lg">
          <span className="text-[10px] text-[#94A3B8] block">PENDING/INCOMPLETE</span>
          <span className="text-base font-bold text-[#94A3B8]">
            {pendingEncounters.toLocaleString()}
          </span>
        </div>
      </div>

      {/* Charts Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        
        {/* Chart 1: Time to TCA Binned Histogram (7 cols) */}
        <div className="lg:col-span-7 bg-[#0B1E35] border border-[#243B55] rounded-lg p-5 space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-xs font-bold text-[#F5F7FA]">
                ENCOUNTER DISTRIBUTION BY TIME TO TCA
              </h2>
              <p className="text-[11px] text-[#A8B6CB]">
                Click any bin to view filtered encounters
              </p>
            </div>
            <span className="text-[11px] text-[#A8B6CB]">Lead time (Days)</span>
          </div>

          {/* Histogram Bar Visual */}
          <div className="h-56 flex items-stretch justify-between gap-3 pt-2 pb-2 px-2 border-b border-[#243B55]">
            {bins.map((b, i) => {
              const heightPct = b.count > 0 ? Math.max(3, (b.count / maxBinCount) * 100) : 0;

              return (
                <button
                  key={i}
                  type="button"
                  onClick={() => handleBinClick(b.filterKey)}
                  className="flex-1 min-w-0 flex flex-col items-center gap-1.5 group cursor-pointer"
                  title={`${b.label}: ${b.count.toLocaleString()} encounters (click to view)`}
                >
                  <span className="text-[11px] font-mono text-[#A8B6CB] group-hover:text-[#F5F7FA]">
                    {b.count.toLocaleString()}
                  </span>
                  <div className="flex-1 w-full min-h-0 flex items-end">
                    <div
                      className="w-full rounded-t transition-all duration-300 group-hover:brightness-125"
                      style={{
                        height: `${heightPct}%`,
                        minHeight: b.count > 0 ? 3 : 1,
                        backgroundColor: b.color,
                      }}
                    />
                  </div>
                  <span className="text-[10px] text-[#A8B6CB] group-hover:text-[#F5F7FA] whitespace-nowrap">
                    {b.label}
                  </span>
                </button>
              );
            })}
          </div>

          <div className="text-[11px] text-[#A8B6CB] leading-relaxed">
            Each bar counts encounters by the lead time of their latest assessment; encounters already at or past closest approach are included in the first bar. Click a bar to open the matching encounters.
          </div>
        </div>

        {/* Chart 2: Chaser Object Breakdown (5 cols) */}
        <div className="lg:col-span-5 bg-[#0B1E35] border border-[#243B55] rounded-lg p-5 space-y-4">
          <h2 className="text-xs font-bold text-[#F5F7FA]">
            CHASER OBJECT TYPE BREAKDOWN
          </h2>

          <div className="space-y-3 pt-1">
            <div>
              <div className="flex justify-between mb-1">
                <span className="text-[#A8B6CB]">DEBRIS</span>
                <span className="text-[#F5F7FA] font-bold">
                  {debrisCount.toLocaleString()} ({debrisPct}%)
                </span>
              </div>
              <div className="w-full bg-[#061426] h-2 rounded overflow-hidden">
                <div className="bg-[#245BFF] h-full" style={{ width: `${debrisPct}%` }} />
              </div>
            </div>

            <div>
              <div className="flex justify-between mb-1">
                <span className="text-[#A8B6CB]">PAYLOAD</span>
                <span className="text-[#F5F7FA] font-bold">
                  {payloadCount.toLocaleString()} ({payloadPct}%)
                </span>
              </div>
              <div className="w-full bg-[#061426] h-2 rounded overflow-hidden">
                <div className="bg-[#10B981] h-full" style={{ width: `${payloadPct}%` }} />
              </div>
            </div>

            <div>
              <div className="flex justify-between mb-1">
                <span className="text-[#A8B6CB]">ROCKET BODY</span>
                <span className="text-[#F5F7FA] font-bold">
                  {rocketCount.toLocaleString()} ({rocketPct}%)
                </span>
              </div>
              <div className="w-full bg-[#061426] h-2 rounded overflow-hidden">
                <div className="bg-[#FBBF24] h-full" style={{ width: `${rocketPct}%` }} />
              </div>
            </div>

            <div>
              <div className="flex justify-between mb-1">
                <span className="text-[#A8B6CB]">UNKNOWN</span>
                <span className="text-[#F5F7FA] font-bold">
                  {unknownCount.toLocaleString()} ({unknownPct}%)
                </span>
              </div>
              <div className="w-full bg-[#061426] h-2 rounded overflow-hidden">
                <div className="bg-[#94A3B8] h-full" style={{ width: `${unknownPct}%` }} />
              </div>
            </div>
          </div>

          <div className="pt-4 border-t border-[#243B55] space-y-1 text-[11px]">
            <span className="font-bold text-[#F5F7FA]">Key Operational Finding:</span>
            <p className="text-[#A8B6CB]">
              {totalEncounters === 0
                ? 'No encounters in this selection.'
                : `${debrisPct}% of encounters involve debris and ${unknownPct}% an unidentified object, neither of which can coordinate a maneuver. ${(
                    (criticalEncounters / totalEncounters) *
                    100
                  ).toFixed(1)}% of encounters are critical.`}
            </p>
          </div>
        </div>

      </div>
      {/* Risk score distribution */}
      <div className="bg-[#0B1E35] border border-[#243B55] rounded-lg p-5 space-y-3">
        <div>
          <h2 className="text-xs font-bold text-[#F5F7FA]">RISK SCORE DISTRIBUTION</h2>
          <p className="text-[11px] text-[#A8B6CB]">Risk score = 10^risk, the collision probability of each encounter&apos;s latest assessment</p>
        </div>
        <div className="space-y-2.5">
          {riskBins.map((b) => (
            <div key={b.label}>
              <div className="flex justify-between mb-1">
                <span className="text-[#A8B6CB]">{b.label}</span>
                <span className="text-[#F5F7FA] font-bold">
                  {b.count.toLocaleString()} ({((b.count / riskBinTotal) * 100).toFixed(1)}%)
                </span>
              </div>
              <div className="w-full bg-[#061426] h-2 rounded overflow-hidden">
                <div className="h-full" style={{ width: `${(b.count / riskBinTotal) * 100}%`, backgroundColor: b.color }} />
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Per-mission breakdown */}
      <div className="bg-[#0B1E35] border border-[#243B55] rounded-lg p-5 space-y-3">
        <div>
          <h2 className="text-xs font-bold text-[#F5F7FA]">FLEET BREAKDOWN BY MISSION</h2>
          <p className="text-[11px] text-[#A8B6CB]">Click a row to scope the page to that mission</p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-[11px]">
            <thead className="text-[#A8B6CB] border-b border-[#243B55]">
              <tr>
                <th className="py-1.5 pr-3">MISSION</th>
                <th className="py-1.5 pr-3 text-right">ENCOUNTERS</th>
                <th className="py-1.5 pr-3 text-right text-[#EF4444]">CRITICAL</th>
                <th className="py-1.5 pr-3 text-right text-[#FBBF24]">ELEVATED</th>
                <th className="py-1.5 pr-3 text-right text-[#10B981]">SAFE</th>
                <th className="py-1.5 pr-3 text-right">DEBRIS</th>
                <th className="py-1.5 text-right">AVG MISS</th>
              </tr>
            </thead>
            <tbody>
              {missionRows.map((r) => (
                <tr
                  key={r.id}
                  onClick={() => setMission(r.id === mission ? 'all' : r.id)}
                  className={`cursor-pointer border-b border-[#243B55]/50 hover:bg-[#132742] ${
                    r.id === mission ? 'bg-[#245BFF]/15' : ''
                  }`}
                >
                  <td className="py-1.5 pr-3 font-bold text-[#F5F7FA]">{missionLabel(r.id)}</td>
                  <td className="py-1.5 pr-3 text-right text-[#F5F7FA]">{r.n.toLocaleString()}</td>
                  <td className="py-1.5 pr-3 text-right text-[#EF4444]">{r.crit.toLocaleString()}</td>
                  <td className="py-1.5 pr-3 text-right text-[#FBBF24]">{r.elev.toLocaleString()}</td>
                  <td className="py-1.5 pr-3 text-right text-[#10B981]">{r.safe.toLocaleString()}</td>
                  <td className="py-1.5 pr-3 text-right text-[#A8B6CB]">{((r.debris / r.n) * 100).toFixed(0)}%</td>
                  <td className="py-1.5 text-right text-[#A8B6CB]">{(r.miss / r.n / 1000).toFixed(1)} km</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </main>
  );
}
