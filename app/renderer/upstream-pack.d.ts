export interface Box { dx0:number;dy0:number;dx1:number;dy1:number }
export interface Tile { fullW:number;fullH:number;mask:{w:number;h:number;cells:number[][]};labelBox:Box|null;labelCells:Box[]|null;x:number;y:number;id:string }
export function maskPack(tiles:Tile[], width:number,height:number,xBias:number,yBias:number,pad:number):Tile[];
