// 构建后压缩 sw.js(Service Worker 单独文件,不在 vite 处理范围内)
const fs = require('fs');
const path = require('path');
const { minify } = require('terser');

const SRC = path.resolve('public/sw.js');
const DST = path.resolve('public/sw.min.js');

if (!fs.existsSync(SRC)) { console.error('找不到 public/sw.js'); process.exit(1); }

const src = fs.readFileSync(SRC, 'utf8');
minify(src, { compress: { drop_debugger: true, passes: 2 }, mangle: { toplevel: true }, output: { comments: false } })
  .then(out => {
    fs.writeFileSync(DST, out.code);
    console.log('已压缩: ' + out.code.length + ' 字节');
  })
  .catch(e => { console.error(e); process.exit(1); });