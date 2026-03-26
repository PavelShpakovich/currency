'use client';

import Image from 'next/image';
import { startTransition, useEffect, useEffectEvent, useMemo, useState } from 'react';

import type { RateCard, RatesSnapshot } from '@/lib/types';

type TvRatesBoardProps = {
  initialSnapshot: RatesSnapshot;
};

const rateFormatter = new Intl.NumberFormat('ru-RU', {
  minimumFractionDigits: 4,
  maximumFractionDigits: 4,
});

const timestampFormatter = new Intl.DateTimeFormat('ru-RU', {
  day: '2-digit',
  month: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
});

function formatRate(value: number | undefined) {
  if (typeof value !== 'number' || Number.isNaN(value)) {
    return '-';
  }

  return rateFormatter.format(value);
}

function formatTimestamp(value: string | number | Date) {
  return timestampFormatter.format(new Date(value));
}

function formatTemperature(value: number | undefined) {
  if (typeof value !== 'number' || Number.isNaN(value)) {
    return null;
  }

  return `${value > 0 ? '+' : ''}${Math.round(value)}°C`;
}

function buildWeatherLabel(snapshot: RatesSnapshot) {
  if (!snapshot.weather) {
    return null;
  }

  const parts = [snapshot.weather.city, formatTemperature(snapshot.weather.temperatureC), snapshot.weather.condition];

  if (typeof snapshot.weather.windSpeedMs === 'number') {
    parts.push(`ветер ${snapshot.weather.windSpeedMs.toFixed(1)} м/с`);
  }

  return parts.filter(Boolean).join(' • ');
}

function buildStatus(snapshot: RatesSnapshot, now: number, networkIssue: string | null) {
  if (networkIssue) {
    return {
      tone: 'text-[color:var(--danger)]',
      label: networkIssue,
    };
  }

  if (!snapshot.cards.length) {
    return {
      tone: 'text-[color:var(--warn)]',
      label: 'Нет доступных курсов. Ожидаем следующее обновление.',
    };
  }

  if (now - Date.parse(snapshot.fetchedAt) > snapshot.refreshIntervalMs * 2) {
    return {
      tone: 'text-[color:var(--warn)]',
      label: 'Данные устарели. Показываем последний полученный снимок.',
    };
  }

  if (snapshot.partialFailure) {
    return {
      tone: 'text-[color:var(--warn)]',
      label: 'Часть источников недоступна, экран показывает то, что удалось получить.',
    };
  }

  return {
    tone: 'text-[color:var(--ok)]',
    label: null,
  };
}

function StatBlock({ label, value, accent = false }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className='metal-panel min-w-0 overflow-hidden rounded-[2.1rem] px-6 py-6 lg:px-10 lg:py-8'>
      <p className='text-sm font-semibold uppercase tracking-[0.24em] text-[color:var(--muted)] lg:text-lg'>{label}</p>
      <p
        className={[
          'mt-4 min-w-0 overflow-hidden text-[clamp(2.9rem,5.2vw,5.1rem)] leading-[0.9] font-mono font-bold tracking-tight',
          accent ? 'text-[color:var(--accent)]' : 'text-[color:var(--foreground)]',
        ].join(' ')}
      >
        {value}
      </p>
    </div>
  );
}

function LogoPlate({ logoUrl, alt }: { logoUrl?: string; alt: string }) {
  if (!logoUrl) {
    return null;
  }

  return (
    <div className='metal-panel flex h-28 w-[16rem] shrink-0 items-center justify-center overflow-hidden rounded-[2.2rem] px-6 py-4 lg:h-40 lg:w-[20rem] lg:px-8'>
      <div className='relative h-20 w-full lg:h-28'>
        <Image
          src={logoUrl}
          alt={alt}
          fill
          className='object-contain'
          sizes='(max-width: 1024px) 24rem, 32rem'
          unoptimized
        />
      </div>
    </div>
  );
}

function SequenceDots({ activeIndex, total }: { activeIndex: number; total: number }) {
  return (
    <div className='flex items-center justify-center gap-3 lg:gap-4'>
      {Array.from({ length: total }, (_, index) => {
        const active = index === activeIndex;

        return (
          <span
            key={index}
            className={[
              'block rounded-full transition-all duration-300',
              active
                ? 'h-3 w-14 bg-[color:var(--accent)] lg:h-4 lg:w-20'
                : 'h-3 w-3 bg-[color:var(--line)] lg:h-4 lg:w-4',
            ].join(' ')}
          />
        );
      })}
    </div>
  );
}

function EmptyState({ issues }: { issues: string[] }) {
  return (
    <section className='metal-panel flex h-full min-h-[70vh] w-full max-w-[1400px] flex-col justify-between rounded-[2.5rem] px-8 py-10 lg:px-12 lg:py-12'>
      <div>
        <p className='text-sm font-semibold uppercase tracking-[0.28em] text-[color:var(--muted)] lg:text-base'>
          USD / BYN
        </p>
        <h1 className='mt-6 max-w-4xl text-4xl font-black leading-[1.02] tracking-[-0.04em] text-[color:var(--foreground)] lg:text-7xl'>
          Источники не ответили. Экран продолжит обновляться автоматически.
        </h1>
      </div>
      <div className='space-y-3 text-lg text-[color:var(--muted)] lg:text-2xl'>
        {issues.length ? issues.map((issue) => <p key={issue}>{issue}</p>) : <p>Ожидаем следующее обновление.</p>}
      </div>
    </section>
  );
}

function CardDetails({ card }: { card: RateCard }) {
  if (card.kind === 'official') {
    return (
      <div className='grid w-full min-w-0 gap-6 lg:gap-8'>
        <StatBlock label='Официальный курс' value={`${formatRate(card.officialRate)} BYN`} accent />
      </div>
    );
  }

  return (
    <div className='data-grid w-full min-w-0 gap-6 lg:gap-8'>
      <StatBlock label='Покупка' value={`${formatRate(card.buyRate)} BYN`} accent />
      <StatBlock label='Продажа' value={`${formatRate(card.sellRate)} BYN`} />
    </div>
  );
}

export function TvRatesBoard({ initialSnapshot }: TvRatesBoardProps) {
  const [snapshot, setSnapshot] = useState(initialSnapshot);
  const [activeIndex, setActiveIndex] = useState(0);
  const [networkIssue, setNetworkIssue] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());

  const cards = snapshot.cards;
  const currentCard = cards[activeIndex] ?? cards[0];

  const refreshSnapshot = useEffectEvent(async () => {
    try {
      const response = await fetch('/api/rates', {
        cache: 'no-store',
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const nextSnapshot = (await response.json()) as RatesSnapshot;

      startTransition(() => {
        setSnapshot(nextSnapshot);
        setNetworkIssue(null);
      });
    } catch {
      setNetworkIssue('Не удалось обновить данные. Показываем последний снимок.');
    }
  });

  useEffect(() => {
    if (cards.length <= 1) {
      return;
    }

    const intervalId = window.setInterval(() => {
      setActiveIndex((current) => (current + 1) % cards.length);
    }, snapshot.rotationIntervalMs);

    return () => {
      window.clearInterval(intervalId);
    };
  }, [cards.length, snapshot.rotationIntervalMs]);

  useEffect(() => {
    setActiveIndex((current) => {
      if (!cards.length) {
        return 0;
      }

      return current >= cards.length ? 0 : current;
    });
  }, [cards.length]);

  useEffect(() => {
    const intervalId = window.setInterval(() => {
      void refreshSnapshot();
    }, snapshot.refreshIntervalMs);

    return () => {
      window.clearInterval(intervalId);
    };
  }, [snapshot.refreshIntervalMs]);

  useEffect(() => {
    const timeoutId = window.setTimeout(
      () => {
        setNow(Date.now());
      },
      Math.max(0, 60000 - (now % 60000)),
    );

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [now]);

  const status = useMemo(() => buildStatus(snapshot, now, networkIssue), [networkIssue, now, snapshot]);
  const weatherLabel = useMemo(() => buildWeatherLabel(snapshot), [snapshot]);

  if (!currentCard) {
    return <EmptyState issues={snapshot.issues} />;
  }

  const hasLogo = Boolean(currentCard.logoUrl);

  return (
    <section className='metal-panel panel-enter flex h-full min-h-[82vh] w-full flex-col justify-between overflow-hidden rounded-[2.8rem] px-6 py-6 lg:px-10 lg:py-10'>
      <div className='flex flex-1 flex-col gap-10 lg:gap-14'>
        <div className='flex flex-wrap items-start justify-between gap-x-6 gap-y-3'>
          <div className='flex min-w-0 max-w-full flex-1 flex-col gap-2'>
            <p className='text-sm font-semibold uppercase tracking-[0.28em] text-[color:var(--muted)] lg:text-base'>
              USD / BYN • Брест
            </p>
            {weatherLabel ? (
              <div className='metal-panel max-w-full rounded-[1.4rem] px-4 py-3 lg:px-6 lg:py-4'>
                <p className='max-w-full text-base font-bold leading-snug text-[color:var(--foreground)] wrap-break-word lg:text-2xl'>
                  {weatherLabel}
                </p>
              </div>
            ) : null}
          </div>

          <p className='shrink-0 text-sm font-semibold tracking-[0.18em] text-[color:var(--muted)] lg:text-base'>
            {formatTimestamp(now)}
          </p>
        </div>

        <div className='flex min-w-0 flex-1 flex-col justify-center gap-8 lg:gap-10'>
          <div
            className={[
              'grid min-w-0 grid-cols-1 items-center gap-5 md:gap-8',
              hasLogo ? 'md:grid-cols-[20rem_minmax(0,1fr)]' : 'md:grid-cols-1',
            ].join(' ')}
          >
            <LogoPlate logoUrl={currentCard.logoUrl} alt={currentCard.sourceName} />

            <h1 className='min-w-0 max-w-full text-balance break-words text-[clamp(2.6rem,5vw,6rem)] font-black leading-[0.92] tracking-[-0.06em] text-[color:var(--foreground)]'>
              {currentCard.headline}
            </h1>
          </div>

          <CardDetails card={currentCard} />
        </div>
      </div>

      <div className='mt-8 flex shrink-0 flex-col gap-5 lg:mt-10 lg:gap-6'>
        <SequenceDots activeIndex={activeIndex} total={cards.length} />
        {status.label ? (
          <p className={['text-center text-base font-semibold leading-relaxed lg:text-xl', status.tone].join(' ')}>
            {status.label}
          </p>
        ) : null}
      </div>
    </section>
  );
}
