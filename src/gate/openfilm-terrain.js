// gate/openfilm-terrain.js — 开幕电影的地形数学与着色器(2026-11-11 巨型文件拆分:从 openfilm.js 抽离)
// 全部纯函数/纯字符串:不捕获 playOpeningFilm 闭包的可变状态,输入输出明确。
// 抽离原则:逐字搬运,数学常数/shader 文本一字不改,运行期产物逐字节一致。
import * as THREE from 'three';

// 地形噪声(四组正弦叠加)
export function noise2(x, z) {
  return (
    Math.sin(x * 0.013 + 1.7) * Math.cos(z * 0.016 + 0.6) * 7.5 +
    Math.sin(x * 0.045 + z * 0.031 + 2.2) * 3.2 +
    Math.cos(x * 0.021 - z * 0.027 + 4.1) * 4.2 +
    Math.sin(x * 0.093 + z * 0.087) * 1.1
  );
}
// 地形高度(中心平滑压平)
export function heightAt(x, z) {
  const d = Math.hypot(x, z - 40);
  const flat = THREE.MathUtils.smoothstep(d, 26, 90);
  return Math.max(0, noise2(x, z) * flat + flat * 2.2 - 1.2);
}

// 高斯鼓包 / smoothstep 缓动(飞行与折纸用)
export const bump = (x, c, w) => Math.exp(-Math.pow((x - c) / w, 2));
export const ease = (x) => x * x * (3 - 2 * x);

// 水彩漂粒纹理(随机五瓣径向渐变)
export function blobTex(hue) {
  const s = 64,
    c = document.createElement('canvas');
  c.width = c.height = s;
  const x = c.getContext('2d');
  for (let i = 0; i < 5; i++) {
    const r = s * 0.32 * (0.7 + Math.random() * 0.5),
      a = s / 2 + (Math.random() - 0.5) * 8;
    const gr = x.createRadialGradient(a, a, 1, a, a, r);
    gr.addColorStop(0, `hsla(${hue},45%,62%,.55)`);
    gr.addColorStop(1, `hsla(${hue},45%,62%,0)`);
    x.fillStyle = gr;
    x.beginPath();
    x.arc(a, a, r, 0, 7);
    x.fill();
  }
  return new THREE.CanvasTexture(c);
}

// 地形着色器(纸墨语言:等高线 + 网格 + 边缘渐隐)
export const TERRAIN_VERTEX = `varying float vH;varying vec3 vN;varying vec3 vW;
      void main(){vH=position.y;vN=normal;vW=position;
      gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}`;
export const TERRAIN_FRAGMENT = `varying float vH;varying vec3 vN;varying vec3 vW;
      uniform vec3 uInk;
      float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
      void main(){
        float wob=(hash(floor(vW.xz*5.0))-.5)*.9;
        float h=vH+wob;
        vec3 col=mix(vec3(.957,.933,.866),vec3(.930,.890,.796),smoothstep(0.,20.,h));
        float bl=sin(vW.x*.021+3.1)*sin(vW.z*.017+1.3);
        col=mix(col,vec3(.902,.846,.712),bl*.5+.5)*.5+col*.5;
        float band=h/2.6;
        float aa=fwidth(band)*1.4;
        float line=1.0-smoothstep(0.,aa,min(fract(band),1.0-fract(band)));
        line*=mix(.22,1.0,smoothstep(.3,2.5,vH));
        col=mix(col,uInk*.9,line*.42);
        float slope=clamp(1.0-vN.y,0.,1.);
        col=mix(col,vec3(.806,.748,.616),smoothstep(.04,.5,slope)*.55);
        vec2 g=abs(fract(vW.xz/95.0)-.5);
        float grid=1.0-smoothstep(0.,.004,min(g.x,g.y)*2.0/(fwidth(vW.x/95.0)+1e-4));
        col=mix(col,uInk,grid*.10);
        float edge=smoothstep(340.,240.,length(vW.xz));
        col=mix(vec3(.953,.925,.847),col,edge);
        gl_FragColor=vec4(col,1.0);
      }`;
