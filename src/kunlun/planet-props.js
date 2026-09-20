// planet-props.js — 六星球章节道具建造(2026-09-20 自 planets.js 拆分,审计「大文件拆分」)
// 纯工厂:传入 box(w,h,d,hex)/cyl(r顶,r底,h,hex) 建造器、章节序号与岛顶高度,返回道具组
// (0 国王王座+披风 / 1 虚荣高镜 / 2 酒鬼酒瓶 / 3 商人账桌星环 / 4 点灯人路灯 / 5 地理学家书堆地球仪)。
import * as THREE from 'three';

export function buildChapterProps(idx, box, cyl, topY) {
  // ---- 章节道具 ----
  const props = new THREE.Group();
  props.position.y = topY;
  if (idx === 0) {
    // 国王:王座+披风
    const seat = box(1.6, 0.9, 1.4, 0x7a5a34);
    seat.position.set(0, 0.45, 0);
    const back = box(1.6, 2.6, 0.3, 0x6b4c2c);
    back.position.set(0, 1.7, -0.65);
    const armL = box(0.25, 0.7, 1.3, 0x7a5a34);
    armL.position.set(-0.85, 0.85, 0);
    const armR = armL.clone();
    armR.position.x = 0.85;
    const cape = new THREE.Mesh(
      new THREE.CylinderGeometry(0.2, 1.5, 2.6, 10, 1, true),
      new THREE.MeshBasicMaterial({ color: 0x9a2c2c, side: THREE.DoubleSide })
    );
    cape.position.set(0, 1.4, -1.5);
    props.add(seat, back, armL, armR, cape);
  } else if (idx === 1) {
    // 虚荣:高镜
    const frame = box(1.5, 3.4, 0.14, 0x8a6a4a);
    frame.position.set(0, 1.7, 0);
    const glass = box(1.2, 3.0, 0.05, 0xd8e4ea);
    glass.position.set(0, 1.7, 0.06);
    const foot = box(1.1, 0.3, 0.7, 0x6b4c2c);
    foot.position.set(0, 0.15, 0);
    props.add(frame, glass, foot);
  } else if (idx === 2) {
    // 酒鬼:三只歪酒瓶
    for (let i = 0; i < 3; i++) {
      const bottle = new THREE.Group();
      const bd = cyl(0.22, 0.26, 0.9, 0x3a5a3a);
      bd.position.y = 0.45;
      const neck = cyl(0.07, 0.14, 0.4, 0x3a5a3a);
      neck.position.y = 1.05;
      bottle.add(bd, neck);
      bottle.position.set(Math.cos(i * 2.1) * 1.3, 0, Math.sin(i * 2.1) * 1.3);
      bottle.rotation.z = (i - 1) * 0.5;
      props.add(bottle);
    }
  } else if (idx === 3) {
    // 商人:账桌+纸+头顶三道星环(数过的星星锁进环)
    const desk = box(2.2, 0.12, 1.1, 0x6b4c2c);
    desk.position.set(0, 1.0, 0);
    const legL = box(0.14, 1.0, 0.9, 0x5a3f24);
    legL.position.set(-0.9, 0.5, 0);
    const legR = legL.clone();
    legR.position.x = 0.9;
    const paper = box(0.6, 0.02, 0.8, 0xefe5cc);
    paper.position.set(0.2, 1.08, 0.1);
    paper.rotation.y = 0.4;
    props.add(desk, legL, legR, paper);
    for (let i = 0; i < 3; i++) {
      const ring = new THREE.Mesh(
        new THREE.TorusGeometry(3.2 + i * 0.5, 0.04, 8, 64),
        new THREE.MeshBasicMaterial({ color: 0xd8c8a0, transparent: true, opacity: 0.4 })
      );
      ring.rotation.x = Math.PI / 2;
      ring.position.y = 2.4 + i * 0.12;
      props.add(ring);
    }
  } else if (idx === 4) {
    // 点灯人:路灯(真亮灭,2.4s 周期)
    const post = cyl(0.09, 0.12, 3.4, 0x3a3a44);
    post.position.set(0, 1.7, 0);
    const head = new THREE.Mesh(
      new THREE.SphereGeometry(0.42, 16, 12),
      new THREE.MeshBasicMaterial({ color: 0xffe9b0 })
    );
    head.position.set(0, 3.6, 0);
    props.add(post, head);
    props.userData.lampHead = head; // 主循环交替亮灭
  } else {
    // 地理学家:书堆+星球仪+摊开的地图
    const b1 = box(1.1, 0.22, 0.8, 0x8a4a3a);
    b1.position.set(0, 0.11, 0);
    const b2 = box(1.0, 0.2, 0.72, 0x3a5a7a);
    b2.position.set(0.06, 0.32, 0.05);
    b2.rotation.y = 0.3;
    const b3 = box(0.9, 0.18, 0.66, 0x5a6b3a);
    b3.position.set(-0.04, 0.51, -0.03);
    b3.rotation.y = -0.2;
    const globe = new THREE.Mesh(
      new THREE.SphereGeometry(0.5, 20, 14),
      new THREE.MeshBasicMaterial({ color: 0x7aa8c8 })
    );
    globe.position.set(1.3, 0.62, -0.2);
    const map = box(1.8, 0.02, 1.2, 0xefe5cc);
    map.position.set(-1.2, 0.02, 0.6);
    map.rotation.y = 0.5;
    props.add(b1, b2, b3, globe, map);
  }
  return props;
}
