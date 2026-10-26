import { expect,it } from 'vitest';
import { renderPng } from './raster';
import { renderSvg } from './composition';
import { layout } from './layout';
it('rasterizes a real portrait PNG, including honest empty state',async()=>{
 const request={width:480 as const,height:800 as const,species:[],showNames:true};
 const png=await renderPng(request,'public');
 expect([...png.slice(0,8)]).toEqual([137,80,78,71,13,10,26,10]);
 const header=new DataView(png.buffer,png.byteOffset,png.byteLength);
 expect([header.getUint32(16),header.getUint32(20)]).toEqual([480,800]);
 expect(renderSvg(request)).toContain('No birds in this selection yet');
});
it('packs six real illustrated silhouettes organically and keeps every bird on canvas',async()=>{
 const available=await import('./masks.json');
 const chosen=Object.keys(available.default).slice(0,6);
 expect(chosen).toHaveLength(6);
 const species=chosen.map(id=>({id,commonName:id,scientificName:id,artworkUrl:`/birds/${id}.png`}));
 const positions=layout(species,true);
 expect(positions).toEqual(layout(species,true));
 expect(positions).toHaveLength(6);
 expect(new Set(positions.map(p=>p.y)).size).toBeGreaterThan(3);
 expect(positions.every(p=>p.x>=0 && p.y>=100 && p.x+p.fullW<=480 && p.y+(p.labelBox?.dy1 ?? p.fullH)<=800)).toBe(true);
 const png=await renderPng({species,showNames:true,width:480,height:800},'public');
 expect(png.length).toBeGreaterThan(20000);
});
it('shows missing artwork explicitly and escapes labels',()=>{
 const svg=renderSvg({width:480,height:800,showNames:false,species:[{id:'a',commonName:'Robin & <friend>',scientificName:'Erithacus rubecula',artworkUrl:null}]});
 expect(svg).toContain('Illustration unavailable');
 expect(svg).toContain('Robin &amp; &lt;friend&gt;');
});
