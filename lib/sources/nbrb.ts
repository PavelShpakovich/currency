import type { RateCard, SourceLoadResult } from '@/lib/types';

const NBRB_USD_URL = 'https://api.nbrb.by/exrates/rates/USD?parammode=2';
const DISPLAY_TIME_ZONE = 'Europe/Minsk';

type NbrbUsdResponse = {
  Cur_Abbreviation: string;
  Cur_OfficialRate: number;
  Date: string;
};

const dateKeyFormatter = new Intl.DateTimeFormat('en-CA', {
  timeZone: DISPLAY_TIME_ZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

function getDateKey(value: string | number | Date) {
  const parsedDate = new Date(value);

  if (Number.isNaN(parsedDate.valueOf())) {
    return null;
  }

  const parts = dateKeyFormatter.formatToParts(parsedDate);
  const year = parts.find((part) => part.type === 'year')?.value;
  const month = parts.find((part) => part.type === 'month')?.value;
  const day = parts.find((part) => part.type === 'day')?.value;

  if (!year || !month || !day) {
    return null;
  }

  return `${year}-${month}-${day}`;
}

function getYesterdayDateKey(value: string | number | Date) {
  const currentDateKey = getDateKey(value);

  if (!currentDateKey) {
    return null;
  }

  const [year, month, day] = currentDateKey.split('-').map(Number);
  const currentMidnightUtc = new Date(Date.UTC(year, month - 1, day));
  currentMidnightUtc.setUTCDate(currentMidnightUtc.getUTCDate() - 1);

  return currentMidnightUtc.toISOString().slice(0, 10);
}

async function fetchNbrbUsd(url: string) {
  const response = await fetch(url, {
    cache: 'no-store',
  });

  if (!response.ok) {
    throw new Error(`NBRB ответил со статусом ${response.status}`);
  }

  return (await response.json()) as NbrbUsdResponse;
}

export async function getNbrbCards(): Promise<SourceLoadResult> {
  const payload = await fetchNbrbUsd(NBRB_USD_URL);
  const yesterdayDateKey = getYesterdayDateKey(payload.Date);

  const previousPayload = yesterdayDateKey
    ? await fetchNbrbUsd(`${NBRB_USD_URL}&ondate=${yesterdayDateKey}`).catch(() => null)
    : null;

  const card: RateCard = {
    id: 'nbrb-official-usd-byn',
    sourceId: 'nbrb',
    sourceName: 'Национальный банк Республики Беларусь',
    kind: 'official',
    priority: 10,
    headline: 'Официальный курс доллара',
    subheadline: `${payload.Cur_Abbreviation} к белорусскому рублю по данным НБРБ`,
    updatedAt: payload.Date,
    officialRate: payload.Cur_OfficialRate,
    previousOfficialRate: previousPayload?.Cur_OfficialRate,
    note: 'Базовый официальный ориентир на сегодня.',
  };

  return {
    cards: [card],
    issues: [],
  };
}
