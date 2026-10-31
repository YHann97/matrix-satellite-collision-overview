import { NextResponse } from 'next/server';

// The dashboard serves frozen forecasts for the supplied test dataset. A live
// inference service has not been configured for arbitrary uploaded events.
export async function POST() {
  return NextResponse.json({ error: 'Live predictions are currently unavailable.' }, { status: 503 });
}
