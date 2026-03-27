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
  previousOfficialRate?: number;
  buyRate?: number;
  previousBuyRate?: number;
  sellRate?: number;
  previousSellRate?: number;
  location?: string;
  note?: string;
};

export type SourceLoadResult = {
  cards: RateCard[];
  issues: string[];
};

export type WeatherSnapshot = {
  city: string;
  temperatureC: number;
  feelsLikeC?: number;
  windSpeedMs?: number;
  condition: string;
  updatedAt: string;
};

export type RatesSnapshot = {
  cards: RateCard[];
  weather?: WeatherSnapshot;
  fetchedAt: string;
  refreshIntervalMs: number;
  rotationIntervalMs: number;
  partialFailure: boolean;
  issues: string[];
};
