import { expect, it } from 'vitest';
import { SOUNDS } from '../../src/audio/sounds';
import { renderSfx } from '../../src/audio/sfxr';

it('Kirin has an audible lightning crack and sustained thunder tail',()=>{
  const rate=22050,samples=renderSfx(SOUNDS.kirinExplosion,rate);
  const rms=(start:number,end:number)=>{
    const slice=samples.subarray(Math.floor(start*rate),Math.floor(end*rate));
    return Math.sqrt(slice.reduce((sum,n)=>sum+n*n,0)/slice.length);
  };
  expect(samples.length/rate).toBeGreaterThan(1.2);
  expect(rms(.005,.1)).toBeGreaterThan(.15);
  expect(rms(.7,1)).toBeGreaterThan(.015);
  expect(samples.every(n=>Number.isFinite(n)&&Math.abs(n)<=1)).toBe(true);
});
