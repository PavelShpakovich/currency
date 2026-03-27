import type { NextRequest } from 'next/server';

import { getRatesSnapshot } from '@/lib/sources';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const snapshot = await getRatesSnapshot(request.nextUrl.searchParams.get('city') ?? undefined);

  return Response.json(snapshot, {
    headers: {
      'Cache-Control': 'no-store, max-age=0',
    },
  });
}
