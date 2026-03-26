import type { RateCard, SourceLoadResult } from '@/lib/types';

const city = 'Минск';
const BELARUSBANK_URL = `https://belarusbank.by/api/kursExchange?city=${encodeURIComponent(city)}`;

type BelarusbankBranch = {
  USD_in: string;
  USD_out: string;
  filial_id: string;
  street_type: string;
  street: string;
  home_number: string;
  filials_text: string;
};

type ParsedBranch = {
  id: string;
  buyRate: number;
  sellRate: number;
  location: string;
  branchLabel: string;
};

function toNumber(value: string) {
  return Number.parseFloat(value);
}

function buildLocation(branch: BelarusbankBranch) {
  const street = `${branch.street_type ?? ''}${branch.street ?? ''}`.replace(/\s+/g, ' ').trim();
  const house = branch.home_number?.trim();

  return [street, house].filter(Boolean).join(', ');
}

function buildBranchLabel(branch: BelarusbankBranch) {
  return branch.filials_text.replace(/\s+/g, ' ').trim();
}

function parseBranch(branch: BelarusbankBranch): ParsedBranch | null {
  const buyRate = toNumber(branch.USD_in);
  const sellRate = toNumber(branch.USD_out);

  if (!Number.isFinite(buyRate) || !Number.isFinite(sellRate) || buyRate <= 0 || sellRate <= 0) {
    return null;
  }

  return {
    id: branch.filial_id,
    buyRate,
    sellRate,
    location: buildLocation(branch),
    branchLabel: buildBranchLabel(branch),
  };
}

export async function getBelarusbankCards(): Promise<SourceLoadResult> {
  const response = await fetch(BELARUSBANK_URL, {
    cache: 'no-store',
  });

  if (!response.ok) {
    throw new Error(`Беларусбанк ответил со статусом ${response.status}`);
  }

  const payload = (await response.json()) as BelarusbankBranch[];
  const branches = payload.map(parseBranch).filter((branch): branch is ParsedBranch => branch !== null);

  if (!branches.length) {
    throw new Error('Беларусбанк не вернул подходящие наличные курсы по USD');
  }

  const bestBuyBranch = branches.reduce((best, current) => (current.buyRate > best.buyRate ? current : best));
  const bestSellBranch = branches.reduce((best, current) => (current.sellRate < best.sellRate ? current : best));
  const latestTimestamp = new Date().toISOString();

  const summaryCard: RateCard = {
    id: 'belarusbank-summary',
    sourceId: 'belarusbank',
    sourceName: 'Беларусбанк',
    kind: 'bank-summary',
    priority: 20,
    headline: 'Лучшие наличные курсы в Минске',
    subheadline: 'Сводка по отделениям Беларусбанка для наличного USD.',
    updatedAt: latestTimestamp,
    buyRate: bestBuyBranch.buyRate,
    sellRate: bestSellBranch.sellRate,
    note: `В выдаче найдено ${branches.length} отделений.`,
  };

  const bestBuyCard: RateCard = {
    id: `belarusbank-best-buy-${bestBuyBranch.id}`,
    sourceId: 'belarusbank',
    sourceName: 'Беларусбанк',
    kind: 'bank-branch',
    priority: 30,
    headline: 'Лучший курс покупки',
    subheadline: 'Где дороже всего принимают наличные доллары.',
    updatedAt: latestTimestamp,
    buyRate: bestBuyBranch.buyRate,
    sellRate: bestBuyBranch.sellRate,
    location: bestBuyBranch.location,
    note: bestBuyBranch.branchLabel,
  };

  const bestSellCard: RateCard = {
    id: `belarusbank-best-sell-${bestSellBranch.id}`,
    sourceId: 'belarusbank',
    sourceName: 'Беларусбанк',
    kind: 'bank-branch',
    priority: 40,
    headline: 'Лучшая цена продажи',
    subheadline: 'Где дешевле всего купить наличный доллар.',
    updatedAt: latestTimestamp,
    buyRate: bestSellBranch.buyRate,
    sellRate: bestSellBranch.sellRate,
    location: bestSellBranch.location,
    note: bestSellBranch.branchLabel,
  };

  return {
    cards: [summaryCard, bestBuyCard, bestSellCard],
    issues: [],
  };
}
