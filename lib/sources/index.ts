import { DEFAULT_CITY, getCityBySlug, type SupportedCitySlug } from '@/lib/cities';
import { getNbrbCards } from '@/lib/sources/nbrb';
import { getMyfinCards } from '@/lib/sources/myfin';
import { getWeather } from '@/lib/sources/weather';
import type { RatesSnapshot, SourceLoadResult } from '@/lib/types';

const REFRESH_INTERVAL_MS = 5 * 60_000;
const ROTATION_INTERVAL_MS = 10_000;

// Cache TTL is slightly shorter than the client refresh interval so that a
// polling client always receives a reasonably fresh snapshot without every
// concurrent request triggering a full upstream fetch.
const CACHE_TTL_MS = REFRESH_INTERVAL_MS - 5_000;

type SourceAdapter = {
  name: string;
  load: () => Promise<SourceLoadResult>;
};

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

const cache = new Map<SupportedCitySlug, CacheEntry>();

// In-flight promise deduplicated across concurrent requests that arrive while
// a fetch is already in progress.
const inFlight = new Map<SupportedCitySlug, Promise<RatesSnapshot>>();

// ---------------------------------------------------------------------------

function toIssueMessage(sourceName: string, error: unknown) {
  if (error instanceof Error && error.message) {
    return `${sourceName}: ${error.message}`;
  }

  return `${sourceName}: неизвестная ошибка при загрузке`;
}

function buildAdapters(citySlug: SupportedCitySlug): SourceAdapter[] {
  return [
    {
      name: 'NBRB',
      load: getNbrbCards,
    },
    {
      name: 'Myfin',
      load: () => getMyfinCards(citySlug),
    },
  ];
}

async function fetchFreshSnapshot(citySlug: SupportedCitySlug): Promise<RatesSnapshot> {
  const city = getCityBySlug(citySlug);
  const adapters = buildAdapters(citySlug);
  const [settled, weatherResult] = await Promise.all([
    Promise.allSettled(
      adapters.map(async (adapter) => ({
        name: adapter.name,
        result: await adapter.load(),
      })),
    ),
    Promise.allSettled([getWeather(citySlug)]),
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
    citySlug: city.slug,
    cityName: city.label,
    cards,
    weather,
    fetchedAt: new Date().toISOString(),
    refreshIntervalMs: REFRESH_INTERVAL_MS,
    rotationIntervalMs: ROTATION_INTERVAL_MS,
    partialFailure: issues.length > 0,
    issues,
  };
}

export async function getRatesSnapshot(requestedCitySlug?: string): Promise<RatesSnapshot> {
  const city = getCityBySlug(requestedCitySlug ?? DEFAULT_CITY.slug);
  const now = Date.now();
  const cachedSnapshot = cache.get(city.slug) ?? null;

  // Serve from cache if still valid.
  if (cachedSnapshot !== null && now < cachedSnapshot.expiresAt) {
    return cachedSnapshot.snapshot;
  }

  // Deduplicate concurrent requests: if a fetch is already in progress, wait
  // for it instead of starting a duplicate upstream call.
  const inFlightSnapshot = inFlight.get(city.slug) ?? null;

  if (inFlightSnapshot !== null) {
    return inFlightSnapshot;
  }

  const nextInFlightSnapshot = fetchFreshSnapshot(city.slug)
    .then((snapshot) => {
      cache.set(city.slug, { snapshot, expiresAt: Date.now() + CACHE_TTL_MS });
      inFlight.delete(city.slug);
      return snapshot;
    })
    .catch((error: unknown) => {
      inFlight.delete(city.slug);
      throw error;
    });

  inFlight.set(city.slug, nextInFlightSnapshot);

  return nextInFlightSnapshot;
}
