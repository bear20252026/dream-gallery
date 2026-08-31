// normalize-glb.mjs — 用 SDK 读取并重写,标准化 GLB 字节布局(消除手写 GLB 的小瑕疵)
import fs from 'fs';
import { NodeIO } from '@gltf-transform/core';
const [,, inPath, outPath] = process.argv;
const io = new NodeIO();
const doc = await io.read(inPath);
await io.write(outPath, doc);
console.log(`标准化: ${inPath} → ${outPath} ${(fs.statSync(outPath).size / 1048576).toFixed(2)}MB`);