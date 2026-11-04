import type { Location } from '../shared/contracts';

/** Approximate areas offered instead of typed coordinates. */
export const PLACES: { id: string; name: string; location: Location }[] = [
  { id: 'home', name: 'Rossendale', location: { latitude: 53.7, longitude: -2.29 } },
  { id: 'caravan', name: 'Lytham', location: { latitude: 53.738, longitude: -2.964 } },
];
export function placeFor(location: Location | null): (typeof PLACES)[number] | undefined {
  return PLACES.find(place => location && Math.abs(place.location.latitude - location.latitude) < 1e-6 && Math.abs(place.location.longitude - location.longitude) < 1e-6);
}
