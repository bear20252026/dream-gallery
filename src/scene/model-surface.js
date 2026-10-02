// 只对模型的地形网格采样，不把人物、草叶或星幕当作脚下地面。
import * as THREE from 'three';
import { EYE_HEIGHT } from '../shared/constants.js';

export function createModelSurface(meshes, eyeHeight = EYE_HEIGHT) {
  for (const mesh of meshes) mesh.updateWorldMatrix(true, false);
  const bounds = new THREE.Box3();
  for (const mesh of meshes) bounds.union(new THREE.Box3().setFromObject(mesh));
  const center = bounds.getCenter(new THREE.Vector3());
  const size = bounds.getSize(new THREE.Vector3());
  const ray = new THREE.Raycaster();
  const origin = new THREE.Vector3(),
    down = new THREE.Vector3(0, -1, 0);

  function height(x, z) {
    origin.set(x, bounds.max.y + 1, z);
    ray.set(origin, down);
    const hit = ray.intersectObjects(meshes, false)[0];
    return hit ? hit.point.y : undefined;
  }
  function place(point, previous = center) {
    const rx = size.x / 2,
      rz = size.z / 2;
    if (!rx || !rz) return null;
    const dx = (point.x - center.x) / rx,
      dz = (point.z - center.z) / rz;
    const distance = Math.hypot(dx, dz),
      scale = distance > 0.9 ? 0.9 / distance : 1;
    const x = center.x + dx * scale * rx,
      z = center.z + dz * scale * rz;
    const ground = height(x, z);
    if (ground !== undefined && ground >= bounds.max.y - size.y * 0.42)
      return { x, y: ground + eyeHeight, z };
    const fallback = height(previous.x, previous.z);
    return fallback !== undefined
      ? { x: previous.x, y: fallback + eyeHeight, z: previous.z }
      : null;
  }
  return { height, place, bounds, center, size };
}
