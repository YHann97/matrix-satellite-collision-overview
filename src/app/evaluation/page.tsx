'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { useData } from '@/context/DataContext';

interface ModelEval {
  placeholder: boolean;
  model: string;
  note?: string;
  task: string;
  split: { method: string; held_out_events: number; total_events: number };
  classes: string[];
  confusion: number[][]; // rows = actual, columns = predicted
  per_class: { tier: string; support: number; precision: number; recall: number; f1: number }[];
  accuracy: number;
  macro_f1: number;
  log_loss: number;
  future_target: { events: number; macro_f1: number; critical_recall: number };
  baseline: { macro_f1: number; critical_recall: number };
  class_balance: Record<string, number>;
}

const COLORS: Record<string, string> = { critical: '#EF4444', elevated: '#FBBF24', safe: '#10B981' };
const pct = (v: number, d = 1) => `${(v * 100).toFixed(d)}%`;

export default function EvaluationPage() {
  const { datasets, switchDataset } = useData();
  const [ev, setEv] = useState<ModelEval | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    fetch('/data/train/model_eval.json')
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then(setEv)
      .catch(() => setError(true));
  }, []);

  const testSet = datasets.find((d) => d.kind === 'test');

  if (error) {
    return (
      <main className="flex-1 bg-[#061426] p-6 text-xs text-[#A8B6CB]">
        No evaluation found at <code>public/data/train/model_eval.json</code>.
      </main>
    );
  }
  if (!ev) return <main className="flex-1 bg-[#061426] p-6 text-xs text-[#A8B6CB]">Loading evaluation&hellip;</main>;

  const total = Object.values(ev.class_balance).reduce((s, n) => s + n, 0) || 1;
  const critical = ev.per_class.find((c) => c.tier === 'critical');
  const maxCell = Math.max(1, ...ev.confusion.flat());

  return (
    <main className="flex-1 flex flex-col bg-[#061426] p-6 space-y-5 overflow-y-auto text-xs">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-sm font-bold text-[#F5F7FA]">MODEL EVALUATION</h1>
          <p className="text-[11px] text-[#A8B6CB] max-w-3xl">{ev.task}</p>
          <p className="text-[11px] text-[#A8B6CB] max-w-3xl mt-1">{ev.note}</p>
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <div className="p-3 bg-[#0B1E35] border border-[#243B55] rounded-lg">
          <span className="text-[10px] text-[#A8B6CB] block">MODEL</span>
          <span className="text-sm font-bold text-[#F5F7FA]">{ev.model}</span>
        </div>
        <div className="p-3 bg-[#0B1E35] border border-[#243B55] rounded-lg">
          <span className="text-[10px] text-[#A8B6CB] block">HELD-OUT EVENTS</span>
          <span className="text-sm font-bold text-[#F5F7FA]">
            {ev.split.held_out_events.toLocaleString()} of {ev.split.total_events.toLocaleString()}
          </span>
          <span className="text-[10px] text-[#A8B6CB] block">split {ev.split.method}</span>
        </div>
        <div className="p-3 bg-[#0B1E35] border border-[#EF4444]/50 rounded-lg">
          <span className="text-[10px] text-[#EF4444] block font-bold">CRITICAL RECALL</span>
          <span className="text-xl font-bold text-[#EF4444]">{critical ? pct(critical.recall) : 'N/A'}</span>
          <span className="text-[10px] text-[#A8B6CB] block">{critical ? `${ev.confusion[ev.classes.indexOf('critical')]?.[ev.classes.indexOf('critical')]} of ${critical.support} critical events detected` : 'Critical metrics unavailable'}</span>
        </div>
        <div className="p-3 bg-[#0B1E35] border border-[#243B55] rounded-lg">
          <span className="text-[10px] text-[#A8B6CB] block">ACCURACY</span>
          <span className="text-sm font-bold text-[#F5F7FA]">{pct(ev.accuracy)}</span>
          <span className="text-[10px] text-[#A8B6CB] block">misleading on its own: classes are imbalanced</span>
        </div>
      </div>

      <div className="bg-[#0B1E35] border border-[#243B55] rounded-lg p-5 space-y-2 text-[#A8B6CB]">
        <h2 className="text-xs font-bold text-[#F5F7FA]">INTERNAL HOLDOUT CONTEXT</h2>
        <p>Macro F1: <strong className="text-[#F5F7FA]">{pct(ev.macro_f1)}</strong> · Log loss: <strong className="text-[#F5F7FA]">{ev.log_loss.toFixed(3)}</strong>. The latest-message rule baseline reached {pct(ev.baseline.macro_f1)} macro F1 and {pct(ev.baseline.critical_recall)} critical recall.</p>
        <p>For {ev.future_target.events.toLocaleString()} events whose target occurred after the available messages, macro F1 was {pct(ev.future_target.macro_f1)} and critical recall was {pct(ev.future_target.critical_recall)}. The remaining {(ev.split.held_out_events - ev.future_target.events).toLocaleString()} events already contained the target message among their inputs.</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
        <div className="lg:col-span-7 bg-[#0B1E35] border border-[#243B55] rounded-lg p-5 space-y-3">
          <h2 className="text-xs font-bold text-[#F5F7FA]">CONFUSION MATRIX (held-out events)</h2>
          <table className="w-full text-center text-[11px]">
            <thead>
              <tr className="text-[#A8B6CB]">
                <th className="p-2 text-left">actual / predicted</th>
                {ev.classes.map((c) => (
                  <th key={c} className="p-2 uppercase" style={{ color: COLORS[c] }}>
                    {c}
                  </th>
                ))}
                <th className="p-2">RECALL</th>
              </tr>
            </thead>
            <tbody>
              {ev.confusion.map((row, i) => {
                const rowSum = row.reduce((s, n) => s + n, 0) || 1;
                return (
                  <tr key={i}>
                    <td className="p-2 text-left font-bold uppercase" style={{ color: COLORS[ev.classes[i]] }}>
                      {ev.classes[i]}
                    </td>
                    {row.map((n, j) => (
                      <td
                        key={j}
                        className="p-2 border border-[#061426] font-bold text-[#F5F7FA]"
                        style={{
                          backgroundColor:
                            i === j ? `rgba(36,91,255,${0.15 + 0.6 * (n / maxCell)})` : `rgba(239,68,68,${0.6 * (n / maxCell)})`,
                        }}
                        title={`${pct(n / rowSum)} of actual ${ev.classes[i]}`}
                      >
                        {n.toLocaleString()}
                        <span className="block text-[9px] font-normal text-[#A8B6CB]">{pct(n / rowSum, 0)}</span>
                      </td>
                    ))}
                    <td className="p-2 font-bold text-[#F5F7FA]">{pct(ev.per_class[i].recall)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <p className="text-[10px] text-[#A8B6CB]">
            Blue diagonal = correct. Red = errors. A Critical encounter predicted as elevated or safe is the costly mistake.
          </p>
        </div>

        <div className="lg:col-span-5 bg-[#0B1E35] border border-[#243B55] rounded-lg p-5 space-y-3">
          <h2 className="text-xs font-bold text-[#F5F7FA]">CLASS BALANCE (held-out)</h2>
          {ev.classes.map((c) => {
            const n = ev.class_balance[c] ?? 0;
            return (
              <div key={c}>
                <div className="flex justify-between mb-1">
                  <span className="uppercase" style={{ color: COLORS[c] }}>
                    {c}
                  </span>
                  <span className="text-[#F5F7FA] font-bold">
                    {n.toLocaleString()} ({pct(n / total)})
                  </span>
                </div>
                <div className="w-full bg-[#061426] h-2 rounded overflow-hidden">
                  <div className="h-full" style={{ width: `${(n / total) * 100}%`, backgroundColor: COLORS[c] }} />
                </div>
              </div>
            );
          })}
          <p className="text-[10px] text-[#A8B6CB]">Critical is rare, so report its recall and the matrix, not only accuracy.</p>
        </div>
      </div>

      <div className="bg-[#0B1E35] border border-[#243B55] rounded-lg p-5 space-y-3">
        <h2 className="text-xs font-bold text-[#F5F7FA]">PER-CLASS METRICS</h2>
        <table className="w-full text-left text-[11px]">
          <thead className="text-[#A8B6CB] border-b border-[#243B55]">
            <tr>
              <th className="py-1.5">CLASS</th>
              <th className="py-1.5 text-right">SUPPORT</th>
              <th className="py-1.5 text-right">PRECISION</th>
              <th className="py-1.5 text-right">RECALL</th>
              <th className="py-1.5 text-right">F1</th>
            </tr>
          </thead>
          <tbody>
            {ev.per_class.map((c) => (
              <tr key={c.tier} className="border-b border-[#243B55]/50">
                <td className="py-1.5 font-bold uppercase" style={{ color: COLORS[c.tier] }}>
                  {c.tier}
                </td>
                <td className="py-1.5 text-right text-[#F5F7FA]">{c.support.toLocaleString()}</td>
                <td className="py-1.5 text-right text-[#F5F7FA]">{pct(c.precision)}</td>
                <td className="py-1.5 text-right text-[#F5F7FA] font-bold">{pct(c.recall)}</td>
                <td className="py-1.5 text-right text-[#F5F7FA]">{pct(c.f1)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="bg-[#0B1E35] border border-[#243B55] rounded-lg p-5 space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-xs font-bold text-[#F5F7FA]">TEST DATA DEMO</h2>
          {testSet ? (
            <Link
              href="/globe"
              onClick={() => switchDataset(testSet.id)}
              className="px-3 py-1.5 bg-[#245BFF] hover:bg-blue-600 text-white rounded font-bold"
            >
              Open {testSet.filename} on the globe &rarr;
            </Link>
          ) : (
            <span className="text-[#A8B6CB]">No test dataset built yet.</span>
          )}
        </div>
        <p className="text-[11px] text-[#A8B6CB]">
          Test data has no final outcomes and every CDM is 2&ndash;7 days out, so each test encounter shows the model&apos;s predicted
          tier. Test and train are separate datasets: event_id restarts in each file and they are never joined.
        </p>
        {testSet?.predicted_counts && (
          <div className="flex flex-wrap gap-5 text-[11px]">
            {(['critical', 'elevated', 'safe'] as const).map((c) => (
              <span key={c}>
                <span className="uppercase font-bold" style={{ color: COLORS[c] }}>
                  {c}
                </span>{' '}
                <strong className="text-[#F5F7FA]">{(testSet.predicted_counts?.[c] ?? 0).toLocaleString()}</strong> predicted
              </span>
            ))}
          </div>
        )}
      </div>
    </main>
  );
}
