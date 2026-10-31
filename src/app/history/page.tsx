'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { useData } from '@/context/DataContext';
import { AuditEventRecord } from '@/lib/data/mockStore';

export default function HistoryPage() {
  const { auditLog, exportAuditCsv } = useData();

  const [searchTerm, setSearchTerm] = useState('');
  const [actionFilter, setActionFilter] = useState('all');
  const [operatorFilter, setOperatorFilter] = useState('all');
  const [selectedRecordId, setSelectedRecordId] = useState<string>(auditLog[0]?.id || '');

  const filteredLog = auditLog.filter((entry) => {
    if (searchTerm && !entry.event_id.toLowerCase().includes(searchTerm.toLowerCase())) {
      return false;
    }
    if (actionFilter !== 'all' && entry.action_type !== actionFilter) {
      return false;
    }
    if (operatorFilter !== 'all' && entry.operator_email !== operatorFilter) {
      return false;
    }
    return true;
  });

  const selectedRecord =
    auditLog.find((r) => r.id === selectedRecordId) || filteredLog[0] || null;

  return (
    <main className="flex-1 flex flex-col bg-[#061426] p-6 space-y-4 overflow-hidden text-xs">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-sm font-bold text-[#F5F7FA]">AUDIT &amp; ACTION HISTORY</h1>
          <p className="text-[#A8B6CB] text-[11px]">
            Append-only persistent log of all operator decisions, acknowledgments, and dataset events
          </p>
        </div>

        <button
          onClick={exportAuditCsv}
          className="px-3.5 py-1.5 bg-[#0B1E35] border border-[#243B55] hover:border-[#10B981] text-[#10B981] rounded flex items-center gap-1.5 font-bold transition-colors shadow"
        >
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
          </svg>
          Export CSV
        </button>
      </div>

      {/* Filter Bar */}
      <div className="p-3 bg-[#0B1E35] border border-[#243B55] rounded-lg flex flex-wrap items-center gap-3">
        <input
          type="text"
          placeholder="Filter by Event ID..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="bg-[#061426] border border-[#243B55] rounded px-3 py-1.5 text-[#F5F7FA] w-48 focus:border-[#245BFF] focus:outline-none"
        />

        <select
          value={actionFilter}
          onChange={(e) => setActionFilter(e.target.value)}
          className="bg-[#061426] border border-[#243B55] rounded px-3 py-1.5 text-[#F5F7FA] focus:border-[#245BFF]"
        >
          <option value="all">All Actions</option>
          <option value="ALERT ACKNOWLEDGED">Alert Acknowledged</option>
          <option value="SENT TO PLANNING">Sent to Planning</option>
          <option value="PLAN DRAFT SAVED">Plan Draft Saved</option>
          <option value="PREDICTION REFRESHED">Prediction Refreshed</option>
          <option value="DATASET IMPORTED">Dataset Imported</option>
        </select>

        <select
          value={operatorFilter}
          onChange={(e) => setOperatorFilter(e.target.value)}
          className="bg-[#061426] border border-[#243B55] rounded px-3 py-1.5 text-[#F5F7FA] focus:border-[#245BFF]"
        >
          <option value="all">All Operators</option>
          <option value="controller.dan@esa.int">controller.dan@esa.int</option>
          <option value="operator.alex@esa.int">operator.alex@esa.int</option>
          <option value="system_ingest">system_ingest</option>
        </select>
      </div>

      {/* Audit Log Table & Expanded Record Drawer */}
      <div className="flex-1 grid grid-cols-1 lg:grid-cols-12 gap-4 overflow-hidden">
        
        {/* Audit Table (8 cols) */}
        <div className="lg:col-span-8 border border-[#243B55] rounded-lg overflow-y-auto bg-[#0B1E35]">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="bg-[#061426] text-[#A8B6CB] border-b border-[#243B55] sticky top-0 z-10">
                <th className="p-3">TIMESTAMP (UTC)</th>
                <th className="p-3">EVENT ID</th>
                <th className="p-3">ACTION</th>
                <th className="p-3">OPERATOR</th>
                <th className="p-3">SUMMARY</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#243B55]">
              {filteredLog.map((entry) => {
                const isSelected = selectedRecord?.id === entry.id;

                return (
                  <tr
                    key={entry.id}
                    onClick={() => setSelectedRecordId(entry.id)}
                    className={`cursor-pointer transition-colors ${
                      isSelected
                        ? 'bg-[#245BFF]/20 hover:bg-[#245BFF]/30'
                        : 'hover:bg-[#132742]'
                    }`}
                  >
                    <td className="p-3 font-mono text-[#A8B6CB]">
                      {new Date(entry.timestamp).toISOString().replace('T', ' ').slice(0, 19)}
                    </td>
                    <td className="p-3 font-bold text-[#F5F7FA]">{entry.event_id}</td>
                    <td className="p-3">
                      <span className="px-2 py-0.5 rounded bg-[#245BFF]/20 text-[#245BFF] font-bold text-[10px]">
                        {entry.action_type}
                      </span>
                    </td>
                    <td className="p-3 text-[#A8B6CB]">{entry.operator_email}</td>
                    <td className="p-3 text-[#F5F7FA] truncate max-w-xs">{entry.summary}</td>
                  </tr>
                );
              })}
              {filteredLog.length === 0 && (
                <tr>
                  <td colSpan={5} className="p-8 text-center text-[#A8B6CB]">
                    No audit records match the current filters.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Expanded History Record (4 cols) */}
        <div className="lg:col-span-4 bg-[#0B1E35] border border-[#243B55] rounded-lg p-4 space-y-4 overflow-y-auto">
          {selectedRecord ? (
            <>
              <div className="flex items-center justify-between pb-2 border-b border-[#243B55]">
                <span className="text-[#A8B6CB] font-bold">AUDIT RECORD #{selectedRecord.id}</span>
                <span className="px-2 py-0.5 bg-[#245BFF]/20 text-[#245BFF] font-bold rounded text-[10px]">
                  {selectedRecord.action_type}
                </span>
              </div>

              <div className="space-y-2 text-[11px]">
                <div>
                  <span className="text-[#A8B6CB] block text-[10px]">Exact UTC Timestamp:</span>
                  <span className="text-[#F5F7FA] font-mono">{selectedRecord.timestamp}</span>
                </div>
                <div>
                  <span className="text-[#A8B6CB] block text-[10px]">Operator ID:</span>
                  <span className="text-[#F5F7FA]">{selectedRecord.operator_email}</span>
                </div>
                <div>
                  <span className="text-[#A8B6CB] block text-[10px]">Associated Encounter:</span>
                  {selectedRecord.event_id !== 'SYSTEM' ? (
                    <Link
                      href={`/encounters?eventId=${selectedRecord.event_id}`}
                      className="text-[#245BFF] font-bold hover:underline"
                    >
                      {selectedRecord.event_id} &rarr;
                    </Link>
                  ) : (
                    <span className="text-[#A8B6CB]">System-wide action</span>
                  )}
                </div>
                <div>
                  <span className="text-[#A8B6CB] block text-[10px]">Summary:</span>
                  <p className="text-[#F5F7FA] pt-0.5">{selectedRecord.summary}</p>
                </div>
              </div>

              {/* State Diff Inspection */}
              {(selectedRecord.previous_state || selectedRecord.new_state) && (
                <div className="pt-3 border-t border-[#243B55] space-y-2">
                  <span className="text-[#A8B6CB] font-bold text-[11px] block">
                    AUDITED FIELD DIFF
                  </span>
                  <div className="p-3 bg-[#061426] rounded border border-[#243B55] font-mono text-[11px] space-y-1 overflow-x-auto">
                    {selectedRecord.previous_state && (
                      <div className="text-[#EF4444]">
                        - {JSON.stringify(selectedRecord.previous_state)}
                      </div>
                    )}
                    {selectedRecord.new_state && (
                      <div className="text-[#10B981]">
                        + {JSON.stringify(selectedRecord.new_state)}
                      </div>
                    )}
                  </div>
                </div>
              )}
            </>
          ) : (
            <div className="p-8 text-center text-[#A8B6CB]">
              Select an audit row to inspect full details.
            </div>
          )}
        </div>

      </div>
    </main>
  );
}
