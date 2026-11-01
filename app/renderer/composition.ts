import type { Species } from '../shared/contracts';
import qrcode from 'qrcode-generator';
import { layout } from './layout';

export interface RenderRequest { species: Species[]; showNames: boolean; width: 480; height: 800 }
/** Shown while a phone still needs pairing: scanning the QR opens the one-time sign-in link. */
export interface PairingRequest { pairingUrl: string; width: 480; height: 800 }
const escape = (text: string) => text.replace(/[<>&"']/g, c => ({'<':'&lt;','>':'&gt;','&':'&amp;','"':'&quot;',"'":'&apos;'}[c] ?? c));

/** Shared composition for browser SVG preview and server PNG. Palette and Caveat
 * labels derive from AvianVisitors (CC BY-NC-SA; see repository LICENSE).
 * Art remains transparent cutouts rather than cards or capture photographs. */
export function renderSvg(request: RenderRequest): string {
  if (request.width !== 480 || request.height !== 800 || request.species.length > 6 || new Set(request.species.map(s=>s.id)).size !== request.species.length) throw new Error('Expected up to six distinct species on a 480×800 canvas');
  const count = request.species.length;
  const placed = layout(request.species,request.showNames);
  const birds = placed.map(tile=>{
    const bird=request.species.find(b=>b.id===tile.id);
    if(!bird) throw new Error('Layout species missing');
    const {x,y,fullW,fullH}=tile;
    const image = bird.artworkUrl ? `<image href="${escape(bird.artworkUrl)}" x="${x}" y="${y}" width="${fullW}" height="${fullH}" preserveAspectRatio="xMidYMid meet"/>` : `<text x="${x+fullW/2}" y="${y+fullH/2}" text-anchor="middle" font-family="sans-serif" font-size="13" fill="#908576">Illustration unavailable</text>`;
    return image + (request.showNames || !bird.artworkUrl ? `<text x="${x}" y="${y+fullH+23}" font-family="Caveat" font-size="23" fill="#4a3f31">${escape(bird.commonName)}</text>` : '');
  }).join('');
  return `<svg xmlns="http://www.w3.org/2000/svg" width="480" height="800" viewBox="0 0 480 800"><rect width="480" height="800" fill="#fcfcfb"/><text x="240" y="75" text-anchor="middle" font-family="Caveat" font-size="43" fill="#1a1612">Avian Visitors</text>${count ? birds : '<text x="240" y="400" text-anchor="middle" font-family="Caveat" font-size="28" fill="#908576">No birds in this selection yet</text>'}</svg>`;
}

export function renderPairingSvg(request: PairingRequest): string {
  if (request.width !== 480 || request.height !== 800 || !/^https?:\/\/[^\s]+$/.test(request.pairingUrl) || request.pairingUrl.length > 300) throw new Error('Expected an http(s) pairing URL on a 480×800 canvas');
  const qr = qrcode(0, 'M');
  qr.addData(request.pairingUrl);
  qr.make();
  const modules = qr.getModuleCount(), cell = Math.floor(400 / (modules + 8)), size = cell * modules, left = (480 - size) / 2, top = 190;
  let path = '';
  for (let row = 0; row < modules; row++) for (let col = 0; col < modules; col++) if (qr.isDark(row, col)) path += `M${left + col * cell} ${top + row * cell}h${cell}v${cell}h-${cell}z`;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="480" height="800" viewBox="0 0 480 800"><rect width="480" height="800" fill="#ffffff"/><text x="240" y="85" text-anchor="middle" font-family="Caveat" font-size="43" fill="#1a1612">Avian Visitors</text><text x="240" y="150" text-anchor="middle" font-family="Caveat" font-size="30" fill="#1a1612">Scan to set up your bird journal</text><path d="${path}" fill="#000000"/><text x="240" y="${top + size + 60}" text-anchor="middle" font-family="Caveat" font-size="26" fill="#4a3f31">Point your iPhone camera here,</text><text x="240" y="${top + size + 92}" text-anchor="middle" font-family="Caveat" font-size="26" fill="#4a3f31">then tap the link that appears</text></svg>`;
}
