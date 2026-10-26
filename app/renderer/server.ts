import { createServer } from 'node:http';
import { timingSafeEqual } from 'node:crypto';
import { renderPng } from './raster';
import type { RenderRequest } from './composition';

const token = process.env.RENDERER_TOKEN;
if (!token) throw new Error('RENDERER_TOKEN is required');
function validRequest(value: unknown): value is RenderRequest {
  if (!value || typeof value !== 'object' || !('species' in value) || !('width' in value) || !('height' in value) || !('showNames' in value)) return false;
  return value.width === 480 && value.height === 800 && typeof value.showNames === 'boolean' && Array.isArray(value.species) && value.species.length <= 6 && value.species.every(s=>s && typeof s==='object' && typeof s.id==='string' && typeof s.commonName==='string' && s.commonName.length<=100 && typeof s.scientificName==='string' && (s.artworkUrl===null || typeof s.artworkUrl==='string'));
}
createServer(async (req,res)=>{
  if(req.url==='/health' && req.method==='GET') {res.writeHead(200).end('ok');return;}
  const expected=Buffer.from(`Bearer ${token}`), actual=Buffer.from(req.headers.authorization ?? '');
  if(actual.length!==expected.length || !timingSafeEqual(actual,expected)) {res.writeHead(401).end('Unauthorized');return;}
  if(req.url!=='/render' || req.method!=='POST') {res.writeHead(404).end();return;}
  try {
    const chunks:Buffer[]=[]; let size=0;
    for await(const chunk of req) {size+=chunk.length;if(size>65536) {res.writeHead(413).end();return;} chunks.push(chunk);}
    let body:unknown;
    try {body=JSON.parse(Buffer.concat(chunks).toString());} catch {res.writeHead(400).end('Invalid JSON');return;}
    if(!validRequest(body)) {res.writeHead(400).end('Invalid render request');return;}
    const png=await renderPng(body,process.env.PUBLIC_DIRECTORY ?? 'public');
    res.writeHead(200,{'Content-Type':'image/png','Cache-Control':'no-store'}).end(png);
  } catch(error) {
    console.error('Render failed',error instanceof Error ? error.message : 'Unknown error');
    res.writeHead(500).end('Rendering failed');
  }
}).listen(Number(process.env.PORT ?? 8081),'0.0.0.0');
