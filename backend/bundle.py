"""Load only the immutable inference bundle, locally or from a pinned private Hub commit."""
import hashlib
import json
import importlib.util
import os
from pathlib import Path
import re

EXPECTED_MANIFEST_SHA256 = '0ad8499ee758c4f6f102294af34961fbd4a9915e8b2aa75004d12c5a996b4627'

BUNDLE_FILES = (
    'bundle_manifest.json', 'README.md', 'requirements.txt', 'predict_events.py',
    'runtime/features.py', 'runtime/predict.py',
    'models/lightgbm_v3_history_seed20261031/classification.txt',
    'models/lightgbm_v3_history_seed20261031/config.json',
    'models/lightgbm_v3_history_seed20261031/deployment_manifest.json',
)

def bundle_directory():
    explicit = os.getenv('MODEL_BUNDLE_DIR')
    if explicit:
        return Path(explicit).resolve()
    repo_id = os.getenv('HF_MODEL_ID')
    if repo_id:
        revision = os.getenv('HF_MODEL_REVISION', '')
        if not re.fullmatch(r'[0-9a-f]{40}', revision):
            raise RuntimeError('HF_MODEL_REVISION must be an immutable 40-character commit SHA')
        subdir = os.getenv('HF_MODEL_SUBDIR', 'bundle')
        if not re.fullmatch(r'[A-Za-z0-9_-]+(?:/[A-Za-z0-9_-]+)*', subdir):
            raise RuntimeError('HF_MODEL_SUBDIR must be a relative artifact directory')
        from huggingface_hub import snapshot_download
        # Hub's default cache uses blob symlinks outside the snapshot. Materialize
        # regular local-dir files so the frozen wrapper's containment checks hold.
        model_cache = Path(os.getenv('MODEL_CACHE_DIR', str(Path.home()/'.cache'/'airbus-forecast-models')))
        local_dir = model_cache/hashlib.sha256(repo_id.encode()).hexdigest()[:16]/revision
        snapshot = snapshot_download(
            repo_id=repo_id, repo_type='model', revision=revision,
            token=os.getenv('HF_TOKEN'), local_dir=local_dir,
            allow_patterns=[subdir+'/'+name for name in BUNDLE_FILES],
        )
        return Path(snapshot)/subdir
    local = Path(__file__).resolve().parent/'model_bundle'
    if local.is_dir():
        return local
    raise RuntimeError('Configure a local MODEL_BUNDLE_DIR or private HF_MODEL_ID and pinned HF_MODEL_REVISION')

def load_predictor():
    root = bundle_directory()
    manifest_path = root/'bundle_manifest.json'
    if hashlib.sha256(manifest_path.read_bytes()).hexdigest() != EXPECTED_MANIFEST_SHA256:
        raise RuntimeError('Bundle is not the authorized frozen manifest')
    manifest = json.loads(manifest_path.read_text())
    for name, expected in manifest['sha256'].items():
        artifact = (root/name).resolve()
        if not artifact.is_relative_to(root.resolve()) or hashlib.sha256(artifact.read_bytes()).hexdigest() != expected:
            raise RuntimeError('Frozen artifact checksum mismatch')
    spec = importlib.util.spec_from_file_location('_airbus_frozen_bundle', root/'predict_events.py')
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module.ForecastPredictor(root)
