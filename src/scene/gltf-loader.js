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
import { LoadingManager } from 'three';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';

const MODEL_CDN = 'https://cdn.cloudbear.cloud';
const IS_LOCAL = /^(localhost|127\.0\.0\.1)(:\d+)?$/.test(
  typeof location !== 'undefined' ? location.hostname : ''
);
const cdnEnabled = () => !IS_LOCAL && !window.__modelCdnDown;

// URL 重写:models/ 相对路径(或同源绝对路径)→ CDN;外部 URL / 其余资源原样。
// GLTF 内部子资源(scene.bin/贴图)会以 CDN 绝对地址解析,天然走 CDN,无需在此处理。
function rewrite(url) {
  if (!cdnEnabled()) return url;
  const stripped = url.replace(/^https?:\/\/[^/]+/, '');
  if (!/^\/?models\//.test(stripped)) return url;
  if (/^https?:\/\//.test(url)) return url; // 已是绝对地址(别的域/已是 CDN)
  return MODEL_CDN + '/' + stripped.replace(/^\/+/, '');
}

export function createGLTFLoader() {
  const manager = new LoadingManager();
  manager.setURLModifier(rewrite);
  const loader = new GLTFLoader(manager);
  loader.setMeshoptDecoder(MeshoptDecoder);
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
