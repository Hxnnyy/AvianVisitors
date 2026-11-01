import { afterEach, describe, expect, it, vi } from 'vitest';
import { pair } from './session';

afterEach(() => vi.unstubAllGlobals());

describe('pair', () => {
  it('sends only the token from a pasted pairing link', async () => {
    const fetch = vi.fn(async () => new Response(null, { status: 204 }));
    vi.stubGlobal('fetch', fetch);
    expect(await pair('  https://birds.example/#pair=abc_DEF-123 ')).toBe(true);
    expect(fetch).toHaveBeenCalledWith('/api/pair', expect.objectContaining({ body: JSON.stringify({ token: 'abc_DEF-123' }) }));
  });
  it('reports a used or expired link', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(null, { status: 401 })));
    expect(await pair('https://birds.example/#pair=used')).toBe(false);
  });
});
