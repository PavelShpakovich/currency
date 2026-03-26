import { getNbrbCards } from '@/lib/sources/nbrb';
import { getMyfinCards } from '@/lib/sources/myfin';
import { getBrestWeather } from '@/lib/sources/weather';
import type { RatesSnapshot, SourceLoadResult } from '@/lib/types';

const REFRESH_INTERVAL_MS = 60_000;
const ROTATION_INTERVAL_MS = 10_000;

// Cache TTL is slightly shorter than the client refresh interval so that a
// polling client always receives a reasonably fresh snapshot without every
// concurrent request triggering a full upstream fetch.
const CACHE_TTL_MS = REFRESH_INTERVAL_MS - 5_000;

type SourceAdapter = {
  name: string;
  load: () => Promise<SourceLoadResult>;
};

const adapters: SourceAdapter[] = [
  {
    name: 'NBRB',
    load: getNbrbCards,
  },
  {
    name: 'Myfin',
    load: getMyfinCards,
  },
];

// ---------------------------------------------------------------------------
// In-memory snapshot cache
// ---------------------------------------------------------------------------
// Next.js route handlers and page renders run in the same Node.js process, so
// a module-level variable acts as a request-deduplication cache: only one set
// of upstream fetches runs per TTL window regardless of how many concurrent
// requests arrive.
// ---------------------------------------------------------------------------

type CacheEntry = {
  snapshot: RatesSnapshot;
  expiresAt: number;
};

let cache: CacheEntry | null = null;

// In-flight promise deduplicated across concurrent requests that arrive while
// a fetch is already in progress.
let inFlight: Promise<RatesSnapshot> | null = null;

// ---------------------------------------------------------------------------

function toIssueMessage(sourceName: string, error: unknown) {
  if (error instanceof Error && error.message) {
    return `${sourceName}: ${error.message}`;
  }

  return `${sourceName}: неизвестная ошибка при загрузке`;
}

async function fetchFreshSnapshot(): Promise<RatesSnapshot> {
  const [settled, weatherResult] = await Promise.all([
    Promise.allSettled(
      adapters.map(async (adapter) => ({
        name: adapter.name,
        result: await adapter.load(),
      })),
    ),
    Promise.allSettled([getBrestWeather()]),
  ]);

  const cards = settled
    .flatMap((entry) => {
      if (entry.status !== 'fulfilled') {
        return [];
      }

      return entry.value.result.cards;
    })
    .sort((left, right) => left.priority - right.priority);

  // Build the issues list in a single pass — each settled entry contributes
  // either its rejection reason (for hard failures) or the adapter's own
  // soft-failure issues array (for fulfilled results).
  const issues: string[] = [];

  settled.forEach((entry, index) => {
    if (entry.status === 'rejected') {
      issues.push(toIssueMessage(adapters[index].name, entry.reason));
    } else {
      issues.push(...entry.value.result.issues);
    }
  });

  const weather = weatherResult[0]?.status === 'fulfilled' ? weatherResult[0].value : undefined;

  if (weatherResult[0]?.status === 'rejected') {
    issues.push(toIssueMessage('Погода', weatherResult[0].reason));
  }

  return {
    cards,
    weather,
    fetchedAt: new Date().toISOString(),
    refreshIntervalMs: REFRESH_INTERVAL_MS,
    rotationIntervalMs: ROTATION_INTERVAL_MS,
    partialFailure: issues.length > 0,
    issues,
  };
}

export async function getRatesSnapshot(): Promise<RatesSnapshot> {
  const now = Date.now();

  // Serve from cache if still valid.
  if (cache !== null && now < cache.expiresAt) {
    return cache.snapshot;
  }

  // Deduplicate concurrent requests: if a fetch is already in progress, wait
  // for it instead of starting a duplicate upstream call.
  if (inFlight !== null) {
    return inFlight;
  }

  inFlight = fetchFreshSnapshot().then((snapshot) => {
    cache = { snapshot, expiresAt: Date.now() + CACHE_TTL_MS };
    inFlight = null;
    return snapshot;
  }).catch((error: unknown) => {
    inFlight = null;
    throw error;
  });

  return inFlight;
}
