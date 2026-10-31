'use client';

import React, { useState, useEffect, Suspense } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useData } from '@/context/DataContext';
import { OperationalTier, TelemetryRow } from '@/types/telemetry';
import RiskTrendChart from '@/components/encounters/RiskTrendChart';

// ---------- Shared visual helpers (same palette as the Insights page) ----------

const TIER_HEX: Record<OperationalTier, string> = {
  critical: '#EF4444',
  elevated: '#FBBF24',
  safe: '#10B981',
  incomplete: '#94A3B8',
};

const TIER_LABEL: Record<OperationalTier, string> = {
  critical: 'CRITICAL',
  elevated: 'ELEVATED',
  safe: 'SAFE',
  incomplete: 'INCOMPLETE',
};

const TIER_ICON: Record<OperationalTier, string> = {
  critical: '▲',
  elevated: '◆',
  safe: '●',
  incomplete: '○',
};

const PLACEHOLDER_RISK = -29; // risk = -30 means Pc too small to compute (≈ 0)

function TierBadge({ tier, size = 'sm' }: { tier: OperationalTier; size?: 'sm' | 'md' }) {
  const solid = tier === 'critical' ? 'text-white' : 'text-black';
  return (
    <span
      className={`inline-flex items-center gap-1 rounded font-bold whitespace-nowrap ${solid} ${
        size === 'md' ? 'px-2.5 py-1 text-[11px]' : 'px-2 py-0.5 text-[10px]'
      }`}
      style={{ backgroundColor: TIER_HEX[tier] }}
    >
      <span aria-hidden>{TIER_ICON[tier]}</span>
      {TIER_LABEL[tier]}
    </span>
  );
}

const pcTier = (pc: number | null): OperationalTier =>
  pc === null ? 'incomplete' : pc >= 1e-4 ? 'critical' : pc >= 1e-6 ? 'elevated' : 'safe';
const missTier = (m: number | null | undefined): OperationalTier =>
  m === null || m === undefined ? 'incomplete' : m < 1000 ? 'critical' : m <= 5000 ? 'elevated' : 'safe';

// Pc at or below 1e-29 comes from the risk = -30 placeholder (too small to compute)
const fmtPc = (pc: number | null) => (pc === null ? 'N/A' : pc <= 1e-29 ? '≈ 0' : pc.toExponential(2));
const riskToPc = (risk: number | null | undefined): number | null =>
  typeof risk !== 'number' || !Number.isFinite(risk) ? null : risk <= PLACEHOLDER_RISK ? 0 : Math.min(1, Math.pow(10, risk));

/** Position (0–100%) of a Pc on a log scale from 1e-10 to 1. */
const pcPos = (pc: number | null) => {
  if (pc === null) return 0;
  const lg = pc <= 0 ? -10 : Math.log10(pc);
  return Math.max(0, Math.min(100, ((lg + 10) / 10) * 100));
};

/** Position (0–100%) of a miss distance on a 0–10 km scale. */
const MISS_SCALE_M = 10_000;
const missPos = (m: number) => Math.max(0, Math.min(100, (m / MISS_SCALE_M) * 100));

/** Horizontal gauge with coloured policy zones and a marker. */
function ZoneGauge({
  zones,
  marker,
  ticks,
}: {
  zones: { from: number; to: number; color: string }[];
  marker: number | null;
  ticks: { at: number; label: string }[];
}) {
  return (
    <div className="pt-1">
      <div className="relative h-2.5 rounded overflow-hidden bg-[#0B1E35] flex">
        {zones.map((z, i) => (
          <div
            key={i}
            className="h-full"
            style={{ width: `${z.to - z.from}%`, backgroundColor: z.color, opacity: 0.35, marginLeft: i === 0 ? `${z.from}%` : 0 }}
          />
        ))}
        {marker !== null && (
          <div
            className="absolute top-[-2px] bottom-[-2px] w-[3px] rounded bg-[#F5F7FA] ring-2 ring-[#061426]"
            style={{ left: `calc(${marker}% - 1.5px)` }}
          />
        )}
      </div>
      <div className="relative h-3 mt-1 text-[9px] text-[#A8B6CB]">
        {ticks.map((t) => (
          <span key={t.label} className="absolute -translate-x-1/2 whitespace-nowrap" style={{ left: `${t.at}%` }}>
            {t.label}
          </span>
        ))}
      </div>
    </div>
  );
}

function PcGauge({ pc }: { pc: number | null }) {
  return (
    <ZoneGauge
      zones={[
        { from: 0, to: 40, color: TIER_HEX.safe },
        { from: 40, to: 60, color: TIER_HEX.elevated },
        { from: 60, to: 100, color: TIER_HEX.critical },
      ]}
      marker={pc === null ? null : pcPos(pc)}
      ticks={[
        { at: 4, label: '1e-10' },
        { at: 40, label: '1e-6' },
        { at: 60, label: '1e-4' },
        { at: 96, label: '1' },
      ]}
    />
  );
}

function MissGauge({ missM }: { missM: number }) {
  return (
    <ZoneGauge
      zones={[
        { from: 0, to: 10, color: TIER_HEX.critical },
        { from: 10, to: 50, color: TIER_HEX.elevated },
        { from: 50, to: 100, color: TIER_HEX.safe },
      ]}
      marker={missPos(missM)}
      ticks={[
        { at: 10, label: '1 km' },
        { at: 50, label: '5 km' },
        { at: 95, label: '10+ km' },
      ]}
    />
  );
}

function Panel({
  title,
  subtitle,
  right,
  accent,
  children,
}: {
  title: string;
  subtitle?: string;
  right?: React.ReactNode;
  accent?: string;
  children: React.ReactNode;
}) {
  return (
    <div
      className="bg-[#061426] border rounded-lg p-4 space-y-3"
      style={{ borderColor: accent ? `${accent}66` : '#243B55' }}
    >
      <div className="flex items-start justify-between gap-2">
        <div>
          <h3 className="text-[11px] font-bold text-[#F5F7FA]">{title}</h3>
          {subtitle && <p className="text-[10px] text-[#A8B6CB]">{subtitle}</p>}
        </div>
        {right}
      </div>
      {children}
    </div>
  );
}

function Field({ label, value, unit }: { label: string; value: React.ReactNode; unit?: string }) {
  return (
    <div className="p-2.5 bg-[#0B1E35] border border-[#243B55] rounded">
      <span className="text-[10px] text-[#A8B6CB] block">{label}</span>
      <span className="text-[13px] font-bold text-[#F5F7FA] font-mono">
        {value}
        {unit && value !== 'N/A' && <span className="text-[10px] text-[#A8B6CB] font-normal ml-1">{unit}</span>}
      </span>
    </div>
  );
}

const fmtNum = (v: number | null | undefined, digits = 1) =>
  v === null || v === undefined || !Number.isFinite(v) ? 'N/A' : v.toLocaleString(undefined, { maximumFractionDigits: digits });

// ---------- Page ----------

function EncountersContent() {
  const searchParams = useSearchParams();
  const urlEventId = searchParams.get('eventId');

  const {
    encounters,
    selectedEncounter,
    selectedMessages,
    selectEncounterById,
    acknowledgeEncounter,
    createOrUpdatePlan,
    requestPrediction,
    setGlobeFilters,
    globeViewRef,
  } = useData();

  // Search & Filter States
  const [searchTerm, setSearchTerm] = useState('');
  const [tierFilter, setTierFilter] = useState<string>('all');
  const [objectFilter, setObjectFilter] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [leadTimeFilter, setLeadTimeFilter] = useState<string>(searchParams.get('leadTime') || 'all'); // set by Insights histogram clicks

  const [activeSubtab, setActiveSubtab] = useState<'assessment' | 'telemetry' | 'updates'>('assessment');
  const [isRawExpanded, setIsRawExpanded] = useState(false);
  const [isPredicting, setIsPredicting] = useState(false);

  // Pagination
  const [currentPage, setCurrentPage] = useState(1);
  const pageSize = 10;

  useEffect(() => {
    if (urlEventId) {
      selectEncounterById(urlEventId);
    }
  }, [urlEventId]);

  // Every filter except tier, so the tier tiles can show the split of the current selection
  const baseFiltered = encounters.filter((enc) => {
    if (searchTerm && !enc.event_id.toLowerCase().includes(searchTerm.toLowerCase())) return false;
    if (objectFilter !== 'all' && enc.c_object_type !== objectFilter) return false;
    if (statusFilter !== 'all' && enc.review_status !== statusFilter) return false;
    const t = enc.min_time_to_tca;
    switch (leadTimeFilter) {
      case 'within_24h': return t <= 1.0; // includes encounters already at/after TCA
      case '1_to_2d': return t > 1.0 && t <= 2.0;
      case '2_to_3d': return t > 2.0 && t <= 3.0;
      case '1_to_3d': return t > 1.0 && t <= 3.0;
      case '3_to_5d': return t > 3.0 && t <= 5.0;
      case '5_to_7d': return t > 5.0 && t <= 7.0;
      case 'gt_7d': return t > 7.0;
      case 'gt_3d': return t > 3.0;
    }
    return true;
  });

  const filteredEncounters =
    tierFilter === 'all' ? baseFiltered : baseFiltered.filter((enc) => enc.operational_tier === tierFilter);

  const tierCounts = { critical: 0, elevated: 0, safe: 0, incomplete: 0 } as Record<OperationalTier, number>;
  for (const e of baseFiltered) tierCounts[e.operational_tier]++;
  const within24h = filteredEncounters.filter((e) => e.min_time_to_tca <= 1.0).length;
  const unreviewed = filteredEncounters.filter((e) => e.review_status === 'unreviewed').length;

  // Sort logic: Critical first, then by smallest lead time
  const sortedEncounters = [...filteredEncounters].sort((a, b) => {
    const tierOrder: Record<OperationalTier, number> = { critical: 0, elevated: 1, safe: 2, incomplete: 3 };
    if (tierOrder[a.operational_tier] !== tierOrder[b.operational_tier]) {
      return tierOrder[a.operational_tier] - tierOrder[b.operational_tier];
    }
    return a.min_time_to_tca - b.min_time_to_tca;
  });

  const totalPages = Math.max(1, Math.ceil(sortedEncounters.length / pageSize));
  const paginatedEncounters = sortedEncounters.slice((currentPage - 1) * pageSize, currentPage * pageSize);

  const resetPage = () => setCurrentPage(1);
  const toggleTier = (tier: string) => {
    setTierFilter((cur) => (cur === tier ? 'all' : tier));
    resetPage();
  };

  const handlePredict = async () => {
    if (!selectedEncounter) return;
    setIsPredicting(true);
    try {
      await requestPrediction(selectedEncounter.event_id);
    } catch (e) {
      alert('Prediction request failed. Telemetry preserved.');
    } finally {
      setIsPredicting(false);
    }
  };

  const handleSendToPlanning = () => {
    if (!selectedEncounter) return;
    createOrUpdatePlan({
      event_id: selectedEncounter.event_id,
      planning_status: 'assessing',
      assessment_rationale: `Encounter ${selectedEncounter.event_id} queued for manual planning. Operational tier: ${selectedEncounter.operational_tier.toUpperCase()}.`,
    });
    alert(`Encounter ${selectedEncounter.event_id} added to Planning Queue.`);
  };

  const latestMessage: TelemetryRow | null = selectedMessages[selectedMessages.length - 1] || null;
  const selectedPc = selectedEncounter
    ? selectedEncounter.predicted_pc !== null
      ? selectedEncounter.predicted_pc
      : selectedEncounter.source_pc
    : null;
  const selTier = selectedEncounter?.operational_tier ?? 'incomplete';
  const selHex = TIER_HEX[selTier];

  const selectCls =
    'bg-[#061426] border border-[#243B55] rounded px-2.5 py-1.5 text-[#F5F7FA] focus:border-[#245BFF] focus:outline-none';

  const kpiTiles: { key: string; label: string; count: number; hex?: string; tier?: OperationalTier }[] = [
    { key: 'critical', label: 'CRITICAL', count: tierCounts.critical, hex: TIER_HEX.critical, tier: 'critical' },
    { key: 'elevated', label: 'ELEVATED', count: tierCounts.elevated, hex: TIER_HEX.elevated, tier: 'elevated' },
    { key: 'safe', label: 'SAFE', count: tierCounts.safe, hex: TIER_HEX.safe, tier: 'safe' },
  ];

  return (
    <div className="flex-1 flex flex-col bg-[#061426] text-xs overflow-hidden">
      {/* Header + KPI strip */}
      <div className="px-6 pt-5 pb-4 border-b border-[#243B55] space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-sm font-bold text-[#F5F7FA]">CONJUNCTION ENCOUNTERS</h1>
            <p className="text-[#A8B6CB] text-[11px]">
              {filteredEncounters.length.toLocaleString()} of {encounters.length.toLocaleString()} unique encounters match
              filters · click a tier tile to filter
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <input
              type="text"
              placeholder="Search EV-..."
              value={searchTerm}
              onChange={(e) => {
                setSearchTerm(e.target.value);
                resetPage();
              }}
              className={`${selectCls} w-36 px-3`}
            />
            <select value={tierFilter} onChange={(e) => { setTierFilter(e.target.value); resetPage(); }} className={selectCls}>
              <option value="all">All Tiers</option>
              <option value="critical">Critical</option>
              <option value="elevated">Elevated</option>
              <option value="safe">Safe</option>
            </select>
            <select value={objectFilter} onChange={(e) => { setObjectFilter(e.target.value); resetPage(); }} className={selectCls}>
              <option value="all">All Objects</option>
              <option value="DEBRIS">DEBRIS</option>
              <option value="PAYLOAD">PAYLOAD</option>
              <option value="ROCKET BODY">ROCKET BODY</option>
              <option value="UNKNOWN">UNKNOWN</option>
            </select>
            <select value={statusFilter} onChange={(e) => { setStatusFilter(e.target.value); resetPage(); }} className={selectCls}>
              <option value="all">All Status</option>
              <option value="unreviewed">Unreviewed</option>
              <option value="acknowledged">Acknowledged</option>
              <option value="in_planning">In Planning</option>
              <option value="reviewed">Reviewed</option>
            </select>
            <select value={leadTimeFilter} onChange={(e) => { setLeadTimeFilter(e.target.value); resetPage(); }} className={selectCls}>
              <option value="all">All Lead Times</option>
              <option value="within_24h">&le; 24h of TCA</option>
              <option value="1_to_2d">1 to 2 days</option>
              <option value="2_to_3d">2 to 3 days</option>
              <option value="1_to_3d">1 to 3 days</option>
              <option value="3_to_5d">3 to 5 days</option>
              <option value="5_to_7d">5 to 7 days</option>
              <option value="gt_7d">&gt; 7 days</option>
              <option value="gt_3d">&gt; 3 days</option>
            </select>
          </div>
        </div>

        {/* KPI tiles */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          <button
            type="button"
            onClick={() => toggleTier('all')}
            className={`p-3 text-left bg-[#0B1E35] border rounded-lg transition-colors hover:bg-[#132742] ${
              tierFilter === 'all' ? 'border-[#245BFF]' : 'border-[#243B55]'
            }`}
          >
            <span className="text-[10px] text-[#A8B6CB] block">MATCHING ENCOUNTERS</span>
            <span className="text-base font-bold text-[#245BFF]">{baseFiltered.length.toLocaleString()}</span>
          </button>
          {kpiTiles.map((k) => {
            const active = tierFilter === k.key;
            const pct = baseFiltered.length > 0 ? (k.count / baseFiltered.length) * 100 : 0;
            return (
              <button
                key={k.key}
                type="button"
                onClick={() => toggleTier(k.key)}
                className="p-3 text-left bg-[#0B1E35] border rounded-lg transition-colors hover:bg-[#132742]"
                style={{
                  borderColor: active ? k.hex : `${k.hex}66`,
                  boxShadow: active ? `inset 0 0 0 1px ${k.hex}` : undefined,
                }}
                title={active ? 'Click to clear tier filter' : `Show only ${k.label.toLowerCase()} encounters`}
              >
                <span className="text-[10px] font-bold block" style={{ color: k.hex }}>
                  {k.tier && TIER_ICON[k.tier]} {k.label}
                </span>
                <span className="text-base font-bold" style={{ color: k.hex }}>
                  {k.count.toLocaleString()}
                </span>
                <span className="text-[10px] text-[#A8B6CB] ml-1.5">{pct.toFixed(1)}%</span>
                <div className="mt-1.5 w-full bg-[#061426] h-1 rounded overflow-hidden">
                  <div className="h-full rounded" style={{ width: `${pct}%`, backgroundColor: k.hex }} />
                </div>
              </button>
            );
          })}
          <button
            type="button"
            onClick={() => {
              setLeadTimeFilter((cur) => (cur === 'within_24h' ? 'all' : 'within_24h'));
              resetPage();
            }}
            className={`p-3 text-left bg-[#0B1E35] border rounded-lg transition-colors hover:bg-[#132742] ${
              leadTimeFilter === 'within_24h' ? 'border-[#F5F7FA]' : 'border-[#243B55]'
            }`}
            title="Toggle the ≤ 24h lead-time filter"
          >
            <span className="text-[10px] text-[#A8B6CB] block">TCA WITHIN 24H</span>
            <span className="text-base font-bold text-[#F5F7FA]">{within24h.toLocaleString()}</span>
          </button>
          <div className="p-3 bg-[#0B1E35] border border-[#243B55] rounded-lg">
            <span className="text-[10px] text-[#A8B6CB] block">AWAITING REVIEW</span>
            <span className="text-base font-bold text-[#F5F7FA]">{unreviewed.toLocaleString()}</span>
          </div>
        </div>
      </div>

      {/* Main split: table + detail */}
      <div className="flex-1 grid grid-cols-1 lg:grid-cols-12 overflow-hidden">
        {/* Encounters table */}
        <div className="lg:col-span-7 border-r border-[#243B55] overflow-y-auto p-5 space-y-3 flex flex-col">
          <div className="flex items-center justify-between text-[11px] text-[#A8B6CB]">
            <span>
              Sorted by <strong className="text-[#F5F7FA]">risk tier (critical first), then lead time</strong>
            </span>
            <span>
              Showing {filteredEncounters.length === 0 ? 0 : (currentPage - 1) * pageSize + 1}–
              {Math.min(currentPage * pageSize, filteredEncounters.length)} of {filteredEncounters.length.toLocaleString()}
            </span>
          </div>

          <div className="border border-[#243B55] rounded-lg overflow-hidden bg-[#0B1E35] flex-1">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="bg-[#061426] text-[#A8B6CB] border-b border-[#243B55] text-[10px]">
                  <th className="py-2.5 pl-4 pr-3 font-bold">EVENT</th>
                  <th className="py-2.5 px-3 font-bold">RISK TIER</th>
                  <th className="py-2.5 px-3 font-bold">COLLISION Pc</th>
                  <th className="py-2.5 px-3 font-bold">MISS DIST</th>
                  <th className="py-2.5 px-3 font-bold">TIME TO TCA</th>
                  <th className="py-2.5 px-3 font-bold">STATUS</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#243B55]">
                {paginatedEncounters.map((enc) => {
                  const isSelected = selectedEncounter?.event_id === enc.event_id;
                  const displayPc = enc.predicted_pc !== null ? enc.predicted_pc : enc.source_pc;
                  const hex = TIER_HEX[enc.operational_tier];
                  const pTier = pcTier(displayPc);
                  const mTier = missTier(enc.miss_distance);
                  const soon = enc.min_time_to_tca <= 1.0;

                  return (
                    <tr
                      key={enc.event_id}
                      onClick={() => selectEncounterById(enc.event_id)}
                      className={`cursor-pointer transition-colors ${
                        isSelected ? 'bg-[#245BFF]/20 hover:bg-[#245BFF]/30' : 'hover:bg-[#132742]'
                      }`}
                      style={{ boxShadow: `inset 3px 0 0 ${hex}` }}
                    >
                      <td className="py-2.5 pl-4 pr-3">
                        <div className="font-bold text-[#F5F7FA]">{enc.event_id}</div>
                        <div className="text-[10px] text-[#A8B6CB]">{enc.c_object_type}</div>
                      </td>
                      <td className="py-2.5 px-3">
                        <TierBadge tier={enc.operational_tier} />
                      </td>
                      <td className="py-2.5 px-3 min-w-[110px]">
                        <div className="font-bold text-[#F5F7FA] font-mono">
                          {fmtPc(displayPc)}
                          {enc.predicted_pc !== null && <span className="text-[9px] text-[#245BFF] ml-1">AI</span>}
                        </div>
                        <div className="mt-1 w-full max-w-[96px] bg-[#061426] h-1 rounded overflow-hidden">
                          <div
                            className="h-full rounded"
                            style={{ width: `${Math.max(2, pcPos(displayPc))}%`, backgroundColor: TIER_HEX[pTier] }}
                          />
                        </div>
                      </td>
                      <td className="py-2.5 px-3 min-w-[100px]">
                        <div className="text-[#F5F7FA] font-mono">{(enc.miss_distance / 1000).toFixed(2)} km</div>
                        <div className="mt-1 w-full max-w-[96px] bg-[#061426] h-1 rounded overflow-hidden">
                          <div
                            className="h-full rounded"
                            style={{ width: `${Math.max(2, missPos(enc.miss_distance))}%`, backgroundColor: TIER_HEX[mTier] }}
                          />
                        </div>
                      </td>
                      <td className="py-2.5 px-3 whitespace-nowrap">
                        <span className="text-[#F5F7FA] font-mono">{enc.min_time_to_tca.toFixed(2)} d</span>
                        {soon && (
                          <span className="ml-1.5 px-1.5 py-0.5 rounded text-[9px] font-bold bg-[#EF4444]/20 text-[#F5F7FA] border border-[#EF4444]/60">
                            ≤24H
                          </span>
                        )}
                      </td>
                      <td className="py-2.5 px-3">
                        <span
                          className={`px-2 py-0.5 rounded text-[10px] uppercase whitespace-nowrap ${
                            enc.review_status === 'acknowledged'
                              ? 'bg-[#10B981]/20 text-[#10B981] border border-[#10B981]/40'
                              : enc.review_status === 'in_planning'
                              ? 'bg-[#245BFF]/20 text-[#245BFF] border border-[#245BFF]/40'
                              : enc.review_status === 'reviewed'
                              ? 'bg-purple-900/40 text-purple-300 border border-purple-500/40'
                              : 'bg-[#061426] text-[#A8B6CB] border border-[#243B55]'
                          }`}
                        >
                          {enc.review_status.replace('_', ' ')}
                        </span>
                      </td>
                    </tr>
                  );
                })}
                {paginatedEncounters.length === 0 && (
                  <tr>
                    <td colSpan={6} className="p-8 text-center text-[#A8B6CB]">
                      No encounters match the current filter selection.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          <div className="flex items-center justify-between text-xs text-[#A8B6CB] pt-1">
            <span>
              Page {currentPage} of {totalPages}
            </span>
            <div className="flex gap-1">
              <button
                onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                disabled={currentPage === 1}
                className="px-3 py-1 bg-[#0B1E35] border border-[#243B55] rounded disabled:opacity-50 text-[#A8B6CB] hover:text-[#F5F7FA]"
              >
                &larr; Prev
              </button>
              <span className="px-3 py-1 bg-[#245BFF] text-white rounded font-bold">{currentPage}</span>
              <button
                onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                disabled={currentPage === totalPages}
                className="px-3 py-1 bg-[#0B1E35] border border-[#243B55] rounded disabled:opacity-50 text-[#A8B6CB] hover:text-[#F5F7FA]"
              >
                Next &rarr;
              </button>
            </div>
          </div>
        </div>

        {/* Detail panel */}
        <div className="lg:col-span-5 bg-[#0B1E35] flex flex-col overflow-y-auto border-t lg:border-t-0 border-[#243B55]">
          {selectedEncounter ? (
            <>
              {/* Detail header */}
              <div
                className="p-4 border-b border-[#243B55] space-y-3"
                style={{ background: `linear-gradient(180deg, ${selHex}1F 0%, #061426 100%)`, boxShadow: `inset 0 3px 0 ${selHex}` }}
              >
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <span className="text-[10px] text-[#A8B6CB] block">ENCOUNTER</span>
                    <div className="flex items-center gap-2">
                      <span className="text-base font-bold text-[#F5F7FA]">{selectedEncounter.event_id}</span>
                      <TierBadge tier={selTier} size="md" />
                    </div>
                    <span className="text-[10px] text-[#A8B6CB]">
                      {selectedEncounter.c_object_type} · {selectedEncounter.message_count} messages ·{' '}
                      {(selectedEncounter.min_time_to_tca * 24).toFixed(1)} h to TCA
                    </span>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <button
                    onClick={() => acknowledgeEncounter(selectedEncounter.event_id)}
                    className="px-3 py-1.5 bg-[#0B1E35] border border-[#10B981] hover:bg-[#10B981]/20 text-[#10B981] rounded font-bold transition-colors"
                  >
                    ✓ Acknowledge
                  </button>
                  <button
                    onClick={handleSendToPlanning}
                    className="px-3 py-1.5 bg-[#245BFF] hover:bg-blue-600 text-white rounded font-bold transition-colors"
                  >
                    + Send to Planning
                  </button>
                  <Link
                    href="/globe"
                    onClick={() => {
                      // Show only this encounter on the globe, turned to face it
                      globeViewRef.current = {
                        angle: selectedEncounter.lon,
                        pitch: selectedEncounter.lat,
                        zoom: 1.4,
                        rotating: false,
                      };
                      setGlobeFilters((f) => ({ ...f, focusEventId: selectedEncounter.event_id }));
                    }}
                    className="px-3 py-1.5 bg-[#0B1E35] border border-[#243B55] hover:border-[#245BFF] text-[#F5F7FA] rounded transition-colors"
                  >
                    View on Globe
                  </Link>
                  <button
                    onClick={handlePredict}
                    disabled={isPredicting}
                    className="px-3 py-1.5 bg-[#0B1E35] border border-[#243B55] hover:border-[#FBBF24] text-[#FBBF24] rounded transition-colors"
                    title="Request prediction from external model"
                  >
                    {isPredicting ? 'Calculating...' : '↻ Request Pred'}
                  </button>
                </div>
              </div>

              {/* Subtabs */}
              <div className="flex border-b border-[#243B55] bg-[#061426] font-bold text-[11px]">
                {(
                  [
                    ['assessment', 'ASSESSMENT'],
                    ['telemetry', 'TELEMETRY'],
                    ['updates', `UPDATES (${selectedEncounter.message_count})`],
                  ] as const
                ).map(([key, label]) => (
                  <button
                    key={key}
                    onClick={() => setActiveSubtab(key)}
                    className={`flex-1 py-2.5 text-center border-b-2 transition-colors ${
                      activeSubtab === key
                        ? 'border-[#245BFF] text-[#F5F7FA] bg-[#0B1E35]'
                        : 'border-transparent text-[#A8B6CB] hover:text-[#F5F7FA]'
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>

              {/* ASSESSMENT */}
              {activeSubtab === 'assessment' && (
                <div className="p-4 space-y-4">
                  {/* Classification */}
                  <Panel
                    title="OPERATIONAL CLASSIFICATION"
                    subtitle="Critical if Pc ≥ 1e-4 or miss < 1,000 m · Elevated if Pc ≥ 1e-6 or miss 1–5 km"
                    accent={selHex}
                    right={<TierBadge tier={selTier} />}
                  >
                    <ul className="space-y-1 text-[11px]">
                      {selectedEncounter.classification_reasons.length === 0 && (
                        <li className="text-[#A8B6CB]">No triggering rule recorded.</li>
                      )}
                      {selectedEncounter.classification_reasons.map((r, i) => (
                        <li key={i} className="flex gap-2 text-[#F5F7FA]">
                          <span style={{ color: selHex }} aria-hidden>
                            {TIER_ICON[selTier]}
                          </span>
                          <span>{r}</span>
                        </li>
                      ))}
                    </ul>
                  </Panel>

                  {/* Gauges */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <Panel
                      title="COLLISION PROBABILITY"
                      right={
                        <span className="text-[9px] px-1.5 py-0.5 rounded bg-[#245BFF]/20 text-[#245BFF] font-bold">
                          {selectedEncounter.predicted_pc !== null ? 'MODEL' : 'SOURCE'}
                        </span>
                      }
                    >
                      <div className="text-lg font-bold text-[#F5F7FA] font-mono leading-none">{fmtPc(selectedPc)}</div>
                      <PcGauge pc={selectedPc} />
                    </Panel>
                    <Panel title="MISS DISTANCE">
                      <div className="text-lg font-bold text-[#F5F7FA] font-mono leading-none">
                        {(selectedEncounter.miss_distance / 1000).toFixed(3)}
                        <span className="text-[11px] text-[#A8B6CB] font-normal ml-1">km</span>
                      </div>
                      <MissGauge missM={selectedEncounter.miss_distance} />
                    </Panel>
                  </div>

                  {/* Trend */}
                  <Panel title="RISK AS CLOSEST APPROACH NEARS" subtitle="Each point is one conjunction message">
                    <RiskTrendChart messages={selectedMessages} />
                  </Panel>

                  {/* Quick facts */}
                  <div className="grid grid-cols-2 gap-3">
                    <Field label="Relative speed" value={fmtNum(selectedEncounter.relative_speed, 0)} unit="m/s" />
                    <Field
                      label="Time to TCA"
                      value={selectedEncounter.min_time_to_tca.toFixed(2)}
                      unit={`d · ${(selectedEncounter.min_time_to_tca * 24).toFixed(1)} h`}
                    />
                  </div>

                  {/* Provenance + workflow */}
                  <div className="grid grid-cols-2 gap-3 text-[11px]">
                    <div className="p-2.5 bg-[#061426] border border-[#243B55] rounded">
                      <span className="text-[10px] text-[#A8B6CB] block">PROVENANCE</span>
                      <span className="text-[#F5F7FA] font-bold">
                        {selectedEncounter.predicted_pc !== null ? 'External Model v1.0.4' : 'Source assessment baseline'}
                      </span>
                      <span className="text-[10px] text-[#A8B6CB] block font-mono">Pc = 10^(log10 Pc)</span>
                    </div>
                    <div className="p-2.5 bg-[#061426] border border-[#243B55] rounded">
                      <span className="text-[10px] text-[#A8B6CB] block">WORKFLOW STATUS</span>
                      <span className="text-[#F5F7FA] font-bold uppercase">
                        {selectedEncounter.review_status.replace('_', ' ')}
                      </span>
                      <span className="text-[10px] text-[#A8B6CB] block">
                        {selectedEncounter.review_status === 'acknowledged'
                          ? 'Acknowledged by operator.'
                          : selectedEncounter.review_status === 'in_planning'
                          ? 'Active in planning workspace.'
                          : selectedEncounter.review_status === 'reviewed'
                          ? 'Review complete.'
                          : 'Awaiting human review.'}
                      </span>
                    </div>
                  </div>
                </div>
              )}

              {/* TELEMETRY */}
              {activeSubtab === 'telemetry' && (
                <div className="p-4 space-y-4">
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] font-bold text-[#F5F7FA]">LATEST MESSAGE</span>
                    <span className="text-[11px] text-[#A8B6CB]">
                      {typeof latestMessage?.time_to_tca === 'number'
                        ? `${latestMessage.time_to_tca.toFixed(2)} d before TCA`
                        : 'Lead time N/A'}
                    </span>
                  </div>

                  <Panel title="RELATIVE POSITION (R/T/N FRAME)" subtitle="Target-centred frame, metres">
                    <div className="grid grid-cols-3 gap-2">
                      <Field label="Radial (r)" value={fmtNum(latestMessage?.relative_position_r)} unit="m" />
                      <Field label="Along-track (t)" value={fmtNum(latestMessage?.relative_position_t)} unit="m" />
                      <Field label="Cross-track (n)" value={fmtNum(latestMessage?.relative_position_n)} unit="m" />
                    </div>
                  </Panel>

                  <Panel title="COVARIANCE UNCERTAINTY (1σ, RADIAL)">
                    <div className="grid grid-cols-2 gap-2">
                      <Field label="Chaser (c_sigma_r)" value={fmtNum(latestMessage?.c_sigma_r)} unit="m" />
                      <Field label="Target (t_sigma_r)" value={fmtNum(latestMessage?.t_sigma_r)} unit="m" />
                    </div>
                  </Panel>

                  <Panel title="OBJECT & SPACE WEATHER">
                    <div className="grid grid-cols-2 gap-2">
                      <Field label="Object type" value={latestMessage?.c_object_type || selectedEncounter.c_object_type} />
                      <Field label="Max risk estimate" value={fmtNum(latestMessage?.max_risk_estimate, 3)} />
                      <Field label="F10.7 solar flux" value={fmtNum(latestMessage?.F10)} unit="sfu" />
                      <Field label="AP geomagnetic index" value={fmtNum(latestMessage?.AP)} />
                    </div>
                  </Panel>

                  {/* Raw attributes */}
                  <div className="border border-[#243B55] rounded-lg overflow-hidden">
                    <button
                      onClick={() => setIsRawExpanded(!isRawExpanded)}
                      className="w-full p-2.5 bg-[#061426] text-left text-[#A8B6CB] hover:text-[#F5F7FA] flex items-center justify-between font-bold text-[11px]"
                    >
                      <span>
                        All raw CSV attributes{latestMessage ? ` (${Object.keys(latestMessage).length})` : ''}
                      </span>
                      <span>{isRawExpanded ? '▲' : '▼'}</span>
                    </button>
                    {isRawExpanded && (
                      <div className="p-3 bg-[#0B1E35] border-t border-[#243B55] max-h-56 overflow-y-auto font-mono text-[11px] space-y-1">
                        {latestMessage &&
                          Object.entries(latestMessage).map(([key, val]) => (
                            <div key={key} className="flex justify-between py-0.5 border-b border-[#243B55]/40">
                              <span className="text-[#A8B6CB]">{key}</span>
                              <span className="text-[#F5F7FA]">{val === null ? 'null' : String(val)}</span>
                            </div>
                          ))}
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* UPDATES */}
              {activeSubtab === 'updates' && (
                <div className="p-4 space-y-3">
                  <div className="flex items-center justify-between text-[11px]">
                    <span className="font-bold text-[#F5F7FA]">MESSAGE HISTORY</span>
                    <span className="text-[#A8B6CB]">{selectedMessages.length} received · newest first</span>
                  </div>

                  <div className="space-y-2">
                    {[...selectedMessages]
                      .map((msg, index) => ({ msg, index }))
                      .reverse()
                      .map(({ msg, index }) => {
                        const isLatest = index === selectedMessages.length - 1;
                        const msgPc = riskToPc(msg.risk);
                        const pT = pcTier(msgPc);
                        const mT = missTier(msg.miss_distance);
                        const order: OperationalTier[] = ['critical', 'elevated', 'safe', 'incomplete'];
                        const msgTier = order.find((t) => t === pT || t === mT) ?? 'incomplete';
                        const hex = TIER_HEX[msgTier];

                        return (
                          <div
                            key={index}
                            className={`p-3 bg-[#061426] border border-[#243B55] rounded-lg ${isLatest ? '' : 'opacity-85'}`}
                            style={{ boxShadow: `inset 3px 0 0 ${hex}` }}
                          >
                            <div className="flex items-center justify-between gap-2">
                              <span className="font-bold text-[#F5F7FA] text-[11px]">
                                Msg #{index + 1}
                                <span className="text-[#A8B6CB] font-normal">
                                  {' '}
                                  · {typeof msg.time_to_tca === 'number' ? msg.time_to_tca.toFixed(2) : '?'} d (
                                  {typeof msg.time_to_tca === 'number' ? (msg.time_to_tca * 24).toFixed(1) : '?'} h) to TCA
                                </span>
                              </span>
                              <div className="flex items-center gap-1.5">
                                {isLatest && (
                                  <span className="px-1.5 py-0.5 bg-[#245BFF] text-white text-[9px] font-bold rounded">
                                    LATEST
                                  </span>
                                )}
                                <TierBadge tier={msgTier} />
                              </div>
                            </div>

                            <div className="grid grid-cols-2 gap-3 mt-2 text-[11px]">
                              <div>
                                <span className="text-[10px] text-[#A8B6CB] block">Pc</span>
                                <span className="text-[#F5F7FA] font-mono font-bold">{fmtPc(msgPc)}</span>
                                <span className="text-[10px] text-[#A8B6CB] ml-1.5 font-mono">
                                  log₁₀ {typeof msg.risk === 'number' ? msg.risk.toFixed(2) : 'N/A'}
                                </span>
                              </div>
                              <div>
                                <span className="text-[10px] text-[#A8B6CB] block">Miss distance</span>
                                <span className="text-[#F5F7FA] font-mono font-bold">
                                  {typeof msg.miss_distance === 'number' ? `${(msg.miss_distance / 1000).toFixed(3)} km` : 'N/A'}
                                </span>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                  </div>
                </div>
              )}
            </>
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center p-8 text-center text-[#A8B6CB] gap-2">
              <span className="text-2xl text-[#243B55]">◎</span>
              <span>Select an encounter from the table to see its risk gauges, trend and telemetry.</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default function EncountersPage() {
  return (
    <Suspense
      fallback={
        <div className="flex-1 bg-[#061426] p-8 text-[#A8B6CB] flex items-center justify-center">
          Loading encounters...
        </div>
      }
    >
      <EncountersContent />
    </Suspense>
  );
}
