import React from 'react';
import { OperationalTier } from '@/types/telemetry';

interface SatelliteSvgProps {
  tier: OperationalTier;
  isSelected?: boolean;
  className?: string;
  size?: number;
}

export function SatelliteSvg({
  tier,
  isSelected = false,
  className = '',
  size = 28,
}: SatelliteSvgProps) {
  let color = '#94A3B8'; // pending / default
  if (tier === 'critical') color = '#EF4444';
  if (tier === 'elevated') color = '#FBBF24';
  if (tier === 'safe') color = '#10B981';

  return (
    <div
      className={`relative inline-flex items-center justify-center transition-transform ${
        isSelected ? 'scale-125 z-40' : 'hover:scale-110'
      } ${className}`}
      style={{ width: size, height: size }}
    >
      <svg
        viewBox="0 0 24 24"
        fill="currentColor"
        className="w-full h-full drop-shadow-[0_0_4px_rgba(0,0,0,0.8)]"
        style={{ color }}
      >
        {/* Spacecraft Central Body */}
        <rect x="9" y="8" width="6" height="8" rx="1" />
        
        {/* Left Solar Panel Wing with Grid Cells */}
        <path d="M2 9h5v6H2z" fill={color} fillOpacity="0.85" />
        <line x1="4.5" y1="9" x2="4.5" y2="15" stroke="#061426" strokeWidth="0.75" />
        <line x1="2" y1="12" x2="7" y2="12" stroke="#061426" strokeWidth="0.75" />

        {/* Right Solar Panel Wing with Grid Cells */}
        <path d="M17 9h5v6h-5z" fill={color} fillOpacity="0.85" />
        <line x1="19.5" y1="9" x2="19.5" y2="15" stroke="#061426" strokeWidth="0.75" />
        <line x1="17" y1="12" x2="22" y2="12" stroke="#061426" strokeWidth="0.75" />

        {/* Solar Boom Mounts */}
        <line x1="7" y1="12" x2="9" y2="12" stroke={color} strokeWidth="1.5" />
        <line x1="15" y1="12" x2="17" y2="12" stroke={color} strokeWidth="1.5" />

        {/* Antenna Dish & Mast */}
        <line x1="12" y1="5" x2="12" y2="8" stroke={color} strokeWidth="1.5" />
        <circle cx="12" cy="4" r="1.5" fill={color} />
      </svg>

      {/* Selected Secondary Object Diamond Indicator */}
      {isSelected && (
        <>
          <div
            className="absolute -bottom-2 -right-2 w-3 h-3 bg-white rotate-45 border border-black shadow-[0_0_8px_white]"
            title="Secondary Object in Conjunction"
          />
          <div className="absolute -inset-1.5 border border-white rounded-full animate-ping opacity-60 pointer-events-none" />
        </>
      )}
    </div>
  );
}
