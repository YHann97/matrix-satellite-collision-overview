import { TelemetryRow } from '@/types/telemetry';
export const HISTORY_SHARDS = 32;
export const HISTORY_FIELDS = [
  'time_to_tca','miss_distance','relative_speed','risk','max_risk_estimate',
  'relative_position_r','relative_position_t','relative_position_n',
  'relative_velocity_r','relative_velocity_t','relative_velocity_n',
  'c_sigma_r','t_sigma_r','F10','AP','c_object_type','source_row',
] as const;
export type HistoryCell = number | string | null;
export type HistoryRows = HistoryCell[][];
export interface HistoryShardV2 { schema_version: 2; fields: readonly string[]; events: Record<string, HistoryRows>; }
export type HistoryShard = HistoryShardV2 | Record<string, HistoryRows>;
export function historyShardOf(eventId: string): number {
  const n=Number(eventId); if (Number.isInteger(n)&&n>=0) return n%HISTORY_SHARDS;
  let h=0;for(let i=0;i<eventId.length;i++) h=(h*31+eventId.charCodeAt(i))>>>0;return h%HISTORY_SHARDS;
}
export function historyRowsFor(shard: HistoryShard,eventId:string): {rows:HistoryRows;fields:readonly string[];version:number} {
  if ('schema_version' in shard && shard.schema_version===2) {
    const current=shard as HistoryShardV2;
    if (!Array.isArray(current.fields)||!current.events) throw new Error('Invalid versioned history shard');
    return {rows:current.events[eventId]??[],fields:current.fields,version:2};
  }
  return {rows:(shard as Record<string,HistoryRows>)[eventId]??[],fields:HISTORY_FIELDS.slice(0,15),version:1};
}
export function decodeHistory(rows:HistoryRows,base:{event_id:string;mission_id:string|null;c_object_type:string|null},fields:readonly string[]=HISTORY_FIELDS.slice(0,15),version=1):TelemetryRow[] {
  return rows.map((values,i)=>{
    const msg:Record<string,any>={event_id:base.event_id,mission_id:base.mission_id,_source_row_number:i+1,_prediction_history_complete:false};
    fields.forEach((f,k)=>{msg[f]=values[k]??null;});
    if(version===2 && HISTORY_FIELDS.every(f => fields.includes(f)) && Number.isSafeInteger(msg.source_row) && msg.source_row>=0) {
      msg._source_row_number=msg.source_row+1;msg._prediction_history_complete=true;
    } else {
      // Legacy categories are for display only; never send these rows for inference.
      msg.c_object_type=base.c_object_type;
    }
    return msg as TelemetryRow;
  });
}
