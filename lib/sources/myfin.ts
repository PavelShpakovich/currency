import type { RateCard, SourceLoadResult } from '@/lib/types';

// ---------------------------------------------------------------------------
// Myfin adapter — HTML scraping
// ---------------------------------------------------------------------------
// This adapter fetches the myfin.by USD/BYN Brest page and extracts bank
// exchange rates by matching known HTML class names and data-attributes.
//
// FRAGILITY NOTE: There is no public JSON API, so we parse raw HTML. If
// myfin.by changes their markup (class renames, DOM restructuring, etc.) this
// adapter will start returning an empty sections array and throw the error
// 'Не удалось извлечь банковские курсы Myfin', which surfaces to the UI as a
// partialFailure warning. The rest of the app (NBRB official rate, weather)
// continues working normally.
//
// When this breaks:
//   1. Inspect the new HTML structure on https://myfin.by/currency/usd/brest.
//   2. Update the regex patterns in `parseRateCells` and `parseDefaultRows`.
//   3. Run `npm run dev` and confirm bank cards appear before deploying.
// ---------------------------------------------------------------------------

const CITY_LABEL = 'Брест';
const MYFIN_SOURCE_URL = 'https://myfin.by/currency/usd/brest';
const DISPLAY_TIME_ZONE = 'Europe/Minsk';

type MyfinSection = {
  id: string;
  bankAlias: string;
  bankName: string;
  logoUrl?: string;
  buyRate: number;
  sellRate: number;
  branchCount: number;
};

const LOCAL_BANK_LOGO_PATHS: Record<string, string> = {
  alfabank: '/banks/alfabank.svg',
  'bank-vtb': '/banks/bank-vtb.svg',
  belagroprombank: '/banks/belagroprombank.svg',
  belarusbank: '/banks/belarusbank.svg',
  belgazprombank: '/banks/belgazprombank.svg',
  belinvestbank: '/banks/belinvestbank.svg',
  belswissbank: '/banks/belswissbank.svg',
  bnbank: '/banks/bnbank.svg',
  'bps-sberbank': '/banks/bps-sberbank.svg',
  btabank: '/banks/btabank.svg',
  bvebank: '/banks/bvebank.svg',
  dabrabyt: '/banks/dabrabyt.svg',
  mtbank: '/banks/mtbank.svg',
  paritetbank: '/banks/paritetbank.svg',
  priorbank: '/banks/priorbank.svg',
  reshenie: '/banks/reshenie.svg',
  'rrb-bank': '/banks/rrb-bank.svg',
  statusbank: '/banks/statusbank.svg',
  technobank: '/banks/technobank.svg',
  zepterbank: '/banks/zepterbank.svg',
};

const archiveDateFormatter = new Intl.DateTimeFormat('ru-RU', {
  timeZone: DISPLAY_TIME_ZONE,
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
});

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

function getLocalBankLogoPath(bankAlias: string) {
  return LOCAL_BANK_LOGO_PATHS[bankAlias];
}

function getPreviousDate(value: string | number | Date) {
  const parsedDate = new Date(value);

  if (Number.isNaN(parsedDate.valueOf())) {
    return null;
  }

  const parts = archiveDateFormatter.formatToParts(parsedDate);
  const year = Number(parts.find((part) => part.type === 'year')?.value);
  const month = Number(parts.find((part) => part.type === 'month')?.value);
  const day = Number(parts.find((part) => part.type === 'day')?.value);

  if (!year || !month || !day) {
    return null;
  }

  const currentMidnightUtc = new Date(Date.UTC(year, month - 1, day));
  currentMidnightUtc.setUTCDate(currentMidnightUtc.getUTCDate() - 1);

  return currentMidnightUtc;
}

function formatArchiveDate(value: Date) {
  const day = String(value.getUTCDate()).padStart(2, '0');
  const month = String(value.getUTCMonth() + 1).padStart(2, '0');
  const year = value.getUTCFullYear();

  return `${day}-${month}-${year}`;
}

async function fetchMyfinPage(url: string) {
  const response = await fetch(url, {
    cache: 'no-store',
  });

  if (!response.ok) {
    throw new Error(`Myfin ответил со статусом ${response.status}`);
  }

  return response.text();
}

function parseRateCells(rowHtml: string) {
  const rateMatches = Array.from(
    rowHtml.matchAll(/<td class="currencies-courses__currency-cell [^"]*">\s*<span[^>]*>([\d.]+)<\/span>/g),
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
  const rowPattern = /<tr class="([^"]*currencies-courses__row-main[^"]*)"([^>]*)>([\s\S]*?)<\/tr>/g;
  const parsed: MyfinSection[] = [];

  for (const match of html.matchAll(rowPattern)) {
    const [, rowClassName, rowAttributes, rowHtml] = match;

    if (rowClassName.includes('currencies-courses__row-main--ad')) {
      continue;
    }

    if (!rowAttributes.includes('data-row-type="default"')) {
      continue;
    }

    const bankAliasMatch = rowAttributes.match(/data-bank-sef-alias="([^"]+)"/);

    if (!bankAliasMatch) {
      continue;
    }

    const [, bankAlias] = bankAliasMatch;
    const logoMatch = rowHtml.match(/<img class="load_image"[^>]*alt="([^"]+)"[^>]*data-url-img="([^"]+)"/);

    if (!logoMatch) {
      continue;
    }

    const [, altName] = logoMatch;
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
      logoUrl: getLocalBankLogoPath(bankAlias),
      buyRate: rates.buyRate,
      sellRate: rates.sellRate,
      branchCount,
    });
  }

  return parsed.sort((left, right) => left.bankName.localeCompare(right.bankName, 'ru'));
}

export async function getMyfinCards(): Promise<SourceLoadResult> {
  const html = await fetchMyfinPage(MYFIN_SOURCE_URL);
  const sections = parseDefaultRows(html);

  if (!sections.length) {
    throw new Error('Не удалось извлечь банковские курсы Myfin');
  }

  const previousDate = getPreviousDate(new Date());
  const previousSections = previousDate
    ? parseDefaultRows(await fetchMyfinPage(`${MYFIN_SOURCE_URL}/${formatArchiveDate(previousDate)}`).catch(() => ''))
    : [];
  const previousSectionsByAlias = previousSections.reduce<Record<string, MyfinSection>>((sectionsByAlias, section) => {
    sectionsByAlias[section.bankAlias] = section;
    return sectionsByAlias;
  }, {});

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
    previousBuyRate: previousSectionsByAlias[section.bankAlias]?.buyRate,
    sellRate: section.sellRate,
    previousSellRate: previousSectionsByAlias[section.bankAlias]?.sellRate,
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
