// glb-shapes.cjs — 按 mesh 分组输出 GLB 各部件的世界空间包围盒(含 node 变换)
// 用法: node glb-shapes.cjs <glb路径> [目标直径米数]
const fs = require('fs');
const path = require('path');
const file = process.argv[2];
const TARGET_D = parseFloat(process.argv[3] || '6');
const b = fs.readFileSync(file);
let off = 12, json = null, binStart = -1;
while (off < b.length) {
  const len = b.readUInt32LE(off), t = b.readUInt32LE(off + 4), body = off + 8;
  if (t === 0x4e4f534a) json = JSON.parse(b.slice(body, body + len).toString('utf8'));
  else if (t === 0x004e4942) binStart = body;
  off = body + len + ((4 - (len % 4)) % 4);
  if (json && binStart >= 0) break;
}
const NC = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4 };
const SZ = { 5120: 1, 5121: 1, 5122: 2, 5123: 2, 5125: 4, 5126: 4 };
function rd(a) {
  const vs = json.bufferViews[a.bufferView], c = NC[a.type], e = SZ[a.componentType];
  const st = vs.byteStride || c * e, bs = binStart + (vs.byteOffset || 0) + (a.byteOffset || 0);
  const o = new Float64Array(a.count * c);
  for (let i = 0; i < a.count; i++) {
    const p = bs + i * st;
    for (let k = 0; k < c; k++) {
      const q = p + k * e;
      o[i * c + k] = a.componentType === 5126 ? b.readFloatLE(q)
        : a.componentType === 5125 ? b.readUInt32LE(q)
        : a.componentType === 5123 ? b.readUInt16LE(q)
        : a.componentType === 5122 ? b.readInt16LE(q)
        : a.componentType === 5121 ? b.readUInt8(q) : b.readInt8(q);
    }
  }
  return o;
}
const I = () => [1,0,0,0, 0,1,0,0, 0,0,1,0, 0,0,0,1];
function M(x, y) { const o = new Array(16).fill(0); for (let i=0;i<4;i++) for (let j=0;j<4;j++){ let s=0; for(let k=0;k<4;k++) s+=x[k*4+j]*y[i*4+k]; o[i*4+j]=s; } return o; }
function TRS(t, r, s) {
  const [a, b2, c, d] = r, x2=a+a, y2=b2+b2, z2=c+c, xx=a*x2, xy=a*y2, xz=a*z2, yy=b2*y2, yz=b2*z2, zz=c*z2, wx=d*x2, wy=d*y2, wz=d*z2;
  return [(1-(yy+zz))*s[0], (xy+wz)*s[0], (xz-wy)*s[0], 0,
          (xy-wz)*s[1], (1-(xx+zz))*s[1], (yz+wx)*s[1], 0,
          (xz+wy)*s[2], (yz-wx)*s[2], (1-(xx+yy))*s[2], 0, t[0], t[1], t[2], 1];
}
const AP = (m, v) => [
  m[0]*v[0] + m[4]*v[1] + m[8]*v[2] + m[12],
  m[1]*v[0] + m[5]*v[1] + m[9]*v[2] + m[13],
  m[2]*v[0] + m[6]*v[1] + m[10]*v[2] + m[14],
];

const res = {};
function walk(i, p) {
  const n = json.nodes[i];
  let m = p;
  if (n.matrix) m = M(p, n.matrix);
  else m = M(p, TRS(n.translation || [0,0,0], n.rotation || [0,0,0,1], n.scale || [1,1,1]));
  if (n.mesh !== undefined) {
    const mname = json.meshes[n.mesh].name;
    json.meshes[n.mesh].primitives.forEach((pr, pi) => {
      const pa = pr.attributes.POSITION;
      if (pa === undefined) return;
      const pos = rd(json.accessors[pa]);
      const key = `${mname}#${n.mesh}.${pi}`;
      const r = res[key] || (res[key] = { mn:[1e9,1e9,1e9], mx:[-1e9,-1e9,-1e9], n:0, hasUV:false, mat:null });
      if (pr.attributes.TEXCOORD_0 !== undefined) r.hasUV = true;
      if (pr.material !== undefined) {
        const mt = json.materials[pr.material] || {};
        const pbr = mt.pbrMetallicRoughness || {};
        const sg = mt.extensions && mt.extensions.KHR_materials_pbrSpecularGlossiness;
        r.mat = {
          name: mt.name,
          rgba: pbr.baseColorFactor || (sg && sg.diffuseFactor) || null,
          metal: pbr.metallicFactor, rough: pbr.roughnessFactor,
          tex: !!(pbr.baseColorTexture || (sg && sg.diffuseTexture)),
          alphaMode: mt.alphaMode || 'OPAQUE',
          doubleSided: !!mt.doubleSided,
        };
      }
      for (let k = 0; k < pos.length; k += 3) {
        const w = AP(m, [pos[k], pos[k+1], pos[k+2]]);
        r.n++;
        for (let d = 0; d < 3; d++) { if (w[d] < r.mn[d]) r.mn[d] = w[d]; if (w[d] > r.mx[d]) r.mx[d] = w[d]; }
      }
    });
  }
  (n.children || []).forEach(c => walk(c, m));
}
(json.scenes[json.scene || 0].nodes || [0]).forEach(r => walk(r, I()));

// 用「主体」(顶点最多的)定缩放比例与地面基准
let mainKey = null, mainN = 0;
for (const k in res) if (res[k].n > mainN) { mainN = res[k].n; mainKey = k; }
const mainDia = Math.max(res[mainKey].mx[0]-res[mainKey].mn[0], res[mainKey].mx[2]-res[mainKey].mn[2]);
const S = TARGET_D / mainDia;
const gMinY = Math.min(...Object.values(res).map(r => r.mn[1]));

console.log(`文件: ${path.basename(file)}   基准部件: ${mainKey} (直径 ${mainDia.toFixed(1)} 单位 → 缩放到 ${TARGET_D}m, 比例 ${S.toFixed(5)})`);
console.log(`世界最低点 Y = ${gMinY.toFixed(1)} (以下高度均以该点为 0)\n`);

for (const k in res) {
  const r = res[k];
  const W = (r.mx[0]-r.mn[0])*S, H = (r.mx[1]-r.mn[1])*S, D = (r.mx[2]-r.mn[2])*S;
  const cx = (r.mn[0]+r.mx[0])/2, cz = (r.mn[2]+r.mx[2])/2;
  const y0 = (r.mn[1]-gMinY)*S, y1 = (r.mx[1]-gMinY)*S;
  console.log(`${k}`);
  console.log(`  顶点 ${r.n.toLocaleString()}   UV: ${r.hasUV ? '有' : '无'}   ${W.toFixed(2)}m宽 × ${H.toFixed(2)}m高 × ${D.toFixed(2)}m深`);
  console.log(`  高度 y ${y0.toFixed(2)} ~ ${y1.toFixed(2)} m   距池心水平 ${(Math.hypot(cx,cz)*S).toFixed(2)} m`);
  if (r.mat) {
    const m = r.mat;
    console.log(`  材质 "${m.name}"  RGBA=${JSON.stringify(m.rgba)}  metal=${m.metal} rough=${m.rough} 贴图=${m.tex?'有':'无'} alphaMode=${m.alphaMode} 双面=${m.doubleSided}`);
  }
  console.log('');
}
