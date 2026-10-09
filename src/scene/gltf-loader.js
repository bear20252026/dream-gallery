// gltf-loader.js — GLTFLoader 统一工厂(2026-09-20 模型压缩管线配套,审计 v3-P0)
// 全部 GLB 已启用 EXT_meshopt_compression + KHR_mesh_quantization + webp 纹理
// (scripts/optimize 管线产出),因此**所有**加载点必须经本工厂取 loader:
// MeshoptDecoder 只在此处接线一次,漏接的 loader 遇 meshopt 压缩 GLB 会解析失败。
// 新增 GLB 加载点禁止直接 new GLTFLoader(),一律 import { createGLTFLoader }。
//
// 2026-09-24 模型 CDN 加速(主人批准"模型走 R2 CDN"):
//   models/ 已镜像到 R2 桶 gallery-media(scripts/r2-upload-models-rest.cjs),
//   经 https://cdn.cloudbear.cloud/models/... 边缘分发(immutable 一年缓存 + CORS *),
//   源站不再吃模型流量(源站单请求 TTFB 实测 2.3s,是加载慢的主因)。
//   本地开发(localhost)不改写;CDN 失联时本会话自动回退源站(__modelCdnDown)。
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { KTX2Loader } from 'three/examples/jsm/loaders/KTX2Loader.js';
import { LoadingManager } from 'three';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';

const MODEL_CDN = 'https://cdn.cloudbear.cloud';
const IS_LOCAL = /^(localhost|127\.0\.0\.1)(:\d+)?$/.test(
  typeof location !== 'undefined' ? location.hostname : ''
);
const cdnEnabled = () => !IS_LOCAL && !window.__modelCdnDown;

// URL 重写:models/ 相对路径(或同源绝对路径)→ CDN;外部 URL / 其余资源原样。
// GLTF 内部子资源(scene.bin/贴图)会以 CDN 绝对地址解析,天然走 CDN,无需在此处理。
// 新入库、还没镜像到 R2 的模型:直接走源站(否则 CDN 404 会把整局都切回源站,别的大模型变慢)。
// 镜像后(服务器上跑 node scripts/r2-upload-models-rest.cjs hall/b612-world/xxx.glb)从这里删掉即可。
// 2026-10-04:玫瑰/路灯四件真模型已镜像 R2(200 验证),摘出清单;当前清单为空。
const NOT_ON_CDN_YET = new Set([]);
function rewrite(url) {
  if (!cdnEnabled()) return url;
  const stripped = url.replace(/^https?:\/\/[^/]+/, '');
  if (!/^\/?models\//.test(stripped)) return url;
  if (NOT_ON_CDN_YET.has(stripped.replace(/^\/+/, ''))) return url;
  if (/^https?:\/\//.test(url)) return url; // 已是绝对地址(别的域/已是 CDN)
  return MODEL_CDN + '/' + stripped.replace(/^\/+/, '');
}

// KTX2 纹理支持(审查#11,2026-10-08 小流量实验的运行时半边):KTX2Loader 只在 GLB 内
// 出现 .ktx2 纹理时才解析(转码器 wasm 按需拉取,存量 WebP 模型零成本);renderer 依赖
// detectSupport —— 极早调用(window.__ctx 尚未挂)时本帧不带 KTX2,后续 loader 再取。
// 注意 KTX2Loader 需要跨域凭据语义与 CDN 一致:transcoder 从本站 /vendor/basis/ 拉,无跨域问题。
let _ktx2 = null;
function getKTX2() {
  if (_ktx2) return _ktx2;
  const renderer =
    typeof window !== 'undefined' && window.__ctx && window.__ctx.scene && window.__ctx.scene.rnd;
  if (!renderer) return null; // 场景渲染器未就绪;KTX2 纹理的 GLB 不会在这些极早加载点出现
  // 转码器路径:开发(native ESM)= repo vendor/;生产(dist 根)= public/basis/ 拷贝
  _ktx2 = new KTX2Loader()
    .setTranscoderPath(IS_LOCAL ? 'vendor/basis/' : 'basis/')
    .detectSupport(renderer);
  return _ktx2;
}

export function createGLTFLoader() {
  const manager = new LoadingManager();
  manager.setURLModifier(rewrite);
  const loader = new GLTFLoader(manager);
  loader.setMeshoptDecoder(MeshoptDecoder);
  const ktx2 = getKTX2();
  if (ktx2) loader.setKTX2Loader(ktx2);
  // 失败回退:CDN 上的请求一旦报错,标记回退源站并立刻用原 URL 重试一次
  const origLoad = loader.load.bind(loader);
  loader.load = function (url, onLoad, onProgress, onError) {
    const resolved = manager.resolveURL(url);
    const viaCdn = resolved !== url;
    origLoad(resolved, onLoad, onProgress, (err) => {
      if (viaCdn && !window.__modelCdnDown) {
        window.__modelCdnDown = true; // 本会话后续请求全部直连源站
        console.warn('[gltf] CDN 模型失联,本会话回退源站:', url);
        origLoad(url, onLoad, onProgress, onError);
      } else if (onError) {
        onError(err);
      }
    });
  };
  return loader;
}
