// @vitest-environment jsdom
import React from 'react';
import { afterEach, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { CaptureForm } from './Capture';
afterEach(() => { cleanup(); vi.useRealTimers(); vi.unstubAllGlobals(); });
it('never assigns the phone location or upload date to an imported photo without metadata', async () => {
  URL.createObjectURL = vi.fn(() => 'blob:old-photo'); URL.revokeObjectURL = vi.fn();
  const fetcher = vi.fn().mockImplementation(() => Promise.resolve(new Response(JSON.stringify({ id: 'photo-with-missing-metadata' })))); vi.stubGlobal('fetch', fetcher);
  render(<CaptureForm location={{ latitude: 53.7, longitude: -2.29 }} onUploaded={vi.fn()} />);
  const input = document.querySelector('input[type=file]'); if (!input) throw new Error('Photo input missing');
  fireEvent.change(input, { target: { files: [new File(['old photograph'], 'holiday.jpg', { type: 'image/jpeg' })] } });
  fireEvent.click(screen.getByRole('button', { name: 'Identify this visitor' }));
  await waitFor(() => expect(fetcher).toHaveBeenCalledTimes(1));
  const form = fetcher.mock.calls[0]?.[1]?.body; if (!(form instanceof FormData)) throw new Error('Upload must be multipart');
  expect(form.get('metadata')).toBe(JSON.stringify({ capturedAt: null, location: null, source: 'missing' }));
});
it('rejects photographs above the upload limit before sending private media', () => {
  const fetcher = vi.fn(); vi.stubGlobal('fetch', fetcher);
  render(<CaptureForm location={null} onUploaded={vi.fn()} />);
  const input = document.querySelector('input[type=file]');
  if (!input) throw new Error('Photo input missing');
  fireEvent.change(input, { target: { files: [new File([new Uint8Array(25 * 1024 * 1024 + 1)], 'large.jpg', { type: 'image/jpeg' })] } });
  expect(screen.getByRole('alert').textContent).toContain('25 MB');
  expect(fetcher).not.toHaveBeenCalled();
});
it('stops a recording at sixty seconds, releases the microphone and offers playback before upload', async () => {
  vi.useFakeTimers(); const stopTrack = vi.fn(); const stop = vi.fn();
  class Recorder {
    static isTypeSupported() { return true; }
    state = 'inactive'; mimeType = 'audio/mp4'; ondataavailable: ((event: { data: Blob }) => void) | null = null; onstop: (() => void) | null = null;
    start() { this.state = 'recording'; }
    stop() { this.state = 'inactive'; stop(); this.ondataavailable?.({ data: new Blob(['birdsong'], { type: this.mimeType }) }); this.onstop?.(); }
  }
  vi.stubGlobal('MediaRecorder', Recorder);
  Object.defineProperty(navigator, 'mediaDevices', { configurable: true, value: { getUserMedia: vi.fn().mockResolvedValue({ getTracks: () => [{ stop: stopTrack }] }) } });
  URL.createObjectURL = vi.fn(() => 'blob:test-recording'); URL.revokeObjectURL = vi.fn();
  const fetcher = vi.fn(); vi.stubGlobal('fetch', fetcher);
  render(<CaptureForm location={null} onUploaded={vi.fn()} />);
  await act(async () => { fireEvent.click(screen.getByRole('button', { name: /Record birdsong/ })); });
  expect(screen.getByRole('button', { name: /Stop recording/ })).toBeDefined();
  act(() => { vi.advanceTimersByTime(60_000); });
  expect(stop).toHaveBeenCalledTimes(1); expect(stopTrack).toHaveBeenCalled();
  expect(document.querySelector('audio')?.src).toBe('blob:test-recording');
  expect(screen.getByRole('button', { name: 'Identify this visitor' })).toBeDefined();
  expect(fetcher).not.toHaveBeenCalled();
});
