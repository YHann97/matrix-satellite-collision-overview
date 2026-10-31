'use client';

import React, { useMemo, useState } from 'react';
import { useData } from '@/context/DataContext';
import { GlobeView } from '@/components/globe/GlobeView';
import { CollisionSimCard } from '@/components/globe/CollisionSimCard';
import { EncounterSummary } from '@/types/telemetry';

export default function GlobePage() {
  const { encounters: allEncounters, selectedEncounter, selectedMessages, selectEncounterById, globeFilters, setGlobeFilters } = useData();
  const { mission: filterMission, tier: filterTier, maxMarkers, focusEventId } = globeFilters;
  // Set when a satellite is clicked on the globe; opens the encounter card
  const [cardEncounterId, setCardEncounterId] = useState<string | null>(null);

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
  const tierCounts = useMemo(
    () => ({
      critical: encounters.filter((e) => e.operational_tier === 'critical').length,
      elevated: encounters.filter((e) => e.operational_tier === 'elevated').length,
      safe: encounters.filter((e) => e.operational_tier === 'safe').length,
    }),
    [encounters]
  );

  // Focus mode (from "View on Globe"): only that one encounter is drawn, regardless of other filters
  const focusedEncounter = useMemo(
    () => (focusEventId ? allEncounters.find((e) => e.event_id === focusEventId) ?? null : null),
    [allEncounters, focusEventId]
  );
  const clearFocus = () => setGlobeFilters((f) => ({ ...f, focusEventId: null }));

  const handleSelectMarker = (encounter: EncounterSummary) => {
    selectEncounterById(encounter.event_id);
    setCardEncounterId(encounter.event_id);
  };

  return (
    <main className="flex-1 min-h-0 flex flex-col relative overflow-hidden bg-[#061426] text-xs">
      <div className="flex-1 min-h-0 relative">
        <GlobeView
          encounters={focusedEncounter ? [focusedEncounter] : encounters}
          selectedEncounterId={selectedEncounter?.event_id}
          onSelectEncounter={handleSelectMarker}
          filterTier={focusedEncounter ? 'all' : filterTier}
          maxMarkers={maxMarkers}
          missions={missions}
          totalCount={encounters.length}
          tierCounts={tierCounts}
        />

        {focusedEncounter && (
          <div className="absolute top-2 left-1/2 -translate-x-1/2 z-30 flex items-center gap-3 px-3 py-1.5 bg-[#0B1E35]/95 border border-[#245BFF] rounded-full shadow-xl text-[11px]">
            <span className="text-[#A8B6CB]">
              Focused on encounter <strong className="text-[#F5F7FA]">{focusedEncounter.event_id}</strong>
            </span>
            <button onClick={clearFocus} className="px-2 py-0.5 rounded bg-[#245BFF] text-white font-bold hover:bg-blue-600">
              Show all
            </button>
          </div>
        )}

        {selectedEncounter && cardEncounterId === selectedEncounter.event_id && (
          <CollisionSimCard
            encounter={selectedEncounter}
            message={selectedMessages[selectedMessages.length - 1] ?? null}
            onClose={() => setCardEncounterId(null)}
          />
        )}
      </div>
    </main>
  );
}
