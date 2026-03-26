import type { RateCard, SourceLoadResult } from '@/lib/types';

const NBRB_USD_URL = 'https://api.nbrb.by/exrates/rates/USD?parammode=2';

type NbrbUsdResponse = {
  Cur_Abbreviation: string;
  Cur_OfficialRate: number;
  Date: string;
};

export async function getNbrbCards(): Promise<SourceLoadResult> {
  const response = await fetch(NBRB_USD_URL, {
    cache: 'no-store',
  });

  if (!response.ok) {
    throw new Error(`NBRB ответил со статусом ${response.status}`);
  }

  const payload = (await response.json()) as NbrbUsdResponse;

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
    note: 'Базовый официальный ориентир на сегодня.',
  };

  return {
    cards: [card],
    issues: [],
  };
}
