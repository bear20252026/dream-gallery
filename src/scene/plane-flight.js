// scene/plane-flight.js — 可驾驶 Piper PA-18(2026-10-03)
// 主人构想:"这里有一架真实的飞机,可以尝试加入真实的游戏,可以驾驶飞机"。
//
// 为什么这架飞机不只是个玩具:
//   剧本第 1 场有「古地图俯视」——那是**飞行中**的视角。你的纸飞机扎进沙里,
//   因为那是**你开的**。所以驾驶的落点选在坠机点旁:残骸换回真机,
//   玩家走上前就能把它开起来 —— 开场电影里"你坠落的地方"变成"你还能再起飞的地方"。
//   这条因果链把第 1 场的被动观看变成主动经历,是全项目最省成本的一次叙事升级。
//
// 物理在 scene/plane-physics.mjs(纯函数,26 项单测钉死)。本文件只管:
//   3D 姿态同步 / 输入 / 相机 / HUD / 起降交互 / 存档。
// 严格不复用 kunlun/freeflight-physics.js(那是飞舟:自动油门、无失速、灵蕴),
// 也不改它 —— ark.js 920 行 + 探针钉着,动了会回归。
//
// 玩家冻结走既有通道 gs.set('flightLock', true)(player.js 读 ctx.kunlun.flightLock),
// 与飞舟同一条路,不新增"谁能禁用玩家"的第二套机制。
import * as THREE from 'three';
import { ctx } from '../ctx.js';
import { defineSystem } from '../core/system.js';
import { getGameState } from '../core/game-state.js';
import { createGLTFLoader } from './gltf-loader.js';
import { Z } from '../shared/z-layers.mjs';
import { tt } from '../shared/story-text.mjs';
import { PLANE_PARAMS as P, stepPlane, planePhase, planeSpeedKmh } from './plane-physics.mjs';

const gs = getGameState();
const MODEL = '/models/b612/piper-pa18-full.glb'; // 1.74MB 完整机 → 压缩后 0.31MB
// 停放点 = 原残骸位(crash-site.js 的 WRECK,-9/76)。这不是随便选的:
// 那是剧本第 1 场你坠机的地方,残骸已由本模块接管(旧 piper-pa18.glb 简化残骸已下线),
// 现在那架扎在沙里的真飞机可以被你修好、推出去、重新起飞。
// 开场电影里"你坠落的地方" = 游戏里"你还能再起飞的地方" —— 同一条因果链。
const PARK = { x: -9, z: 76, yaw: -0.35 }; // yaw 与原残骸一致(机头朝北偏东)
const STORE_KEY = 'planeFlown';
const NEAR_R = 5.5;

const STYLE = `
/* 飞行 HUD 用 veilFx(390)之上 —— 原先用 hudBtn(35),会被对话框(questBook 层 70
   与其上的 gameDialog)整块盖住,玩家在飞行中看不到速度/失速告警(2026-10-03 截图自查发现)。 */
#planeHud{position:fixed;left:50%;bottom:104px;transform:translateX(-50%);z-index:${Z.veilFx};
  display:none;min-width:210px;padding:12px 20px;border-radius:12px;
  background:linear-gradient(160deg,rgba(20,22,28,.92),rgba(30,26,22,.92));
  border:1px solid #7d6a4a;color:#f0e2c0;font:13px/1.6 "SF Mono",Consolas,monospace;
  text-align:center;box-shadow:0 8px 28px #0008;pointer-events:none}
#planeHud .ph-speed{font-size:30px;font-weight:600;letter-spacing:2px;color:#ffe9b0;font-variant-numeric:tabular-nums}
#planeHud .ph-phase{font-size:12px;color:#c9b98f;margin-top:2px;min-height:1.4em}
#planeHud .ph-stall{color:#ff9d90}
#planeHud .ph-bar{height:5px;margin-top:8px;border-radius:3px;background:#0c0e12;overflow:hidden;border:1px solid #3a3527}
#planeHud .ph-bar i{display:block;height:100%;background:linear-gradient(90deg,#c8a45c,#f0d898)}
/* 提示条在 HUD **上方**(bottom 更大),两者不能叠在一起 ——
   截图自查过一次:提示条压住了速度数字的上一行,读数被切掉一半。 */
#planePrompt{position:fixed;left:50%;bottom:210px;transform:translateX(-50%);z-index:${Z.veilFx};
  padding:11px 20px;border-radius:22px;background:rgba(24,22,18,.94);
  border:1px solid #8a7550;color:#ffeec4;font:13.5px/1.5 inherit;cursor:pointer;
  box-shadow:0 6px 22px #0007;min-height:44px;display:none;align-items:center}
#planePrompt:hover{background:#3a3122}
body[data-flying] #questHud,body[data-flying] #storyCompass{visibility:hidden}
/* 飞行中关掉对话框的表现层:玩家在开飞机,不该被剧情对话框挡住仪表与视线 */
body[data-flying] #gameDialog,body[data-flying] #journeyTask{visibility:hidden}
@media(max-width:600px){#planeHud{bottom:96px;min-width:170px;padding:9px 14px}
#planeHud .ph-speed{font-size:23px}#planePrompt{bottom:186px;font-size:12.5px}}
`;

const T = {
  enter: { zh: '走近飞机 · 按 E 登机', en: 'Walk to the plane · press E to board' },
  exit: { zh: '按 Esc 下机 · F 切视角', en: 'Esc to exit · F for view' },
  crashed: { zh: '摔机了 · 按 E 重新登机', en: 'Wrecked · press E to board again' },
  flew: { zh: '你已经飞过这片沙海了', en: 'You have flown this desert' },
};

export function createPlaneFlight({ input }) {
  let root = null,
    modelWrap = null,
    shadow = null;
  let hud = null,
    promptEl = null,
    style = null;
  let state = null;
  let driving = false;
  let nearPlane = false;
  let crashed = false;
  let everFlew = false;
  let maxAltitude = 0; // 本次飞行最高点(探针断言用:飞没飞过要看它,不看某一帧)
  let camMode = 0; // 0 追尾 / 1 驾驶舱 / 2 侧视
  let camInit = false;
  const camPos = new THREE.Vector3();
  const camLook = new THREE.Vector3();
  let onKey = null;
  let unsubWorld = null;

  const groundH = (x, z) => (ctx.media && ctx.media.desert ? ctx.media.desert.getH(x, z) : 0);

  function freshState() {
    return {
      pos: { x: PARK.x, y: groundH(PARK.x, PARK.z) + P.GROUND_CLEAR + P.WHEEL_R, z: PARK.z },
      yaw: PARK.yaw,
      pitch: 0,
      roll: 0,
      speed: 0,
      throttle: 0,
      onGround: true,
      vspeed: 0,
    };
  }

  // ——————————————————————————— 3D ———————————————————————————
  function buildMesh() {
    if (root) return;
    root = new THREE.Group();
    root.name = 'piperPA18';
    // 影子:假接地圆盘(不追飞机高度),避免高速飞过时"影子跟着飞"的廉价感
    shadow = new THREE.Mesh(
      new THREE.CircleGeometry(6.4, 24),
      new THREE.MeshBasicMaterial({
        color: 0x1a1712,
        transparent: true,
        opacity: 0.28,
        depthWrite: false,
      })
    );
    shadow.rotation.x = -Math.PI / 2;
    root.add(shadow);
    ctx.scene.s.add(root);

    createGLTFLoader().load(
      MODEL,
      (g) => {
        const m = g.scene;
        const bb = new THREE.Box3().setFromObject(m);
        const size = bb.getSize(new THREE.Vector3());
        // 姿态归一:模型是 Z-up 导出 + 源根链可能带旋转。
        // 判据:真实飞机翼展(6.7m)应显著长于机身长度(7.3m 的 GLB 里最长轴是翼展方向)。
        // 不靠猜 —— 用包围盒比例:若最长轴是 Y(竖直),说明模型躺着导出,转平它。
        if (size.y > Math.max(size.x, size.z)) m.rotation.x = -Math.PI / 2;
        m.position.y -= bb.min.y; // 贴地:模型原点不在脚底
        modelWrap = m;
        root.add(m);
        if (driving && camMode === 1) root.visible = false;
        // 碰撞:机身实心一盒(座舱玻璃按惯例可穿,不单独立柱)。
        // 沿用 crash-site 旧残骸的口径:只保留机身段,机翼下可穿行 ——
        // 否则整个翼展会圈住出生点。
        root.updateMatrixWorld(true);
        const hull = new THREE.Box3().setFromObject(m);
        ctx.scene.addBounds?.([
          {
            mnX: hull.min.x + 2.6,
            mxX: hull.max.x - 2.6,
            mnZ: hull.min.z + 0.6,
            mxZ: hull.max.z - 0.6,
          },
        ]);
      },
      undefined,
      (e) => console.error('[plane-flight] 真实飞机模型加载失败:', e.message)
    );
  }

  function syncMesh() {
    if (!root) return;
    root.position.set(state.pos.x, state.pos.y - (P.GROUND_CLEAR + P.WHEEL_R), state.pos.z);
    root.rotation.set(state.pitch, state.yaw, state.roll, 'YXZ');
    if (shadow) {
      const gh = groundH(state.pos.x, state.pos.z);
      shadow.position.set(0, gh - root.position.y + 0.06, 0);
      const h = Math.max(0, state.pos.y - gh);
      const k = Math.max(0.2, Math.min(1, 1 - h / 70));
      shadow.scale.setScalar(k);
      shadow.material.opacity = 0.28 * k;
      shadow.visible = !crashed;
    }
  }

  // ——————————————————————————— 相机 ———————————————————————————
  function updateCamera(dt) {
    const cam = ctx.scene.cam;
    if (!cam) return;
    const p = state.pos;
    const fx = Math.sin(state.yaw),
      fz = Math.cos(state.yaw);
    let want;
    if (camMode === 1) {
      // 驾驶舱:贴在机头,随飞机滚转(真机座舱会随倾斜)
      want = new THREE.Vector3(p.x + fx * 1.7, p.y + 0.75, p.z + fz * 1.7);
    } else if (camMode === 2) {
      want = new THREE.Vector3(p.x - fz * 16, p.y + 5, p.z + fx * 16); // 侧视
    } else {
      // 追尾:机后上方,随速度后拉
      const back = 13 + state.speed * 0.3;
      want = new THREE.Vector3(p.x - fx * back, p.y + 4.4, p.z - fz * back);
    }
    const gh = groundH(want.x, want.z) + 1.4;
    if (want.y < gh) want.y = gh;
    if (!camInit) {
      camPos.copy(want);
      camInit = true;
    }
    camPos.lerp(want, Math.min(1, dt * (camMode === 1 ? 24 : 4.5)));
    cam.position.copy(camPos);
    camLook.set(p.x + fx * 12, p.y + 0.6, p.z + fz * 12);
    cam.lookAt(camLook);
    if (camMode === 1) cam.rotateZ(-state.roll * 0.7);
  }

  // ——————————————————————————— HUD / 提示 ———————————————————————————
  function syncHud() {
    if (!hud) return;
    if (!driving) {
      hud.style.display = 'none';
      return;
    }
    const ph = planePhase({ ...state, crashed });
    hud.style.display = 'block';
    hud.querySelector('.ph-speed').textContent = planeSpeedKmh(state) + ' km/h';
    const el = hud.querySelector('.ph-phase');
    el.textContent = tt(ph.hint);
    el.classList.toggle('ph-stall', ph.phase === 'stall');
    hud.querySelector('.ph-bar i').style.width = Math.round(state.throttle * 100) + '%';
  }

  function showPrompt(text) {
    if (!promptEl) return;
    if (text) {
      promptEl.style.display = 'flex';
      promptEl.textContent = tt(text);
    } else {
      promptEl.style.display = 'none';
    }
  }

  // ——————————————————————————— 上/下机 ———————————————————————————
  function board() {
    if (crashed) {
      crashed = false;
      state = freshState();
      syncMesh();
    }
    driving = true;
    camInit = false;
    gs.set('flightLock', true); // 冻结玩家移动(与飞舟同一条通道)
    document.body.dataset.flying = '1';
    if (root) root.visible = camMode !== 1;
    syncHud();
    showPrompt(T.exit);
  }

  function leave() {
    if (!driving) return;
    driving = false;
    delete document.body.dataset.flying;
    gs.set('flightLock', false);
    if (root) root.visible = true; // 下机后把玩家放到飞机侧方,而不是机身里
    const pl = ctx.player && ctx.player.pl;
    if (pl) {
      pl.p.x = state.pos.x + Math.sin(state.yaw + 1.3) * 5;
      pl.p.z = state.pos.z + Math.cos(state.yaw + 1.3) * 5;
      pl.p.y = groundH(pl.p.x, pl.p.z) + 0.2;
      pl.vy = 0;
    }
    camInit = false;
    showPrompt(null);
    syncHud();
  }

  // ——————————————————————————— 输入 ———————————————————————————
  // ⚠️ 符号约定(与 plane-physics.mjs 文件头一致):pitchIn **负 = 拉杆抬头**。
  // 键盘直觉是"↓ = 低头"，但飞杆是"往后拉 = 抬头"，两者相反。
  // 首次实现照直觉写了 arrowdown:+1,结果压杆反而低头,飞机永远抬不起机头
  // (2026-10-03 线上探针实锤:拉杆 3s 后 pitch=-0.196,y 纹丝不动)。
  // 正确映射:↓ 压杆低头(+1) · ↑ 拉杆抬头(-1)。
  function readInput() {
    const kd = (k) => input.isKeyDown(k);
    return {
      pitchIn: (kd('arrowdown') ? 1 : 0) - (kd('arrowup') ? 1 : 0),
      rollIn: (kd('arrowright') || kd('d') ? 1 : 0) - (kd('arrowleft') || kd('a') ? 1 : 0),
      yawIn: (kd('e') ? 1 : 0) - (kd('q') ? 1 : 0),
      throttleIn: (kd('s') ? 1 : 0) - (kd('w') ? 1 : 0),
      brakeHold: kd('shift'),
      groundHeightAt: groundH,
    };
  }

  // 系统本体。defineSystem 只保留 name/layer/phase/order/deps/init/update/dispose,
  // 额外字段会被丢弃 —— 所以调试/探针接口挂 ctx.scene(与项目既有做法一致),
  // 不污染系统契约,也不用给每个系统开 ctx 属性后门。
  const system = defineSystem({
    name: 'planeFlight',
    layer: 'gameplay',
    phase: 'simulate',
    order: 8,
    deps: { input: true },
    init() {
      style = document.createElement('style');
      style.textContent = STYLE;
      document.head.appendChild(style);

      hud = document.createElement('div');
      hud.id = 'planeHud';
      hud.innerHTML =
        '<div class="ph-speed">0 km/h</div><div class="ph-phase"></div><div class="ph-bar"><i style="width:0%"></i></div>';
      document.body.appendChild(hud);

      promptEl = document.createElement('button');
      promptEl.id = 'planePrompt';
      promptEl.type = 'button';
      promptEl.onclick = () => (driving ? leave() : board());
      document.body.appendChild(promptEl);

      state = freshState();
      buildMesh();
      syncMesh();

      try {
        everFlew = !!(ctx.store.json(STORE_KEY, {}) || {}).flew;
      } catch (e) {}

      onKey = (e) => {
        if (!e || !e.key) return;
        const k = e.key.toLowerCase();
        if (driving) {
          if (k === 'escape') leave();
          if (k === 'f') {
            camMode = (camMode + 1) % 3;
            camInit = false;
            if (root) root.visible = camMode !== 1;
          }
        } else if (k === 'e' && nearPlane) {
          board();
        }
      };
      document.addEventListener('keydown', onKey);
    },
    update(dt) {
      if (!state) return;
      if (driving) {
        const r = stepPlane(state, readInput(), Math.min(0.05, dt), P);
        state = r.state;
        if (state.pos.y > maxAltitude) maxAltitude = state.pos.y;
        if (r.flags.liftoff) {
          // ⚠️ 不要写成 `if (liftoff && !everFlew)` —— everFlew 从存档读入,
          // 老玩家重进时它已是 true,这个分支就永远不再进,maxAltitude 断言随之失真
          // (2026-10-03 探针实测:飞机明明飞到 9.8m,everFlew 却报 false)。
          // 存档只在"首次"写;标记每帧都更新。
          if (!everFlew) {
            everFlew = true;
            try {
              ctx.store.setJson(STORE_KEY, { flew: true, at: Date.now() });
            } catch (e) {}
            ctx.ui.modeToast?.(tt(T.flew), 3200);
          }
        }
        if (r.flags.crash && !crashed) {
          crashed = true;
          ctx.ui.modeToast?.(tt(T.crashed), 4000);
          showPrompt(T.crashed);
        }
        updateCamera(dt);
        syncHud();
        syncMesh();
        return;
      }
      // 地面:靠近才提示登机
      const pl = ctx.player && ctx.player.pl;
      if (pl) {
        const near = Math.hypot(pl.p.x - state.pos.x, pl.p.z - state.pos.z) < NEAR_R;
        if (near !== nearPlane) {
          nearPlane = near;
          showPrompt(near ? T.enter : null);
        }
      }
    },
    dispose() {
      if (onKey) document.removeEventListener('keydown', onKey);
      onKey = null;
      unsubWorld?.();
      unsubWorld = null;
      if (driving) gs.set('flightLock', false);
      delete document.body.dataset.flying;
      style?.remove();
      hud?.remove();
      promptEl?.remove();
      if (root) {
        ctx.scene.s.remove(root);
        root = null;
        modelWrap = null;
        shadow = null;
      }
    },
  });

  // 探针/调试接口挂 ctx.scene(defineSystem 会丢弃额外字段)。
  // 只读状态 + 三个动作;不参与任何游戏逻辑,线上探针经 window.__ctx.scene 读取。
  ctx.scene.planeApi = {
    debug: () => ({
      driving,
      crashed,
      camMode,
      state: JSON.parse(JSON.stringify(state)),
      modelLoaded: !!modelWrap,
      nearPlane,
      // 飞行历程(探针断言用):曾离地 + 本次最高点。
      // 不靠外部轮询 —— 轮询会漏掉刚离地那几帧,实测过一次假阴性。
      everFlew,
      maxAltitude: Math.round(maxAltitude * 10) / 10,
    }),
    board,
    leave,
    resetFlight: () => {
      maxAltitude = 0;
    },
    setCam: (m) => {
      camMode = ((m % 3) + 3) % 3;
      camInit = false;
      if (root) root.visible = camMode !== 1;
    },
  };

  return system;
}
