import { getRatesSnapshot } from '@/lib/sources';

export const dynamic = 'force-dynamic';

export async function GET() {
  const snapshot = await getRatesSnapshot();

  return Response.json(snapshot, {
    headers: {
      'Cache-Control': 'no-store, max-age=0',
    },
  });
}
