// 离线解析 GLB 动画:检查各 track 首尾关键帧是否重复
const https = require('https');
function get(url) {
  return new Promise((res, rej) => {
    https.get(url, (r) => {
      if (r.statusCode >= 300 && r.headers.location) return get(r.headers.location).then(res, rej);
      const cs = [];
      r.on('data', (c) => cs.push(c));
      r.on('end', () => res(Buffer.concat(cs)));
    }).on('error', rej);
  });
}
(async () => {
  const buf = await get('https://cdn.cloudbear.cloud/models/avatar/catwalk/catwalk-loop-378982.glb');
  const jsonLen = buf.readUInt32LE(12);
  const json = JSON.parse(buf.slice(20, 20 + jsonLen).toString());
  const binStart = 20 + jsonLen;
  // bin chunk: len(4)+type(4) at binStart
  const binDataOff = binStart + 8;
  const acc = (idx) => {
    const a = json.accessors[idx];
    const v = json.bufferViews[a.bufferView];
    const off = binDataOff + (v.byteOffset || 0) + (a.byteOffset || 0);
    const comp = { VEC4: 4, VEC3: 3, VEC2: 2, SCALAR: 1 }[a.type];
    return new Float32Array(buf.buffer.slice(buf.byteOffset + off, buf.byteOffset + off + a.count * comp * 4), 0, a.count * comp);
  };
  for (const anim of json.animations) {
    console.log('动画:', anim.name, '| channels:', anim.channels.length, '| samplers:', anim.samplers.length);
    let dup = 0, total = 0;
    for (const s of anim.samplers) {
      const times = acc(s.input);
      const vals = acc(s.output);
      const comp = vals.length / times.length;
      const n = times.length;
      let diff = 0;
      for (let k = 0; k < comp; k++) diff = Math.max(diff, Math.abs(vals[k] - vals[(n - 1) * comp + k]));
      let minGap = Infinity;
      for (let i = 1; i < n; i++) minGap = Math.min(minGap, times[i] - times[i - 1]);
      if (total < 8) {
        console.log(`  t末=${times[n - 1].toFixed(4)} n=${n} minGap=${minGap.toFixed(4)} 首尾差=${diff.toFixed(6)} comp=${comp}`);
      }
      total++;
      if (diff < 1e-4) dup++;
    }
    console.log(`  → samplers 总数 ${total}, 首尾重复 ${dup}`);
  }
})();
