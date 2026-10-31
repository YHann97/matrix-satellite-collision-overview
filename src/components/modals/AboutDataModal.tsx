'use client';

import React from 'react';

interface AboutDataModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function AboutDataModal({ isOpen, onClose }: AboutDataModalProps) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="w-full max-w-2xl bg-[#0B1E35] border border-[#243B55] rounded-xl shadow-2xl overflow-hidden flex flex-col text-xs">
        {/* Header */}
        <div className="px-6 py-4 border-b border-[#243B55] flex items-center justify-between bg-[#061426]">
          <h2 className="text-sm font-bold text-[#F5F7FA]">ABOUT THIS DATA &amp; OPERATIONAL POLICIES</h2>
          <button
            onClick={onClose}
            className="text-[#A8B6CB] hover:text-[#F5F7FA] text-lg font-bold"
          >
            &times;
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-5 overflow-y-auto max-h-[70vh] text-[#A8B6CB] leading-relaxed">
          <div>
            <h3 className="font-bold text-[#245BFF] mb-1 text-sm">1. DATASET PROVENANCE &amp; UNITS</h3>
            <p>
              Derived from the ESA Collision Avoidance Challenge dataset.
            </p>
            <ul className="list-disc list-inside mt-2 space-y-1 font-mono text-[11px] text-[#F5F7FA]">
              <li><strong className="text-[#A8B6CB]">time_to_tca:</strong> Days to Closest Approach</li>
              <li><strong className="text-[#A8B6CB]">miss_distance:</strong> Metres (converted to km for display)</li>
              <li><strong className="text-[#A8B6CB]">relative_speed:</strong> Metres per second (m/s)</li>
              <li><strong className="text-[#A8B6CB]">risk:</strong> log10(Pc) at the given message assessment; the app's risk score is 10^risk</li>
            </ul>
          </div>

          <div>
            <h3 className="font-bold text-[#245BFF] mb-1 text-sm">2. HISTORICAL ASSESSMENTS &amp; TCA</h3>
            <p>
              This dataset comprises historical assessments across variable lead times. It does not provide an absolute wall-clock date. The application defaults to <strong className="text-[#F5F7FA]">All available assessments</strong> and does not invent countdown timers.
            </p>
            <p className="mt-1">
              A “Within 24 hours of TCA” filter corresponds strictly to <code className="text-[#F5F7FA] bg-[#061426] px-1 py-0.5 rounded">0 &le; time_to_tca &le; 1</code>. The supplied benchmark file contains no messages within this interval; an empty result is mathematically valid.
            </p>
          </div>

          <div>
            <h3 className="font-bold text-[#245BFF] mb-1 text-sm">3. ENCOUNTER GROUPING</h3>
            <p>
              An encounter is identified by <code className="text-[#F5F7FA] bg-[#061426] px-1 py-0.5 rounded">dataset_id + event_id</code>. Multiple telemetry messages belong to each encounter. The message with the smallest valid <code className="text-[#F5F7FA] bg-[#061426] px-1 py-0.5 rounded">time_to_tca</code> is designated the authoritative latest assessment.
            </p>
          </div>

          <div>
            <h3 className="font-bold text-[#245BFF] mb-1 text-sm">4. OPERATIONAL RISK CLASSIFICATION POLICY</h3>
            <p className="mb-2">Applied sequentially using unrounded values:</p>
            <div className="p-3 bg-[#061426] border border-[#243B55] rounded font-mono text-[11px] text-[#F5F7FA] space-y-1">
              <div>IF Pc &ge; 1e-4 OR miss_distance &lt; 1,000m &rarr; <span className="text-[#EF4444] font-bold">CRITICAL</span></div>
              <div>ELSE IF Pc &ge; 1e-6 OR 1,000m &le; miss_distance &le; 5,000m &rarr; <span className="text-[#FBBF24] font-bold">ELEVATED</span></div>
              <div>ELSE (Pc &lt; 1e-6 AND miss_distance &gt; 5,000m) &rarr; <span className="text-[#10B981] font-bold">SAFE</span></div>
            </div>
            <p className="mt-1 text-[11px]">
              Missing or invalid inputs never silently default to Safe; they are marked <strong className="text-[#94A3B8]">Incomplete assessment</strong>.
            </p>
          </div>

          <div>
            <h3 className="font-bold text-[#245BFF] mb-1 text-sm">5. SIMULATED GLOBE POSITIONS</h3>
            <p>
              Because the dataset does not include absolute orbital ephemerides (state vectors), satellite markers on the globe utilize deterministic simulated positions to visualize spatial clustering and depth. They are encounter representations, not physical satellites.
            </p>
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-3 border-t border-[#243B55] bg-[#061426] flex justify-end">
          <button
            onClick={onClose}
            className="px-4 py-1.5 bg-[#245BFF] hover:bg-blue-600 text-white rounded font-bold"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
