'use client';
import { applyPrecomputed } from '@/lib/prediction/precomputed';
import { eventKey } from '@/lib/prediction/schema';

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
import { decodeHistory, historyShardOf, historyRowsFor, HistoryShard } from '@/lib/data/history';
import { messagesForPrediction, predictionKey, isCurrentPrediction, applyPrediction } from '@/lib/prediction/client';
import type { PredictionResponse } from '@/types/prediction';

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
  const activeDatasetIdRef = useRef(INITIAL_DATASETS[0].id);
  const datasetEpochRef = useRef(0);
  const predictionTicketsRef = useRef(new Map<string, number>());
  const sourceByDatasetRef = useRef(new Map<string, 'static' | 'imported' | 'demo'>([[INITIAL_DATASETS[0].id, 'demo']]));
  const recordsByDatasetRef = useRef(new Map<string, Map<string, TelemetryRow[]>>());
  const encounterSnapshotsRef = useRef(new Map<string, EncounterSummary[]>());
  const historyShardsRef = useRef(new Map<string, Promise<HistoryShard>>());
  const messagesRequestRef = useRef(0);
  const precomputedCacheRef = useRef<any>(null);
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
    const bootstrapEpoch = datasetEpochRef.current;
    const useSeed = () => {
      const seeded = generateSeedEncounters(2167);
      setEncounters(seeded);
      if (seeded.length > 0) {
        setSelectedEncounter(seeded[0]);
        setSelectedMessages(generateSeedMessages(seeded[0].event_id));
      }
    };

    Promise.all([
      fetch('/data/encounters.json').then(res => res.ok ? res.json() : Promise.reject(new Error(`HTTP ${res.status}`))),
      fetch('/data/predictions.json').then(res => res.ok ? res.json() : null).catch(() => null),
    ])
      .then(([data, cache]: [{ dataset: Partial<Dataset> & { id: string; filename: string }; encounters: EncounterSummary[] }, any]) => {
        if (cancelled || datasetEpochRef.current !== bootstrapEpoch || !data.encounters?.length) return;
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
        activeDatasetIdRef.current = real.id;
        datasetEpochRef.current++;
        sourceByDatasetRef.current.set(real.id, 'static');
        precomputedCacheRef.current = cache;
        const clean = applyPrecomputed(real, data.encounters.map(e => ({ ...e, dataset_id: real.id, predicted_pc: null, model_tier: null, model_tier_probabilities: null, model_version: null, model_simulation: false, prediction_status: undefined, prediction_error: null, model_observed_pc: null, model_observed_pc_status: undefined, model_observed_miss_distance_m: null, prediction_as_of_days: null })), cache);
        encounterSnapshotsRef.current.set(real.id, clean);
        setActiveDataset(real);
        setEncounters(clean);
        setSelectedEncounter(clean[0]);
        loadMessages(clean[0], real.id);
      })
      .catch(() => {
        if (!cancelled && datasetEpochRef.current === bootstrapEpoch) useSeed();
      });

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (encounters.length && encounters.every(e => e.dataset_id === activeDatasetIdRef.current)) {
      encounterSnapshotsRef.current.set(activeDatasetIdRef.current, encounters);
    }
  }, [encounters]);

  const getMessages = async (enc: EncounterSummary, datasetId: string): Promise<TelemetryRow[]> => {
    const imported = recordsByDatasetRef.current.get(datasetId);
    if (imported) return imported.get(enc.event_id) ?? [];
    if (sourceByDatasetRef.current.get(datasetId) === 'demo') return generateSeedMessages(enc.event_id);
    if (sourceByDatasetRef.current.get(datasetId) !== 'static') throw new Error('Source history is unavailable. Import a telemetry CSV.');
    const shard = historyShardOf(enc.event_id);
    const key = JSON.stringify([datasetId, shard]);
    let pending = historyShardsRef.current.get(key);
    if (!pending) {
      pending = fetch(`/data/history/${shard}.json`).then(res => res.ok ? res.json() : Promise.reject(new Error(`History unavailable: HTTP ${res.status}`)));
      historyShardsRef.current.set(key, pending!);
    }
    try {
      const history = historyRowsFor(await pending!, enc.event_id);
      return decodeHistory(history.rows, enc, history.fields, history.version);
    } catch (e) { historyShardsRef.current.delete(key); throw e; }
  };

  const loadMessages = (enc: EncounterSummary, datasetId = activeDatasetIdRef.current) => {
    const request = ++messagesRequestRef.current;
    setSelectedMessages([]);
    if (sourceByDatasetRef.current.get(datasetId) === 'demo') {
      setSelectedMessages(generateSeedMessages(enc.event_id));
      return;
    }
    getMessages(enc, datasetId).then(rows => {
      if (request === messagesRequestRef.current && datasetId === activeDatasetIdRef.current) setSelectedMessages(rows);
    }).catch(() => {
      if (request === messagesRequestRef.current && datasetId === activeDatasetIdRef.current) setSelectedMessages([]);
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
    const existing = plans.find((p) => p.event_id === planData.event_id && p.dataset_id === activeDatasetIdRef.current);
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
        baseline_pc: event?.source_pc ?? null,
        baseline_miss_distance: event?.miss_distance || null,
        baseline_lead_time: event?.min_time_to_tca || null,
        baseline_model_version: event?.model_version ?? 'source-assessment',
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
    const datasetId = activeDatasetIdRef.current;
    const event = encounters.find(e => e.event_id === eventId && e.dataset_id === datasetId);
    if (!event) throw new Error('Encounter is not part of the active dataset');
    if (event.model_prediction_source === 'precomputed' && event.model_tier_probabilities) return null;
    const key = predictionKey(datasetId, eventId);
    const ticket = (predictionTicketsRef.current.get(key) ?? 0) + 1;
    predictionTicketsRef.current.set(key, ticket);
    const captured = { datasetId, epoch: datasetEpochRef.current, ticket };
    const current = () => isCurrentPrediction(captured, {
      datasetId: activeDatasetIdRef.current, epoch: datasetEpochRef.current,
      ticket: predictionTicketsRef.current.get(key) ?? 0,
    });
    const update = (fn: (e: EncounterSummary) => EncounterSummary) => {
      if (!current()) return;
      setEncounters(prev => prev.map(e => e.dataset_id === datasetId && e.event_id === eventId ? fn(e) : e));
      setSelectedEncounter(prev => prev?.dataset_id === datasetId && prev.event_id === eventId ? fn(prev) : prev);
    };
    update(e => ({ ...e, prediction_status: 'processing', prediction_error: null }));
    try {
      const messages = messagesForPrediction(await getMessages(event, datasetId), eventId);
      if (!current()) return null;
      const res = await fetch('/api/predictions', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ dataset_id: datasetId, event_id: eventId,
          record_id: event.latest_record_id, schema_version: '2.0', messages }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || `Prediction failed: HTTP ${res.status}`);
      const response = data as PredictionResponse;
      if (response.dataset_id !== datasetId || response.event_id !== eventId || response.event_key !== eventKey(datasetId,eventId)) throw new Error('Prediction response belongs to a different encounter');
      update(e => applyPrediction(e, response));
      if (current()) recordAuditEvent({ event_id: eventId, action_type: 'FINAL-TIER FORECAST UPDATED',
        operator_email: 'system_model', summary: `${datasetId}: ${response.classification}; model ${response.model_version}; input as of ${response.input_time_to_tca_days.toFixed(3)} days before TCA. No Pc forecast produced.` });
      return response;
    } catch (err) {
      update(e => ({ ...e, prediction_status: 'failed', prediction_error: err instanceof Error ? err.message : 'Prediction unavailable' }));
      throw err;
    }
  };

  const importCsvDataset = async (csvText: string, filename: string): Promise<Dataset> => {
    const parseResult = parseTelemetryCsv(csvText);
    const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(csvText));
    const checksum=Array.from(new Uint8Array(digest),b=>b.toString(16).padStart(2,'0')).join('');
    const newDatasetId = `sha256:${checksum}`;
    const grouped = groupEncounters(newDatasetId, parseResult.rows);

    const newDataset: Dataset = {
      id: newDatasetId,
      filename,
      sha256_checksum: checksum,
      file_size_bytes: csvText.length,
      row_count: parseResult.totalRows,
      encounter_count: grouped.encounters.length,
      status: 'ready',
      is_active: true,
      created_at: new Date().toISOString(),
    };

    grouped.encounters = applyPrecomputed(newDataset, grouped.encounters, precomputedCacheRef.current);
    setDatasets((prev) => [
      newDataset,
      ...prev.filter((d) => d.id !== newDatasetId).map((d) => ({ ...d, is_active: false })),
    ]);
    encounterSnapshotsRef.current.set(activeDatasetIdRef.current, encounters);
    encounterSnapshotsRef.current.set(newDatasetId, grouped.encounters);
    recordsByDatasetRef.current.set(newDatasetId, grouped.recordsByEvent);
    sourceByDatasetRef.current.set(newDatasetId, 'imported');
    activeDatasetIdRef.current = newDatasetId;
    datasetEpochRef.current++;
    messagesRequestRef.current++;
    setActiveDataset(newDataset);
    setEncounters(grouped.encounters);
    if (grouped.encounters.length > 0) {
      setSelectedEncounter(grouped.encounters[0]);
      setSelectedMessages(grouped.recordsByEvent.get(grouped.encounters[0].event_id) || []);
    } else { setSelectedEncounter(null); setSelectedMessages([]); }

    recordAuditEvent({
      event_id: 'SYSTEM',
      action_type: 'DATASET IMPORTED',
      operator_email: 'active.operator@esa.int',
      summary: `Imported ${filename}: ${parseResult.totalRows} rows, ${grouped.encounters.length} unique encounters.`,
    });

    return newDataset;
  };

  const switchDataset = (datasetId: string) => {
    const target = datasets.find(d => d.id === datasetId);
    if (!target || datasetId === activeDatasetIdRef.current) return;
    encounterSnapshotsRef.current.set(activeDatasetIdRef.current, encounters);
    activeDatasetIdRef.current = datasetId;
    datasetEpochRef.current++;
    messagesRequestRef.current++;
    if (datasetId === 'ds-seed' && !encounterSnapshotsRef.current.has(datasetId)) {
      encounterSnapshotsRef.current.set(datasetId, generateSeedEncounters(24));
      sourceByDatasetRef.current.set(datasetId, 'demo');
    }
    const restored = encounterSnapshotsRef.current.get(datasetId) ?? [];
    setDatasets(prev => prev.map(d => ({ ...d, is_active: d.id === datasetId })));
    setActiveDataset(target);
    setEncounters(restored);
    setSelectedEncounter(restored[0] ?? null);
    setSelectedMessages([]);
    if (restored[0]) loadMessages(restored[0], datasetId);
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
