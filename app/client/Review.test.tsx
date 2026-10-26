// @vitest-environment jsdom
import React, { useState } from 'react';
import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { Review } from './Review';
import type { Capture } from '../shared/contracts';
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
const capture: Capture = { id: 'capture-1', kind: 'image', status: 'review', metadata: { capturedAt: '2026-09-01T10:15:30.000Z', location: { latitude: 53.7, longitude: -2.29 }, source: 'embedded' }, crop: null, originalUrl: '/api/media/capture-1', createdAt: '2026-10-26T00:00:00Z', error: null, identification: { warnings: [], status: 'identified', model: 'test-model', scoreLabel: 'classifier score', raw: {}, candidates: [{ speciesId: 'robin', commonName: 'Robin', scientificName: 'Erithacus rubecula', score: 0.8, ranges: [] }] } };
it('confirms a suggestion without replacing unchanged embedded metadata or timestamp seconds', async () => {
  const fetcher = vi.fn().mockImplementation((path: string) => Promise.resolve(new Response(JSON.stringify(path.startsWith('/api/species') ? [] : { id: 'sighting-1' }), { status: 200 }))); vi.stubGlobal('fetch', fetcher);
  render(<Review capture={capture} onChange={vi.fn()} onConfirmed={vi.fn()} onDeleted={vi.fn()} />);
  fireEvent.click(screen.getByRole('button', { name: 'Confirm' }));
  await waitFor(() => expect(screen.getByRole('status').textContent).toContain('Saved'));
  expect(fetcher.mock.calls.filter(call => call[0].startsWith('/api/captures'))).toHaveLength(1);
  expect(fetcher.mock.calls.find(call => call[0].endsWith('/confirm'))?.[0]).toBe('/api/captures/capture-1/confirm');
});
it('requires capture date and location before any confirmation request', async () => {
  const fetcher = vi.fn().mockImplementation(() => Promise.resolve(new Response('[]'))); vi.stubGlobal('fetch', fetcher);
  render(<Review capture={{ ...capture, metadata: { capturedAt: null, location: null, source: 'missing' } }} onChange={vi.fn()} onConfirmed={vi.fn()} onDeleted={vi.fn()} />);
  fireEvent.click(screen.getByRole('button', { name: 'Confirm' }));
  await waitFor(() => expect(screen.getByRole('alert').textContent).toContain('capture date'));
  expect(fetcher.mock.calls.filter(call => call[1]?.method)).toHaveLength(0);
});
it('retains unfinished metadata edits when returning to the same capture', () => {
  vi.stubGlobal('fetch', vi.fn().mockImplementation(() => Promise.resolve(new Response('[]'))));
  const draftCapture = { ...capture, id: 'draft-capture' };
  const callbacks = { onChange: vi.fn(), onConfirmed: vi.fn(), onDeleted: vi.fn() };
  const first = render(<Review capture={draftCapture} {...callbacks} />);
  fireEvent.change(screen.getByLabelText('Capture date and time'), { target: { value: '2026-10-25T10:00' } });
  fireEvent.click(screen.getByRole('button', { name: 'Lytham' }));
  first.unmount(); render(<Review capture={draftCapture} {...callbacks} />);
  expect(screen.getByLabelText<HTMLInputElement>('Capture date and time').value).toBe('2026-10-25T10:00');
  expect(screen.getByLabelText<HTMLInputElement>('Longitude').value).toBe('-2.964');
});
it('requires an explicit timezone review and save before a photo can be confirmed', async () => {
  if (!capture.identification) throw new Error('Identification fixture missing');
  const ambiguous: Capture = { ...capture, id: 'ambiguous-photo', identification: { ...capture.identification, warnings: ['embedded_date_has_no_timezone'] } };
  const fetcher = vi.fn().mockImplementation((path: string) => Promise.resolve(new Response(JSON.stringify(path.startsWith('/api/species') ? [] : { ...ambiguous, metadata: { ...ambiguous.metadata, source: 'user' } }), { status: 200 }))); vi.stubGlobal('fetch', fetcher);
  function SavedReview() { const [current, setCurrent] = useState(ambiguous); return <Review capture={current} onChange={setCurrent} onConfirmed={vi.fn()} onDeleted={vi.fn()} />; }
  render(<SavedReview />);
  expect(screen.getByRole<HTMLButtonElement>('button', { name: 'Confirm' }).disabled).toBe(true);
  expect(screen.getByRole('alert').textContent).toContain('Photo has no timezone');
  expect(screen.getByLabelText<HTMLInputElement>('Capture date and time').value).toBe('2026-09-01T10:15');
  fireEvent.click(screen.getByRole('button', { name: 'Save capture details' }));
  await waitFor(() => expect(screen.getByRole<HTMLButtonElement>('button', { name: 'Confirm' }).disabled).toBe(false));
  expect(fetcher.mock.calls.find(call => call[1]?.method === 'PATCH')?.[0]).toBe('/api/captures/ambiguous-photo');
});


