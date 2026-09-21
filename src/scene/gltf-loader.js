// gltf-loader.js — GLTFLoader 统一工厂(2026-09-20 模型压缩管线配套,审计 v3-P0)
// 全部 GLB 已启用 EXT_meshopt_compression + KHR_mesh_quantization + webp 纹理
// (scripts/optimize 管线产出),因此**所有**加载点必须经本工厂取 loader:
// MeshoptDecoder 只在此处接线一次,漏接的 loader 遇 meshopt 压缩 GLB 会解析失败。
// 新增 GLB 加载点禁止直接 new GLTFLoader(),一律 import { createGLTFLoader }。
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';

export function createGLTFLoader() {
  const loader = new GLTFLoader();
  loader.setMeshoptDecoder(MeshoptDecoder);
  return loader;
}
