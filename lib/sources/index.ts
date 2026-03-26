import { getNbrbCards } from '@/lib/sources/nbrb';
import { getMyfinCards } from '@/lib/sources/myfin';
import type { RatesSnapshot, SourceLoadResult } from '@/lib/types';

const REFRESH_INTERVAL_MS = 60_000;
const ROTATION_INTERVAL_MS = 10_000;

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

function toIssueMessage(sourceName: string, error: unknown) {
  if (error instanceof Error && error.message) {
    return `${sourceName}: ${error.message}`;
  }

  return `${sourceName}: неизвестная ошибка при загрузке`;
}

export async function getRatesSnapshot(): Promise<RatesSnapshot> {
  const settled = await Promise.allSettled(
    adapters.map(async (adapter) => ({
      name: adapter.name,
      result: await adapter.load(),
    })),
  );

  const cards = settled
    .flatMap((entry) => {
      if (entry.status !== 'fulfilled') {
        return [];
      }

      return entry.value.result.cards;
    })
    .sort((left, right) => left.priority - right.priority);

  const issues = settled.flatMap((entry) => {
    if (entry.status === 'rejected') {
      return [toIssueMessage('Источник', entry.reason)];
    }

    return entry.value.result.issues;
  });

  settled.forEach((entry, index) => {
    if (entry.status === 'rejected') {
      issues.push(toIssueMessage(adapters[index].name, entry.reason));
    }
  });

  return {
    cards,
    fetchedAt: new Date().toISOString(),
    refreshIntervalMs: REFRESH_INTERVAL_MS,
    rotationIntervalMs: ROTATION_INTERVAL_MS,
    partialFailure: issues.length > 0,
    issues,
  };
}
