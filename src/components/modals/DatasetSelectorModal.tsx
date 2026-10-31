'use client';

import React from 'react';
import { useData } from '@/context/DataContext';

interface DatasetSelectorModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function DatasetSelectorModal({ isOpen, onClose }: DatasetSelectorModalProps) {
  const { datasets, activeDataset, switchDataset } = useData();

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="w-full max-w-md bg-[#0B1E35] border border-[#243B55] rounded-xl shadow-2xl p-5 space-y-4 text-xs">
        <div className="flex items-center justify-between pb-3 border-b border-[#243B55]">
          <h2 className="text-sm font-bold text-[#F5F7FA]">SWITCH ACTIVE DATASET</h2>
          <button
            onClick={onClose}
            className="text-[#A8B6CB] hover:text-[#F5F7FA] text-lg font-bold"
          >
            &times;
          </button>
        </div>

        <div className="space-y-2">
          {datasets.map((ds) => {
            const isActive = activeDataset?.id === ds.id;
            return (
              <div
                key={ds.id}
                onClick={() => {
                  switchDataset(ds.id);
                  onClose();
                }}
                className={`p-3 rounded border cursor-pointer flex justify-between items-center transition-colors ${
                  isActive
                    ? 'bg-[#245BFF]/15 border-2 border-[#245BFF]'
                    : 'bg-[#061426] border-[#243B55] hover:border-[#A8B6CB]'
                }`}
              >
                <div>
                  <div className="font-bold text-[#F5F7FA] flex items-center gap-1.5">
                    <span
                      className={`w-2 h-2 rounded-full ${
                        isActive ? 'bg-[#10B981]' : 'bg-[#94A3B8]'
                      }`}
                    />
                    <span>{ds.filename}</span>
                    {isActive && (
                      <span className="text-[10px] text-[#10B981] font-bold uppercase">(Active)</span>
                    )}
                  </div>
                  <span className="text-[#A8B6CB] text-[11px] block mt-0.5">
                    {ds.encounter_count.toLocaleString()} Encounters &bull; {ds.row_count.toLocaleString()} Messages
                  </span>
                </div>
                {isActive && <span className="text-xs font-bold text-[#245BFF]">✓</span>}
              </div>
            );
          })}
        </div>

        <div className="pt-3 border-t border-[#243B55] flex justify-end">
          <button
            onClick={onClose}
            className="px-4 py-1.5 bg-[#245BFF] hover:bg-blue-600 text-white rounded font-bold"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
}
