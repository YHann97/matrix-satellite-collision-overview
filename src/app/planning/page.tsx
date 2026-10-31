'use client';

import React, { useState } from 'react';
import { useData } from '@/context/DataContext';
import { formatRiskScore } from '@/lib/classification/policy';
import { PlanRecord } from '@/lib/data/mockStore';

export default function PlanningPage() {
  const { plans, createOrUpdatePlan, encounters } = useData();
  const [selectedPlanId, setSelectedPlanId] = useState<string>(plans[0]?.id || '');
  const [activeSubtab, setActiveSubtab] = useState<'plan' | 'activity'>('plan');

  // Filter
  const [statusFilter, setStatusFilter] = useState('all');

  const selectedPlan = plans.find((p) => p.id === selectedPlanId) || plans[0] || null;

  // Form edit states
  const [operator, setOperator] = useState(selectedPlan?.assigned_operator || '');
  const [rationale, setRationale] = useState(selectedPlan?.assessment_rationale || '');
  const [proposedAction, setProposedAction] = useState(selectedPlan?.proposed_action || '');
  const [planningStatus, setPlanningStatus] = useState<'queued' | 'assessing' | 'reviewed'>(
    selectedPlan?.planning_status || 'assessing'
  );
  const [isSaved, setIsSaved] = useState(false);

  // Sync state when selected plan changes
  React.useEffect(() => {
    if (selectedPlan) {
      setOperator(selectedPlan.assigned_operator || '');
      setRationale(selectedPlan.assessment_rationale || '');
      setProposedAction(selectedPlan.proposed_action || '');
      setPlanningStatus(selectedPlan.planning_status);
      setIsSaved(false);
    }
  }, [selectedPlan?.id]);

  const filteredPlans = plans.filter((p) => {
    if (statusFilter !== 'all' && p.planning_status !== statusFilter) return false;
    return true;
  });

  const handleSaveDraft = () => {
    if (!selectedPlan) return;
    createOrUpdatePlan({
      event_id: selectedPlan.event_id,
      assigned_operator: operator,
      assessment_rationale: rationale,
      proposed_action: proposedAction,
      planning_status: planningStatus,
    });
    setIsSaved(true);
    setTimeout(() => setIsSaved(false), 3000);
  };

  const handleMarkReviewed = () => {
    if (!selectedPlan) return;
    createOrUpdatePlan({
      event_id: selectedPlan.event_id,
      assigned_operator: operator,
      assessment_rationale: rationale,
      proposed_action: proposedAction,
      planning_status: 'reviewed',
    });
    setPlanningStatus('reviewed');
    setIsSaved(true);
  };

  const matchingEncounter = encounters.find((e) => e.event_id === selectedPlan?.event_id);

  return (
    <main className="flex-1 flex flex-col bg-[#061426] text-xs overflow-hidden">
      {/* Top Header */}
      <div className="p-4 border-b border-[#243B55] bg-[#0B1E35] flex flex-wrap items-center justify-between gap-4 z-10">
        <div>
          <h1 className="text-sm font-bold text-[#F5F7FA]">MANUAL PLANNING WORKSPACE</h1>
          <p className="text-[#A8B6CB] text-[11px]">
            Operator decision support and maneuver preparation. Does not execute spacecraft burns.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="bg-[#061426] border border-[#243B55] rounded px-2.5 py-1.5 text-[#F5F7FA] focus:border-[#245BFF]"
          >
            <option value="all">All Plans ({plans.length})</option>
            <option value="queued">Queued</option>
            <option value="assessing">Assessing</option>
            <option value="reviewed">Reviewed</option>
          </select>
        </div>
      </div>

      {/* Split Queue & Detail Layout */}
      <div className="flex-1 grid grid-cols-1 lg:grid-cols-12 overflow-hidden">
        
        {/* Queue List (5 cols) */}
        <div className="lg:col-span-5 border-r border-[#243B55] p-4 space-y-3 overflow-y-auto">
          <span className="text-[#A8B6CB] text-[11px] block">
            ACTIVE PLANNING QUEUE ({filteredPlans.length})
          </span>

          <div className="space-y-2">
            {filteredPlans.map((plan) => {
              const isSelected = selectedPlan?.id === plan.id;
              const enc = encounters.find((e) => e.event_id === plan.event_id);

              return (
                <div
                  key={plan.id}
                  onClick={() => setSelectedPlanId(plan.id)}
                  className={`p-3.5 rounded-lg border cursor-pointer transition-all ${
                    isSelected
                      ? 'bg-[#245BFF]/15 border-2 border-[#245BFF]'
                      : 'bg-[#0B1E35] border-[#243B55] hover:border-[#A8B6CB]'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-[#F5F7FA]">
                      {plan.event_id} ({plan.id})
                    </span>
                    <span
                      className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                        enc?.operational_tier === 'critical'
                          ? 'bg-[#EF4444] text-white'
                          : enc?.operational_tier === 'elevated'
                          ? 'bg-[#FBBF24] text-black'
                          : 'bg-[#10B981] text-black'
                      }`}
                    >
                      {enc?.operational_tier?.toUpperCase() || 'CRITICAL'}
                    </span>
                  </div>

                  <div className="text-[11px] text-[#A8B6CB] mt-1 space-y-0.5">
                    <div>
                      Miss:{' '}
                      <strong className="text-[#F5F7FA]">
                        {plan.baseline_miss_distance ? `${plan.baseline_miss_distance} m` : '842 m'}
                      </strong>
                      {' • '}
                      Lead:{' '}
                      <strong className="text-[#F5F7FA]">
                        {plan.baseline_lead_time ? `${plan.baseline_lead_time} d` : '0.45 d'}
                      </strong>
                    </div>
                    <div>
                      Assigned: <strong className="text-[#F5F7FA]">{plan.assigned_operator}</strong>
                    </div>
                    <div className="flex items-center justify-between pt-1">
                      <span className="text-[10px] text-[#FBBF24] uppercase font-bold">
                        Status: {plan.planning_status}
                      </span>
                      <span className="text-[10px] text-[#A8B6CB]">
                        {new Date(plan.updated_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </span>
                    </div>
                  </div>
                </div>
              );
            })}

            {filteredPlans.length === 0 && (
              <div className="p-8 text-center text-[#A8B6CB]">
                No plans match the selected status filter.
              </div>
            )}
          </div>
        </div>

        {/* Selected Plan Detail (7 cols) */}
        <div className="lg:col-span-7 bg-[#0B1E35] flex flex-col overflow-y-auto">
          {selectedPlan ? (
            <>
              {/* Header */}
              <div className="p-4 border-b border-[#243B55] bg-[#061426]/60 space-y-2">
                <div className="flex items-center justify-between">
                  <div>
                    <span className="text-[#A8B6CB] text-[10px]">SELECTED PLAN: {selectedPlan.id}</span>
                    <h2 className="text-base font-bold text-[#F5F7FA]">
                      Encounter {selectedPlan.event_id} Decision Record
                    </h2>
                  </div>
                  <span className="px-2.5 py-1 bg-[#FBBF24]/20 border border-[#FBBF24] text-[#FBBF24] rounded font-bold uppercase">
                    {planningStatus}
                  </span>
                </div>

                {/* Stale Assessment Alert */}
                <div className="p-2.5 bg-[#061426] border border-[#243B55] rounded text-[11px] text-[#A8B6CB] flex items-center gap-2">
                  <span className="text-[#10B981] font-bold">✓ Current Assessment:</span>
                  <span>Matches latest telemetry assessment #{matchingEncounter?.latest_record_id || 'rec-latest'}</span>
                </div>
              </div>

              {/* Subtabs Header */}
              <div className="flex border-b border-[#243B55] bg-[#061426] font-bold text-xs">
                <button
                  onClick={() => setActiveSubtab('plan')}
                  className={`flex-1 py-2.5 text-center border-b-2 transition-colors ${
                    activeSubtab === 'plan'
                      ? 'border-[#245BFF] text-[#245BFF]'
                      : 'border-transparent text-[#A8B6CB] hover:text-[#F5F7FA]'
                  }`}
                >
                  1. PLAN DRAFT &amp; NOTES
                </button>
                <button
                  onClick={() => setActiveSubtab('activity')}
                  className={`flex-1 py-2.5 text-center border-b-2 transition-colors ${
                    activeSubtab === 'activity'
                      ? 'border-[#245BFF] text-[#245BFF]'
                      : 'border-transparent text-[#A8B6CB] hover:text-[#F5F7FA]'
                  }`}
                >
                  2. ACTIVITY LOG
                </button>
              </div>

              {/* SUBTAB 1: PLAN FORM */}
              {activeSubtab === 'plan' && (
                <div className="p-5 space-y-4">
                  {/* Frozen Baseline Snapshot */}
                  <div className="p-3 bg-[#061426] border border-[#243B55] rounded space-y-1">
                    <span className="text-[#A8B6CB] font-bold text-[11px] block">
                      ASSESSMENT SNAPSHOT AT PLAN CREATION
                    </span>
                    <div className="grid grid-cols-4 gap-2 text-[11px] text-[#A8B6CB] pt-1">
                      <div>
                        Risk score:{' '}
                        <strong className="text-[#F5F7FA]">{formatRiskScore(selectedPlan.baseline_pc)}</strong>
                      </div>
                      <div>
                        Miss:{' '}
                        <strong className="text-[#EF4444]">
                          {selectedPlan.baseline_miss_distance || '842'} m
                        </strong>
                      </div>
                      <div>
                        Lead:{' '}
                        <strong className="text-[#F5F7FA]">
                          {selectedPlan.baseline_lead_time || '0.45'} d
                        </strong>
                      </div>
                      <div>
                        Model:{' '}
                        <strong className="text-[#F5F7FA]">
                          {selectedPlan.baseline_model_version || 'v1.0.4'}
                        </strong>
                      </div>
                    </div>
                  </div>

                  {/* Form Fields */}
                  <div className="space-y-3">
                    <div>
                      <label className="block text-[#A8B6CB] font-bold mb-1">
                        ASSIGNED OPERATOR
                      </label>
                      <input
                        type="text"
                        value={operator}
                        onChange={(e) => setOperator(e.target.value)}
                        className="w-full bg-[#061426] border border-[#243B55] rounded px-3 py-2 text-[#F5F7FA] focus:border-[#245BFF] focus:outline-none"
                      />
                    </div>

                    <div>
                      <label className="block text-[#A8B6CB] font-bold mb-1">
                        OPERATOR ASSESSMENT &amp; RATIONALE
                      </label>
                      <textarea
                        rows={3}
                        value={rationale}
                        onChange={(e) => setRationale(e.target.value)}
                        className="w-full bg-[#061426] border border-[#243B55] rounded p-3 text-[#F5F7FA] focus:border-[#245BFF] focus:outline-none"
                      />
                    </div>

                    <div>
                      <label className="block text-[#A8B6CB] font-bold mb-1">
                        PROPOSED OPERATOR ACTION
                      </label>
                      <textarea
                        rows={3}
                        value={proposedAction}
                        onChange={(e) => setProposedAction(e.target.value)}
                        className="w-full bg-[#061426] border border-[#243B55] rounded p-3 text-[#F5F7FA] focus:border-[#245BFF] focus:outline-none"
                      />
                      <span className="text-[11px] text-[#A8B6CB] mt-1 block">
                        * Note: Human operator assessment only. Application does not execute satellite maneuvers.
                      </span>
                    </div>

                    <div>
                      <label className="block text-[#A8B6CB] font-bold mb-1">
                        PLANNING STATUS
                      </label>
                      <select
                        value={planningStatus}
                        onChange={(e: any) => setPlanningStatus(e.target.value)}
                        className="w-full bg-[#061426] border border-[#243B55] rounded px-3 py-2 text-[#F5F7FA] focus:border-[#245BFF]"
                      >
                        <option value="assessing">Assessing</option>
                        <option value="queued">Queued</option>
                        <option value="reviewed">Reviewed (Sign off complete)</option>
                      </select>
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="pt-4 border-t border-[#243B55] flex items-center justify-between">
                    <div>
                      {isSaved && (
                        <span className="text-[#10B981] font-bold">
                          ✓ Draft successfully persisted
                        </span>
                      )}
                    </div>
                    <div className="flex gap-2">
                      <button
                        onClick={handleSaveDraft}
                        className="px-4 py-2 bg-[#0B1E35] border border-[#243B55] hover:border-[#245BFF] text-[#F5F7FA] rounded font-bold transition-colors"
                      >
                        Save Draft
                      </button>
                      <button
                        onClick={handleMarkReviewed}
                        className="px-4 py-2 bg-[#245BFF] hover:bg-blue-600 text-white rounded font-bold transition-colors"
                      >
                        Mark Reviewed
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {/* SUBTAB 2: ACTIVITY */}
              {activeSubtab === 'activity' && (
                <div className="p-5 space-y-4">
                  <span className="text-[#A8B6CB] font-bold block text-[11px]">
                    PLAN LIFECYCLE AUDIT TRAIL
                  </span>

                  <div className="border-l-2 border-[#243B55] pl-4 space-y-4">
                    <div className="relative">
                      <span className="absolute -left-[21px] top-1 w-2.5 h-2.5 rounded-full bg-[#245BFF]" />
                      <div className="font-bold text-[#F5F7FA]">
                        Plan Updated by {selectedPlan.assigned_operator}
                      </div>
                      <p className="text-[#A8B6CB] text-[11px]">
                        Status: {selectedPlan.planning_status.toUpperCase()} &bull; Proposed action updated.
                      </p>
                      <span className="text-[10px] text-[#A8B6CB]">
                        {new Date(selectedPlan.updated_at).toUTCString()}
                      </span>
                    </div>

                    <div className="relative">
                      <span className="absolute -left-[21px] top-1 w-2.5 h-2.5 rounded-full bg-[#EF4444]" />
                      <div className="font-bold text-[#F5F7FA]">Plan Initiated from Encounter</div>
                      <p className="text-[#A8B6CB] text-[11px]">
                        Encounter {selectedPlan.event_id} queued for manual planning evaluation.
                      </p>
                      <span className="text-[10px] text-[#A8B6CB]">
                        Baseline lead time: {selectedPlan.baseline_lead_time || '0.45'} d
                      </span>
                    </div>
                  </div>
                </div>
              )}
            </>
          ) : (
            <div className="p-8 text-center text-[#A8B6CB]">
              No active plan selected.
            </div>
          )}
        </div>

      </div>
    </main>
  );
}
