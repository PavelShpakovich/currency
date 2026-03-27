export type SupportedCitySlug = 'minsk' | 'brest' | 'grodno' | 'gomel' | 'mogilev' | 'vitebsk';

export type SupportedCity = {
  slug: SupportedCitySlug;
  label: string;
  latitude: number;
  longitude: number;
};

const BELARUS_BOUNDS = {
  minLatitude: 51.2,
  maxLatitude: 56.3,
  minLongitude: 23.1,
  maxLongitude: 32.9,
};

export const SUPPORTED_CITIES: SupportedCity[] = [
  {
    slug: 'minsk',
    label: 'Минск',
    latitude: 53.9045,
    longitude: 27.5615,
  },
  {
    slug: 'brest',
    label: 'Брест',
    latitude: 52.0976,
    longitude: 23.7341,
  },
  {
    slug: 'grodno',
    label: 'Гродно',
    latitude: 53.6694,
    longitude: 23.8131,
  },
  {
    slug: 'gomel',
    label: 'Гомель',
    latitude: 52.4345,
    longitude: 30.9754,
  },
  {
    slug: 'mogilev',
    label: 'Могилев',
    latitude: 53.9,
    longitude: 30.3319,
  },
  {
    slug: 'vitebsk',
    label: 'Витебск',
    latitude: 55.1848,
    longitude: 30.2016,
  },
];

export const DEFAULT_CITY = SUPPORTED_CITIES[0];

function toRadians(value: number) {
  return (value * Math.PI) / 180;
}

function getDistanceKm(leftLatitude: number, leftLongitude: number, rightLatitude: number, rightLongitude: number) {
  const earthRadiusKm = 6371;
  const deltaLatitude = toRadians(rightLatitude - leftLatitude);
  const deltaLongitude = toRadians(rightLongitude - leftLongitude);
  const leftLatitudeRadians = toRadians(leftLatitude);
  const rightLatitudeRadians = toRadians(rightLatitude);
  const haversine =
    Math.sin(deltaLatitude / 2) * Math.sin(deltaLatitude / 2) +
    Math.cos(leftLatitudeRadians) *
      Math.cos(rightLatitudeRadians) *
      Math.sin(deltaLongitude / 2) *
      Math.sin(deltaLongitude / 2);

  return 2 * earthRadiusKm * Math.atan2(Math.sqrt(haversine), Math.sqrt(1 - haversine));
}

export function isWithinBelarus(latitude: number, longitude: number) {
  return (
    latitude >= BELARUS_BOUNDS.minLatitude &&
    latitude <= BELARUS_BOUNDS.maxLatitude &&
    longitude >= BELARUS_BOUNDS.minLongitude &&
    longitude <= BELARUS_BOUNDS.maxLongitude
  );
}

export function getCityBySlug(citySlug: string | null | undefined) {
  return SUPPORTED_CITIES.find((city) => city.slug === citySlug) ?? DEFAULT_CITY;
}

export function getNearestSupportedCity(latitude: number, longitude: number) {
  if (!isWithinBelarus(latitude, longitude)) {
    return DEFAULT_CITY;
  }

  return (
    SUPPORTED_CITIES.reduce(
      (nearestCity, city) => {
        if (nearestCity === null) {
          return city;
        }

        const nearestDistance = getDistanceKm(latitude, longitude, nearestCity.latitude, nearestCity.longitude);
        const nextDistance = getDistanceKm(latitude, longitude, city.latitude, city.longitude);

        return nextDistance < nearestDistance ? city : nearestCity;
      },
      null as SupportedCity | null,
    ) ?? DEFAULT_CITY
  );
}
