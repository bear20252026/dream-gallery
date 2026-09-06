// tmp-glb-audit.cjs — GLB 模型体检(一次性,审完即删)
const fs = require('fs');
function audit(file) {
  const buf = fs.readFileSync(file);
  if (buf.readUInt32LE(0) !== 0x46546c67) { console.log(file, ': 不是 GLB'); return; }
  const jsonLen = buf.readUInt32LE(12);
  const json = JSON.parse(buf.toString('utf8', 20, 20 + jsonLen));
  console.log('===== ' + file.split(/[\\/]/).pop() + ' =====');
  console.log('大小', (buf.length / 1048576).toFixed(1) + 'MB', '| generator:', String((json.asset && json.asset.generator) || '?').slice(0, 70));
  console.log('extensionsUsed:', JSON.stringify(json.extensionsUsed || []));
  console.log('extensionsRequired:', JSON.stringify(json.extensionsRequired || []));
  const meshes = json.meshes || [];
  let prims = 0, verts = 0, tris = 0;
  for (const m of meshes)
    for (const p of m.primitives) {
      prims++;
      const pos = p.attributes.POSITION !== undefined ? json.accessors[p.attributes.POSITION] : null;
      if (pos) { verts += pos.count; tris += pos.count / 3; }
    }
  console.log('mesh:', meshes.length, '| prims:', prims, '| 顶点:', verts, '| 三角:', Math.round(tris));
  const mats = json.materials || [];
  console.log('materials(' + mats.length + '):');
  for (const m of mats.slice(0, 14)) {
    const exts = Object.keys(m.extensions || {}).join(',');
    const kind = m.extensions && m.extensions.KHR_materials_pbrSpecularGlossiness ? 'specGloss!' : m.pbrMetallicRoughness ? 'pbrMR' : 'other';
    console.log('  -', m.name || '(noname)', '|', kind, exts ? 'ext:' + exts : '', m.alphaMode ? 'alpha:' + m.alphaMode : '');
  }
  const anims = json.animations || [];
  console.log('animations(' + anims.length + '):', anims.map((a) => a.name || '(noname)').join(', ').slice(0, 220));
  console.log('skins:', (json.skins || []).length, '| nodes:', (json.nodes || []).length, '| textures:', (json.textures || []).length, '| images:', (json.images || []).length, (json.images || []).some((i) => i.uri) ? '(外链贴图!)' : '(贴图内嵌)');
  // 带节点变换的粗包围盒(逐节点 TRS)
  const scene = json.scenes && json.scenes[json.scene || 0];
  const min = [1e9, 1e9, 1e9], max = [-1e9, -1e9, -1e9];
  function compose(n) {
    if (n.matrix) return n.matrix;
    const t = n.translation || [0, 0, 0], r = n.rotation || [0, 0, 0, 1], s = n.scale || [1, 1, 1];
    const [x, y, z, w] = r;
    const m = [
      1 - 2 * (y * y + z * z), 2 * (x * y - z * w), 2 * (x * z + y * w), 0,
      2 * (x * y + z * w), 1 - 2 * (x * x + z * z), 2 * (y * z - x * w), 0,
      2 * (x * z - y * w), 2 * (y * z + x * w), 1 - 2 * (x * x + y * y), 0,
      t[0], t[1], t[2], 1,
    ];
    for (let c = 0; c < 3; c++) for (let r2 = 0; r2 < 3; r2++) m[c * 4 + r2] *= s[r2];
    return m;
  }
  function walk(ni, pm) {
    const n = json.nodes[ni];
    const m = compose(n);
    const abs = pm ? mul(pm, m) : m;
    if (n.mesh !== undefined) {
      for (const p of json.meshes[n.mesh].primitives) {
        const pos = p.attributes.POSITION !== undefined ? json.accessors[p.attributes.POSITION] : null;
        if (!pos || !pos.min) continue;
        for (let i = 0; i < pos.count; i += Math.max(1, Math.floor(pos.count / 400))) {
          // 采样 accessor min/max 均匀盒 8 角(位置 accessor 有 min/max,直接用角点)
        }
        const pts = [];
        for (let i = 0; i < 8; i++) {
          const lx = i & 1 ? pos.max[0] : pos.min[0];
          const ly = i & 2 ? pos.max[1] : pos.min[1];
          const lz = i & 4 ? pos.max[2] : pos.min[2];
          pts.push([lx, ly, lz]);
        }
        for (const [lx, ly, lz] of pts) {
          const w = [0, 0, 0];
          for (let r = 0; r < 3; r++) w[r] = abs[r] * lx + abs[4 + r] * ly + abs[8 + r] * lz + abs[12 + r];
          for (let k = 0; k < 3; k++) { min[k] = Math.min(min[k], w[k]); max[k] = Math.max(max[k], w[k]); }
        }
      }
    }
    (n.children || []).forEach((c) => walk(c, abs));
  }
  function mul(a, b) {
    const o = new Array(16).fill(0);
    for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++) for (let k = 0; k < 4; k++) o[c * 4 + r] += a[k * 4 + r] * b[c * 4 + k];
    return o;
  }
  (scene.nodes || []).forEach((n) => walk(n, null));
  console.log('世界包围盒(计节点变换):', min.map((v) => v.toFixed(2)), '~', max.map((v) => v.toFixed(2)));
  console.log('尺寸: X', (max[0] - min[0]).toFixed(2), 'Y', (max[1] - min[1]).toFixed(2), 'Z', (max[2] - min[2]).toFixed(2));
  // 关键节点名(动画骨骼/根)
  const named = (json.nodes || []).filter((n) => n.name).map((n) => n.name);
  console.log('节点名样例:', named.slice(0, 16).join(', '));
}
audit('C:/Users/17296/Downloads/the_chibi_prince (1).glb');
console.log();
audit('C:/Users/17296/Downloads/piper_pa_18.glb');
