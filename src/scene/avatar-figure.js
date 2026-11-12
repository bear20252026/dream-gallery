// avatar-figure.js — 第三人称玩家小人:有四肢、比例正常、可关节驱动(2026-11-12 角色)
//
// 治「比例怪」:原先的小人是 CapsuleGeometry(0.28, 0.7) 身体 + SphereGeometry(0.22) 头
// (player.js:49-56)—— 头半径 0.22 对身体半径 0.28,几乎一样宽,像个没脖子的雪人;
// 而且**完全没有四肢**,所以既谈不上比例,也谈不上动作。
//
// 本版按 1.7m 身高重新分配(与 EYE_HEIGHT=1.6 / 相机看胸口 footY+0.85 的既有契约对齐):
//   头顶 1.70 · 头心 1.55 · 颈 1.40 · 肩 1.36 · 髋 0.86 · 膝 0.45 · 脚底 0
//   头宽 0.26(直径)对肩宽 0.42 ⇒ 约 1:1.6,是正常少年比例(原先是 1:1.27 的雪人)
//   腿长 0.86 ≈ 身高的一半 —— 原先胶囊身体从 0.12 直筒到 1.38,没有腿的概念
//
// 结构:每个可动部位都是独立 Group(关节),网格挂在关节下并**向下偏移**,
// 于是旋转 Group 就是绕关节转(而不是绕网格中心自转)。这是能做步态的前提。
//
// ⚠️ 零新增灯光(core/light-budget.js 硬约束):要发光就用 emissive,照 sheep-model.js:26 的办法。
// ⚠️ 无顶层副作用:全部在工厂函数里建,便于 node 环境单测。
// ⚠️ 必须仍是**一个可整体 reparent 的 Object3D**:core/scene-manager.js 会把 avatar
//    在世界之间搬来搬去,holder 语义不能破(kunlun/avatar.js:183 同款)。

import * as THREE from 'three';
import { gaitPose } from '../shared/avatar-gait.mjs';

/** 身高与各关节高度(米)——单一源,改这里整体等比生效 */
export const FIG = {
  height: 1.7,
  headY: 1.55,
  headR: 0.13,
  neckY: 1.4,
  shoulderY: 1.36,
  // 肩关节横向位置必须 > 躯干半宽(0.14×1.22≈0.171),否则整条手臂埋在躯干里看不见
  shoulderX: 0.2,
  hipY: 0.86,
  hipX: 0.1,
  upperArm: 0.3,
  foreArm: 0.27,
  thigh: 0.41,
  shin: 0.45,
};

/**
 * 建一个带关节的小人。
 * @returns {{root: THREE.Group, joints: {spine: THREE.Group, head: THREE.Group, shoulderL: THREE.Group, shoulderR: THREE.Group, elbowL: THREE.Group, elbowR: THREE.Group, hipL: THREE.Group, hipR: THREE.Group, kneeL: THREE.Group, kneeR: THREE.Group}, apply: (pose: ReturnType<typeof gaitPose>) => void, dispose: () => void}}
 */
export function createAvatarFigure() {
  const root = new THREE.Group();
  root.name = 'avatarFigure';

  // 配色沿用原先的粉色系(主人已看惯),但拆成衣/肤/发三层,不再是一坨同色
  const skinMat = new THREE.MeshStandardMaterial({ color: 0xffe0d0, roughness: 0.62 });
  const clothMat = new THREE.MeshStandardMaterial({ color: 0xffb6c8, roughness: 0.66 });
  const legMat = new THREE.MeshStandardMaterial({ color: 0x8a6a7a, roughness: 0.7 });
  const hairMat = new THREE.MeshStandardMaterial({ color: 0xf7d98a, roughness: 0.55 });
  const mats = [skinMat, clothMat, legMat, hairMat];

  // ── 躯干(脊柱关节在髋部,前倾/侧倾由它带动整个上身)──
  const spine = new THREE.Group();
  spine.position.y = FIG.hipY;
  root.add(spine);
  // 上身躯干:上宽下窄的胶囊,长度 = 髋到肩
  const torsoLen = FIG.shoulderY - FIG.hipY;
  // ⚠️ CapsuleGeometry 总高 = length + 2r。取 length=torsoLen 会让躯干实际
  // 上下各外扩 0.15 ⇒ 下摆垂到髋下 0.15、顶端顶过头颈,实测「躯干过长、手臂被吞没」。
  // 正确做法:柱段 = 间距 - 2r,这样**总高恰好等于关节间距**,两端半球正好收在髋与肩。
  // 柱段 = 间距 - r:顶端收在肩线,底端探过髋关节 r ⇒ 与骨盆球重叠,腰处不断开
  const torsoR = 0.14;
  const torso = new THREE.Mesh(
    new THREE.CapsuleGeometry(torsoR, Math.max(0.05, torsoLen - torsoR), 6, 12),
    clothMat
  );
  torso.position.y = torsoLen * 0.5;
  torso.scale.set(1.22, 1, 0.8); // 略扁:人是前后薄左右宽,不是圆柱
  spine.add(torso);
  // 髋部(与腿衔接,避免上下身之间出现缝)
  const pelvis = new THREE.Mesh(new THREE.SphereGeometry(0.14, 12, 8), legMat);
  pelvis.scale.set(1.1, 0.7, 0.85);
  spine.add(pelvis);

  // ── 颈 + 头(头关节独立,可抵消躯干前倾保持视线水平)──
  const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.05, 0.08, 8), skinMat);
  neck.position.y = FIG.neckY - FIG.hipY;
  spine.add(neck);
  const head = new THREE.Group();
  head.position.y = FIG.headY - FIG.hipY;
  spine.add(head);
  const skull = new THREE.Mesh(new THREE.SphereGeometry(FIG.headR, 16, 12), skinMat);
  skull.scale.set(0.95, 1.08, 1); // 略立蛋形,比正球更像头
  head.add(skull);
  // 头发:半球罩在头顶偏后,给轮廓一点起伏(原先是个光球)
  const hair = new THREE.Mesh(
    new THREE.SphereGeometry(FIG.headR * 1.06, 16, 12, 0, Math.PI * 2, 0, Math.PI * 0.62),
    hairMat
  );
  hair.position.set(0, 0.012, 0.012);
  head.add(hair);
  // 面向指示:保留原先的鼻尖(玩家靠它辨认朝向),但缩小并前移到脸面
  const nose = new THREE.Mesh(new THREE.ConeGeometry(0.022, 0.05, 8), skinMat);
  nose.rotation.x = -Math.PI / 2; // 模型正面朝 -Z(与 loop-manager 的 yaw+π 约定一致)
  nose.position.set(0, -0.01, -FIG.headR * 0.98);
  head.add(nose);

  /**
   * 建一条两段式肢体(肩→肘 / 髋→膝)。
   * 关节 Group 在根部,网格向下偏移半长 ⇒ 旋转关节即绕根摆动。
   */
  function limb(parent, x, y, upperLen, lowerLen, rUp, rLo, matUp, matLo) {
    const upper = new THREE.Group();
    upper.position.set(x, y, 0);
    parent.add(upper);
    // ⚠️ CapsuleGeometry 总高 = length + 2r。上段取 length = upperLen - rUp:
    // 顶端半球正好收在**上关节**(肩/髋)上,底端半球探过**下关节** rUp ⇒ 与下段重叠,
    // 膝盖/肘部不会出现断缝。三次实测校准:
    //   0.7 倍 ⇒ 两端都短,膝盖露缝;满间距 ⇒ 上下各外扩 r,躯干吞手臂;
    //   减 2r ⇒ 底端只到关节平面,与下段顶端相切,摆动时又露缝。
    const upMesh = new THREE.Mesh(
      new THREE.CapsuleGeometry(rUp, Math.max(0.02, upperLen - rUp), 4, 8),
      matUp
    );
    upMesh.position.y = -upperLen * 0.5;
    upper.add(upMesh);
    const lower = new THREE.Group();
    lower.position.y = -upperLen;
    upper.add(lower);
    // 下段:顶端半球探过**上关节** rLo(与上段重叠,关节不断),
    // 底端正好收在 -lowerLen(踝/腕),交给脚盒/手球收口,不戳出地面。
    const loMesh = new THREE.Mesh(
      new THREE.CapsuleGeometry(rLo, Math.max(0.02, lowerLen - rLo), 4, 8),
      matLo
    );
    loMesh.position.y = -lowerLen * 0.5 + rLo * 0.5;
    lower.add(loMesh);
    return { upper, lower, loMesh };
  }

  // 臂:挂在脊柱上(躯干前倾时手臂跟着走,不会留在原地)
  const armL = limb(
    spine,
    -FIG.shoulderX,
    FIG.shoulderY - FIG.hipY,
    FIG.upperArm,
    FIG.foreArm,
    0.045,
    0.038,
    clothMat,
    skinMat
  );
  const armR = limb(
    spine,
    FIG.shoulderX,
    FIG.shoulderY - FIG.hipY,
    FIG.upperArm,
    FIG.foreArm,
    0.045,
    0.038,
    clothMat,
    skinMat
  );
  // 手:小球收口,免得手臂末端是个平切面
  for (const a of [armL, armR]) {
    const hand = new THREE.Mesh(new THREE.SphereGeometry(0.045, 8, 6), skinMat);
    hand.position.y = -FIG.foreArm;
    a.lower.add(hand);
  }

  // 腿:挂在 root 上(髋不随躯干前倾而转,否则站立前倾会把腿也带歪)
  const legL = limb(root, -FIG.hipX, FIG.hipY, FIG.thigh, FIG.shin, 0.062, 0.05, legMat, legMat);
  const legR = limb(root, FIG.hipX, FIG.hipY, FIG.thigh, FIG.shin, 0.062, 0.05, legMat, legMat);
  // 脚:扁盒朝前(-Z),给落地一个明确的接触面。
  // ⚠️ 脚底必须恰好落在 y=0(局部坐标)—— 主循环把 root 放在 footY(贴地高度),
  //    任何负值都会让脚陷进沙里。小腿胶囊底端在 -shin-rShin,所以脚盒中心取
  //    -(shin - 0.025) 使其底面 = -shin = 小腿柱段末端,胶囊半球被脚盒包住。
  for (const l of [legL, legR]) {
    const foot = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.05, 0.18), legMat);
    foot.position.set(0, -FIG.shin + 0.025, -0.04);
    l.lower.add(foot);
  }

  const joints = {
    spine,
    head,
    shoulderL: armL.upper,
    shoulderR: armR.upper,
    elbowL: armL.lower,
    elbowR: armR.lower,
    hipL: legL.upper,
    hipR: legR.upper,
    kneeL: legL.lower,
    kneeR: legR.lower,
  };

  /**
   * 把步态角度落到关节上(由主循环每帧调用)。
   * @param {ReturnType<typeof gaitPose>} p gaitPose 的返回
   */
  function apply(p) {
    // 起伏只动 root.y 的**偏移**,绝对高度仍由主循环写(脚底贴地契约不变)
    root.userData.bob = p.bob;
    spine.rotation.x = p.spineX;
    spine.rotation.z = p.spineZ;
    head.rotation.x = p.headX;
    head.rotation.z = p.headZ;
    // 腿:髋绕 X 前后摆;膝单向屈曲(负号 = 小腿往后折,符合人的膝关节方向)
    joints.hipL.rotation.x = p.hipL;
    joints.hipR.rotation.x = p.hipR;
    joints.kneeL.rotation.x = -p.kneeL;
    joints.kneeR.rotation.x = -p.kneeR;
    // 臂:肩绕 X 摆 + 一点外张(避免手臂穿进躯干);肘微屈
    joints.shoulderL.rotation.x = p.shoulderL;
    joints.shoulderR.rotation.x = p.shoulderR;
    joints.shoulderL.rotation.z = 0.1;
    joints.shoulderR.rotation.z = -0.1;
    joints.elbowL.rotation.x = -p.elbowL;
    joints.elbowR.rotation.x = -p.elbowR;
  }

  function dispose() {
    root.traverse((n) => {
      const m = /** @type {THREE.Mesh} */ (n);
      if (m.geometry) m.geometry.dispose();
    });
    mats.forEach((m) => m.dispose());
  }

  return { root, joints, apply, dispose };
}
