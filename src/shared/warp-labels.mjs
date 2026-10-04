// warp-labels.mjs — 星流过场中心浮现的目的地名与色调(纯数据,单测可测)
import { PLANETS } from './planet-logic.mjs';

/** @returns {{label:{en:string,zh:string}, color:string}|null} */
export function warpDest(world) {
  if (world === 'main')
    return { label: { en: 'Earth · the desert', zh: '地球 · 沙漠' }, color: '#e8c98a' };
  if (world === 'b612')
    return { label: { en: 'Asteroid B612', zh: 'B612 号小行星' }, color: '#d98a6a' };
  const p = PLANETS.find((x) => 'king' + x.num === world);
  if (p) return { label: { en: p.num + ' · ' + p.en, zh: p.num + ' · ' + p.name }, color: p.color };
  return null;
}
