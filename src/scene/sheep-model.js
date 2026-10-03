import * as THREE from 'three';

// 原资产没有骨架。保留作者网格和材质，按已有头部/四腿制作轻量程序动作。
export function prepareSheep(source) {
  source.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(source, true);
  const center = box.getCenter(new THREE.Vector3());
  const scale = 0.72 / (box.max.y - box.min.y);
  const normalize = new THREE.Matrix4().makeScale(scale, scale, scale);
  normalize.setPosition(-center.x * scale, -box.min.y * scale, -center.z * scale);
  const pose = new THREE.Group();
  const head = new THREE.Group();
  head.position.set(0, 0.48, 0.2);
  pose.add(head);
  const legs = Array.from({ length: 4 }, (_, i) => {
    const leg = new THREE.Group();
    leg.position.set(i % 2 ? 0.085 : -0.085, 0.29, i < 2 ? 0.11 : -0.11);
    pose.add(leg);
    return leg;
  });
  const materials = new Map();
  source.traverse((node) => {
    if (!node.isMesh) return;
    if (!materials.has(node.material)) {
      const material = node.material.clone();
      // 珍珠般的微光表现“想象投影”，不增加光源或改动原星球。
      material.emissive?.setHex(0x352c21);
      material.emissiveIntensity = 0.12;
      materials.set(node.material, material);
    }
    const material = materials.get(node.material);
    let geo = node.geometry.clone();
    // 发布资产的量化属性先解码为浮点，矩阵变换不能写回归一整数缓冲。
    for (const [name, attr] of Object.entries(geo.attributes)) {
      if (!attr.normalized && attr.array instanceof Float32Array) continue;
      const values = new Float32Array(attr.count * attr.itemSize);
      const getters = ['getX', 'getY', 'getZ', 'getW'];
      for (let i = 0; i < attr.count; i++)
        for (let k = 0; k < attr.itemSize; k++) values[i * attr.itemSize + k] = attr[getters[k]](i);
      geo.setAttribute(name, new THREE.BufferAttribute(values, attr.itemSize));
    }
    geo.applyMatrix4(new THREE.Matrix4().multiplyMatrices(normalize, node.matrixWorld));
    if (/^Legs_/.test(node.name)) {
      if (geo.index) {
        const expanded = geo.toNonIndexed();
        geo.dispose();
        geo = expanded;
      }
      const vertices = Array.from({ length: 4 }, () => []);
      const pos = geo.attributes.position;
      for (let i = 0; i < pos.count; i += 3) {
        const x = (pos.getX(i) + pos.getX(i + 1) + pos.getX(i + 2)) / 3;
        const z = (pos.getZ(i) + pos.getZ(i + 1) + pos.getZ(i + 2)) / 3;
        vertices[(z < 0 ? 2 : 0) + (x > 0 ? 1 : 0)].push(i, i + 1, i + 2);
      }
      vertices.forEach((indices, i) => {
        const part = new THREE.BufferGeometry();
        for (const [name, attr] of Object.entries(geo.attributes)) {
          const values = new Float32Array(indices.length * attr.itemSize);
          indices.forEach((index, j) => {
            for (let k = 0; k < attr.itemSize; k++)
              values[j * attr.itemSize + k] = attr.array[index * attr.itemSize + k];
          });
          part.setAttribute(name, new THREE.BufferAttribute(values, attr.itemSize));
        }
        part.translate(-legs[i].position.x, -legs[i].position.y, -legs[i].position.z);
        const mesh = new THREE.Mesh(part, material);
        mesh.name = 'sheepLeg' + i + '_' + node.name;
        legs[i].add(mesh);
      });
      geo.dispose();
    } else {
      const isHead = /^(Head|Eyes|Ear|Nose)_/.test(node.name);
      if (isHead) geo.translate(-head.position.x, -head.position.y, -head.position.z);
      const mesh = new THREE.Mesh(geo, material);
      mesh.name = node.name;
      (isHead ? head : pose).add(mesh);
    }
  });
  return {
    pose,
    animate(phase, walk, time, reaction, sitting) {
      pose.position.y =
        -sitting * 0.11 + Math.sin(time * 2.2) * 0.006 + Math.abs(Math.sin(phase)) * walk * 0.018;
      pose.rotation.z = Math.sin(phase) * walk * 0.025;
      head.rotation.z = Math.sin(time * 2.5) * reaction * 0.17;
      head.rotation.x = -sitting * 0.12 + Math.sin(time * 3) * reaction * 0.08;
      legs.forEach((leg, i) => {
        const diagonal = i === 0 || i === 3 ? 1 : -1;
        leg.rotation.x =
          Math.sin(phase) * walk * 0.52 * diagonal + sitting * (i < 2 ? -0.85 : 0.85);
      });
    },
    dispose() {
      pose.traverse((node) => node.geometry?.dispose());
      materials.forEach((m) => m.dispose());
    },
  };
}
