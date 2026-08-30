// dome-towers.js — Yazd 穹顶塔楼群(2026-08-31):6 座塔围成圆环,画廊建筑围在中央
// 模型来源:islamic_dome_-_yazd.glb 拆出穹顶本体(scripts/extract-dome.mjs),
//          贴图已 WEBP 2048 + 几何量化(117MB → 0.95MB),three 0.160 原生支持其扩展。
// 布置:圆心=画廊几何中心(0, (OT+OBR)/2),半径 30m(画廊对角半径≈27+3m 间距),
//       塔高统一 8.5m(画廊墙 5m 的 1.7 倍),塔身朝向圆心,落地对齐 Y=0。
// 碰撞:每座塔一个轴对齐碰撞盒(与墙体 bounds 同格式),玩家不可穿塔。
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { ctx } from '../ctx.js';
import { hotBegin, hotEnd } from '../hot.js';

const bag = hotBegin('dome-towers');
const sc = ctx.scene;
const { s, OT, OBR, addBounds } = sc;

const MODEL_URL = '/models/yazd/dome.glb';
const TARGET_H = 8.5; // 塔目标高度(m)
const CX = 0;
const CZ = (OT + OBR) / 2; // 画廊几何中心 z = 8
const RADIUS = 30; // 圆环半径
const COUNT = 6;

new GLTFLoader().load(
  MODEL_URL,
  function (gltf) {
    const proto = gltf.scene;
    // 轴向修正:该 GLB 为 Z-up 躺倒导出(穹顶尖朝 -Z,祖先链无旋转节点),
    // 绕 X 轴 +90° 将 -Z(尖顶)转至 +Y(上方),否则塔会横躺在地上
    proto.rotation.x = Math.PI / 2;
    proto.updateMatrixWorld(true);

    // 实测包围盒(以节点变换后的真实朝向为准),统一缩放到目标高度
    const box = new THREE.Box3().setFromObject(proto);
    const size = box.getSize(new THREE.Vector3());
    const scale = TARGET_H / size.y;
    proto.scale.setScalar(scale);
    proto.updateMatrixWorld(true);

    for (let i = 0; i < COUNT; i++) {
      // 结构:holder(Group)负责圆周定位+朝向;内层模型自带轴向修正(x=π/2)。
      // 不能对模型本身 lookAt——lookAt 会重置整个四元数,覆盖掉轴向修正让塔重新躺倒
      const holder = new THREE.Group();
      holder.add(proto.clone(true)); // clone 共享几何与材质,6 座仅 1 份显存
      const ang = (i / COUNT) * Math.PI * 2 + Math.PI / 6; // 均匀 60°,避开正北
      const x = CX + Math.sin(ang) * RADIUS;
      const z = CZ + Math.cos(ang) * RADIUS;

      holder.position.set(x, 0, z);
      holder.lookAt(CX, 0, CZ); // 朝向圆心(水平旋转,不碰内层轴向)
      holder.updateMatrixWorld(true);

      // 落地:实测世界包围盒,minY 对齐地面
      const b3 = new THREE.Box3().setFromObject(holder);
      holder.position.y = -b3.min.y;
      holder.updateMatrixWorld(true);
      s.add(holder);
      bag.objs.push(holder);

      // 碰撞盒(世界坐标 AABB,直径近似正方形 + 0.3m 余量;Y 修正不影响 XZ)
      const half = Math.max(b3.max.x - b3.min.x, b3.max.z - b3.min.z) / 2 + 0.3;
      addBounds([{ mnX: x - half, mxX: x + half, mnZ: z - half, mxZ: z + half }]);
    }
    hotEnd('dome-towers');
  },
  undefined,
  function (e) {
    console.warn('[dome-towers] 穹顶塔楼加载失败:', e && e.message);
    hotEnd('dome-towers');
  }
);

if (import.meta.hot) import.meta.hot.accept();
