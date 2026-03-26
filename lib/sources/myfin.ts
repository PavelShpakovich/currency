import type { RateCard, SourceLoadResult } from '@/lib/types';

const CITY_LABEL = 'Брест';
const MYFIN_SOURCE_URL = 'https://myfin.by/currency/usd/brest';

type MyfinSection = {
  id: string;
  bankAlias: string;
  bankName: string;
  logoUrl?: string;
  buyRate: number;
  sellRate: number;
  branchCount: number;
};

function normalizeWhitespace(value: string) {
  return value.replace(/\s+/g, ' ').trim();
}

function slugify(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-zа-яё0-9]+/gi, '-')
    .replace(/^-+|-+$/g, '');
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function stripHtml(value: string) {
  return normalizeWhitespace(value.replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' '));
}

function parseRateCells(rowHtml: string) {
  const rateMatches = Array.from(
    rowHtml.matchAll(
      /<td class="currencies-courses__currency-cell [^"]*">\s*<span(?: class="[^"]*")?>([\d.]+)<\/span>/g,
    ),
  );

  if (rateMatches.length < 2) {
    return null;
  }

  const buyRate = Number.parseFloat(rateMatches[0][1]);
  const sellRate = Number.parseFloat(rateMatches[1][1]);

  if (!Number.isFinite(buyRate) || !Number.isFinite(sellRate)) {
    return null;
  }

  return {
    buyRate,
    sellRate,
  };
}

function parseDefaultRows(html: string): MyfinSection[] {
  const rowPattern =
    /<tr class="currencies-courses__row-main "[^>]*data-row-type="default"[^>]*data-bank-sef-alias="([^"]+)"[^>]*>([\s\S]*?)<\/tr>/g;
  const parsed: MyfinSection[] = [];

  for (const match of html.matchAll(rowPattern)) {
    const [, bankAlias, rowHtml] = match;
    const logoMatch = rowHtml.match(/<img class="load_image"[^>]*alt="([^"]+)"[^>]*data-url-img="([^"]+)"/);

    if (!logoMatch) {
      continue;
    }

    const [, altName, rawLogoUrl] = logoMatch;
    const nameMatch = rowHtml.match(
      /<span class="bank-logo bank-logo--s mr-5">[\s\S]*?<\/span>([\s\S]*?)<\/span><\/td>/,
    );
    const bankName = normalizeWhitespace(stripHtml(nameMatch?.[1] ?? altName));
    const rates = parseRateCells(rowHtml);

    if (!rates) {
      continue;
    }

    const branchCount = new Set(
      Array.from(html.matchAll(new RegExp(`/bank/${escapeRegExp(bankAlias)}/department/[^"']+`, 'g'))).map(
        (item) => item[0],
      ),
    ).size;

    parsed.push({
      id: slugify(bankName),
      bankAlias,
      bankName,
      logoUrl: rawLogoUrl.startsWith('http') ? rawLogoUrl : `https://myfin.by${rawLogoUrl}`,
      buyRate: rates.buyRate,
      sellRate: rates.sellRate,
      branchCount,
    });
  }

  return parsed.sort((left, right) => left.bankName.localeCompare(right.bankName, 'ru'));
}

export async function getMyfinCards(): Promise<SourceLoadResult> {
  const response = await fetch(MYFIN_SOURCE_URL, {
    cache: 'no-store',
  });

  if (!response.ok) {
    throw new Error(`Myfin ответил со статусом ${response.status}`);
  }

  const html = await response.text();
  const sections = parseDefaultRows(html);

  if (!sections.length) {
    throw new Error('Не удалось извлечь банковские курсы Myfin');
  }

  const updatedAt = new Date().toISOString();
  const cards: RateCard[] = sections.map((section, index) => ({
    id: `myfin-${section.id}`,
    sourceId: 'myfin',
    sourceName: section.bankName,
    kind: 'bank-summary',
    priority: 20 + index,
    headline: section.bankName,
    subheadline: `Наличный доллар • ${CITY_LABEL}`,
    updatedAt,
    logoUrl: section.logoUrl,
    buyRate: section.buyRate,
    sellRate: section.sellRate,
    note:
      section.branchCount > 0
        ? `${CITY_LABEL} • ${section.branchCount} ${section.branchCount === 1 ? 'отделение' : section.branchCount < 5 ? 'отделения' : 'отделений'} в выдаче Myfin`
        : `${CITY_LABEL} • данные Myfin`,
  }));

  return {
    cards,
    issues: [],
  };
}
