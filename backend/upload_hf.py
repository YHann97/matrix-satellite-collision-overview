"""Verified personal-account PRIVATE model upload; dry-run unless --execute."""
import argparse
import hashlib
import json
from pathlib import Path
import re

try:
    from .bundle import BUNDLE_FILES, EXPECTED_MANIFEST_SHA256
except ImportError:
    from bundle import BUNDLE_FILES, EXPECTED_MANIFEST_SHA256

def verify_stage(stage):
    expected = {'README.md'} | {'bundle/'+name for name in BUNDLE_FILES}
    actual = {str(p.relative_to(stage)) for p in stage.rglob('*') if p.is_file()}
    if actual != expected:
        raise ValueError('Upload staging must contain exactly the model-card and allowlisted inference files')
    if any(p.is_symlink() for p in stage.rglob('*')):
        raise ValueError('Symlinks are not allowed in upload staging')
    root = stage/'bundle'
    if hashlib.sha256((root/'bundle_manifest.json').read_bytes()).hexdigest() != EXPECTED_MANIFEST_SHA256:
        raise ValueError('Staged bundle is not the accepted frozen manifest')
    manifest = json.loads((root/'bundle_manifest.json').read_text())
    for name, digest in manifest['sha256'].items():
        if hashlib.sha256((root/name).read_bytes()).hexdigest() != digest:
            raise ValueError('Staged artifact differs from frozen bundle')
    return sorted(expected)

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--account', required=True, help='Exact personal username to verify with whoami')
    parser.add_argument('--repo-name', required=True)
    parser.add_argument('--staging', default=str(Path(__file__).resolve().parent/'hf_staging'))
    parser.add_argument('--execute', action='store_true', help='Actually upload after authenticated account/privacy checks')
    args = parser.parse_args()
    if not re.fullmatch(r'[A-Za-z0-9][A-Za-z0-9_-]{0,95}', args.account) or not re.fullmatch(r'[A-Za-z0-9][A-Za-z0-9_.-]{0,95}', args.repo_name):
        raise ValueError('Use a personal username and a plain model repository name')
    stage = Path(args.staging).resolve()
    files = verify_stage(stage)
    repo = args.account+'/'+args.repo_name
    if not args.execute:
        print(json.dumps({'repo_id': repo, 'repo_type': 'model', 'private': True, 'files': files,
                          'upload_performed': False, 'account_authenticated': False}, indent=2))
        return
    from huggingface_hub import HfApi
    api = HfApi()  # Use existing authenticated CLI session/server environment; never print credentials.
    identity = api.whoami()
    if identity.get('name') != args.account or identity.get('type') != 'user':
        raise RuntimeError('Authenticated identity must match the explicitly named PERSONAL account')
    from huggingface_hub.errors import RepositoryNotFoundError
    try:
        info = api.repo_info(repo_id=repo, repo_type='model')
        if not info.private:
            raise RuntimeError('Refusing to upload to an existing public repository')
    except RepositoryNotFoundError:
        api.create_repo(repo_id=repo, repo_type='model', private=True)
    # Recheck immediately before upload; no data, examples, logs or backend credentials are allowlisted.
    if not api.repo_info(repo_id=repo, repo_type='model').private:
        raise RuntimeError('Repository must be private')
    commit = api.upload_folder(repo_id=repo, repo_type='model', folder_path=stage,
                              allow_patterns=files, commit_message='Upload frozen CPU inference bundle')
    print(json.dumps({'repo_id': repo, 'private': True, 'revision': commit.oid,
                      'bundle_manifest_sha256': EXPECTED_MANIFEST_SHA256, 'upload_performed': True}))

if __name__ == '__main__':
    main()
