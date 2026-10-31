"""Synthetic raw requests exercise the actual immutable model; no dataset rows."""
import copy
import importlib.util
import json
from pathlib import Path
import sys
import time

import numpy as np
import pandas as pd
import pytest
from fastapi.testclient import TestClient

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT))
from backend.app import create_app
from backend.bundle import load_predictor

def payload():
    row = {'event_id':'47','time_to_tca':5.,'source_row':0,'miss_distance':350.,
           'relative_speed':12000.,'relative_position_r':30.,'relative_position_t':340.,
           'relative_position_n':50.,'c_object_type':'DEBRIS','c_sigma_r':100.,
           't_sigma_r':50.,'max_risk_estimate':-3.8,'F10':100.,'AP':4.,'risk':-5.}
    later = {**row,'source_row':1,'time_to_tca':3.,'miss_distance':300.,'risk':-4.5}
    return {'schema_version':'2.0','request_id':'synthetic-test','dataset_id':'demo/source',
            'event_id':'47','record_id':'demo-47','messages':[row,later]}

@pytest.fixture
def client(monkeypatch):
    monkeypatch.delenv('HF_MODEL_ID', raising=False)
    monkeypatch.delenv('FORECAST_API_KEY', raising=False)
    with TestClient(create_app()) as client:
        yield client

def test_actual_frozen_model_matches_native_bundle(client):
    body = payload()
    direct = load_predictor().predict(pd.DataFrame(body['messages']),namespace=body['dataset_id'])
    response = client.post('/v1/predict',json=body)
    assert response.status_code == 200, response.text
    actual=response.json()
    assert actual == direct
    event=actual['events'][0]
    assert event['forecast']['final_pc'] is None
    assert event['forecast']['final_pc_status']=='withheld_pending_validation'
    assert np.isclose(sum(event['forecast']['tier_probabilities'].values()),1)
    assert set(event['forecast']['tier_probabilities'])=={'Safe','Elevated','Critical'}
    assert event['latest_observed']['pc']==10**-4.5
    assert event['event_key'].startswith('demo%2Fsource:')

def test_future_poison_and_unknown_target_columns_are_ignored(client):
    body=payload();before=client.post('/v1/predict',json=body).json()
    body['messages'].append({'event_id':'47','source_row':2,'time_to_tca':.1,
                             'risk':'future-poison','c_sigma_r':{'bad':'future'},
                             'final_tier':'Critical','final_risk':1e100})
    response=client.post('/v1/predict',json=body)
    assert response.status_code==200,response.text
    assert response.json()==before

def test_missing_all_measurements_remain_valid_and_observed_risk_null(client):
    body=payload()
    for message in body['messages']:
        for key in ['c_sigma_r','c_object_type','F10','risk']:
            message[key]=None
    response=client.post('/v1/predict',json=body)
    assert response.status_code==200,response.text
    event=response.json()['events'][0]
    assert event['latest_observed']['pc'] is None
    assert event['latest_observed']['pc_status']=='unavailable'
    assert np.isfinite(list(event['forecast']['tier_probabilities'].values())).all()

def test_missing_source_row_and_floor_observed_risk(client):
    body=payload()
    for message in body['messages']:
        message.pop('source_row');message['risk']=-30.
    response=client.post('/v1/predict',json=body)
    assert response.status_code==200,response.text
    assert response.json()['events'][0]['latest_observed']['pc']==0.
    assert response.json()['events'][0]['latest_observed']['pc_status']=='approximately_zero'

def test_no_eligible_messages_returns_422(client):
    body=payload()
    for message in body['messages']:message['time_to_tca']=1.
    response=client.post('/v1/predict',json=body)
    assert response.status_code==422
    assert response.json()['detail']['code']=='no_eligible_messages'

def test_namespaces_do_not_collide(client):
    body=payload();a=client.post('/v1/predict',json=body).json()
    body['dataset_id']='other/source';b=client.post('/v1/predict',json=body).json()
    assert a['events'][0]['event_key']!=b['events'][0]['event_key']
    assert a['events'][0]['forecast']==b['events'][0]['forecast']

@pytest.mark.parametrize('change', ['mixed_ids','blank_namespace','partial_source','duplicate_source','old_schema','too_many','nonfinite'])
def test_invalid_requests_rejected(client,change):
    body=payload()
    if change=='mixed_ids':body['messages'][1]['event_id']='99'
    elif change=='blank_namespace':body['dataset_id']='  '
    elif change=='partial_source':body['messages'][0].pop('source_row')
    elif change=='duplicate_source':body['messages'][1]['source_row']=0
    elif change=='old_schema':body['schema_version']='1.0'
    elif change=='too_many':body['messages']=[{**body['messages'][0],'source_row':i} for i in range(2049)]
    elif change=='nonfinite':
        raw=json.dumps(body).replace('12000.0','1e999')
        response=client.post('/v1/predict',content=raw,headers={'content-type':'application/json'})
        assert response.status_code==422
        return
    assert client.post('/v1/predict',json=body).status_code==422

def test_optional_key_is_server_only(client,monkeypatch):
    monkeypatch.setenv('FORECAST_API_KEY','synthetic-not-a-real-secret')
    assert client.post('/v1/predict',json=payload()).status_code==401
    assert client.post('/v1/predict',json=payload(),headers={'X-API-Key':'wrong'}).status_code==401
    assert client.post('/v1/predict',json=payload(),headers={'X-API-Key':'synthetic-not-a-real-secret'}).status_code==200
    health=client.get('/health').json()
    assert 'key' not in json.dumps(health).lower()
    assert health['status']=='ok' and health['final_pc_enabled'] is False

def test_body_limit(client):
    response=client.post('/v1/predict',content=b'x'*(2*1024*1024+1),headers={'content-type':'application/json'})
    assert response.status_code==413

def test_hub_requires_pinned_commit(monkeypatch):
    from backend.bundle import bundle_directory
    monkeypatch.delenv('MODEL_BUNDLE_DIR',raising=False)
    monkeypatch.setenv('HF_MODEL_ID','personal/private-model')
    monkeypatch.setenv('HF_MODEL_REVISION','main')
    with pytest.raises(RuntimeError,match='commit SHA'):bundle_directory()

def test_timeout_retains_capacity_until_background_task_finishes(client,monkeypatch):
    import backend.app as module
    native=client.app.state.predictor.predict
    def slow(messages,*,namespace):
        time.sleep(.15)
        return native(messages,namespace=namespace)
    monkeypatch.setattr(client.app.state.predictor,'predict',slow)
    monkeypatch.setattr(module,'REQUEST_TIMEOUT',.01)
    assert client.post('/v1/predict',json=payload()).status_code==504
    assert client.post('/v1/predict',json=payload()).status_code==503
    assert client.get('/health').status_code==200

def test_manifest_is_pinned_before_python_import(tmp_path,monkeypatch):
    from backend.bundle import load_predictor
    monkeypatch.setenv('MODEL_BUNDLE_DIR',str(tmp_path))
    (tmp_path/'bundle_manifest.json').write_text('{"sha256":{}}')
    (tmp_path/'predict_events.py').write_text('raise AssertionError("must not execute")')
    with pytest.raises(RuntimeError,match='authorized frozen manifest'):load_predictor()

def test_private_upload_staging_is_exact_allowlist(tmp_path):
    from backend.prepare_hf import prepare
    from backend.upload_hf import verify_stage
    out=tmp_path/'stage'
    result=prepare(ROOT/'backend/model_bundle',out)
    assert result['upload_performed'] is False
    files=verify_stage(out)
    assert len(files)==10 and 'README.md' in files
    assert 'bundle/bundle_manifest.json' in files
    (out/'accidental_labels.csv').write_text('not-a-real-label\n')
    with pytest.raises(ValueError,match='exactly'):verify_stage(out)

def test_private_hub_materializes_pinned_local_directory(tmp_path,monkeypatch):
    import backend.bundle as module
    import huggingface_hub
    captured={}
    def snapshot_download(**kwargs):
        captured.update(kwargs)
        return str(kwargs['local_dir'])
    monkeypatch.delenv('MODEL_BUNDLE_DIR',raising=False)
    monkeypatch.setenv('HF_MODEL_ID','personal/private-model')
    monkeypatch.setenv('HF_MODEL_REVISION','a'*40)
    monkeypatch.setenv('MODEL_CACHE_DIR',str(tmp_path))
    monkeypatch.setattr(huggingface_hub,'snapshot_download',snapshot_download)
    path=module.bundle_directory()
    assert path==Path(captured['local_dir'])/'bundle'
    assert captured['revision']=='a'*40
    assert captured['repo_type']=='model'
    assert set(captured['allow_patterns'])=={'bundle/'+p for p in module.BUNDLE_FILES}
    assert captured['local_dir'].is_relative_to(tmp_path)

def test_extreme_json_integer_is_validation_error_not_server_error(client):
    body=payload();body['messages'][0]['time_to_tca']=10**400
    assert client.post('/v1/predict',json=body).status_code==422
    body=payload();body['messages'][0]['source_row']=2**53
    assert client.post('/v1/predict',json=body).status_code==422
