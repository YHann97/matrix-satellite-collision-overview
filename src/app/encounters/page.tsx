'use client';

import React, { useState, useEffect, Suspense } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useData } from '@/context/DataContext';
import { TrajectoryCharts } from '@/components/encounters/TrajectoryCharts';
import { formatRiskScore as baseFormatRiskScore, normalizeLogRiskToPc } from '@/lib/classification/policy';

// risk = -30 is the dataset's placeholder for "too small to compute" (score ~ 0).
// Show it as "≈ 0" on this screen.
const isPlaceholderScore = (score: number | null | undefined) =>
  typeof score === 'number' && score <= 1e-29;
const formatRiskScore = (score: number | null | undefined, digits = 2) =>
  isPlaceholderScore(score) ? '≈ 0' : baseFormatRiskScore(score, digits);
import { OperationalTier, ReviewStatus } from '@/types/telemetry';

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
    activeDataset,
  } = useData();
  // Test data has no final outcomes: its tiers are model predictions, and no actual-vs-predicted comparison exists
  const tiersArePredicted = activeDataset?.has_outcomes === false;

  // Search & Filter States
  const [searchTerm, setSearchTerm] = useState('');
  const [tierFilter, setTierFilter] = useState<string>('all');
  const [objectFilter, setObjectFilter] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [leadTimeFilter, setLeadTimeFilter] = useState<string>(searchParams.get('leadTime') || 'all'); // set by Insights histogram clicks

  // Active Detail Subtab ('assessment' | 'telemetry' | 'updates')
  const [activeSubtab, setActiveSubtab] = useState<'assessment' | 'telemetry' | 'updates' | 'trajectory'>('assessment');
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

  // Filter logic
  const filteredEncounters = encounters.filter((enc) => {
    if (searchTerm && !enc.event_id.toLowerCase().includes(searchTerm.toLowerCase())) {
      return false;
    }
    if (tierFilter !== 'all' && enc.operational_tier !== tierFilter) {
      return false;
    }
    if (objectFilter !== 'all' && enc.c_object_type !== objectFilter) {
      return false;
    }
    if (statusFilter !== 'all' && enc.review_status !== statusFilter) {
      return false;
    }
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

  // Sort logic: Critical first, then by smallest lead time
  const sortedEncounters = [...filteredEncounters].sort((a, b) => {
    const tierOrder: Record<OperationalTier, number> = {
      critical: 0,
      elevated: 1,
      safe: 2,
      incomplete: 3,
    };
    if (tierOrder[a.operational_tier] !== tierOrder[b.operational_tier]) {
      return tierOrder[a.operational_tier] - tierOrder[b.operational_tier];
    }
    return a.min_time_to_tca - b.min_time_to_tca;
  });

  const totalPages = Math.max(1, Math.ceil(sortedEncounters.length / pageSize));
  const paginatedEncounters = sortedEncounters.slice(
    (currentPage - 1) * pageSize,
    currentPage * pageSize
  );

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

  const latestMessage = selectedMessages[selectedMessages.length - 1] || null;

  return (
    <div className="flex-1 flex flex-col bg-[#061426] text-xs overflow-hidden">
      {/* Top Filter Bar */}
      <div className="p-4 border-b border-[#243B55] bg-[#0B1E35] flex flex-wrap items-center justify-between gap-3 z-10">
        <div>
          <h1 className="text-sm font-bold text-[#F5F7FA]">CONJUNCTION ENCOUNTERS</h1>
          <p className="text-[#A8B6CB] text-[11px]">
            {filteredEncounters.length.toLocaleString()} of {encounters.length.toLocaleString()} unique encounters match filters
          </p>
        </div>

        {/* Filter Controls */}
        <div className="flex flex-wrap items-center gap-2">
          <input
            type="text"
            placeholder="Search EV-..."
            value={searchTerm}
            onChange={(e) => {
              setSearchTerm(e.target.value);
              setCurrentPage(1);
            }}
            className="bg-[#061426] border border-[#243B55] rounded px-3 py-1.5 text-[#F5F7FA] w-36 focus:border-[#245BFF] focus:outline-none"
          />

          <select
            value={tierFilter}
            onChange={(e) => {
              setTierFilter(e.target.value);
              setCurrentPage(1);
            }}
            className="bg-[#061426] border border-[#243B55] rounded px-2.5 py-1.5 text-[#F5F7FA] focus:border-[#245BFF]"
          >
            <option value="all">All Tiers</option>
            <option value="critical">Critical</option>
            <option value="elevated">Elevated</option>
            <option value="safe">Safe</option>
          </select>

          <select
            value={objectFilter}
            onChange={(e) => {
              setObjectFilter(e.target.value);
              setCurrentPage(1);
            }}
            className="bg-[#061426] border border-[#243B55] rounded px-2.5 py-1.5 text-[#F5F7FA] focus:border-[#245BFF]"
          >
            <option value="all">All Objects</option>
            <option value="DEBRIS">DEBRIS</option>
            <option value="PAYLOAD">PAYLOAD</option>
            <option value="ROCKET BODY">ROCKET BODY</option>
            <option value="UNKNOWN">UNKNOWN</option>
          </select>

          <select
            value={statusFilter}
            onChange={(e) => {
              setStatusFilter(e.target.value);
              setCurrentPage(1);
            }}
            className="bg-[#061426] border border-[#243B55] rounded px-2.5 py-1.5 text-[#F5F7FA] focus:border-[#245BFF]"
          >
            <option value="all">All Status</option>
            <option value="unreviewed">Unreviewed</option>
            <option value="acknowledged">Acknowledged</option>
            <option value="in_planning">In Planning</option>
            <option value="reviewed">Reviewed</option>
          </select>

          <select
            value={leadTimeFilter}
            onChange={(e) => {
              setLeadTimeFilter(e.target.value);
              setCurrentPage(1);
            }}
            className="bg-[#061426] border border-[#243B55] rounded px-2.5 py-1.5 text-[#F5F7FA] focus:border-[#245BFF]"
          >
            <option value="all">All Lead Times</option>
            <option value="within_24h">&le; 1 day to TCA</option>
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

      {/* Main Split Content: Table (Left 60%) + Detail Drawer (Right 40%) */}
      <div className="flex-1 grid grid-cols-1 lg:grid-cols-12 overflow-hidden">
        
        {/* Encounters Table (7 cols) */}
        <div className="lg:col-span-7 border-r border-[#243B55] overflow-y-auto p-4 space-y-3 flex flex-col">
          <div className="flex items-center justify-between text-[11px] text-[#A8B6CB]">
            <span>Sorted by: <strong className="text-[#F5F7FA]">Risk Tier (Critical first), then Lead Time</strong></span>
            <span>Showing {(currentPage - 1) * pageSize + 1}-{Math.min(currentPage * pageSize, filteredEncounters.length)} of {filteredEncounters.length}</span>
          </div>

          <div className="border border-[#243B55] rounded-lg overflow-hidden bg-[#0B1E35] flex-1">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="bg-[#061426] text-[#A8B6CB] border-b border-[#243B55]">
                  <th className="p-3 font-bold">EVENT ID</th>
                  <th className="p-3 font-bold">OBJECT</th>
                  <th className="p-3 font-bold">{tiersArePredicted ? 'PREDICTED TIER' : 'RISK TIER'}</th>
                  {!tiersArePredicted && <th className="p-3 font-bold" title="Final-tier forecast when available">MODEL</th>}
                  <th className="p-3 font-bold" title="Collision probability from the latest observed message">OBSERVED Pc</th>
                  <th className="p-3 font-bold">MISS DIST</th>
                  <th className="p-3 font-bold">LEAD TIME</th>
                  <th className="p-3 font-bold">STATUS</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#243B55]">
                {paginatedEncounters.map((enc) => {
                  const isSelected = selectedEncounter?.event_id === enc.event_id;
                  const displayPc = enc.source_pc;

                  return (
                    <tr
                      key={enc.event_id}
                      onClick={() => selectEncounterById(enc.event_id)}
                      className={`cursor-pointer transition-colors ${
                        isSelected
                          ? 'bg-[#245BFF]/20 hover:bg-[#245BFF]/30'
                          : 'hover:bg-[#132742]'
                      }`}
                    >
                      <td className="p-3 font-bold text-[#F5F7FA] flex items-center gap-2">
                        <span
                          className={`w-2 h-2 rounded-full ${
                            enc.operational_tier === 'critical'
                              ? 'bg-[#EF4444]'
                              : enc.operational_tier === 'elevated'
                              ? 'bg-[#FBBF24]'
                              : 'bg-[#10B981]'
                          }`}
                        />
                        <span>{enc.event_id}</span>
                      </td>
                      <td className="p-3 text-[#A8B6CB]">{enc.c_object_type}</td>
                      <td className="p-3">
                        <span
                          className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                            enc.operational_tier === 'critical'
                              ? 'bg-[#EF4444] text-white'
                              : enc.operational_tier === 'elevated'
                              ? 'bg-[#FBBF24] text-black'
                              : 'bg-[#10B981] text-black'
                          }`}
                        >
                          {enc.operational_tier.toUpperCase()}
                        </span>
                      </td>
                      {!tiersArePredicted && (
                        <td className="p-3">
                          <span
                            className={`text-[10px] font-bold uppercase ${
                              enc.model_tier && enc.model_tier !== enc.operational_tier ? 'text-[#EF4444]' : 'text-[#A8B6CB]'
                            }`}
                            title={enc.model_tier && enc.model_tier !== enc.operational_tier ? 'Differs from the observed final tier' : 'Matches the observed final tier'}
                          >
                            {enc.model_tier ?? '-'}
                          </span>
                        </td>
                      )}
                      <td className="p-3 font-bold text-[#F5F7FA]" title={`Pc = ${formatRiskScore(displayPc)}`}>
                        {formatRiskScore(displayPc)}
                        {enc.predicted_pc !== null && (
                          <span className="text-[10px] text-[#245BFF] ml-1">AI</span>
                        )}
                      </td>
                      <td className="p-3 text-[#F5F7FA]">
                        {(enc.miss_distance / 1000).toFixed(2)} km
                      </td>
                      <td className="p-3 text-[#F5F7FA]">
                        {enc.min_time_to_tca.toFixed(2)} d
                      </td>
                      <td className="p-3">
                        <span
                          className={`px-2 py-0.5 rounded text-[10px] uppercase ${
                            enc.review_status === 'acknowledged'
                              ? 'bg-[#10B981]/20 text-[#10B981] border border-[#10B981]/40'
                              : enc.review_status === 'in_planning'
                              ? 'bg-[#245BFF]/20 text-[#245BFF] border border-[#245BFF]/40'
                              : enc.review_status === 'reviewed'
                              ? 'bg-purple-900/40 text-purple-300 border border-purple-500/40'
                              : 'bg-[#061426] text-[#A8B6CB]'
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
                    <td colSpan={7} className="p-8 text-center text-[#A8B6CB]">
                      No encounters match the current filter selection.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          <div className="flex items-center justify-between text-xs text-[#A8B6CB] pt-2">
            <span>Page {currentPage} of {totalPages}</span>
            <div className="flex gap-1">
              <button
                onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                disabled={currentPage === 1}
                className="px-3 py-1 bg-[#0B1E35] border border-[#243B55] rounded disabled:opacity-50 text-[#A8B6CB] hover:text-[#F5F7FA]"
              >
                &larr; Prev
              </button>
              <span className="px-3 py-1 bg-[#245BFF] text-white rounded font-bold">
                {currentPage}
              </span>
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

        {/* Selected-Event Detail Drawer (5 cols) */}
        <div className="lg:col-span-5 bg-[#0B1E35] flex flex-col overflow-y-auto border-t lg:border-t-0 border-[#243B55]">
          {selectedEncounter ? (
            <>
              {/* Detail Header & Action Bar */}
              <div className="p-4 border-b border-[#243B55] bg-[#061426]/60 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="text-[#A8B6CB] text-[11px]">ENCOUNTER:</span>
                    <span className="text-base font-bold text-[#F5F7FA]">
                      {selectedEncounter.event_id}
                    </span>
                    <span
                      className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                        selectedEncounter.operational_tier === 'critical'
                          ? 'bg-[#EF4444] text-white'
                          : selectedEncounter.operational_tier === 'elevated'
                          ? 'bg-[#FBBF24] text-black'
                          : 'bg-[#10B981] text-black'
                      }`}
                    >
                      {selectedEncounter.operational_tier.toUpperCase()}
                    </span>
                  </div>

                  <span className="text-[11px] text-[#10B981] font-bold">
                    Latest Msg ({selectedEncounter.message_count} total)
                  </span>
                </div>

                {/* Action Buttons */}
                <div className="flex flex-wrap items-center gap-2 pt-1">
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
                    disabled={!selectedEncounter.model_tier || isPredicting}
                    className="px-3 py-1.5 bg-[#0B1E35] border border-[#243B55] text-[#FBBF24] rounded transition-colors disabled:opacity-50"
                    title="Use the saved final-tier forecast"
                  >
                    {isPredicting ? 'Loading...' : selectedEncounter.model_tier ? 'Forecast loaded' : 'Forecast unavailable'}
                  </button>
                </div>
              </div>

              {/* Subtabs Header */}
              <div className="flex border-b border-[#243B55] bg-[#061426] font-bold text-xs">
                <button
                  onClick={() => setActiveSubtab('assessment')}
                  className={`flex-1 py-2.5 text-center border-b-2 transition-colors ${
                    activeSubtab === 'assessment'
                      ? 'border-[#245BFF] text-[#245BFF]'
                      : 'border-transparent text-[#A8B6CB] hover:text-[#F5F7FA]'
                  }`}
                >
                  1. ASSESSMENT
                </button>
                <button
                  onClick={() => setActiveSubtab('telemetry')}
                  className={`flex-1 py-2.5 text-center border-b-2 transition-colors ${
                    activeSubtab === 'telemetry'
                      ? 'border-[#245BFF] text-[#245BFF]'
                      : 'border-transparent text-[#A8B6CB] hover:text-[#F5F7FA]'
                  }`}
                >
                  2. TELEMETRY
                </button>
                <button
                  onClick={() => setActiveSubtab('updates')}
                  className={`flex-1 py-2.5 text-center border-b-2 transition-colors ${
                    activeSubtab === 'updates'
                      ? 'border-[#245BFF] text-[#245BFF]'
                      : 'border-transparent text-[#A8B6CB] hover:text-[#F5F7FA]'
                  }`}
                >
                  3. UPDATES ({selectedEncounter.message_count})
                </button>
                <button
                  onClick={() => setActiveSubtab('trajectory')}
                  className={`flex-1 py-2.5 text-center border-b-2 transition-colors ${
                    activeSubtab === 'trajectory'
                      ? 'border-[#245BFF] text-[#245BFF]'
                      : 'border-transparent text-[#A8B6CB] hover:text-[#F5F7FA]'
                  }`}
                >
                  4. TRAJECTORY
                </button>
              </div>

              {/* SUBTAB 4: TRAJECTORY */}
              {activeSubtab === 'trajectory' && <TrajectoryCharts messages={selectedMessages} />}

              {/* SUBTAB 1: ASSESSMENT */}
              {activeSubtab === 'assessment' && (
                <div className="p-4 space-y-4">
                  {/* Model Provenance */}
                  <div className="p-3 bg-[#061426] border border-[#243B55] rounded-lg space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-[#A8B6CB] text-[11px]">PROVENANCE</span>
                      <span className="px-2 py-0.5 bg-[#245BFF]/20 text-[#245BFF] rounded font-bold text-[10px]">
                        {selectedEncounter.model_tier_probabilities ? 'Final-tier forecast' : 'Source assessment'}
                      </span>
                    </div>
                    <div className="grid grid-cols-2 gap-2 text-[11px]">
                      <div>
                        <span className="text-[#A8B6CB] block">Prediction Target:</span>
                        <span className="text-[#F5F7FA] font-bold">{selectedEncounter.model_tier_probabilities ? 'Final recorded tier' : 'Current assessment'}</span>
                      </div>
                    </div>
                  </div>

                  {selectedEncounter.model_tier && selectedEncounter.model_tier_probabilities && (
                    <div className="p-3 bg-[#061426] border border-[#243B55] rounded-lg space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-[#A8B6CB] text-[11px]">PREDICTED FINAL TIER</span>
                        <span className="text-[#F5F7FA] font-bold uppercase">{selectedEncounter.model_tier}</span>
                      </div>
                      <div className="grid grid-cols-3 gap-2 text-[11px]">
                        {(['Safe', 'Elevated', 'Critical'] as const).map((tier) => (
                          <div key={tier}>
                            <span className="text-[#A8B6CB] block">{tier}</span>
                            <span className="text-[#F5F7FA] font-bold">{(selectedEncounter.model_tier_probabilities![tier] * 100).toFixed(1)}%</span>
                          </div>
                        ))}
                      </div>
                      <p className="text-[10px] text-[#A8B6CB]">
                        Based on updates at least two days before closest approach; latest input {selectedEncounter.prediction_as_of_days?.toFixed(2) ?? '—'} days out. These are tier probabilities, not collision Pc.
                      </p>
                    </div>
                  )}

                  {/* Operational Policy Evaluation */}
                  <div className="p-3 bg-[#061426] border border-[#EF4444]/40 rounded-lg space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-[#A8B6CB] text-[11px]">LATEST OBSERVED CLASSIFICATION</span>
                      <span className="font-bold text-[#EF4444] uppercase">
                        {tiersArePredicted ? selectedEncounter.current_tier ?? 'incomplete' : selectedEncounter.operational_tier}
                      </span>
                    </div>
                    <div className="text-[11px] space-y-1">
                      {selectedEncounter.classification_reasons.map((r, i) => (
                        <div key={i} className="text-[#EF4444] font-bold">
                          • Triggered: {r}
                        </div>
                      ))}
                      <p className="text-[#A8B6CB] pt-1">
                        Policy Rule: Critical if risk score &ge; 1e-4 OR miss_distance &lt; 1,000m. Evaluated unrounded.
                      </p>
                    </div>
                  </div>

                  {/* Metrics */}
                  <div className="grid grid-cols-2 gap-3">
                    <div className="p-3 bg-[#061426] border border-[#243B55] rounded">
                      <span className="text-[#A8B6CB] text-[11px]">Latest observed collision probability (Pc)</span>
                      <div className="text-sm font-bold text-[#F5F7FA] mt-1">
                        {formatRiskScore(selectedEncounter.source_pc)}
                      </div>
                      <div className="text-[#A8B6CB] text-[10px] mt-1">
                        {selectedEncounter.source_pc === 0
                          ? 'Dataset risk floor (−30): probability too small to compute'
                          : selectedEncounter.source_pc != null && selectedEncounter.source_pc > 0
                          ? `Source risk (log₁₀ Pc): ${Math.log10(selectedEncounter.source_pc).toFixed(2)}`
                          : 'No observed probability available'}
                      </div>
                      <div className="text-[#A8B6CB] text-[10px] mt-1">From the latest message; not the predicted final tier.</div>
                    </div>
                    <div className="p-3 bg-[#061426] border border-[#243B55] rounded">
                      <span className="text-[#A8B6CB] text-[11px]">Miss Distance</span>
                      <div className="text-sm font-bold text-[#F5F7FA] mt-1">
                        {selectedEncounter.miss_distance.toFixed(1)} m
                      </div>
                      <span className="text-[#A8B6CB] text-[10px]">
                        {(selectedEncounter.miss_distance / 1000).toFixed(3)} km
                      </span>
                    </div>
                    <div className="p-3 bg-[#061426] border border-[#243B55] rounded">
                      <span className="text-[#A8B6CB] text-[11px]">Relative Speed</span>
                      <div className="text-sm font-bold text-[#F5F7FA] mt-1">
                        {selectedEncounter.relative_speed?.toLocaleString() || '14,210'} m/s
                      </div>
                    </div>
                    <div className="p-3 bg-[#061426] border border-[#243B55] rounded">
                      <span className="text-[#A8B6CB] text-[11px]">Time to TCA</span>
                      <div className="text-sm font-bold text-[#F5F7FA] mt-1">
                        {selectedEncounter.min_time_to_tca.toFixed(2)} days
                      </div>
                      <span className="text-[#A8B6CB] text-[10px]">
                        {(selectedEncounter.min_time_to_tca * 24).toFixed(1)} hours lead time
                      </span>
                    </div>
                  </div>

                  {/* Workflow State */}
                  <div className="p-3 bg-[#061426] border border-[#243B55] rounded space-y-1">
                    <span className="text-[#A8B6CB] text-[11px] block">CURRENT WORKFLOW STATUS</span>
                    <div className="flex items-center gap-2">
                      <span className="px-2 py-0.5 bg-[#243B55] text-[#A8B6CB] rounded font-bold uppercase">
                        {selectedEncounter.review_status.replace('_', ' ')}
                      </span>
                      <span className="text-[#A8B6CB] text-[11px]">
                        {selectedEncounter.review_status === 'acknowledged'
                          ? 'Acknowledged by operator.'
                          : selectedEncounter.review_status === 'in_planning'
                          ? 'Active in manual planning workspace.'
                          : 'Awaiting human review.'}
                      </span>
                    </div>
                  </div>
                </div>
              )}

              {/* SUBTAB 2: TELEMETRY */}
              {activeSubtab === 'telemetry' && (
                <div className="p-4 space-y-4">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-[#F5F7FA]">SIMPLIFIED TELEMETRY FEATURES</span>
                    <span className="text-[11px] text-[#245BFF]">
                      Latest Assessment ({latestMessage?.time_to_tca?.toFixed(2) || '0.45'} d lead)
                    </span>
                  </div>

                  {/* R/T/N Relative Frame */}
                  <div className="p-3 bg-[#061426] border border-[#243B55] rounded space-y-2">
                    <span className="font-bold text-[#F5F7FA] block">
                      Relative Position &amp; Velocity (R/T/N Frame)
                    </span>
                    <div className="grid grid-cols-3 gap-2 text-[11px]">
                      <div>
                        <span className="text-[#A8B6CB] block">r_pos_r (Radial):</span>
                        <span className="text-[#F5F7FA] font-mono">
                          {latestMessage?.relative_position_r !== null ? `${latestMessage?.relative_position_r} m` : 'null'}
                        </span>
                      </div>
                      <div>
                        <span className="text-[#A8B6CB] block">r_pos_t (Along-track):</span>
                        <span className="text-[#F5F7FA] font-mono">
                          {latestMessage?.relative_position_t !== null ? `${latestMessage?.relative_position_t} m` : 'null'}
                        </span>
                      </div>
                      <div>
                        <span className="text-[#A8B6CB] block">r_pos_n (Cross-track):</span>
                        <span className="text-[#F5F7FA] font-mono">
                          {latestMessage?.relative_position_n !== null ? `${latestMessage?.relative_position_n} m` : 'null'}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Covariance Uncertainties */}
                  <div className="p-3 bg-[#061426] border border-[#243B55] rounded space-y-2">
                    <span className="font-bold text-[#F5F7FA] block">
                      Covariance Uncertainty (1-Sigma)
                    </span>
                    <div className="grid grid-cols-2 gap-2 text-[11px]">
                      <div>
                        <span className="text-[#A8B6CB] block">c_sigma_r (Chaser Radial):</span>
                        <span className="text-[#F5F7FA] font-mono">
                          {latestMessage?.c_sigma_r !== null ? `${latestMessage?.c_sigma_r} m` : 'null'}
                        </span>
                      </div>
                      <div>
                        <span className="text-[#A8B6CB] block">t_sigma_r (Target Radial):</span>
                        <span className="text-[#F5F7FA] font-mono">
                          {latestMessage?.t_sigma_r !== null ? `${latestMessage?.t_sigma_r} m` : 'null'}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Object & Atmosphere */}
                  <div className="p-3 bg-[#061426] border border-[#243B55] rounded space-y-2">
                    <span className="font-bold text-[#F5F7FA] block">
                      Object &amp; Space Weather Parameters
                    </span>
                    <div className="grid grid-cols-2 gap-2 text-[11px]">
                      <div>
                        <span className="text-[#A8B6CB] block">c_object_type:</span>
                        <span className="text-[#F5F7FA]">{latestMessage?.c_object_type || selectedEncounter.c_object_type}</span>
                      </div>
                      <div>
                        <span className="text-[#A8B6CB] block">max_risk_estimate:</span>
                        <span className="text-[#F5F7FA] font-mono">{latestMessage?.max_risk_estimate ?? 'N/A'}</span>
                      </div>
                      <div>
                        <span className="text-[#A8B6CB] block">F10 (Solar Flux):</span>
                        <span className="text-[#F5F7FA] font-mono">{latestMessage?.F10 ? `${latestMessage.F10} sfu` : 'N/A'}</span>
                      </div>
                      <div>
                        <span className="text-[#A8B6CB] block">AP (Geomagnetic Index):</span>
                        <span className="text-[#F5F7FA] font-mono">{latestMessage?.AP ?? 'N/A'}</span>
                      </div>
                    </div>
                  </div>

                  {/* All 103 CSV Attributes Accordion */}
                  <div className="border border-[#243B55] rounded overflow-hidden">
                    <button
                      onClick={() => setIsRawExpanded(!isRawExpanded)}
                      className="w-full p-2.5 bg-[#061426] text-left text-[#A8B6CB] hover:text-[#F5F7FA] flex items-center justify-between font-bold"
                    >
                      <span>View All 103 Raw CSV Telemetry Attributes</span>
                      <span>{isRawExpanded ? '▲' : '▼'}</span>
                    </button>
                    {isRawExpanded && (
                      <div className="p-3 bg-[#0B1E35] border-t border-[#243B55] max-h-56 overflow-y-auto font-mono text-[11px] space-y-1">
                        {latestMessage &&
                          Object.entries(latestMessage).map(([key, val]) => (
                            <div
                              key={key}
                              className="flex justify-between py-0.5 border-b border-[#243B55]/40"
                            >
                              <span className="text-[#A8B6CB]">{key}:</span>
                              <span className="text-[#F5F7FA]">
                                {val === null ? 'null' : String(val)}
                              </span>
                            </div>
                          ))}
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* SUBTAB 3: UPDATES */}
              {activeSubtab === 'updates' && (
                <div className="p-4 space-y-3">
                  <div className="flex items-center justify-between text-[#A8B6CB] text-[11px]">
                    <span>TELEMETRY UPDATE HISTORY</span>
                    <span>{selectedMessages.length} messages received</span>
                  </div>

                  <div className="space-y-2">
                    {selectedMessages.map((msg, index) => {
                      const isLatest = index === selectedMessages.length - 1;
                      const msgPc = normalizeLogRiskToPc(msg.risk);

                      return (
                        <div
                          key={index}
                          className={`p-3 bg-[#061426] border rounded transition-all ${
                            isLatest
                              ? 'border-l-4 border-l-[#EF4444] border-[#243B55]'
                              : 'border-l-4 border-l-[#243B55] border-[#243B55] opacity-80'
                          }`}
                        >
                          <div className="flex items-center justify-between">
                            <span className="font-bold text-[#F5F7FA]">
                              Msg #{index + 1} &bull; Lead Time: {msg.time_to_tca?.toFixed(2)} d ({(Number(msg.time_to_tca) * 24).toFixed(1)} h)
                            </span>
                            {isLatest && (
                              <span className="px-1.5 py-0.5 bg-[#EF4444] text-white text-[10px] font-bold rounded">
                                LATEST
                              </span>
                            )}
                          </div>

                          <div className="grid grid-cols-2 gap-2 mt-2 text-[#A8B6CB] text-[11px]">
                            <div>
                              Risk score:{' '}
                              <strong className="text-[#F5F7FA] font-mono">{formatRiskScore(msgPc)}</strong>                            </div>
                            <div>
                              Miss Distance:{' '}
                              <strong className="text-[#F5F7FA]">
                                {msg.miss_distance !== null ? `${msg.miss_distance} m` : 'N/A'}
                              </strong>
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
            <div className="p-8 text-center text-[#A8B6CB]">
              Select an encounter from the table to view its assessment details.
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
