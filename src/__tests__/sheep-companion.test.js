import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';
import { prepareSheep } from '../scene/sheep-model.js';
import { sheepVisible, sheepTarget, stepSheep } from '../shared/sheep-companion-logic.mjs';

describe('sheep memory companion', () => {
  it('keeps the sheep inside the box in reality and before the drawing', () => {
    expect(sheepVisible('main', true)).toBe(false);
    expect(sheepVisible('b612', false)).toBe(false);
    expect(sheepVisible('king328', true)).toBe(false);
    for (const world of ['b612', 'king325', 'king326', 'king327'])
      expect(sheepVisible(world, true)).toBe(true);
  });
  it('walks smoothly and waits close by without overshooting', () => {
    const player = { p: { x: 0, z: 0 }, y: 0 };
    const target = sheepTarget(player);
    let p = { x: -2, z: 1 };
    let traveled = 0;
    for (let i = 0; i < 200; i++) {
      const next = stepSheep(p, target, 1 / 60);
      expect(next.travel).toBeLessThanOrEqual(4.2 / 60 + 1e-9);
      traveled += next.travel;
      p = next;
    }
    expect(traveled).toBeGreaterThan(2);
    expect(Math.hypot(p.x - target.x, p.z - target.z)).toBeCloseTo(0.35);
    expect(stepSheep(p, target, 0.05).travel).toBeLessThan(1e-7);
    expect(stepSheep(p, { x: 100, z: 100 }, 10).travel).toBeLessThanOrEqual(0.21 + 1e-9);
    expect(stepSheep(p, { x: 100, z: 100 }, 0.05).catchUp).toBe(true);
  });
  it('rigs the supplied model without changing its outline at rest', async () => {
    const file = readFileSync(new URL('../../models/b612/sheep-companion.glb', import.meta.url));
    const g = await new GLTFLoader()
      .setMeshoptDecoder(MeshoptDecoder)
      .parseAsync(file.buffer.slice(file.byteOffset, file.byteOffset + file.byteLength), '');
    const rig = prepareSheep(g.scene);
    const bounds = new THREE.Box3().setFromObject(rig.pose);
    expect(bounds.min.y).toBeCloseTo(0, 5);
    expect(bounds.max.y).toBeCloseTo(0.72, 5);
    let originalTriangles = 0,
      rigTriangles = 0;
    g.scene.traverse((m) => {
      if (m.isMesh)
        originalTriangles += (m.geometry.index?.count || m.geometry.attributes.position.count) / 3;
    });
    rig.pose.traverse((m) => {
      if (m.isMesh)
        rigTriangles += (m.geometry.index?.count || m.geometry.attributes.position.count) / 3;
    });
    expect(rigTriangles).toBe(originalTriangles);
    rig.animate(Math.PI / 2, 1, 0, 0, 0);
    const feet = rig.pose.children.filter((n) =>
      n.children.some((m) => m.name.startsWith('sheepLeg'))
    );
    expect(feet.length).toBe(4);
    expect(feet[0].rotation.x).toBeGreaterThan(0);
    expect(feet[1].rotation.x).toBeLessThan(0);
    expect(feet[3].rotation.x).toBe(feet[0].rotation.x);
    rig.dispose();
    g.scene.traverse((m) => {
      m.geometry?.dispose();
      m.material?.dispose();
    });
  });
});
