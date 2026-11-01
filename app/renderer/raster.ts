import { readFile } from 'node:fs/promises';
import { resolve, sep } from 'node:path';
import { Resvg } from '@resvg/resvg-js';
import { renderPairingSvg, renderSvg, type PairingRequest, type RenderRequest } from './composition';

/** Resolve only packaged artwork, never arbitrary URLs supplied to the renderer. */
export async function renderPng(request: RenderRequest | PairingRequest, publicDirectory: string): Promise<Uint8Array> {
  const root = resolve(publicDirectory);
  const font = {font:{fontFiles:[resolve(root,'fonts/Caveat.ttf')],loadSystemFonts:false}};
  if ('pairingUrl' in request) return new Resvg(renderPairingSvg(request), font).render().asPng();
  const species = await Promise.all(request.species.map(async bird => {
    if (bird.artworkUrl === null) return bird;
    if (!/^\/birds\/[a-zA-Z0-9_./-]+\.png$/.test(bird.artworkUrl) || bird.artworkUrl.includes('..')) throw new Error('Artwork must be a packaged bird PNG');
    const path = resolve(root, '.'+bird.artworkUrl);
    if (!path.startsWith(root+sep)) throw new Error('Artwork escaped public directory');
    const data = await readFile(path);
    return {...bird,artworkUrl:`data:image/png;base64,${data.toString('base64')}`};
  }));
  return new Resvg(renderSvg({...request,species}), font).render().asPng();
}
