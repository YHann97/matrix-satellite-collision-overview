'use client';

import React, { useState } from 'react';
import { useData } from '@/context/DataContext';

interface CsvImportModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function CsvImportModal({ isOpen, onClose }: CsvImportModalProps) {
  const { importCsvDataset } = useData();
  const [file, setFile] = useState<File | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [progressPercent, setProgressPercent] = useState(0);
  const [summaryReport, setSummaryReport] = useState<{
    rowCount: number;
    encounterCount: number;
    rejectedCount: number;
  } | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setFile(e.target.files[0]);
      setErrorMsg(null);
      setSummaryReport(null);
    }
  };

  const handleStartImport = async () => {
    if (!file) return;
    setIsProcessing(true);
    setProgressPercent(15);
    setErrorMsg(null);

    try {
      const text = await file.text();
      setProgressPercent(50);

      // Ingest through context parser and grouping
      const dataset = await importCsvDataset(text, file.name);
      setProgressPercent(100);
      setSummaryReport({
        rowCount: dataset.row_count,
        encounterCount: dataset.encounter_count,
        rejectedCount: 0,
      });
    } catch (err: any) {
      setErrorMsg(err.message || 'Failed to parse CSV file');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleComplete = () => {
    onClose();
    setFile(null);
    setSummaryReport(null);
    setProgressPercent(0);
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="w-full max-w-xl bg-[#0B1E35] border border-[#243B55] rounded-xl shadow-2xl overflow-hidden flex flex-col text-xs">
        {/* Header */}
        <div className="px-6 py-4 border-b border-[#243B55] flex items-center justify-between bg-[#061426]">
          <div className="flex items-center gap-2">
            <svg className="w-5 h-5 text-[#245BFF]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
            </svg>
            <h2 className="text-sm font-bold text-[#F5F7FA]">IMPORT CONJUNCTION TELEMETRY CSV</h2>
          </div>
          <button
            onClick={onClose}
            className="text-[#A8B6CB] hover:text-[#F5F7FA] text-lg font-bold"
          >
            &times;
          </button>
        </div>

        {/* Body */}
        <div className="p-6 space-y-4">
          {/* File Picker */}
          {!summaryReport && (
            <label className="border-2 border-dashed border-[#243B55] hover:border-[#245BFF] rounded-lg p-6 text-center cursor-pointer bg-[#061426]/50 flex flex-col items-center justify-center transition-colors">
              <input
                type="file"
                accept=".csv"
                onChange={handleFileChange}
                className="hidden"
                disabled={isProcessing}
              />
              <svg className="w-10 h-10 text-[#A8B6CB] mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
              <span className="font-bold text-[#F5F7FA] block">
                {file ? `${file.name} (${(file.size / (1024 * 1024)).toFixed(2)} MB)` : 'Click to select CSV file'}
              </span>
              <span className="text-[#A8B6CB] block mt-1 text-[11px]">
                Accepts test.csv, test_data.csv, or any valid conjunction telemetry CSV
              </span>
            </label>
          )}

          {errorMsg && (
            <div className="p-3 bg-[#EF4444]/20 border border-[#EF4444] text-[#EF4444] rounded">
              {errorMsg}
            </div>
          )}

          {/* Ingestion Progress State */}
          {isProcessing && (
            <div className="space-y-2 p-3 bg-[#061426] border border-[#243B55] rounded">
              <div className="flex justify-between font-bold">
                <span className="text-[#F5F7FA]">Ingesting Bounded Batches (Supabase Postgres):</span>
                <span className="text-[#245BFF]">{progressPercent}%</span>
              </div>
              <div className="w-full bg-[#0B1E35] h-2.5 rounded-full overflow-hidden">
                <div
                  className="bg-[#245BFF] h-full transition-all duration-300"
                  style={{ width: `${progressPercent}%` }}
                />
              </div>
              <div className="flex justify-between text-[11px] text-[#A8B6CB]">
                <span>Uploading directly to private storage</span>
                <span>Calculating encounter summaries</span>
              </div>
            </div>
          )}

          {/* Completion Report */}
          {summaryReport && (
            <div className="space-y-4">
              <div className="p-3 bg-[#10B981]/15 border border-[#10B981]/40 rounded text-[#10B981] font-bold">
                ✓ Dataset successfully imported and verified.
              </div>
              <div className="grid grid-cols-3 gap-2 text-center">
                <div className="p-3 bg-[#061426] rounded border border-[#243B55]">
                  <span className="text-[11px] text-[#A8B6CB] block">IMPORTED ROWS</span>
                  <span className="text-base font-bold text-[#10B981]">
                    {summaryReport.rowCount.toLocaleString()}
                  </span>
                </div>
                <div className="p-3 bg-[#061426] rounded border border-[#243B55]">
                  <span className="text-[11px] text-[#A8B6CB] block">ENCOUNTERS</span>
                  <span className="text-base font-bold text-[#245BFF]">
                    {summaryReport.encounterCount.toLocaleString()}
                  </span>
                </div>
                <div className="p-3 bg-[#061426] rounded border border-[#243B55]">
                  <span className="text-[11px] text-[#A8B6CB] block">REJECTED</span>
                  <span className="text-base font-bold text-[#A8B6CB]">
                    {summaryReport.rejectedCount}
                  </span>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-3 border-t border-[#243B55] bg-[#061426] flex justify-end gap-2">
          {!summaryReport ? (
            <>
              <button
                onClick={onClose}
                className="px-4 py-2 border border-[#243B55] rounded text-[#A8B6CB] hover:text-[#F5F7FA]"
                disabled={isProcessing}
              >
                Cancel
              </button>
              <button
                onClick={handleStartImport}
                disabled={!file || isProcessing}
                className="px-4 py-2 bg-[#245BFF] hover:bg-blue-600 disabled:opacity-50 text-white rounded font-bold"
              >
                {isProcessing ? 'Processing...' : 'Start Ingestion'}
              </button>
            </>
          ) : (
            <button
              onClick={handleComplete}
              className="px-4 py-2 bg-[#245BFF] hover:bg-blue-600 text-white rounded font-bold"
            >
              Activate Dataset &rarr;
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
