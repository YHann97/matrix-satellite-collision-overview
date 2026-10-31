# Frozen forecast backend

FastAPI CPU inference for the accepted final-event tier classifier. It never trains a model, loads a dataset or produces a learned final Pc. The native frozen bundle response is preserved.

## Run locally

From the repository root, with Python3.14:

```sh
python -m venv backend/.venv
backend/.venv/bin/pip install -r backend/requirements-dev.txt
# Provide the accepted bundle locally, or configure the private Hub settings below.
OMP_NUM_THREADS=1 OPENBLAS_NUM_THREADS=1 backend/.venv/bin/uvicorn backend.app:app --host 127.0.0.1 --port 7860
```

For the current integration workspace, the exact bundle is already copied into ignored `backend/model_bundle`. That folder and `backend/hf_staging` must never be committed to the public frontend repository. Alternatively set `MODEL_BUNDLE_DIR` to the accepted local bundle. Startup verifies the expected manifest SHA `0ad8499ee758c4f6f102294af34961fbd4a9915e8b2aa75004d12c5a996b4627` and every referenced file **before importing downloaded Python**.

`GET /health` returns readiness, model ID, feature version and `final_pc_enabled:false`. `POST /v1/predict` accepts:

```json
{
  "schema_version": "2.0",
  "dataset_id": "uploaded-file-namespace",
  "event_id": "47",
  "request_id": "optional-request-id",
  "record_id": "optional-record-id",
  "messages": [
    {
      "event_id": "47", "source_row": 0, "time_to_tca": 3.0,
      "miss_distance": 300.0, "relative_speed": 12000.0,
      "relative_position_r": 30.0, "relative_position_t": 290.0,
      "relative_position_n": 50.0, "c_object_type": "DEBRIS",
      "c_sigma_r": 100.0, "t_sigma_r": 50.0,
      "max_risk_estimate": -3.8, "F10": 100.0, "AP": 4.0, "risk": -4.5
    }
  ]
}
```

This example is synthetic, not a training or evaluation row. All message event IDs must match the requested ID. Dataset namespace must be nonempty; equal IDs from different files remain distinct. `time_to_tca` is days; distance is metres; supplied `risk` is known early-message log10(Pc). Numeric JSON values preserve binary64 precision. Null measurement/category/risk values remain missing; they are not replaced with invented observations. Risk, when supplied on an eligible message, must be finite and at most0. `source_row` must be distinct nonnegative integers for every message, or be omitted for every message to use native incoming order.

Finite time is checked first. Messages with time<2days are removed before other measurements are parsed, so future-message poison cannot influence a forecast. Unknown/final-target columns are ignored. The response remains the bundle's native `events`, `skipped`, `model_id`, `schema_version:airbus-final-event-v1`, target and probability-semantics JSON. Read `events[0].latest_observed` separately from `events[0].forecast`. Final-tier probabilities are not collision Pc; `forecast.final_pc` remains null with `withheld_pending_validation` status. No operational manoeuvre recommendation is produced.

Validation returns422; an event with no eligible message returns422 with `detail.code:no_eligible_messages` and native skipped details. Body size is capped at2MiB and message count at2048. Busy inference returns503; the configurable prediction deadline returns504. A timed-out native task retains its bounded slot until it finishes, so retries cannot create an unbounded computation queue. Default inference concurrency is1, configurable up to4; default deadline10seconds, capped at60. Requests and raw telemetry are not logged by application code.

If `FORECAST_API_KEY` is configured, prediction requires `X-API-Key`. Keep it in the frontend **server** environment and proxy requests through the server; never put it in a browser bundle. Health remains public and exposes no credentials. The service does not require CORS because the frontend uses a server-side proxy.

## Private personal Hugging Face model

Create an allowlisted staging directory offline (already prepared in this workspace):

```sh
python -m backend.prepare_hf
python -m backend.upload_hf --account YOUR_PERSONAL_USERNAME --repo-name airbus-final-event-tier
```

The second command is a dry-run. After CLI login and account confirmation, the following verifies `whoami` matches the named **personal user**, requires a private model repository, refuses an existing public repository, then uploads only the root model card and exact frozen files beneath `bundle/`:

```sh
python -m backend.upload_hf --account YOUR_PERSONAL_USERNAME --repo-name airbus-final-event-tier --execute
```

No token is printed or stored by these scripts. There are no dataset rows, labels, sample telemetry, server addresses or absolute local paths in the allowlist. Frozen configuration metadata and provenance hashes remain unchanged. Record the returned commit SHA and set these **server-only** values:

```text
HF_MODEL_ID=YOUR_PERSONAL_USERNAME/airbus-final-event-tier
HF_MODEL_SUBDIR=bundle
HF_MODEL_REVISION=<exact 40-character commit SHA>
HF_TOKEN=<server secret with access to the private model>
```

`main` and mutable revision names are rejected. Download occurs at process startup, never during Docker build; Hub secrets stay outside image layers and browser code. The Hub model repository stores artifacts; it does not itself create a running inference endpoint.

## Docker / optional HF Docker Space

```sh
docker build -t airbus-forecast-api backend
docker run --rm -p 7860:7860 --env-file /path/to/server-only.env airbus-forecast-api
```

The image listens on7860, uses a nonroot user and excludes all local model/staging/token/env files from its build context. It requires private-Hub settings at runtime. `SPACE_README.md` supplies the Docker Space metadata (`sdk:docker`, `app_port:7860`) if a Space is separately authorized/configured. Set HF_TOKEN and any API key as Space secrets. A private Space gateway may additionally require `Authorization:Bearer <HF token>` in the **server-to-server** frontend proxy; that is separate from this application's optional X-API-Key. These scripts never create a Space, select paid hardware or publish the frontend.

## Verification

```sh
OMP_NUM_THREADS=1 OPENBLAS_NUM_THREADS=1 python -m pytest backend/tests -q
```

Tests use synthetic raw messages and the real accepted classifier, not a stub predictor. They cover native-response equality, probability/observed-Pc semantics, null measurements, future cutoff, namespace isolation, validation, server-only key checks, body limits, bounded timeout behavior, the exact manifest pin and upload allowlisting. Known pandas deprecation warnings are emitted by the immutable original bundle; runtime package versions are pinned rather than editing accepted bytes.

Documentation sources: [FastAPI lifespan](https://fastapi.tiangolo.com/advanced/events/), [HF Docker Spaces](https://huggingface.co/docs/hub/spaces-sdks-docker), [HF Hub uploads](https://huggingface.co/docs/huggingface_hub/guides/upload).
