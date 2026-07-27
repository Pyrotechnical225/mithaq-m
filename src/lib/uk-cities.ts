export interface UkCity {
  name: string;
  lat: number;
  lng: number;
}

// Approx city-centre coordinates for a curated set of UK cities with sizeable
// Muslim populations. Used both for user location and imam directory listings.
export const UK_CITIES: UkCity[] = [
  { name: "London", lat: 51.5074, lng: -0.1278 },
  { name: "Birmingham", lat: 52.4862, lng: -1.8904 },
  { name: "Manchester", lat: 53.4808, lng: -2.2426 },
  { name: "Leeds", lat: 53.8008, lng: -1.5491 },
  { name: "Bradford", lat: 53.7960, lng: -1.7594 },
  { name: "Luton", lat: 51.8787, lng: -0.4200 },
  { name: "Leicester", lat: 52.6369, lng: -1.1398 },
  { name: "Glasgow", lat: 55.8642, lng: -4.2518 },
  { name: "Cardiff", lat: 51.4816, lng: -3.1791 },
  { name: "Sheffield", lat: 53.3811, lng: -1.4701 },
  { name: "Nottingham", lat: 52.9548, lng: -1.1581 },
  { name: "Bristol", lat: 51.4545, lng: -2.5879 },
  { name: "Newcastle", lat: 54.9784, lng: -1.6174 },
  { name: "Liverpool", lat: 53.4084, lng: -2.9916 },
  { name: "Edinburgh", lat: 55.9533, lng: -3.1883 },
  { name: "Coventry", lat: 52.4068, lng: -1.5197 },
  { name: "Blackburn", lat: 53.7480, lng: -2.4820 },
  { name: "Oldham", lat: 53.5409, lng: -2.1114 },
  { name: "Rochdale", lat: 53.6097, lng: -2.1561 },
  { name: "Slough", lat: 51.5105, lng: -0.5950 },
];

export const UK_CITY_NAMES = UK_CITIES.map((c) => c.name);

export function findUkCity(name: string | null | undefined): UkCity | null {
  if (!name) return null;
  const n = name.trim().toLowerCase();
  return UK_CITIES.find((c) => c.name.toLowerCase() === n) ?? null;
}
