import test from 'node:test';
import assert from 'node:assert/strict';
import { eventKey, identifier, preparePredictionMessages } from '../src/lib/prediction/schema';
import { handlePrediction, normalizePrediction } from '../src/lib/prediction/service';
import { applyPrediction, isCurrentPrediction, messagesForPrediction } from '../src/lib/prediction/client';
import { parseTelemetryCsv } from '../src/lib/csv/parser';
import { groupEncounters } from '../src/lib/csv/grouping';
import { decodeHistory, HISTORY_FIELDS } from '../src/lib/data/history';
import type { PredictionRequest, PredictionResponse } from '../src/types/prediction';
const message = {event_id:'a:b',source_row:10,time_to_tca:2.5,risk:-5,c_object_type:'DEBRIS',miss_distance:2000};
const req:PredictionRequest={dataset_id:'uploaded file:1',event_id:'a:b',record_id:'rec',request_id:'req',schema_version:'2.0',messages:[message]};
function native(){return {schema_version:'airbus-final-event-v1',prediction_target:'final_recorded_event_tier',input_cutoff_days:2,model_id:'frozen-model',skipped:[],events:[{event_id:req.event_id,event_key:eventKey(req.dataset_id,req.event_id),input_time_to_tca_days:2.5,latest_observed:{risk_log10_pc:-5,pc:1e-5,pc_status:'provided',miss_distance_m:2000},forecast:{final_tier:'Elevated',tier_probabilities:{Safe:.1,Elevated:.7,Critical:.2},final_pc:null,final_pc_status:'withheld_pending_validation'}}]};}
test('eligible observed risk allowed; future poison and final labels never forwarded',()=>{
 const rows=preparePredictionMessages([{...message,final_risk:0,target:2,unknown:42},{...message,source_row:11,time_to_tca:1,risk:'poison',c_sigma_r:Infinity}],req.event_id);
 assert.equal(rows.length,1);assert.equal(rows[0].risk,-5);assert.equal(rows[0].c_sigma_r,null);assert.equal(rows[0].target,undefined);assert.equal(rows[0].final_risk,undefined);
 assert.throws(()=>preparePredictionMessages([{...message,time_to_tca:NaN}],req.event_id));
 assert.throws(()=>preparePredictionMessages([{...message,event_id:'other',time_to_tca:1}],req.event_id));
 assert.throws(()=>preparePredictionMessages([{...message,time_to_tca:1}],req.event_id));
 assert.throws(()=>preparePredictionMessages([message,message],req.event_id));
 assert.throws(()=>preparePredictionMessages([{...message,risk:1}],req.event_id));
 assert.throws(()=>identifier('x'.repeat(129),'event_id'));
});
test('native response enforces encoded namespace and probability versus Pc semantics',()=>{
 assert.equal(eventKey('uploaded file:1',"a:b!'()*é"),'uploaded%20file%3A1:a%3Ab%21%27%28%29%2A%C3%A9');
 const response=normalizePrediction(native(),req);assert.equal(response.provided_pc,1e-5);assert.equal(response.tier_probabilities.Critical,.2);assert.equal(response.final_pc,null);assert.equal(response.classification,'elevated');assert.equal(response.simulation,false);
 for(const mutate of [(x:any)=>x.events[0].event_key='other:a:b',(x:any)=>x.prediction_target='current_pc',(x:any)=>x.events[0].forecast.final_pc=.2,(x:any)=>x.events[0].forecast.tier_probabilities.Safe=1.1,(x:any)=>x.events[0].latest_observed.pc=.2]){const x=native();mutate(x);assert.throws(()=>normalizePrediction(x,req));}
 const floor=native();Object.assign(floor.events[0].latest_observed,{pc:0,risk_log10_pc:-30,pc_status:'approximately_zero'});assert.equal(normalizePrediction(floor,req).provided_pc,0);
 const missing=native();Object.assign(missing.events[0].latest_observed,{pc:null,risk_log10_pc:null,pc_status:'unavailable'});assert.equal(normalizePrediction(missing,req).provided_pc,null);
});
test('proxy forwards sanitized native contract with server auth; failures never synthesize a Pc',async()=>{
 let sent:any;const fetchImpl:typeof fetch=async(_url,init)=>{sent=JSON.parse(String(init?.body));assert.equal((init?.headers as any)['X-API-Key'],'app-key');assert.equal((init?.headers as any).Authorization,'Bearer private-token');return Response.json(native());};
 const result=await handlePrediction({...req,messages:[{...message,target:1}]},{apiUrl:'http://backend/v1/predict',apiKey:'app-key',hfToken:'private-token',fetchImpl});assert.equal(result.status,200);assert.equal(sent.messages[0].target,undefined);assert.equal(sent.schema_version,'2.0');
 const demo=await handlePrediction(req,{});assert.equal(demo.status,200);assert.equal((demo.body as PredictionResponse).simulation,true);assert.equal((demo.body as PredictionResponse).model_version,'demo-simulation-not-trained');assert.equal((demo.body as PredictionResponse).final_pc,null);const enc=groupEncounters(req.dataset_id,parseTelemetryCsv('event_id,time_to_tca,risk\na:b,3,-5').rows).encounters[0];assert.equal(applyPrediction(enc,demo.body as PredictionResponse).model_simulation,true);assert.ok(Math.abs((demo.body as PredictionResponse).provided_pc! - 1e-5)<1e-15);
 assert.equal((await handlePrediction(req,{apiUrl:'x',fetchImpl:async()=>Response.json({detail:'No eligible rows'},{status:422})})).status,422);
 const failed=await handlePrediction(req,{apiUrl:'x',fetchImpl:async()=>{throw new Error('offline');}});assert.equal(failed.status,502);assert.equal((failed.body as any).provided_pc,undefined);
});
test('CSV retains requested event history, category changes and source tie order; legacy history cannot predict',()=>{
 const csv='event_id,time_to_tca,risk,c_object_type,source_row\na:b,3,-6,PAYLOAD,90\nother,2.5,-3,DEBRIS,91\na:b,2,-5,DEBRIS,92\na:b,0.2,-2,PAYLOAD,93';
 const grouped=groupEncounters(req.dataset_id,parseTelemetryCsv(csv).rows);const history=grouped.recordsByEvent.get('a:b')!;
 const eligible=messagesForPrediction(history,'a:b');assert.deepEqual(eligible.map(r=>r.source_row),[90,92]);assert.deepEqual(eligible.map(r=>r.c_object_type),['PAYLOAD','DEBRIS']);
 const enc=grouped.encountersMap.get('a:b')!;const predicted=applyPrediction(enc,normalizePrediction(native(),req));assert.equal(predicted.source_pc,enc.source_pc);assert.equal(predicted.operational_tier,enc.operational_tier);assert.equal(predicted.predicted_pc,null);assert.equal(predicted.model_tier,'elevated');assert.equal(predicted.model_simulation,false);
 const base={event_id:'a:b',mission_id:null,c_object_type:'PAYLOAD'};
 assert.throws(()=>messagesForPrediction(decodeHistory([[3,2000,100,-5]],base),'a:b'));
 const rows=HISTORY_FIELDS.map(f=>f==='source_row'?90:f==='time_to_tca'?3:f==='c_object_type'?'DEBRIS':null);
 assert.equal(messagesForPrediction(decodeHistory([rows],base,HISTORY_FIELDS,2),'a:b')[0].c_object_type,'DEBRIS');
 assert.throws(()=>messagesForPrediction(parseTelemetryCsv('event_id,time_to_tca,source_row\na:b,3,bad').rows,'a:b'));
});
test('dataset changes and newer request tickets invalidate stale async results',()=>{
 const captured={datasetId:'A',epoch:1,ticket:1};assert.equal(isCurrentPrediction(captured,{...captured}),true);
 for(const current of [{...captured,datasetId:'B'},{...captured,epoch:2},{...captured,ticket:2}])assert.equal(isCurrentPrediction(captured,current),false);
});

test('precomputed forecasts join only exact full checksum namespace and event IDs',async()=>{
 const {applyPrecomputed}=await import('../src/lib/prediction/precomputed');
 const sha='a'.repeat(64),id=`sha256:${sha}`;
 const enc=groupEncounters(id,parseTelemetryCsv('event_id,time_to_tca,risk\na:b,3,-5').rows).encounters[0];
 const event=native().events[0];event.event_key=eventKey(id,'a:b');
 const cache={schema_version:'airbus-precomputed-final-event-v1',model_id:'frozen-model',source_csv_sha256:sha,namespace:id,prediction_kind:'precomputed_frozen_model',simulation:false,external_accuracy_available:false,input_cutoff_days:2,prediction_target:'final_recorded_event_tier',events:[event]};
 const joined=applyPrecomputed({id,sha256_checksum:sha},[enc],cache)[0];assert.equal(joined.model_prediction_source,'precomputed');assert.equal(joined.model_simulation,false);assert.equal(joined.model_tier,'elevated');assert.equal(joined.source_pc,enc.source_pc);
 for(const bad of [null,{...cache,source_csv_sha256:'b'.repeat(64)},{...cache,namespace:'other'},{...cache,events:[]},{...cache,simulation:true},{...cache,events:[{...event,event_id:'other'}]}])assert.equal(applyPrecomputed({id,sha256_checksum:sha},[enc],bad)[0].model_tier,null);
 assert.equal(applyPrecomputed({id:'training',sha256_checksum:sha},[{...enc,dataset_id:'training'}],cache)[0].model_tier,null);
});
test('bundled external forecasts match source metadata and all encounters without claiming external accuracy',async()=>{
 const {readFileSync}=await import('node:fs');const {applyPrecomputed}=await import('../src/lib/prediction/precomputed');
 const data=JSON.parse(readFileSync(new URL('../public/data/encounters.json',import.meta.url),'utf8'));
 const cache=JSON.parse(readFileSync(new URL('../public/data/predictions.json',import.meta.url),'utf8'));
 assert.equal(data.dataset.sha256_checksum,cache.source_csv_sha256);assert.equal(data.dataset.row_count,24484);assert.equal(data.encounters.length,2167);assert.equal(cache.events.length,2167);assert.equal(cache.external_accuracy_available,false);
 const result=applyPrecomputed(data.dataset,data.encounters,cache);assert.equal(result.filter(e=>e.model_prediction_source==='precomputed'&&!e.model_simulation).length,2167);assert.ok(result.every(e=>e.predicted_pc===null));
});
