'use client';

import React, { createContext, useContext, useState, useEffect, useRef, MutableRefObject } from 'react';
import { EncounterSummary, Dataset, TelemetryRow } from '@/types/telemetry';
import {
  generateSeedEncounters,
  generateSeedMessages,
  INITIAL_DATASETS,
  PlanRecord,
  AuditEventRecord,
} from '@/lib/data/mockStore';
import { parseTelemetryCsv } from '@/lib/csv/parser';
import { groupEncounters } from '@/lib/csv/grouping';
import { decodeHistory, historyShardOf } from '@/lib/data/history';

export interface GlobeFilters {
  tier: string;
  mission: string;
  maxMarkers: number;
  noteCollapsed: boolean; // globe disclaimer panel
  cardMinimized: boolean; // selected-encounter card
  headerCollapsed: boolean; // page header filters
  controlsCollapsed: boolean; // top-right globe controls
  focusEventId: string | null; // when set, the globe shows only this encounter
}

export interface GlobeViewState {
  angle: number;
  zoom: number;
  rotating: boolean;
  pitch: number; // vertical tilt in degrees
}

export const DEFAULT_GLOBE_FILTERS: GlobeFilters = { tier: 'all', mission: 'all', maxMarkers: 50, noteCollapsed: true, cardMinimized: false, headerCollapsed: false, controlsCollapsed: false, focusEventId: null };
export const DEFAULT_GLOBE_VIEW: GlobeViewState = { angle: 0, zoom: 1, rotating: false, pitch: 0 };

interface DataContextType {
  // Globe settings live here so they survive navigating to another page and back
  globeFilters: GlobeFilters;
  setGlobeFilters: React.Dispatch<React.SetStateAction<GlobeFilters>>;
  globeViewRef: MutableRefObject<GlobeViewState>;
  datasets: Dataset[];
  activeDataset: Dataset | null;
  encounters: EncounterSummary[];
  selectedEncounter: EncounterSummary | null;
  selectedMessages: TelemetryRow[];
  plans: PlanRecord[];
  auditLog: AuditEventRecord[];
  selectEncounterById: (eventId: string) => void;
  acknowledgeEncounter: (eventId: string) => void;
  createOrUpdatePlan: (plan: Partial<PlanRecord> & { event_id: string }) => PlanRecord;
  requestPrediction: (eventId: string) => Promise<any>;
  importCsvDataset: (csvText: string, filename: string) => Promise<Dataset>;
  switchDataset: (datasetId: string) => void;
  exportAuditCsv: () => void;
}

const DataContext = createContext<DataContextType | undefined>(undefined);

export function DataProvider({ children }: { children: React.ReactNode }) {
  const [globeFilters, setGlobeFilters] = useState<GlobeFilters>(DEFAULT_GLOBE_FILTERS);
  const globeViewRef = useRef<GlobeViewState>({ ...DEFAULT_GLOBE_VIEW });
  const [datasets, setDatasets] = useState<Dataset[]>(INITIAL_DATASETS);
  const [activeDataset, setActiveDataset] = useState<Dataset | null>(INITIAL_DATASETS[0]);
  const [encounters, setEncounters] = useState<EncounterSummary[]>([]);
  const [selectedEncounter, setSelectedEncounter] = useState<EncounterSummary | null>(null);
  const [selectedMessages, setSelectedMessages] = useState<TelemetryRow[]>([]);
  // True when encounters came from encounters.json, whose per-update history is in public/data/history
  const hasHistoryRef = useRef(false);
  const historyShardsRef = useRef(new Map<number, Promise<Record<string, (number | null)[][]>>>());
  const messagesRequestRef = useRef(0);
  const [plans, setPlans] = useState<PlanRecord[]>([
    {
      id: 'PLN-881',
      dataset_id: 'ds-seed',
      event_id: 'EV-0001',
      planning_status: 'assessing',
      assigned_operator: 'controller.dan@esa.int',
      assessment_rationale: 'Encounter distance is below 1 km safety margin (303.5 m). High relative velocity of 14.2 km/s means destructive collision risk. Cross-track covariance uncertainty is elevated.',
      proposed_action: 'Prepare along-track +2.5 m/s delta-V maneuver burn at T-6h prior to TCA if tracking does not widen beyond 2.0 km.',
      baseline_pc: 1.2e-4,
      baseline_miss_distance: 303.5,
      baseline_lead_time: 1.02,
      baseline_model_version: 'v1.0.4',
      is_stale: false,
      updated_at: '2026-10-31T12:18:42Z',
    },
    {
      id: 'PLN-879',
      dataset_id: 'ds-seed',
      event_id: 'EV-0002',
      planning_status: 'queued',
      assigned_operator: 'operator.alex@esa.int',
      assessment_rationale: 'Elevated risk profile. Awaiting second tracking pass.',
      proposed_action: 'Monitor radar pass at T-12h.',
      baseline_pc: 4.8e-5,
      baseline_miss_distance: 2450,
      baseline_lead_time: 2.1,
      baseline_model_version: 'v1.0.4',
      is_stale: false,
      updated_at: '2026-10-31T11:00:00Z',
    },
  ]);
  const [auditLog, setAuditLog] = useState<AuditEventRecord[]>([
    {
      id: 'AUD-9921',
      timestamp: '2026-10-31T12:18:42Z',
      event_id: 'EV-0001',
      action_type: 'PLAN DRAFT SAVED',
      operator_email: 'controller.dan@esa.int',
      summary: 'Updated proposed delta-V maneuver to +2.5 m/s',
      previous_state: { proposed_action: '+2.0 m/s' },
      new_state: { proposed_action: '+2.5 m/s' },
    },
    {
      id: 'AUD-9920',
      timestamp: '2026-10-31T11:45:10Z',
      event_id: 'EV-0001',
      action_type: 'STATUS CHANGED TO ASSESSING',
      operator_email: 'operator.alex@esa.int',
      summary: 'Assigned to controller.dan@esa.int',
    },
    {
      id: 'AUD-9919',
      timestamp: '2026-10-31T11:30:15Z',
      event_id: 'EV-0001',
      action_type: 'SENT TO PLANNING',
      operator_email: 'operator.alex@esa.int',
      summary: 'Triggered from Encounters list due to Critical tier threshold violation',
    },
    {
      id: 'AUD-9918',
      timestamp: '2026-10-31T09:00:12Z',
      event_id: 'SYSTEM',
      action_type: 'DATASET IMPORTED',
      operator_email: 'system_ingest',
      summary: 'Imported test.csv: 24,484 rows, 2,167 unique encounters',
    },
  ]);

  // Load the real encounters built by scripts/build-encounters.ts; fall back to generated seed data
  useEffect(() => {
    let cancelled = false;
    const useSeed = () => {
      const seeded = generateSeedEncounters(2167);
      setEncounters(seeded);
      if (seeded.length > 0) {
        setSelectedEncounter(seeded[0]);
        setSelectedMessages(generateSeedMessages(seeded[0].event_id));
      }
    };

    fetch('/data/encounters.json')
      .then((res) => (res.ok ? res.json() : Promise.reject(new Error(`HTTP ${res.status}`))))
      .then((data: { dataset: Partial<Dataset> & { id: string; filename: string }; encounters: EncounterSummary[] }) => {
        if (cancelled || !data.encounters?.length) return;
        const real: Dataset = {
          sha256_checksum: '',
          status: 'ready',
          is_active: true,
          created_at: new Date().toISOString(),
          row_count: 0,
          encounter_count: data.encounters.length,
          file_size_bytes: 0,
          ...data.dataset,
        };
        setDatasets((prev) => [real, ...prev.map((d) => ({ ...d, is_active: false }))]);
        setActiveDataset(real);
        hasHistoryRef.current = true;
        setEncounters(data.encounters);
        setSelectedEncounter(data.encounters[0]);
        loadMessages(data.encounters[0]);
      })
      .catch(() => {
        if (!cancelled) useSeed();
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const loadMessages = (enc: EncounterSummary) => {
    if (!hasHistoryRef.current) {
      setSelectedMessages(generateSeedMessages(enc.event_id));
      return;
    }
    const request = ++messagesRequestRef.current;
    const shard = historyShardOf(enc.event_id);
    let pending = historyShardsRef.current.get(shard);
    if (!pending) {
      pending = fetch(`/data/history/${shard}.json`).then((res) =>
        res.ok ? res.json() : Promise.reject(new Error(`HTTP ${res.status}`))
      );
      historyShardsRef.current.set(shard, pending);
    }
    setSelectedMessages([]);
    pending
      .then((rows) => {
        if (request !== messagesRequestRef.current) return; // a newer selection superseded this one
        setSelectedMessages(decodeHistory(rows[enc.event_id] ?? [], enc));
      })
      .catch(() => {
        historyShardsRef.current.delete(shard);
        if (request === messagesRequestRef.current) setSelectedMessages([]);
      });
  };

  const selectEncounterById = (eventId: string) => {
    const found = encounters.find((e) => e.event_id === eventId);
    if (found) {
      setSelectedEncounter(found);
      loadMessages(found);
    }
  };

  const recordAuditEvent = (entry: Omit<AuditEventRecord, 'id' | 'timestamp'>) => {
    const newEntry: AuditEventRecord = {
      ...entry,
      id: `AUD-${Math.floor(1000 + Math.random() * 9000)}`,
      timestamp: new Date().toISOString(),
    };
    setAuditLog((prev) => [newEntry, ...prev]);
  };

  const acknowledgeEncounter = (eventId: string) => {
    setEncounters((prev) =>
      prev.map((enc) => {
        if (enc.event_id === eventId) {
          return { ...enc, review_status: 'acknowledged' };
        }
        return enc;
      })
    );
    if (selectedEncounter?.event_id === eventId) {
      setSelectedEncounter((prev) => (prev ? { ...prev, review_status: 'acknowledged' } : null));
    }
    recordAuditEvent({
      event_id: eventId,
      action_type: 'ALERT ACKNOWLEDGED',
      operator_email: 'active.operator@esa.int',
      summary: `Encounter ${eventId} acknowledged. Operational risk tier remains ${selectedEncounter?.operational_tier?.toUpperCase() || 'CRITICAL'}.`,
    });
  };

  const createOrUpdatePlan = (planData: Partial<PlanRecord> & { event_id: string }): PlanRecord => {
    const existing = plans.find((p) => p.event_id === planData.event_id);
    const event = encounters.find((e) => e.event_id === planData.event_id);

    if (existing) {
      const updated: PlanRecord = {
        ...existing,
        ...planData,
        updated_at: new Date().toISOString(),
      };
      setPlans((prev) => prev.map((p) => (p.id === existing.id ? updated : p)));
      recordAuditEvent({
        event_id: planData.event_id,
        action_type: 'PLAN DRAFT SAVED',
        operator_email: updated.assigned_operator || 'operator@esa.int',
        summary: `Updated plan ${existing.id} status: ${updated.planning_status}`,
        previous_state: existing,
        new_state: updated,
      });
      return updated;
    } else {
      const newPlan: PlanRecord = {
        id: `PLN-${Math.floor(800 + Math.random() * 199)}`,
        dataset_id: activeDataset?.id || 'ds-active',
        event_id: planData.event_id,
        planning_status: planData.planning_status || 'queued',
        assigned_operator: planData.assigned_operator || 'unassigned',
        assessment_rationale: planData.assessment_rationale || '',
        proposed_action: planData.proposed_action || '',
        baseline_pc: event?.predicted_pc || event?.source_pc || null,
        baseline_miss_distance: event?.miss_distance || null,
        baseline_lead_time: event?.min_time_to_tca || null,
        baseline_model_version: 'v1.0.4',
        is_stale: false,
        updated_at: new Date().toISOString(),
      };
      setPlans((prev) => [newPlan, ...prev]);

      // Update encounter state to in_planning
      setEncounters((prev) =>
        prev.map((enc) =>
          enc.event_id === planData.event_id
            ? { ...enc, review_status: 'in_planning', has_plan: true, plan_id: newPlan.id }
            : enc
        )
      );

      recordAuditEvent({
        event_id: planData.event_id,
        action_type: 'SENT TO PLANNING',
        operator_email: 'active.operator@esa.int',
        summary: `Created new plan ${newPlan.id} for encounter ${planData.event_id}`,
      });
      return newPlan;
    }
  };

  const requestPrediction = async (eventId: string) => {
    try {
      const res = await fetch('/api/predictions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          dataset_id: activeDataset?.id || 'ds-active',
          event_id: eventId,
          record_id: selectedEncounter?.latest_record_id || `rec-${eventId}`,
          schema_version: '1.0',
        }),
      });
      const data = await res.json();
      if (data && data.probability_constant !== undefined) {
        setEncounters((prev) =>
          prev.map((e) =>
            e.event_id === eventId
              ? {
                  ...e,
                  predicted_pc: data.probability_constant,
                  model_tier: data.classification,
                }
              : e
          )
        );
        if (selectedEncounter?.event_id === eventId) {
          setSelectedEncounter((prev) =>
            prev
              ? {
                  ...prev,
                  predicted_pc: data.probability_constant,
                  model_tier: data.classification,
                }
              : null
          );
        }
        recordAuditEvent({
          event_id: eventId,
          action_type: 'PREDICTION REFRESHED',
          operator_email: 'system_model',
          summary: `Model returned Pc: ${data.probability_constant.toExponential(2)}, tier: ${data.classification}`,
        });
      }
      return data;
    } catch (err) {
      console.error('Prediction request error:', err);
      throw err;
    }
  };

  const importCsvDataset = async (csvText: string, filename: string): Promise<Dataset> => {
    const parseResult = parseTelemetryCsv(csvText);
    const newDatasetId = `ds-${Date.now()}`;
    const grouped = groupEncounters(newDatasetId, parseResult.rows);

    const newDataset: Dataset = {
      id: newDatasetId,
      filename,
      sha256_checksum: `sha256-${Date.now()}`,
      file_size_bytes: csvText.length,
      row_count: parseResult.totalRows,
      encounter_count: grouped.encounters.length,
      status: 'ready',
      is_active: true,
      created_at: new Date().toISOString(),
    };

    setDatasets((prev) => [
      newDataset,
      ...prev.map((d) => ({ ...d, is_active: false })),
    ]);
    hasHistoryRef.current = false;
    setActiveDataset(newDataset);
    setEncounters(grouped.encounters);
    if (grouped.encounters.length > 0) {
      setSelectedEncounter(grouped.encounters[0]);
      setSelectedMessages(grouped.recordsByEvent.get(grouped.encounters[0].event_id) || []);
    }

    recordAuditEvent({
      event_id: 'SYSTEM',
      action_type: 'DATASET IMPORTED',
      operator_email: 'active.operator@esa.int',
      summary: `Imported ${filename}: ${parseResult.totalRows} rows, ${grouped.encounters.length} unique encounters.`,
    });

    return newDataset;
  };

  const switchDataset = (datasetId: string) => {
    const target = datasets.find((d) => d.id === datasetId);
    if (target) {
      setDatasets((prev) =>
        prev.map((d) => ({ ...d, is_active: d.id === datasetId }))
      );
      setActiveDataset(target);
    }
  };

  const exportAuditCsv = () => {
    const headers = ['Timestamp', 'Event ID', 'Action Type', 'Operator', 'Summary'];
    const rows = auditLog.map((a) => [
      a.timestamp,
      a.event_id,
      a.action_type,
      a.operator_email,
      `"${a.summary.replace(/"/g, '""')}"`,
    ]);
    const csvContent = [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `audit_history_${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
  };

  return (
    <DataContext.Provider
      value={{
        globeFilters,
        setGlobeFilters,
        globeViewRef,
        datasets,
        activeDataset,
        encounters,
        selectedEncounter,
        selectedMessages,
        plans,
        auditLog,
        selectEncounterById,
        acknowledgeEncounter,
        createOrUpdatePlan,
        requestPrediction,
        importCsvDataset,
        switchDataset,
        exportAuditCsv,
      }}
    >
      {children}
    </DataContext.Provider>
  );
}

export function useData() {
  const context = useContext(DataContext);
  if (!context) {
    throw new Error('useData must be used within a DataProvider');
  }
  return context;
}
