// plane-physics.mjs — 可驾驶 Piper PA-18 飞行纯物理核(2026-10-03)
// 为什么另写而不复用 kunlun/freeflight-physics.js:后者是**飞舟/灵蕴**飞行——
// 自动油门、无失速、能量条、滚转带转向,是"漂在空中"的科幻设定。真实 Piper 是
// 轮式固定翼:推力只由油门给,升力由速度决定,低速会**真的失速掉高度**,方向舵
// 靠蹬舵。改 freeflight 会回归飞舟(它有 920 行 ark.js + 探针钉着),故独立成核。
//
// 纯函数约定:不触碰 DOM / three 场景 / ctx,只吃数字吐数字 → 可 vitest 回归。
// 坐标系:Three.js Y-up 右手系。姿态用欧拉角 YXZ(yaw-pitch-roll),角度单位弧度。
//
// ⚠️ 符号约定(2026-10-03 单测实锤过一次 bug,写之前先读这段):
//   pitch > 0 = **机头上仰**(爬升)  ·  pitch < 0 = 机头下俯(俯冲)
//   因此"拉杆"(pitchIn < 0)→ 目标 pitch 速率取反 → pitch 变正 → 升力 sin(alpha) 为正。
//   早先忘了取反,拉杆算出零升力,一拉杆就往下掉 —— 这就是为什么物理核必须有单测。
//   (首次实现时正是这里反了,被"离地后爬升"一例当场抓住。)
//
// 参数取自真实 Piper PA-18(J-3 Cub 家族)量级:
//   MTOW 1090kg / 巡航 185km/h(51 m/s) / 失速速度约 40km/h(11 m/s)/ 升力线 1m
// 这些数字决定"手感":她在低速会掉头栽进沙里,这是特性不是 bug——
// 飞行员要像飞行员一样把速度维持住。

export const PLANE_PARAMS = {
  // —— 推力 ——
  THRUST_MAX: 9.5, // 全油门加速度 m/s²(单发活塞,别给喷气)
  THRUST_IDLE: 0.35, // 怠速:维持滑行,不熄火
  BRAKE: 7.0, // 机轮刹车减速度
  // —— 升力/阻力 ——
  BASE_AOA: 0.1, // 机体水平时机翼的基础迎角(≈5.7°,真机翼型本来就是这个角度)
  LIFT_K: 0.0072, // 升力系数(乘 v²·迎角)
  LIFT_LEVEL: 20.0, // 维持高度所需速度 m/s(≈72km/h):低于它就在掉高度,必须加油门
  DRAG_K: 0.0021, // 寄生阻力 + 诱导阻力
  SIDE_DRAG: 2.4, // 侧滑阻力(横滚时把飞机"拽住",防止无阻力乱转)
  STALL_SPEED: 11.0, // 失速速度 m/s(≈40km/h)
  LIFT_MAX: 1.0, // 升力饱和系数:超过就不再随速度增长
  SINK_DAMP: 1.6, // 垂直速度阻尼(1/s):没有它会永远飘
  CLIMB_MAX: 8, // 探索手感限幅：短暂抬头不应瞬间蹿到320m天顶。
  DESCENT_MAX: 14,
  // —— 角速度 ——
  PITCH_RATE: 0.62, // 满舵俯仰角速度 rad/s(约 35°/s,适合慢速轻机)
  ROLL_RATE: 1.15, // 满舵滚转
  YAW_RATE: 0.34, // 方向舵偏航(协调转弯之外的 rudder 修正)
  RUDDER_COORD: 0.55, // 协调转弯:滚转自动带偏航的比例
  RATE_SMOOTH: 3.2, // 舵面响应平滑(1/s):越小越"黏",越大越"脆"
  RATE_RETURN: 2.4, // 松杆回中速率(1/s)
  GROUND_LEVEL: 3.0, // 地面机轮把飞机按平的速度(1/s)
  // —— 限幅 ——
  PITCH_LIM: 0.62, // ±35°:再大就要失速
  ROLL_LIM: 1.22, // ±70°
  YAW_LIM: 0.3, // ±17°(方向舵权限小,符合真机)
  // —— 地面 ——
  WHEEL_R: 0.28, // 主轮半径 m
  GROUND_CLEAR: 0.85, // 停机时机身最低点离地(模型的轮高,实测后校准)
  LIFT_ON: 13.0, // 离地速度阈值:超过才可能被"拉起"
  // —— 世界 ——
  // 天顶取 320m 而非更高:沙漠世界的雾在 ~200m 就吃满视野,再往上飞只剩一片棕色,
  // 玩家会以为坏了(2026-10-03 截图自查:飞到 754m 时画面全棕,看不见沙海)。
  // 320m 足够越过所有建筑与飞舟高度,又能一直看见自己飞过的地方。
  YMAX: 320, // 天顶
  BOUND_R: 1600, // 疆域半径(沙漠世界比飞舟大得多)
  GRAVITY: 9.81,
};

const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
const clampN = (v) => clamp(v, -1, 1);

/**
 * 一步积分。
 * @param {object} s 状态(全新对象返回,不改入参)
 *   { pos:{x,y,z}, yaw, pitch, roll, speed, throttle, onGround, vspeed(垂直速度) }
 * @param {object} inp 输入
 *   { pitchIn, rollIn, yawIn, throttleIn, groundHeightAt(x,z) }
 *   pitchIn/rollIn/yawIn ∈ [-1,1]; throttleIn ∈ [0,1] 是**增量**(↑/↓ 键)
 * @param {number} dt 秒(调用方必须已钳制)
 * @returns {{state:object, flags:{liftoff, touchdown, stall, crash, boundaryHit}}}
 */
export function stepPlane(s, inp, dt, P = PLANE_PARAMS) {
  const o = {
    pos: { x: s.pos.x, y: s.pos.y, z: s.pos.z },
    yaw: s.yaw,
    pitch: s.pitch,
    roll: s.roll,
    speed: s.speed,
    throttle: s.throttle,
    onGround: s.onGround,
    vspeed: s.vspeed,
  };
  const flags = {
    liftoff: false,
    touchdown: false,
    stall: false,
    crash: false,
    boundaryHit: false,
  };

  const pitchIn = clampN(inp.pitchIn || 0);
  const rollIn = clampN(inp.rollIn || 0);
  const yawIn = clampN(inp.yawIn || 0);

  // ---------- 1. 油门 ----------
  // 地面与空中都能加油门;空中松油门会让速度自然衰减(真实的"能量守恒")
  o.throttle = clamp(o.throttle + (inp.throttleIn || 0) * dt * 0.85, 0, 1);
  const thrust =
    (P.THRUST_IDLE + (P.THRUST_MAX - P.THRUST_IDLE) * o.throttle) * (o.onGround ? 1 : 1);

  // ---------- 2. 升力:只由速度与迎角决定(失速的物理来源) ----------
  const v = Math.max(0, o.speed);
  // 有效迎角 = 基础迎角 + 机身俯仰 + 爬升率带来的增量
  // (pitch>0 机头上仰 = 迎角增大;BASE_AOA 是"机体水平时机翼本来就有的角度")
  const alpha = clamp(P.BASE_AOA + o.pitch + (o.vspeed / Math.max(6, v)) * 0.5, -0.9, 0.9);
  const q = v * v; // 动压 ∝ v²
  // 失速:速度低于阈值后升力断崖(乘 0.35),并持续 flag
  const stalled = v < P.STALL_SPEED;
  if (stalled) flags.stall = true;
  const liftFactor = stalled ? 0.35 : 1;
  // 升力:速度越快、迎角越大,升力越大。上限 LIFT_MAX 留了余量(1.0 = 恰好抵消重力),
  // 超过它净升力为正 → 爬升;小于它 → 掉高度。这样"平飞"是一个需要维持的平衡点,
  // 而不是自动发生的事 —— 飞行员必须一直配平,和真机一样。
  // LIFT_LEVEL 是平飞所需速度:升力恰为 1.0 的那个速度。
  const liftRaw = P.LIFT_K * q * Math.max(0, Math.sin(alpha)) * 3.2 * liftFactor;
  const lift = Math.min(P.LIFT_MAX, liftRaw);
  // 诊断量:>1 表示有多余升力(能爬升),<1 表示在掉高度
  const liftMargin = liftRaw - 1;

  // ---------- 3. 速度更新 ----------
  // 阻力:寄生 + 诱导(与升力正相关)
  const drag = P.DRAG_K * q * (1 + lift * 1.6);
  // ⚠️ 刹车必须在这里**直接减速度**,不能混进 drag(2026-10-03 单测实锤:
  // 混进 drag 时地面滑跑速度纹丝不动 —— 因为地面路径每步把 vspeed 清零,
  // 动压项在小速度下又近似 0,刹车等于没加)。机轮刹车是纯减速,就这么写。
  const braking = inp.brakeHold && o.onGround ? P.BRAKE : 0;
  o.speed = Math.max(0, v + (thrust - drag) * dt - braking * dt);

  // ---------- 4. 姿态:舵面 → 目标角速率 → 平滑逼近 ----------
  // 舵面输入 → 目标角速率。注意 tPitch 是**角速率(rad/s)**,不是姿态角(rad) ——
  // 两者量纲不同,不能拿 pitch 角去平滑逼近角速率(首次实现就是这么错的,
  // 结果"松杆回中"被符号取反搞成了自我放大,飞机停在 27° 俯角爬不起来)。
  // 低速控制权限下降(模拟低速时舵面发沉),但不完全丧失——真机在失速前仍有控制
  const auth = 0.4 + 0.6 * Math.min(1, o.speed / (P.STALL_SPEED * 2.2));
  // ⚠️ 符号:拉杆(pitchIn<0)必须让 pitch 变正(机头上仰)。取反在这里,见文件头约定段。
  const ratePitch = -clampN(pitchIn) * P.PITCH_RATE * auth;
  const rateRoll = clampN(rollIn) * P.ROLL_RATE * auth;

  // 姿态角积分:角速率 → 姿态
  o.pitch = clamp(o.pitch + ratePitch * dt, -P.PITCH_LIM, P.PITCH_LIM);
  o.roll = clamp(o.roll + rateRoll * dt, -P.ROLL_LIM, P.ROLL_LIM);
  // 松杆自动回中:直接作用在**姿态**上(与舵面输入无关,是稳定性),
  // 松杆时间越久越接近水平 —— 真机飞行员不会一直斜着杆。
  if (Math.abs(pitchIn) < 0.08) o.pitch -= o.pitch * Math.min(1, P.RATE_RETURN * dt);
  if (Math.abs(rollIn) < 0.08) o.roll -= o.roll * Math.min(1, P.RATE_RETURN * dt * 1.2);
  // 地面:机轮把飞机按在水平姿态(后三点式自行回中,见第 6 步)
  if (o.onGround) {
    o.pitch -= o.pitch * Math.min(1, P.GROUND_LEVEL * dt);
    o.roll -= o.roll * Math.min(1, P.GROUND_LEVEL * dt * 1.5);
  }

  // 偏航:方向舵 + 协调转弯(滚转自动带偏航,拉杆就转)
  let tYaw = yawIn * P.YAW_RATE * auth;
  if (Math.abs(yawIn) < 0.08) tYaw = -o.roll * P.RUDDER_COORD; // 无方向舵时靠协调转弯
  o.yaw += (tYaw * dt) / Math.max(0.35, Math.cos(o.roll));
  // 限幅:方向舵权限小,且不能原地自转(等效真机的方向稳定性)
  o.yaw = clamp(o.yaw, -Math.PI * 4, Math.PI * 4);

  // ---------- 5. 位移 ----------
  // 水平速度方向由 yaw 决定;垂直分量由俯仰(抬头爬升/低头俯冲)决定
  const horiz = Math.cos(o.pitch) * o.speed;
  const dx = Math.sin(o.yaw) * horiz * dt;
  const dz = Math.cos(o.yaw) * horiz * dt;
  // 升力抵消重力。
  // ⚠️ 用 liftMargin(未饱和的升力)而不是饱和后的 lift:饱和上限 1.0 恰好等于 1g,
  // 用它算净升力永远得 0,飞机只能平飞、永远爬不上去(2026-10-03 单测实锤)。
  // liftMargin 才是真机的"多余升力",>0 爬升,<0 掉高度。
  const netUp = liftMargin * P.GRAVITY * (stalled ? 0.5 : 1) - (o.onGround ? 0 : P.GRAVITY);
  o.vspeed += netUp * dt;
  // 垂直速度带阻尼(没有阻尼会永远飘)
  o.vspeed *= o.onGround ? 0 : 1 - Math.min(0.6, P.SINK_DAMP * dt);
  o.vspeed = clamp(o.vspeed, -P.DESCENT_MAX, P.CLIMB_MAX);

  o.pos.x += dx;
  o.pos.z += dz;
  o.pos.y += o.vspeed * dt;

  // ---------- 6. 地面/离地判定 ----------
  const gh = inp.groundHeightAt ? inp.groundHeightAt(o.pos.x, o.pos.z) : 0;
  const floor = gh + P.GROUND_CLEAR + P.WHEEL_R;
  if (o.pos.y <= floor) {
    const wasAir = !o.onGround;
    o.pos.y = floor;
    if (o.vspeed < 0) o.vspeed = 0;
    // 摔机判定:高速 + 机头显著下俯 + 触地。三个条件缺一不可:
    //   轻着陆(速度低)允许、垂直落下来(不低头)允许、慢速蹭地允许。
    if (wasAir && o.speed > 22 && o.pitch < -0.3) {
      flags.crash = true;
    }
    o.onGround = true;
    // 触地时机轮一挨地,后三点式自行把机头带平(真机现象:三台车外倾,摩擦力矩)
    // —— 玩家松杆不动,飞机自己回到水平滑行姿态,不会一直趴着推。
    if (wasAir) {
      flags.touchdown = true;
      o.pitch *= 0.25; // 触地后自动拉平(不然玩家会一直趴着)
      o.roll *= 0.4;
    }
    o.vspeed = 0;
  } else {
    if (o.onGround && o.vspeed > 0.5) {
      o.onGround = false;
      flags.liftoff = true;
    }
  }

  // 起飞条件:地面 + 速度过阈值 + 拉杆
  if (o.onGround && o.speed > P.LIFT_ON && pitchIn < -0.15) {
    // 拉杆 → 抬头离地(给一点初始上仰速度,模拟前轮抬起)
    o.vspeed = 3.2;
    o.onGround = false;
    flags.liftoff = true;
  }

  // ---------- 7. 疆域 ----------
  const r = Math.hypot(o.pos.x, o.pos.z);
  if (r > P.BOUND_R) {
    o.pos.x = (o.pos.x / r) * P.BOUND_R;
    o.pos.z = (o.pos.z / r) * P.BOUND_R;
    flags.boundaryHit = true;
  }
  if (o.pos.y > P.YMAX) o.pos.y = P.YMAX;

  return { state: o, flags };
}

/**
 * 起落判定辅助:给 HUD / 探针用的小工具(纯读函数)。
 * @param {object} s 状态
 * @returns {{phase:'parked'|'roll'|'lift'|'cruise'|'stall'|'down', hintZh:string, hintEn:string}}
 */
export function planePhase(s, P = PLANE_PARAMS) {
  const v = s.speed;
  if (s.crashed) return { phase: 'down', hintZh: '飞机损毁了', hintEn: 'Aircraft wrecked' };
  if (s.onGround && v < 1.5)
    return {
      phase: 'parked',
      hintZh: '停机 · 按住 W 加油门',
      hintEn: 'Parked · hold W for throttle',
    };
  if (s.onGround && v < P.LIFT_ON)
    return {
      phase: 'roll',
      hintZh: '滑跑中 · 速度够了拉杆抬头',
      hintEn: 'Rolling · pull back to lift off',
    };
  if (v < P.STALL_SPEED)
    return { phase: 'stall', hintZh: '失速 · 加油门把速度找回来', hintEn: 'Stalled · add power' };
  if (s.onGround) return { phase: 'roll', hintZh: '滑跑中', hintEn: 'Rolling' };
  if (o_isRising(s)) return { phase: 'lift', hintZh: '爬升', hintEn: 'Climbing' };
  return { phase: 'cruise', hintZh: '巡航', hintEn: 'Cruise' };
}
function o_isRising(s) {
  return (s.vspeed || 0) > 0.6;
}

/** 速度 → 地速显示(km/h,玩家习惯读这个)。 */
export function planeSpeedKmh(s) {
  return Math.round(Math.max(0, s.speed) * 3.6);
}
