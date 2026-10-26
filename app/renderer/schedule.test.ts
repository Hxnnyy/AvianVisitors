import { describe, expect, it } from 'vitest';
import { selectSpecies, londonWeek } from './schedule';
import type { CollectionEntry } from '../shared/contracts';
const entry = (id: string, capturedAt: string): CollectionEntry => ({species:{id, commonName:id,scientificName:id,artworkUrl:null},sightings:[{id,captureId:id,speciesId:id,identifiedBy:'user',capturedAt,createdAt:capturedAt,location:{latitude:0,longitude:0}}]});
describe('frame selection',()=>{
 it('starts Monday in London, including summer UTC Sunday',()=>{
  expect(londonWeek(new Date('2026-07-05T23:30:00Z'))).toBe('2026-07-06');
  expect(selectSpecies([entry('old','2026-07-05T22:59:00Z'),entry('new','2026-07-05T23:01:00Z')],{mode:'week',speciesIds:[],showNames:true},new Date('2026-07-06T12:00:00Z')).map(s=>s.id)).toEqual(['new']);
 });
 it('rotates broad coverage hourly, without duplicate species',()=>{
  const entries=Array.from({length:9},(_,i)=>entry(String(i),'2026-01-01T00:00:00Z'));
  const settings={mode:'all-time' as const,speciesIds:[],showNames:true};
  const a=selectSpecies(entries,settings,new Date(0));
  const b=selectSpecies(entries,settings,new Date(3600000));
  expect(a.map(s=>s.id)).toEqual(['0','1','2','3','4','5']);
  expect(b.map(s=>s.id)).toEqual(['6','7','8','0','1','2']);
 });
 it('manual selection removes missing species and deduplicates',()=>{
  expect(selectSpecies([entry('a','2020-01-01')],{mode:'manual',speciesIds:['missing','a','a'],showNames:true},new Date()).map(s=>s.id)).toEqual(['a']);
 });
});
