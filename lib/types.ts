export type RateCardKind = 'official' | 'bank-summary' | 'bank-branch';

export type RateCard = {
  id: string;
  sourceId: string;
  sourceName: string;
  kind: RateCardKind;
  priority: number;
  headline: string;
  subheadline: string;
  updatedAt: string;
  logoUrl?: string;
  officialRate?: number;
  buyRate?: number;
  sellRate?: number;
  location?: string;
  note?: string;
};

export type SourceLoadResult = {
  cards: RateCard[];
  issues: string[];
};

export type RatesSnapshot = {
  cards: RateCard[];
  fetchedAt: string;
  refreshIntervalMs: number;
  rotationIntervalMs: number;
  partialFailure: boolean;
  issues: string[];
};
