import { NextRequest, NextResponse } from 'next/server';
import { handlePrediction } from '@/lib/prediction/service';

export async function POST(req: NextRequest) {
  try {
    const result=await handlePrediction(await req.json(),{
      apiUrl:process.env.PREDICTION_API_URL,apiKey:process.env.PREDICTION_API_KEY,
      hfToken:process.env.HF_TOKEN,
      timeoutMs:Number(process.env.PREDICTION_TIMEOUT_MS || 15000),
    });
    return NextResponse.json(result.body,{status:result.status});
  } catch {
    return NextResponse.json({status:'failed',error:'Invalid JSON request'},{status:400});
  }
}
