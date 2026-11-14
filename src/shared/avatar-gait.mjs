// avatar-gait.mjs — 玩家小人的程序化步态(2026-11-12 角色:治「动作僵」)
//
// 病原先第三人称小人每帧**只写 position 与 rotation.y**(loop-manager.js:499-505),
// 没有任何关节动作 ⇒ 移动时像一块平移的胶囊,这就是「动作僵」。
// 而且那个胶囊压根没有四肢(player.js:47-65 只有身体/头/鼻三件),无从摆动。
//
// 本模块只算**数值**(纯函数,无 THREE、无 DOM),由 avatar-figure.js 落到骨骼上。
// 参照仓库既有范例 sheep-model.js:82 的 animate(phase, walk, ...):
//   · 相位按**位移**推进而不是按时间 —— 脚不会在地面上打滑(sheep-companion.js:344 同法)
//   · 走停之间用指数平滑过渡,不做 0/1 突跳(否则起停瞬间四肢会弹一下)
//   · 停下时仍有呼吸与重心微摆,静止不等于死物
//
// ⚠️ 纯逻辑放 shared/*.mjs 是本仓约定(见 shared/sheep-companion-logic.mjs),
//    这样 node 环境可直接单测,不需要 jsdom。

/** 一步的跨度(米):相位每推进 2π 对应走过的距离。腿长 0.62m 的小人取 0.85 自然 */
export const STRIDE = 0.85;

/** 指数平滑系数(每秒):走↔停过渡的时间常数,12 与羊一致 */
const SMOOTH = 12;

/**
 * 推进步态状态(就地改 st,避免每帧新建对象)。
 * @param {{phase: number, walk: number, lean: number, time: number}} st 步态状态(调用方持有)
 * @param {{travel: number, speed: number, turnRate: number, dt: number, airborne: boolean, gliding: boolean}} inp 本帧输入
 *   travel — 本帧水平位移(米),驱动相位;speed — 水平速度(米/秒),驱动摆幅
 *   turnRate — 朝向角速度(弧度/秒),驱动转身侧倾;dt — 帧间隔(秒)
 *   airborne — 是否离地;gliding — 是否滑翔(两者都收腿,不迈步)
 * @returns {{phase: number, walk: number, lean: number, time: number}} 同一个 st
 */
export function stepGait(st, inp) {
  const dt = Math.max(0, Math.min(0.1, Number(inp.dt) || 0)); // 卡帧不让相位瞬移
  const travel = Math.max(0, Number(inp.travel) || 0);
  const speed = Math.max(0, Number(inp.speed) || 0);
  // 目标摆幅:按速度归一(常速 3.2m/s → 1);空中/滑翔不迈步
  const target = inp.airborne || inp.gliding ? 0 : Math.max(0, Math.min(1, speed / 3.2));
  // 指数平滑(帧率无关):1-exp(-k·dt),与 sheep-companion.js:340 同式
  const k = 1 - Math.exp(-SMOOTH * dt);
  st.walk += (target - st.walk) * k;
  // 相位按位移推进:走得快则步频快,但**每步跨度恒定** ⇒ 脚不打滑
  st.phase += (travel / STRIDE) * Math.PI * 2;
  // 相位收敛到 [0,2π),长时间跑不累积浮点误差
  if (st.phase > Math.PI * 2) st.phase %= Math.PI * 2;
  // 转身侧倾:朝转动方向压肩,上限 ±0.18rad(约 10°),平滑跟随
  const leanTarget = Math.max(-0.18, Math.min(0.18, (Number(inp.turnRate) || 0) * 0.09));
  st.lean += (leanTarget - st.lean) * k;
  st.time += dt;
  return st;
}

/**
 * 由步态状态算各关节角度(纯函数,返回新对象;调用方每帧一次,量很小)。
 * 数值口径参照真人步态:腿摆 ±30°、臂反相摆 ±25°、躯干起伏 ~2cm。
 * @param {{phase: number, walk: number, lean: number, time: number}} st 步态状态
 * @param {{airborne: boolean, gliding: boolean}} pose 姿态开关
 * @returns {{hipL: number, hipR: number, kneeL: number, kneeR: number, shoulderL: number, shoulderR: number, elbowL: number, elbowR: number, spineX: number, spineZ: number, bob: number, headX: number, headZ: number, blink: number, scarfX: number, scarfZ: number, scarfTipX: number}}
 */
export function gaitPose(st, pose) {
  const w = Math.max(0, Math.min(1, st.walk));
  const p = st.phase;
  const s = Math.sin(p);
  const air = pose.airborne ? 1 : 0;
  const glide = pose.gliding ? 1 : 0;

  // 腿:左右反相(sin 与 -sin)。摆动腿在前时膝盖微屈,后腿蹬直 ⇒ 不是两根直棍平移
  const hipL = s * w * 0.52;
  const hipR = -s * w * 0.52;
  // 膝盖只在腿往后摆时弯(单向屈曲,人的膝盖不能反折)
  const kneeL = Math.max(0, -s) * w * 0.62;
  const kneeR = Math.max(0, s) * w * 0.62;

  // 臂:与同侧腿**反相**(走路上身自然对扭),肘部保持一点常屈更放松
  const shoulderL = -s * w * 0.44;
  const shoulderR = s * w * 0.44;
  const elbowL = 0.12 + Math.max(0, s) * w * 0.3;
  const elbowR = 0.12 + Math.max(0, -s) * w * 0.3;

  // 躯干:前倾随速度(跑起来压身),侧倾随转身;叠加步频微扭
  const spineX = w * 0.1 + glide * 0.5 + air * 0.12;
  const spineZ = st.lean + s * w * 0.03;

  // 起伏:每步两次(左右脚各一次落地)⇒ 用 |sin|;静止时换成缓慢呼吸
  const breath = Math.sin(st.time * 1.9) * 0.006;
  const bob = Math.abs(s) * w * 0.022 + breath * (1 - w);

  // 头:抵消躯干前倾的一半(保持视线水平,人才不会一直低头),加微幅摇摆
  const headX = -spineX * 0.5 + Math.sin(st.time * 1.3) * 0.02 * (1 - w);
  const headZ = -st.lean * 0.6 + Math.sin(st.time * 0.9) * 0.03 * (1 - w);

  // 空中/滑翔:收腿张臂覆盖步态(滑翔像张开双臂乘风,不是继续迈步)
  return {
    hipL: hipL + air * 0.5 + glide * 0.3,
    hipR: hipR + air * 0.2 + glide * 0.3,
    kneeL: kneeL + air * 0.7 + glide * 0.25,
    kneeR: kneeR + air * 0.4 + glide * 0.25,
    shoulderL: shoulderL - glide * 1.15 - air * 0.5,
    shoulderR: shoulderR - glide * 1.15 - air * 0.5,
    elbowL: elbowL * (1 - glide) + glide * 0.1,
    elbowR: elbowR * (1 - glide) + glide * 0.1,
    spineX,
    spineZ,
    bob,
    headX,
    headZ,
    // ── 微动作(2026-11-13):眨眼 + 围巾飘动 ──
    // 眨眼用相位取模而非随机计时器:纯函数、可单测、不随帧率漂移。
    // 每 ~3.7s 一次、闭合仅占 0.12s ⇒ 是「眨」不是「闭眼」。
    blink: blinkPulse(st.time),
    // 围巾:基础风摆 + 速度/滑翔带来的向后飘(跑得越快飘得越平)
    scarfX: -(w * 0.5 + glide * 0.7) + Math.sin(st.time * 2.3) * 0.06,
    scarfZ: Math.sin(st.time * 2.3) * 0.16 + Math.sin(st.time * 3.7) * 0.07,
    scarfTipX: -Math.abs(Math.sin(st.time * 3.1 + 0.9)) * 0.3 - w * 0.2,
  };
}

/**
 * 眨眼脉冲(纯函数):0=睁眼,1=完全闭合。
 * @param {number} time 累计时间(秒)
 * @returns {number} 0..1
 */
export function blinkPulse(time) {
  const PERIOD = 3.7;
  const WINDOW = 0.12;
  const t = ((Number(time) || 0) % PERIOD + PERIOD) % PERIOD;
  if (t <= PERIOD - WINDOW) return 0;
  // 窗口内 0→1→0 三角脉冲,峰值在窗口正中
  return Math.max(0, 1 - Math.abs((t - (PERIOD - WINDOW / 2)) / (WINDOW / 2)));
}

/** 新建步态状态(供调用方初始化) */
export function createGaitState() {
  return { phase: 0, walk: 0, lean: 0, time: 0 };
}