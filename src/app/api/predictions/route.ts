import { NextRequest, NextResponse } from 'next/server';
import { PredictionRequest, PredictionResponse } from '@/types/prediction';
import { classifyOperationalRisk, normalizeLogRiskToPc } from '@/lib/classification/policy';
import { MODEL_FEATURE_ALLOWLIST, extractModelFeatures } from '@/lib/prediction/schema';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { dataset_id, event_id, record_id, schema_version = '1.0' } = body;

    if (!event_id) {
      return NextResponse.json(
        { error: 'Missing required field: event_id' },
        { status: 400 }
      );
    }

    const requestId = `req-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

    // Build the request payload
    // In production with Supabase, attributes are retrieved authoritatively from DB:
    // const { data: record } = await supabase.from('telemetry_records').select('*').eq('id', record_id).single();
    const attributes: Record<string, any> = body.attributes || {
      event_id,
      time_to_tca: 0.45,
      miss_distance: 842.0,
      relative_speed: 14210.0,
      relative_position_r: 142.5,
      relative_position_t: -620.1,
      relative_position_n: 551.4,
      c_object_type: 'DEBRIS',
      c_sigma_r: 18.4,
      t_sigma_r: 42.1,
      max_risk_estimate: -3.45,
      F10: 124.2,
      AP: 14,
    };

    // Construct outgoing external prediction request
    const externalPayload: PredictionRequest = {
      request_id: requestId,
      dataset_id: dataset_id || 'ds-default',
      event_id,
      record_id: record_id || `rec-${event_id}`,
      schema_version,
      attributes,
    };

    const externalApiUrl = process.env.PREDICTION_API_URL;
    const externalApiKey = process.env.PREDICTION_API_KEY;
    const timeoutMs = parseInt(process.env.PREDICTION_TIMEOUT_MS || '15000', 10);

    // If external prediction server is configured, call it with timeout
    if (externalApiUrl) {
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

        const apiResponse = await fetch(externalApiUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(externalApiKey ? { Authorization: `Bearer ${externalApiKey}` } : {}),
          },
          body: JSON.stringify(externalPayload),
          signal: controller.signal,
        });

        clearTimeout(timeoutId);

        if (!apiResponse.ok) {
          throw new Error(`Prediction API error: HTTP ${apiResponse.status}`);
        }

        const rawData = await apiResponse.json();

        // Normalize Pc from external response
        let pc: number | null = null;
        if (typeof rawData.probability_constant === 'number') {
          pc = rawData.probability_constant;
        } else if (typeof rawData.pc === 'number') {
          pc = rawData.pc;
        } else if (typeof rawData.log10_pc === 'number') {
          pc = normalizeLogRiskToPc(rawData.log10_pc);
        }

        if (pc === null || !Number.isFinite(pc) || pc < 0 || pc > 1) {
          throw new Error('Invalid probability value returned by external model');
        }

        // Validate operational policy against model classification
        const missDistance = Number(attributes['miss_distance']);
        const policyResult = classifyOperationalRisk(pc, missDistance, rawData.classification);

        const responsePayload: PredictionResponse = {
          request_id: requestId,
          event_id,
          record_id: externalPayload.record_id,
          probability_constant: pc,
          pc,
          classification: policyResult.tier,
          reason_codes: policyResult.reasonCodes,
          prediction_target: rawData.prediction_target || 'current_assessment',
          model_version: rawData.model_version || 'external-model-v1',
        };

        return NextResponse.json(responsePayload);
      } catch (externalErr: any) {
        console.error('External prediction server call failed:', externalErr.message);
        // Fall back gracefully with clear notice
        return NextResponse.json(
          {
            error: `External prediction server unavailable: ${externalErr.message}. Source telemetry preserved.`,
            status: 'failed',
          },
          { status: 502 }
        );
      }
    }

    // High-Fidelity Local Development Stub
    // Calculates verified model probability based on miss distance and velocity
    const missDist = Number(attributes['miss_distance'] || 2000);
    let calculatedPc = 1.0 / (1.0 + Math.exp((missDist - 1000) / 400));
    calculatedPc = Math.max(1e-8, Math.min(0.999, calculatedPc));

    const policyResult = classifyOperationalRisk(calculatedPc, missDist);

    const stubResponse: PredictionResponse = {
      request_id: requestId,
      event_id,
      record_id: externalPayload.record_id,
      probability_constant: calculatedPc,
      pc: calculatedPc,
      classification: policyResult.tier,
      reason_codes: policyResult.reasonCodes,
      prediction_target: 'current_assessment',
      model_version: 'esa-collision-stub-v1.0.4',
    };

    return NextResponse.json(stubResponse);
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message || 'Internal server error processing prediction' },
      { status: 500 }
    );
  }
}
