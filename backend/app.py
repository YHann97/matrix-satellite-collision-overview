"""CPU HTTP inference. No training, dataset loading or browser-side Hub credentials."""
import asyncio
from concurrent.futures import ThreadPoolExecutor
from contextlib import asynccontextmanager
import math
import os
import secrets
from typing import Annotated, Literal

import pandas as pd
from fastapi import FastAPI, Header, HTTPException, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from pydantic import BaseModel, ConfigDict, Field, StringConstraints, field_validator, model_validator

from .bundle import load_predictor

MAX_BODY_BYTES = 2 * 1024 * 1024
MAX_MESSAGES = 2048
MAX_CONCURRENT = min(4, max(1, int(os.getenv('MAX_CONCURRENT_PREDICTIONS', '1'))))
REQUEST_TIMEOUT = min(60., max(.1, float(os.getenv('PREDICTION_TIMEOUT_SECONDS', '10'))))
Text = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=128)]
Number = Annotated[float, Field(strict=True, allow_inf_nan=False)]

class Message(BaseModel):
    # Unknown raw columns (including future labels) never reach the model.
    model_config = ConfigDict(extra='ignore')
    event_id: Text
    time_to_tca: Number
    source_row: Annotated[int, Field(strict=True, ge=0, le=2**53-1)] | None = None
    miss_distance: Number | None = None
    relative_speed: Number | None = None
    relative_position_r: Number | None = None
    relative_position_t: Number | None = None
    relative_position_n: Number | None = None
    c_object_type: Annotated[str, StringConstraints(max_length=64)] | None = None
    c_sigma_r: Number | None = None
    t_sigma_r: Number | None = None
    max_risk_estimate: Number | None = None
    F10: Number | None = None
    AP: Number | None = None
    risk: Annotated[float, Field(strict=True, allow_inf_nan=False, le=0)] | None = None

    @field_validator('event_id', mode='before')
    @classmethod
    def numeric_event_id(cls, value):
        if isinstance(value, int) and not isinstance(value, bool):
            return str(value)
        return value

class PredictRequest(BaseModel):
    model_config = ConfigDict(extra='forbid')
    schema_version: Literal['2.0']
    dataset_id: Text
    event_id: Text
    request_id: Text | None = None
    record_id: Text | None = None
    messages: list[Message] = Field(min_length=1, max_length=MAX_MESSAGES)

    @field_validator('event_id', mode='before')
    @classmethod
    def numeric_event_id(cls, value):
        return Message.numeric_event_id(value)

    @field_validator('messages', mode='before')
    @classmethod
    def discard_future_measurements(cls, values):
        # Preserve IDs/time/order for validation, but never parse future measurements.
        # This mirrors the frozen adapter's eligibility-before-numeric-conversion rule.
        if not isinstance(values, list):
            return values
        clean = []
        for value in values:
            if isinstance(value, dict):
                tca = value.get('time_to_tca')
                finite = isinstance(tca, int) and not isinstance(tca, bool)
                if isinstance(tca, float):
                    finite = math.isfinite(tca)
                if finite and tca < 2:
                    value = {key: value[key] for key in ('event_id', 'time_to_tca', 'source_row') if key in value}
            clean.append(value)
        return clean

    @model_validator(mode='after')
    def same_event(self):
        if any(message.event_id != self.event_id for message in self.messages):
            raise ValueError('Every message event_id must match the requested event_id')
        source_rows = [m.source_row for m in self.messages if m.source_row is not None]
        if source_rows and len(source_rows) != len(self.messages):
            raise ValueError('Provide source_row for every message or omit it for every message')
        if len(source_rows) != len(set(source_rows)):
            raise ValueError('source_row must be distinct within an event')
        return self

class BodyLimit:
    def __init__(self, app, max_bytes=MAX_BODY_BYTES):
        self.app, self.max_bytes = app, max_bytes

    async def __call__(self, scope, receive, send):
        if scope['type'] != 'http' or scope['method'] not in {'POST', 'PUT', 'PATCH'}:
            return await self.app(scope, receive, send)
        parts, total = [], 0
        while True:
            message = await receive()
            if message['type'] == 'http.disconnect':
                return
            total += len(message.get('body', b''))
            if total > self.max_bytes:
                response = JSONResponse({'detail': {'code': 'request_too_large', 'max_bytes': self.max_bytes}}, status_code=413)
                return await response(scope, receive, send)
            parts.append(message.get('body', b''))
            if not message.get('more_body', False):
                break
        sent = False
        async def bounded_receive():
            nonlocal sent
            if not sent:
                sent = True
                return {'type': 'http.request', 'body': b''.join(parts), 'more_body': False}
            return await receive()
        await self.app(scope, bounded_receive, send)

@asynccontextmanager
async def lifespan(app):
    # Constructor validates all referenced frozen artifact hashes before serving.
    app.state.predictor = load_predictor()
    app.state.executor = ThreadPoolExecutor(max_workers=MAX_CONCURRENT, thread_name_prefix='forecast')
    app.state.slots = asyncio.Semaphore(MAX_CONCURRENT)
    yield
    app.state.executor.shutdown(wait=True, cancel_futures=True)

def create_app():
    app = FastAPI(title='Airbus final-event forecast', version='1.0.0', lifespan=lifespan)
    app.add_middleware(BodyLimit)

    @app.exception_handler(RequestValidationError)
    async def validation_error(request, error):
        # Do not echo raw telemetry or non-JSON NaN values in validation errors.
        return JSONResponse({'detail': [{'loc': list(e['loc']), 'msg': e['msg'], 'type': e['type']} for e in error.errors()]}, status_code=422)

    @app.get('/health')
    async def health(request: Request):
        predictor = request.app.state.predictor
        return {'status': 'ok', 'model_id': predictor.manifest['model_id'], 'feature_version': predictor.manifest['feature_version'], 'inference_device': 'cpu', 'final_pc_enabled': False}

    @app.post('/v1/predict')
    async def predict(payload: PredictRequest, request: Request, x_api_key: str | None = Header(default=None)):
        required_key = os.getenv('FORECAST_API_KEY')
        if required_key and not secrets.compare_digest((x_api_key or '').encode(), required_key.encode()):
            raise HTTPException(401, detail={'code': 'unauthorized'})
        slots = request.app.state.slots
        try:
            await asyncio.wait_for(slots.acquire(), timeout=.01)
        except TimeoutError:
            raise HTTPException(503, detail={'code': 'prediction_capacity'}, headers={'Retry-After': '1'})
        predictor = request.app.state.predictor
        columns = ['event_id'] + predictor.features.FEATURES + ['risk']
        if all(message.source_row is not None for message in payload.messages):
            columns.append('source_row')
        messages = pd.DataFrame([message.model_dump(exclude_none=True) for message in payload.messages]).reindex(columns=columns)
        loop = asyncio.get_running_loop()
        future = loop.run_in_executor(request.app.state.executor, lambda: predictor.predict(messages, namespace=payload.dataset_id))
        # Timeout never releases a still-running native task's bounded slot.
        def finished(done):
            slots.release()
            if not done.cancelled():
                done.exception()  # Consume failures even if the HTTP deadline already elapsed.
        future.add_done_callback(finished)
        try:
            result = await asyncio.wait_for(asyncio.shield(future), timeout=REQUEST_TIMEOUT)
        except TimeoutError:
            raise HTTPException(504, detail={'code': 'prediction_timeout'})
        except (ValueError, OverflowError):
            raise HTTPException(422, detail={'code': 'invalid_model_input'})
        except Exception:
            raise HTTPException(500, detail={'code': 'prediction_failed'})
        if not result['events']:
            raise HTTPException(422, detail={'code': 'no_eligible_messages', 'input_cutoff_days': 2, 'skipped': result['skipped']})
        return result

    return app

app = create_app()
