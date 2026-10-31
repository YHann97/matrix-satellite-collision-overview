"""Offline, allowlisted private-model staging. No login, upload, datasets or telemetry."""
import argparse
import hashlib
import json
from pathlib import Path
import shutil

try:
    from .bundle import BUNDLE_FILES, EXPECTED_MANIFEST_SHA256
except ImportError:
    from bundle import BUNDLE_FILES, EXPECTED_MANIFEST_SHA256

CARD = '''---
library_name: lightgbm
pipeline_tag: tabular-classification
tags:
- space-debris
- event-forecasting
---

# Frozen final-event tier classifier

Private personal-account model artifact. CPU inference predicts membership in the final recorded Safe/Elevated/Critical tier from only eligible messages at least two days before closest approach. It includes deterministic per-event history reductions and the known early-message log10 Pc as an input. Class probabilities are not physical collision probabilities or independently validated calibration.

`bundle/` contains the exact accepted wrapper, feature builder, LightGBM weights, category/feature configuration and checksum manifests. No training rows, labels, evaluation examples, raw telemetry, tokens, private server addresses or local absolute paths are included. The model configuration preserves relative artifact metadata and provenance hashes required by the frozen runtime.

## Aggregate evaluation and limits

The frozen classifier was evaluated once on1,781internal events after development selection. MacroF1 was0.907281 versus0.903401 for the deterministic latest-observed-risk/distance baseline. It detected116of134Critical events with13falseCritical alerts; the baseline detected114of134 with11falseCritical alerts. Among1,340events with a genuinely later target, macroF1 was0.879534 versus0.872885 for that baseline.

Bootstrap confidence intervals for the model-minus-baseline improvements include zero. These same event groups had been exposed during earlier experiments on a different target, so this is not a new untouched benchmark. These aggregate results do not establish superiority, operational suitability or calibrated probabilities. No evaluation rows or labels are included in this repository. The output remains final-tier membership probability, not physical collision Pc.

The default decision is deterministic argmax. Observed early Pc is separate from the final-tier forecast. Learned final Pc is withheld pending validation and remains null. This model does not provide maneuver recommendations or operational validation.

Use the accompanying FastAPI backend with a private Hub token on the server and pin this repository's exact commit SHA. Do not expose that token to the browser. The API verifies the authorized bundle-manifest hash before importing any downloaded Python. The model's data-contract and runtime files are immutable within this release; changing them requires a separate reviewed release.
'''

def prepare(source, destination):
    source, destination = Path(source).resolve(), Path(destination).resolve()
    if destination.exists():
        raise FileExistsError('Staging destination must be new')
    manifest = json.loads((source/'bundle_manifest.json').read_text())
    if hashlib.sha256((source/'bundle_manifest.json').read_bytes()).hexdigest() != EXPECTED_MANIFEST_SHA256:
        raise ValueError('Source is not the accepted frozen bundle')
    for name, expected in manifest['sha256'].items():
        path = (source/name).resolve()
        if not path.is_relative_to(source) or hashlib.sha256(path.read_bytes()).hexdigest() != expected:
            raise ValueError('Source artifact checksum mismatch')
    destination.mkdir(parents=True)
    for name in BUNDLE_FILES:
        target = destination/'bundle'/name
        target.parent.mkdir(parents=True, exist_ok=True)
        shutil.copyfile(source/name, target)
    (destination/'README.md').write_text(CARD)
    return {'files': sorted(str(p.relative_to(destination)) for p in destination.rglob('*') if p.is_file()),
            'bundle_manifest_sha256': EXPECTED_MANIFEST_SHA256, 'upload_performed': False}

if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--source', default=str(Path(__file__).resolve().parent/'model_bundle'))
    parser.add_argument('--output', default=str(Path(__file__).resolve().parent/'hf_staging'))
    args = parser.parse_args()
    print(json.dumps(prepare(args.source, args.output), indent=2))
