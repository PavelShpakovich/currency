import { getCityBySlug, type SupportedCitySlug } from '@/lib/cities';
import type { WeatherSnapshot } from '@/lib/types';

const WEATHER_REFRESH_INTERVAL_MS = 20 * 60_000;

type WeatherCacheEntry = {
  snapshot: WeatherSnapshot;
  expiresAt: number;
};

const weatherCache = new Map<SupportedCitySlug, WeatherCacheEntry>();
const weatherInFlight = new Map<SupportedCitySlug, Promise<WeatherSnapshot>>();

function describeWeather(code: number) {
  const descriptions: Record<number, string> = {
    0: 'Ясно',
    1: 'Преимущественно ясно',
    2: 'Переменная облачность',
    3: 'Пасмурно',
    45: 'Туман',
    48: 'Изморозь',
    51: 'Слабая морось',
    53: 'Морось',
    55: 'Сильная морось',
    56: 'Слабая ледяная морось',
    57: 'Ледяная морось',
    61: 'Слабый дождь',
    63: 'Дождь',
    65: 'Сильный дождь',
    66: 'Слабый ледяной дождь',
    67: 'Ледяной дождь',
    71: 'Слабый снег',
    73: 'Снег',
    75: 'Сильный снег',
    77: 'Снежные зерна',
    80: 'Слабый ливень',
    81: 'Ливень',
    82: 'Сильный ливень',
    85: 'Слабый снегопад',
    86: 'Сильный снегопад',
    95: 'Гроза',
    96: 'Гроза с градом',
    99: 'Сильная гроза с градом',
  };

  return descriptions[code] ?? 'Погода';
}

type OpenMeteoResponse = {
  current?: {
    temperature_2m?: number;
    apparent_temperature?: number;
    weather_code?: number;
    wind_speed_10m?: number;
    time?: string;
  };
};

async function fetchFreshWeatherForCity(citySlug: SupportedCitySlug): Promise<WeatherSnapshot> {
  const city = getCityBySlug(citySlug);
  const openMeteoUrl = `https://api.open-meteo.com/v1/forecast?latitude=${city.latitude}&longitude=${city.longitude}&current=temperature_2m,apparent_temperature,weather_code,wind_speed_10m&wind_speed_unit=ms&timezone=auto`;
  const response = await fetch(openMeteoUrl, {
    cache: 'no-store',
  });

  if (!response.ok) {
    throw new Error(`Погода недоступна: ${response.status}`);
  }

  const payload = (await response.json()) as OpenMeteoResponse;
  const current = payload.current;

  if (!current || typeof current.temperature_2m !== 'number' || typeof current.weather_code !== 'number') {
    throw new Error('Погода недоступна: неполный ответ');
  }

  return {
    city: city.label,
    temperatureC: current.temperature_2m,
    feelsLikeC: typeof current.apparent_temperature === 'number' ? current.apparent_temperature : undefined,
    windSpeedMs: typeof current.wind_speed_10m === 'number' ? current.wind_speed_10m : undefined,
    condition: describeWeather(current.weather_code),
    updatedAt: current.time ?? new Date().toISOString(),
  };
}

export async function getWeather(citySlug: SupportedCitySlug): Promise<WeatherSnapshot> {
  const now = Date.now();
  const cachedWeather = weatherCache.get(citySlug) ?? null;

  if (cachedWeather !== null && now < cachedWeather.expiresAt) {
    return cachedWeather.snapshot;
  }

  const inFlightWeather = weatherInFlight.get(citySlug) ?? null;

  if (inFlightWeather !== null) {
    return inFlightWeather;
  }

  const nextInFlightWeather = fetchFreshWeatherForCity(citySlug)
    .then((snapshot) => {
      weatherCache.set(citySlug, {
        snapshot,
        expiresAt: Date.now() + WEATHER_REFRESH_INTERVAL_MS,
      });
      weatherInFlight.delete(citySlug);
      return snapshot;
    })
    .catch((error: unknown) => {
      weatherInFlight.delete(citySlug);
      throw error;
    });

  weatherInFlight.set(citySlug, nextInFlightWeather);

  return nextInFlightWeather;
}
