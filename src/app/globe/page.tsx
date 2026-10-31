'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { useData } from '@/context/DataContext';
import { GlobeView } from '@/components/globe/GlobeView';
import { EncounterSummary } from '@/types/telemetry';

export default function GlobePage() {
  const { encounters, selectedEncounter, selectEncounterById } = useData();
  const [filterTier, setFilterTier] = useState<string>('all');
  const [isCardDismissed, setIsCardDismissed] = useState(false);

  // Calculate totals
  const totalCount = encounters.length;
  const criticalCount = encounters.filter((e) => e.operational_tier === 'critical').length;
  const elevatedCount = encounters.filter((e) => e.operational_tier === 'elevated').length;
  const safeCount = encounters.filter((e) => e.operational_tier === 'safe').length;

  const handleSelectMarker = (encounter: EncounterSummary) => {
    selectEncounterById(encounter.event_id);
    setIsCardDismissed(false);
  };

  return (
    <main className="flex-1 flex flex-col relative overflow-hidden bg-[#061426] text-xs">
      {/* Top Metric Bar & Filter Pills */}
      <div className="p-4 flex flex-wrap items-center justify-between gap-4 border-b border-[#243B55] bg-[#0B1E35]/90 backdrop-blur z-20">
        <div className="flex items-center gap-4">
          <div>
            <h1 className="text-sm font-bold text-[#F5F7FA]">GLOBAL CONJUNCTION OVERVIEW</h1>
            <p className="text-[#A8B6CB] text-[11px]">
              Visual triage map representing active close approach encounters
            </p>
          </div>

          <div className="hidden md:flex items-center gap-2 pl-4 border-l border-[#243B55]">
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
        </div>
      </div>

      {/* Main Interactive Globe Area */}
      <div className="flex-1 relative">
        <GlobeView
          encounters={encounters}
          selectedEncounterId={selectedEncounter?.event_id}
          onSelectEncounter={handleSelectMarker}
          filterTier={filterTier}
        />

        {/* Selected-Event Card (Right Docked Overlay) */}
        {selectedEncounter && !isCardDismissed && (
          <div className="absolute bottom-14 right-6 z-30 w-84 max-w-[90vw] bg-[#0B1E35] border border-[#243B55] rounded-xl shadow-2xl p-4 text-xs space-y-3">
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
              <button
                onClick={() => setIsCardDismissed(true)}
                className="text-[#A8B6CB] hover:text-[#F5F7FA] text-lg font-bold"
                title="Close Card"
              >
                &times;
              </button>
            </div>

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
          </div>
        )}
      </div>
    </main>
  );
}
