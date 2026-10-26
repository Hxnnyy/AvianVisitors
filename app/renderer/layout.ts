import { maskPack, type Tile } from './upstream-pack.js';
import masks from './masks.json';
import type { Species } from '../shared/contracts';
interface Mask {width:number;height:number;w:number;h:number;cells:number[][]}
const silhouettes: Record<string,Mask> = masks;
export function layout(species:Species[],showNames:boolean):Tile[] {
 const count=species.length;
 if(!count) return [];
 let size=1;
 for(let attempt=0;attempt<12;attempt++) {
  const tiles=species.map(bird=>{
   const silhouette=bird.artworkUrl ? silhouettes[bird.id] : undefined;
   if(bird.artworkUrl && !silhouette) throw new Error(`No layout silhouette for ${bird.id}; regenerate renderer masks`);
   const mask=silhouette ?? {w:1,h:1,cells:[[0,0]],width:1.4,height:1};
   const ratio=mask.width/mask.height;
   const area=440*620*(count<=4?0.46:0.40)/count;
   const fullW=Math.sqrt(area*ratio)*size,fullH=fullW/ratio;
   const label=showNames || !bird.artworkUrl ? {dx0:0,dy0:fullH+3,dx1:Math.max(fullW,bird.commonName.length*9),dy1:fullH+28} : null;
   return {id:bird.id,fullW,fullH,mask,labelBox:label,labelCells:label?[label]:null,x:0,y:0};
  });
  const placed=maskPack(tiles,440,620,1,1.7,2);
  if(placed.every(t=>t.x>=0 && t.y>=0 && t.x+t.fullW<=440 && t.y+(t.labelBox?.dy1 ?? t.fullH)<=620)) {
   const left=Math.min(...placed.map(t=>t.x)),right=Math.max(...placed.map(t=>t.x+Math.max(t.fullW,t.labelBox?.dx1 ?? 0)));
   const top=Math.min(...placed.map(t=>t.y)),bottom=Math.max(...placed.map(t=>t.y+(t.labelBox?.dy1 ?? t.fullH)));
   return placed.map(t=>({...t,x:t.x+20+(440-left-right)/2,y:t.y+110+(620-top-bottom)/2}));
  }
  size*=0.9;
 }
 throw new Error('Could not fit all selected species in the portrait collage');
}
