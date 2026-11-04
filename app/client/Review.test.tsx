// @vitest-environment jsdom
import React, { useState } from 'react';
import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { Review } from './Review';
import type { Capture } from '../shared/contracts';
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
const capture: Capture = { id: 'capture-1', kind: 'image', status: 'review', metadata: { capturedAt: '2026-09-01T10:15:30.000Z', location: { latitude: 53.7, longitude: -2.29 }, source: 'embedded' }, crop: null, originalUrl: '/api/media/capture-1', createdAt: '2026-10-26T00:00:00Z', error: null, identification: { warnings: [], status: 'identified', model: 'test-model', scoreLabel: 'classifier score', raw: {}, candidates: [{ speciesId: 'robin', commonName: 'Robin', scientificName: 'Erithacus rubecula', score: 0.8, ranges: [] }] } };
const noPlace: Capture = { ...capture, metadata: { capturedAt: '2026-09-01T10:15:30.000Z', location: null, source: 'missing' } };
const callbacks = () => ({ onChange: vi.fn(), onConfirmed: vi.fn(), onDeleted: vi.fn(), onViewCollection: vi.fn() });
it('confirms a suggestion without rewriting embedded metadata, then offers the collection in a dialog', async () => {
  const fetcher = vi.fn().mockImplementation((path: string) => Promise.resolve(new Response(JSON.stringify(path.startsWith('/api/species') ? [] : { id: 'sighting-1' }), { status: 200 }))); vi.stubGlobal('fetch', fetcher);
  const props = callbacks();
  render(<Review capture={capture} {...props} />);
  fireEvent.click(screen.getByRole('button', { name: 'Confirm' }));
  const dialog = await screen.findByRole('dialog', { name: 'Robin' });
  expect(dialog.textContent).toContain('Saved to your collection');
  expect(fetcher.mock.calls.filter(call => call[0].startsWith('/api/captures'))).toHaveLength(1);
  expect(fetcher.mock.calls.find(call => call[0].endsWith('/confirm'))?.[0]).toBe('/api/captures/capture-1/confirm');
  fireEvent.click(screen.getByRole('button', { name: 'See it in your collection' }));
  expect(props.onViewCollection).toHaveBeenCalledWith('robin');
});
it('shows photo coordinates read-only and never asks for typed coordinates', () => {
  vi.stubGlobal('fetch', vi.fn().mockImplementation(() => Promise.resolve(new Response('[]'))));
  const first = render(<Review capture={capture} {...callbacks()} />);
  expect(screen.getByText(/From your photo · 53\.7000, -2\.2900/)).toBeTruthy();
  expect(screen.queryByRole('spinbutton')).toBeNull();
  expect(screen.queryByRole('button', { name: 'Lytham' })).toBeNull();
  first.unmount();
  render(<Review capture={noPlace} {...callbacks()} />);
  expect(screen.queryByText(/From your photo/)).toBeNull();
  expect(screen.queryByRole('spinbutton')).toBeNull();
  expect(screen.getByRole('button', { name: 'Lytham' })).toBeTruthy();
});
it('requires a place before any confirmation request', async () => {
  const fetcher = vi.fn().mockImplementation(() => Promise.resolve(new Response('[]'))); vi.stubGlobal('fetch', fetcher);
  render(<Review capture={{ ...noPlace, id: 'no-place' }} {...callbacks()} />);
  fireEvent.click(screen.getByRole('button', { name: 'Confirm' }));
  await waitFor(() => expect(screen.getByRole('alert').textContent).toContain('Choose where you saw'));
  expect(fetcher.mock.calls.filter(call => call[1]?.method)).toHaveLength(0);
});
it('retains unfinished edits when returning to the same capture', () => {
  vi.stubGlobal('fetch', vi.fn().mockImplementation(() => Promise.resolve(new Response('[]'))));
  const draftCapture = { ...noPlace, id: 'draft-capture' };
  const first = render(<Review capture={draftCapture} {...callbacks()} />);
  fireEvent.change(screen.getByLabelText('Date and time'), { target: { value: '2026-10-25T10:00' } });
  fireEvent.click(screen.getByRole('button', { name: 'Lytham' }));
  first.unmount(); render(<Review capture={draftCapture} {...callbacks()} />);
  expect(screen.getByLabelText<HTMLInputElement>('Date and time').value).toBe('2026-10-25T10:00');
  expect(screen.getByRole('button', { name: 'Lytham' }).getAttribute('aria-pressed')).toBe('true');
});
it('requires an explicit timezone check before a photo can be confirmed', async () => {
  if (!capture.identification) throw new Error('Identification fixture missing');
  const ambiguous: Capture = { ...capture, id: 'ambiguous-photo', identification: { ...capture.identification, warnings: ['embedded_date_has_no_timezone'] } };
  const fetcher = vi.fn().mockImplementation((path: string) => Promise.resolve(new Response(JSON.stringify(path.startsWith('/api/species') ? [] : { ...ambiguous, metadata: { ...ambiguous.metadata, source: 'user' } }), { status: 200 }))); vi.stubGlobal('fetch', fetcher);
  function SavedReview() { const [current, setCurrent] = useState(ambiguous); return <Review capture={current} {...callbacks()} onChange={setCurrent} />; }
  render(<SavedReview />);
  expect(screen.getByRole<HTMLButtonElement>('button', { name: 'Confirm' }).disabled).toBe(true);
  expect(screen.getByRole('alert').textContent).toContain('Photo has no timezone');
  expect(screen.getByLabelText<HTMLInputElement>('Date and time').value).toBe('2026-09-01T10:15');
  fireEvent.click(screen.getByRole('button', { name: 'The date and time are right' }));
  await waitFor(() => expect(screen.getByRole<HTMLButtonElement>('button', { name: 'Confirm' }).disabled).toBe(false));
  expect(fetcher.mock.calls.find(call => call[1]?.method === 'PATCH')?.[0]).toBe('/api/captures/ambiguous-photo');
});
it('shows the outside-the-list note once, and only when the model was unsure', () => {
  if (!capture.identification) throw new Error('Identification fixture missing');
  vi.stubGlobal('fetch', vi.fn().mockImplementation(() => Promise.resolve(new Response('[]'))));
  const warnings = ['unmapped_photo_label:Red-flanked bluetail', 'unmapped_photo_label:Citrine wagtail', 'unmapped_photo_label:Caspian gull'];
  const unsure = render(<Review capture={{ ...capture, identification: { ...capture.identification, status: 'uncertain', warnings } }} {...callbacks()} />);
  expect(screen.getAllByText(/outside this list/)).toHaveLength(1);
  expect(screen.queryByText(/Identification details/)).toBeNull();
  unsure.unmount();
  render(<Review capture={{ ...capture, identification: { ...capture.identification, warnings } }} {...callbacks()} />);
  expect(screen.queryByText(/outside this list/)).toBeNull();
});
