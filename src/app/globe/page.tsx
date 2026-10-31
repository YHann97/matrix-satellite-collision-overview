'use client';

import React, { useMemo, useState } from 'react';
import Link from 'next/link';
import { useData } from '@/context/DataContext';
import { GlobeView } from '@/components/globe/GlobeView';
import { CollisionSimCard } from '@/components/globe/CollisionSimCard';
import { EncounterSummary } from '@/types/telemetry';

export default function GlobePage() {
  const { encounters: allEncounters, selectedEncounter, selectedMessages, selectEncounterById, globeFilters, setGlobeFilters } = useData();
  const { mission: filterMission, tier: filterTier, maxMarkers, cardMinimized, headerCollapsed, focusEventId } = globeFilters;
  const setFilterMission = (mission: string) => setGlobeFilters((f) => ({ ...f, mission }));
  const setFilterTier = (tier: string) => setGlobeFilters((f) => ({ ...f, tier }));
  const setMaxMarkers = (n: number) =>
    setGlobeFilters((f) => ({ ...f, maxMarkers: Math.max(1, Math.min(1_000_000, Math.round(n) || 1)) }));
  const [isCardDismissed, setIsCardDismissed] = useState(false);
  // Set when a satellite is clicked on the globe; opens the 3D close-approach card
  const [simEncounterId, setSimEncounterId] = useState<string | null>(null);

  const missions = useMemo(
    () =>
      [...new Set(allEncounters.map((e) => e.mission_id).filter((m): m is string => !!m))].sort(
        (a, b) => a.localeCompare(b, undefined, { numeric: true })
      ),
    [allEncounters]
  );
  const encounters = useMemo(
    () => (filterMission === 'all' ? allEncounters : allEncounters.filter((e) => e.mission_id === filterMission)),
    [allEncounters, filterMission]
  );

  // Focus mode (from "View on Globe"): only that one encounter is drawn, regardless of other filters
  const focusedEncounter = useMemo(
    () => (focusEventId ? allEncounters.find((e) => e.event_id === focusEventId) ?? null : null),
    [allEncounters, focusEventId]
  );
  const clearFocus = () => setGlobeFilters((f) => ({ ...f, focusEventId: null }));

  // Calculate totals
  const totalCount = encounters.length;
  const criticalCount = encounters.filter((e) => e.operational_tier === 'critical').length;
  const elevatedCount = encounters.filter((e) => e.operational_tier === 'elevated').length;
  const safeCount = encounters.filter((e) => e.operational_tier === 'safe').length;

  const handleSelectMarker = (encounter: EncounterSummary) => {
    selectEncounterById(encounter.event_id);
    setIsCardDismissed(false);
    setSimEncounterId(encounter.event_id);
  };

  return (
    <main className="flex-1 flex flex-col relative overflow-hidden bg-[#061426] text-xs">
      {/* Top Metric Bar & Filter Pills */}
      <div className="px-3 py-1.5 flex flex-wrap items-center justify-between gap-x-3 gap-y-1 border-b border-[#243B55] bg-[#0B1E35]/90 backdrop-blur z-20">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 min-w-0">
          <div>
            <h1 className="text-xs font-bold text-[#F5F7FA] whitespace-nowrap">GLOBAL CONJUNCTION OVERVIEW</h1>
            <p className="hidden xl:block text-[#A8B6CB] text-[10px]">
              Visual triage map representing active close approach encounters
            </p>
          </div>

          {headerCollapsed && (
            <span className="hidden md:inline text-[#A8B6CB] pl-3 border-l border-[#243B55] truncate">
              {filterMission === 'all' ? 'All missions' : /^\d+$/.test(filterMission) ? `Mission ${filterMission}` : filterMission}
              {' · '}
              {filterTier === 'all' ? 'All tiers' : filterTier}
              {' · '}
              {Math.min(maxMarkers, totalCount).toLocaleString()} shown
            </span>
          )}
          {!headerCollapsed && (<>
          <div className="hidden md:flex items-center gap-2 pl-3 border-l border-[#243B55]">
            <span className="text-[#A8B6CB]">SHOWN:</span>
            <input
              type="range"
              min={1}
              max={Math.max(10, totalCount)}
              step={Math.max(1, Math.round(totalCount / 200))}
              value={Math.min(maxMarkers, totalCount)}
              onChange={(e) => setMaxMarkers(Number(e.target.value))}
              className="w-28 accent-[#245BFF]"
            />
            <input
              type="number"
              min={1}
              max={Math.max(1, totalCount)}
              value={Math.min(maxMarkers, totalCount)}
              onChange={(e) => setMaxMarkers(Number(e.target.value))}
              className="w-20 px-2 py-1 rounded bg-[#061426] border border-[#243B55] text-[#F5F7FA] font-bold focus:outline-none focus:border-[#245BFF]"
            />
          </div>

          <div className="hidden md:flex items-center gap-2 pl-3 border-l border-[#243B55]">
            <span className="text-[#A8B6CB]">MISSION:</span>
            <select
              value={filterMission}
              onChange={(e) => setFilterMission(e.target.value)}
              className="px-2 py-1 rounded bg-[#061426] border border-[#243B55] text-[#F5F7FA] font-bold focus:outline-none focus:border-[#245BFF]"
            >
              <option value="all">All missions ({missions.length})</option>
              {missions.map((m) => (
                <option key={m} value={m}>
                  {/^\d+$/.test(m) ? `Mission ${m}` : m}
                </option>
              ))}
            </select>
          </div>

          <div className="hidden md:flex items-center gap-2 pl-3 border-l border-[#243B55]">
            <span className="text-[#A8B6CB]">TIER:</span>
            <button
              onClick={() => setFilterTier('all')}
              className={`px-2.5 py-1 rounded font-bold transition-colors ${
                filterTier === 'all'
                  ? 'bg-[#245BFF] text-white'
                  : 'bg-[#061426] border border-[#243B55] text-[#A8B6CB] hover:text-[#F5F7FA]'
              }`}
            >
              ALL ({totalCount.toLocaleString()})
            </button>
            <button
              onClick={() => setFilterTier('critical')}
              className={`px-2.5 py-1 rounded font-bold transition-colors ${
                filterTier === 'critical'
                  ? 'bg-[#EF4444] text-white'
                  : 'bg-[#061426] border border-[#EF4444]/40 text-[#EF4444] hover:bg-[#EF4444]/10'
              }`}
            >
              CRITICAL ({criticalCount.toLocaleString()})
            </button>
            <button
              onClick={() => setFilterTier('elevated')}
              className={`px-2.5 py-1 rounded font-bold transition-colors ${
                filterTier === 'elevated'
                  ? 'bg-[#FBBF24] text-black'
                  : 'bg-[#061426] border border-[#FBBF24]/40 text-[#FBBF24] hover:bg-[#FBBF24]/10'
              }`}
            >
              ELEVATED ({elevatedCount.toLocaleString()})
            </button>
            <button
              onClick={() => setFilterTier('safe')}
              className={`px-2.5 py-1 rounded font-bold transition-colors ${
                filterTier === 'safe'
                  ? 'bg-[#10B981] text-black'
                  : 'bg-[#061426] border border-[#10B981]/40 text-[#10B981] hover:bg-[#10B981]/10'
              }`}
            >
              SAFE ({safeCount.toLocaleString()})
            </button>
          </div>
          </>)}
        </div>
        <button
          onClick={() => setGlobeFilters((f) => ({ ...f, headerCollapsed: !f.headerCollapsed }))}
          className="shrink-0 px-2 py-0.5 rounded border border-[#243B55] text-[#A8B6CB] hover:text-[#F5F7FA] hover:border-[#A8B6CB] font-bold"
          title={headerCollapsed ? 'Show filters' : 'Hide filters'}
        >
          {headerCollapsed ? 'Filters ▾' : '▴'}
        </button>
      </div>

      {/* Main Interactive Globe Area */}
      <div className="flex-1 relative">
        <GlobeView
          encounters={focusedEncounter ? [focusedEncounter] : encounters}
          selectedEncounterId={selectedEncounter?.event_id}
          onSelectEncounter={handleSelectMarker}
          filterTier={focusedEncounter ? 'all' : filterTier}
          maxMarkers={maxMarkers}
        />

        {focusedEncounter && (
          <div className="absolute top-12 left-1/2 -translate-x-1/2 z-30 flex items-center gap-3 px-3 py-1.5 bg-[#0B1E35]/95 border border-[#245BFF] rounded-full shadow-xl text-[11px]">
            <span className="text-[#A8B6CB]">
              Focused on encounter <strong className="text-[#F5F7FA]">{focusedEncounter.event_id}</strong>
            </span>
            <button onClick={clearFocus} className="px-2 py-0.5 rounded bg-[#245BFF] text-white font-bold hover:bg-blue-600">
              Show all
            </button>
          </div>
        )}

        {selectedEncounter && simEncounterId === selectedEncounter.event_id && (
          <CollisionSimCard
            encounter={selectedEncounter}
            message={selectedMessages[selectedMessages.length - 1] ?? null}
            onClose={() => setSimEncounterId(null)}
          />
        )}

        {/* Selected-Event Card (Right Docked Overlay) */}
        {selectedEncounter && !isCardDismissed && (
          <div className="absolute bottom-14 right-6 z-30 w-84 max-w-[90vw] bg-[#0B1E35] border border-[#243B55] rounded-xl shadow-2xl p-3 text-xs space-y-3">
            <div className="flex items-center justify-between pb-2 border-b border-[#243B55]">
              <div>
                <span className="text-[#A8B6CB] text-[10px] block">SELECTED ENCOUNTER</span>
                <div className="text-sm font-bold text-[#F5F7FA] flex items-center gap-2 mt-0.5">
                  <span>{selectedEncounter.event_id}</span>
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
              </div>
              <div className="flex items-center gap-3">
                <button
                  onClick={() => setGlobeFilters((f) => ({ ...f, cardMinimized: !f.cardMinimized }))}
                  className="text-[#A8B6CB] hover:text-[#F5F7FA] text-lg font-bold leading-none"
                  title={cardMinimized ? 'Expand Card' : 'Minimize Card'}
                >
                  {cardMinimized ? '+' : '−'}
                </button>
                <button
                  onClick={() => setIsCardDismissed(true)}
                  className="text-[#A8B6CB] hover:text-[#F5F7FA] text-lg font-bold leading-none"
                  title="Close Card"
                >
                  &times;
                </button>
              </div>
            </div>

            {!cardMinimized && (<>
            <div className="space-y-1.5 text-[11px]">
              <div className="flex justify-between">
                <span className="text-[#A8B6CB]">Collision Prob (Pc):</span>
                <span className="text-[#F5F7FA] font-bold">
                  {selectedEncounter.predicted_pc !== null
                    ? selectedEncounter.predicted_pc.toExponential(2)
                    : selectedEncounter.source_pc !== null
                    ? selectedEncounter.source_pc.toExponential(2)
                    : 'N/A'}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-[#A8B6CB]">Miss Distance:</span>
                <span className="text-[#F5F7FA] font-bold">
                  {(selectedEncounter.miss_distance / 1000).toFixed(2)} km ({selectedEncounter.miss_distance.toFixed(0)} m)
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-[#A8B6CB]">Lead Time to TCA:</span>
                <span className="text-[#F5F7FA] font-bold">
                  {selectedEncounter.min_time_to_tca.toFixed(2)} days ({(selectedEncounter.min_time_to_tca * 24).toFixed(1)} h)
                </span>
              </div>
              {selectedEncounter.debris_inclination_deg != null && (
                <div className="flex justify-between">
                  <span className="text-[#A8B6CB]">Debris Orbit:</span>
                  <span className="text-[#F5F7FA]">
                    {selectedEncounter.debris_inclination_deg.toFixed(1)}&deg; incl.
                    {selectedEncounter.debris_perigee_km != null && selectedEncounter.debris_apogee_km != null
                      ? ` · ${selectedEncounter.debris_perigee_km.toFixed(0)}–${selectedEncounter.debris_apogee_km.toFixed(0)} km`
                      : ''}
                  </span>
                </div>
              )}
              <div className="flex justify-between">
                <span className="text-[#A8B6CB]">Object Type:</span>
                <span className="text-[#F5F7FA]">{selectedEncounter.c_object_type}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-[#A8B6CB]">Policy Trigger:</span>
                <span className="text-[#EF4444] font-bold truncate max-w-[170px]">
                  {selectedEncounter.classification_reasons[0] || 'NORMAL_MARGIN'}
                </span>
              </div>
            </div>

            <div className="pt-2 border-t border-[#243B55] flex gap-2">
              <Link
                href={`/encounters?eventId=${selectedEncounter.event_id}`}
                className="flex-1 py-2 bg-[#245BFF] hover:bg-blue-600 text-white rounded font-bold transition-colors text-center shadow"
              >
                View Encounter Detail &rarr;
              </Link>
            </div>
            </>)}
          </div>
        )}
      </div>
    </main>
  );
}
