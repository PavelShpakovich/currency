import type { WeatherSnapshot } from '@/lib/types';

const BREST_LATITUDE = 52.0976;
const BREST_LONGITUDE = 23.7341;
const OPEN_METEO_URL = `https://api.open-meteo.com/v1/forecast?latitude=${BREST_LATITUDE}&longitude=${BREST_LONGITUDE}&current=temperature_2m,apparent_temperature,weather_code,wind_speed_10m&wind_speed_unit=ms&timezone=auto`;

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

export async function getBrestWeather(): Promise<WeatherSnapshot> {
  const response = await fetch(OPEN_METEO_URL, {
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
    city: 'Брест',
    temperatureC: current.temperature_2m,
    feelsLikeC: typeof current.apparent_temperature === 'number' ? current.apparent_temperature : undefined,
    windSpeedMs: typeof current.wind_speed_10m === 'number' ? current.wind_speed_10m : undefined,
    condition: describeWeather(current.weather_code),
    updatedAt: current.time ?? new Date().toISOString(),
  };
}
