import type { CollectionEntry, FrameSettings, Species } from '../shared/contracts';

function londonDate(date: Date): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/London', year:'numeric', month:'2-digit', day:'2-digit' }).format(date);
}
export function londonWeek(now: Date): string {
  const day = new Date(`${londonDate(now)}T00:00:00Z`);
  day.setUTCDate(day.getUTCDate() - (day.getUTCDay() + 6) % 7);
  return day.toISOString().slice(0, 10);
}
/** Called by the hosted hourly scheduler as well as settings/collection mutations. */
export function selectSpecies(collection: CollectionEntry[], settings: FrameSettings, now: Date): Species[] {
  const unique = new Map(collection.map(entry => [entry.species.id, entry]));
  if (settings.mode === 'manual') return [...new Set(settings.speciesIds)].flatMap(id => {
    const entry = unique.get(id); return entry ? [entry.species] : [];
  }).slice(0, 6);
  const week = londonWeek(now);
  const today = londonDate(now);
  const species = [...unique.values()].filter(entry => settings.mode !== 'week' || entry.sightings.some(s => {
    const date = new Date(s.capturedAt);
    if (!Number.isFinite(date.getTime()) || date > now) return false;
    const local = londonDate(date); return local >= week && local <= today;
  })).map(entry => entry.species).sort((a,b) => a.id.localeCompare(b.id, 'en'));
  if (species.length <= 6) return species;
  const start = (Math.floor(now.getTime() / 3_600_000) * 6) % species.length;
  return Array.from({length:6}, (_,i) => species[(start+i)%species.length]);
}
