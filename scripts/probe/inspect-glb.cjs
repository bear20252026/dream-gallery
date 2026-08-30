// 检查 GLB 的动画/骨骼/网格数据(用完即删)
const fs = require('fs');
const path = require('path');

const file = process.argv[2];
const buf = fs.readFileSync(file);
const jsonLen = buf.readUInt32LE(12);
const json = JSON.parse(buf.slice(20, 20 + jsonLen).toString('utf8'));

console.log('文件:', path.basename(file), (buf.length / 1024 / 1024).toFixed(2) + 'MB');
console.log('animations:', (json.animations || []).length);
(json.animations || []).forEach((a, i) => {
  // 动画时长需从 sampler input accessor 的 min/max 读
  let dur = 0;
  if (a.samplers && a.samplers.length) {
    let mn = Infinity, mx = -Infinity;
    a.samplers.forEach((s) => {
      const acc = json.accessors[s.input];
      if (acc && acc.min && acc.max) {
        mn = Math.min(mn, acc.min[0]);
        mx = Math.max(mx, acc.max[0]);
      }
    });
    if (mn !== Infinity) dur = mx - mn;
  }
  console.log(`  [${i}] ${a.name}: ${a.channels.length} channels, ${a.samplers.length} samplers, 时长 ${dur.toFixed(3)}s`);
});
const skin = (json.skins || [])[0];
console.log('skins:', (json.skins || []).length, skin ? 'joints=' + skin.joints.length : '');
console.log('meshes:', (json.meshes || []).length);
console.log('nodes:', (json.nodes || []).length);
console.log('materials:', (json.materials || []).length);
console.log('images:', (json.images || []).length);
console.log('extensionsUsed:', (json.extensionsUsed || []).join(', ') || '(无)');

// 检查每个 primitive 的 JOINTS_0 分量数(判断每顶点几个骨骼权重)
(json.meshes || []).forEach((m, mi) => {
  m.primitives.forEach((p, pi) => {
    const j = p.attributes.JOINTS_0;
    const pos = p.attributes.POSITION;
    const acc = json.accessors[j];
    console.log(`  mesh[${mi}].prim[${pi}] 顶点=${pos ? json.accessors[pos].count : '?'} JOINTS_0 类型=${acc ? acc.componentType + 'x' + acc.type : '无'}`);
  });
});
