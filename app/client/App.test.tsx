// @vitest-environment jsdom
import React from 'react';
import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { App } from './App';
import type { Capture, CollectionEntry, FrameState } from '../shared/contracts';
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

const capture = (id: string, source: Capture['metadata']['source']): Capture => ({ id, kind: 'image', status: 'review', metadata: { capturedAt: '2026-10-30T08:00:00.000Z', location: { latitude: 53.61234, longitude: -2.11234 }, source }, crop: null, originalUrl: `/api/media/${id}`, identification: null, error: null, createdAt: '2026-10-30T08:00:00Z' });
const sighting = (id: string) => ({ id: `s-${id}`, captureId: id, speciesId: 'pica-pica', identifiedBy: 'model' as const, capturedAt: '2026-10-30T08:00:00.000Z', location: { latitude: 53.61234, longitude: -2.11234 }, createdAt: '2026-10-30T08:00:00Z' });
const collection: CollectionEntry[] = [{ species: { id: 'pica-pica', commonName: 'Magpie', scientificName: 'Pica pica', artworkUrl: null }, sightings: [sighting('photo'), sighting('phone')] }];
const frame: FrameState = { settings: { mode: 'week', speciesIds: [], showNames: true }, revision: null, imageUrl: null, lastContactAt: null, acknowledgedRevision: null, error: null };

it('shows coordinates in the collection only for locations read from a photograph', async () => {
  localStorage.setItem('birds:location-reviewed', 'yes'); vi.stubGlobal('scrollTo', vi.fn());
  const bodies: Record<string, unknown> = { '/api/collection': collection, '/api/captures': [capture('photo', 'embedded'), capture('phone', 'user')], '/api/frame': frame };
  vi.stubGlobal('fetch', vi.fn().mockImplementation((path: string) => Promise.resolve(new Response(JSON.stringify(bodies[path] ?? {})))));
  render(<App />);
  fireEvent.click(await screen.findByRole('button', { name: 'collection' }));
  fireEvent.click(await screen.findByRole('button', { name: /Magpie/ }));
  expect(screen.getAllByText(/53\.612, -2\.112/)).toHaveLength(1);
  expect(screen.getByText(/Your location/)).toBeTruthy();
});
