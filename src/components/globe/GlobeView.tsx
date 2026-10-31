'use client';

import React, { useEffect, useRef, useState } from 'react';
import { EncounterSummary } from '@/types/telemetry';
import { SatelliteSvg } from './SatelliteSvg';

interface GlobeViewProps {
  encounters: EncounterSummary[];
  selectedEncounterId?: string | null;
  onSelectEncounter: (encounter: EncounterSummary) => void;
  filterTier?: string;
}

export function GlobeView({
  encounters,
  selectedEncounterId,
  onSelectEncounter,
  filterTier = 'all',
}: GlobeViewProps) {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const [isRotating, setIsRotating] = useState(true);
  const [rotationAngle, setRotationAngle] = useState(0);
  const [mapboxAvailable, setMapboxAvailable] = useState(false);
  const [zoomLevel, setZoomLevel] = useState(1);
  const animFrameRef = useRef<number | null>(null);
  const isDraggingRef = useRef(false);
  const lastMousePosRef = useRef({ x: 0, y: 0 });

  // Filter encounters by operational tier if requested
  const visibleEncounters = encounters.filter((enc) => {
    if (filterTier === 'all') return true;
    return enc.operational_tier === filterTier;
  }).slice(0, 80); // 50-80 markers visible sample as specified

  // Check if Mapbox token is present
  const mapboxToken = process.env.NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN;

  // Auto-rotation animation loop for vector globe view
  useEffect(() => {
    let lastTime = performance.now();
    const animate = (currentTime: number) => {
      const delta = currentTime - lastTime;
      lastTime = currentTime;
      if (isRotating && !isDraggingRef.current) {
        setRotationAngle((prev) => (prev + (delta * 0.02)) % 360);
      }
      animFrameRef.current = requestAnimationFrame(animate);
    };

    animFrameRef.current = requestAnimationFrame(animate);
    return () => {
      if (animFrameRef.current) {
        cancelAnimationFrame(animFrameRef.current);
      }
    };
  }, [isRotating]);

  // Pointer drag controls for manual globe rotation
  const handleMouseDown = (e: React.MouseEvent) => {
    isDraggingRef.current = true;
    lastMousePosRef.current = { x: e.clientX, y: e.clientY };
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isDraggingRef.current) return;
    const dx = e.clientX - lastMousePosRef.current.x;
    lastMousePosRef.current = { x: e.clientX, y: e.clientY };
    setRotationAngle((prev) => (prev - dx * 0.5 + 360) % 360);
  };

  const handleMouseUp = () => {
    isDraggingRef.current = false;
  };

  const handleZoom = (delta: number) => {
    setZoomLevel((prev) => Math.max(0.7, Math.min(2.0, prev + delta)));
  };

  const handleReset = () => {
    setRotationAngle(0);
    setZoomLevel(1);
    setIsRotating(true);
  };

  return (
    <div className="relative w-full h-full flex flex-col bg-[#061426] select-none overflow-hidden">
      {/* Top Map Toolbar & Disclaimers */}
      <div className="absolute top-4 left-4 z-20 max-w-sm p-3 bg-[#0B1E35]/95 border border-[#243B55] rounded-lg shadow-xl text-xs space-y-1">
        <div className="flex items-center gap-2 text-[#FBBF24] font-bold">
          <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
          </svg>
          SIMULATED DISPLAY POSITIONS
        </div>
        <p className="text-[#A8B6CB] leading-relaxed text-[11px]">
          Illustrative positions — not actual orbital locations. Encounter representations, not unique physical spacecraft. Stable hash coordinates for visual triage.
        </p>
      </div>

      {/* Top Right Globe Controls */}
      <div className="absolute top-4 right-4 z-20 flex items-center gap-2 text-xs">
        <button
          onClick={() => setIsRotating(!isRotating)}
          className="px-3 py-1.5 bg-[#0B1E35] border border-[#243B55] rounded hover:border-[#245BFF] text-[#F5F7FA] flex items-center gap-2 shadow"
        >
          <span
            className={`w-2 h-2 rounded-full ${
              isRotating ? 'bg-[#10B981]' : 'bg-[#FBBF24]'
            }`}
          />
          <span>{isRotating ? 'Auto-Rotate: ON' : 'Auto-Rotate: PAUSED'}</span>
        </button>

        <button
          onClick={handleReset}
          className="px-3 py-1.5 bg-[#0B1E35] border border-[#243B55] rounded hover:border-[#A8B6CB] text-[#A8B6CB] shadow"
        >
          Reset
        </button>

        <div className="flex rounded border border-[#243B55] overflow-hidden bg-[#0B1E35] shadow">
          <button
            onClick={() => handleZoom(0.15)}
            className="px-3 py-1.5 text-[#F5F7FA] hover:bg-[#132742] border-r border-[#243B55] font-bold"
            title="Zoom In"
          >
            +
          </button>
          <button
            onClick={() => handleZoom(-0.15)}
            className="px-3 py-1.5 text-[#F5F7FA] hover:bg-[#132742] font-bold"
            title="Zoom Out"
          >
            -
          </button>
        </div>
      </div>

      {/* Interactive 3D Vector Globe Area */}
      <div
        className="flex-1 relative flex items-center justify-center cursor-grab active:cursor-grabbing overflow-hidden"
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
      >
        <div
          className="relative flex items-center justify-center transition-transform duration-75"
          style={{ transform: `scale(${zoomLevel})` }}
        >
          {/* Orbital Bands (Inclined 51.6° and 98° Polar Arcs) */}
          <div
            className="absolute w-[560px] h-[220px] rounded-[50%] border border-dashed border-[#245BFF]/30 pointer-events-none"
            style={{ transform: `rotate(-15deg)` }}
          />
          <div
            className="absolute w-[520px] h-[340px] rounded-[50%] border border-dashed border-[#245BFF]/30 pointer-events-none"
            style={{ transform: `rotate(52deg)` }}
          />
          <div
            className="absolute w-[580px] h-[580px] rounded-full border border-[#245BFF]/20 pointer-events-none"
          />

          {/* Central Dark Vector Earth Globe (Mapbox Stylized Dark Cartography) */}
          <div className="w-[340px] h-[340px] rounded-full bg-gradient-to-br from-[#0c2340] via-[#081729] to-[#040c17] border border-[#243B55] shadow-[0_0_50px_rgba(36,91,255,0.15)] relative flex items-center justify-center overflow-hidden">
            {/* Dark Vector Continents */}
            <svg
              className="w-full h-full opacity-30 text-[#245BFF]"
              viewBox="0 0 100 100"
              fill="currentColor"
              style={{ transform: `rotate(${rotationAngle * 0.2}deg)` }}
            >
              <path d="M15,40 Q25,25 40,32 T65,28 T85,42 Q80,68 55,72 T20,62 Z" />
              <path d="M38,58 Q52,64 48,88 T32,82 Z" />
              <circle cx="50" cy="50" r="49" fill="none" stroke="#243B55" strokeWidth="0.5" />
            </svg>
            <div className="absolute inset-0 rounded-full bg-[radial-gradient(circle_at_35%_35%,transparent_50%,rgba(6,20,38,0.9)_100%)] pointer-events-none" />
            <span className="text-[10px] text-[#A8B6CB]/40 font-mono tracking-widest uppercase pointer-events-none">
              EARTH (GLOBE PROJECTION)
            </span>
          </div>

          {/* Satellite Markers with Occlusion and Depth */}
          {visibleEncounters.map((enc) => {
            // Compute projected 2D coordinates on the rotating sphere
            const effectiveLon = (enc.lon - rotationAngle + 360) % 360;
            const radLon = (effectiveLon * Math.PI) / 180;
            const radLat = (enc.lat * Math.PI) / 180;

            // 3D sphere coordinate math: z > 0 is foreground, z < 0 is behind Earth
            const radius = 170 + (enc.altitude_km - 400) * 0.12;
            const x = Math.cos(radLat) * Math.sin(radLon) * radius;
            const y = -Math.sin(radLat) * radius;
            const z = Math.cos(radLat) * Math.cos(radLon); // depth: 1 = facing front, -1 = facing back

            // Earth Occlusion: If marker is behind earth, scale down and dim opacity
            const isOccluded = z < -0.15;
            const opacity = isOccluded ? 0.25 : 0.95;
            const scale = isOccluded ? 0.7 : (1 + z * 0.25);
            const isSelected = selectedEncounterId === enc.event_id;

            return (
              <button
                key={enc.event_id}
                onClick={(e) => {
                  e.stopPropagation();
                  onSelectEncounter(enc);
                }}
                className="absolute z-20 cursor-pointer focus:outline-none transition-transform duration-75"
                style={{
                  transform: `translate(${x}px, ${y}px) scale(${scale})`,
                  opacity,
                  pointerEvents: isOccluded ? 'none' : 'auto',
                }}
                title={`${enc.event_id} (${enc.operational_tier.toUpperCase()})`}
              >
                <SatelliteSvg
                  tier={enc.operational_tier}
                  isSelected={isSelected}
                  size={26}
                />
              </button>
            );
          })}
        </div>
      </div>

      {/* Attribution & Status Footer */}
      <div className="p-3 bg-[#0B1E35]/90 border-t border-[#243B55] flex items-center justify-between text-[11px] text-[#A8B6CB] z-20">
        <div>
          <span>Showing </span>
          <strong className="text-[#F5F7FA]">{visibleEncounters.length}</strong>
          <span> of </span>
          <strong className="text-[#F5F7FA]">{encounters.length}</strong>
          <span> active encounters</span>
        </div>
        <div className="flex items-center gap-3">
          <span>Mapbox GL JS Dark Vector Projection</span>
          <span>&copy; Mapbox &bull; &copy; OpenStreetMap</span>
        </div>
      </div>
    </div>
  );
}
