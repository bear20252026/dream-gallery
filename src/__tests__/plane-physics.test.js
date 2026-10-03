// plane-physics.test.js — 可驾驶 Piper PA-18 飞行物理契约(2026-10-03)
// 为什么这核值得单测:飞舟物理是"自动油门+无失速"的科幻设定,不能复用;
// 真机手感全靠这几条物理正确性撑着。数值一旦被"优化"掉,玩家会立刻觉得
// 这飞机"不是飞机"。回归锚点:
//   ① 失速:低速必须真的掉高度(不是无限悬停)
//   ② 起飞:地面+速度过阈值+拉杆才离地
//   ③ 摔机:高速重着陆且机头下俯 = crash
//   ④ 积分稳定性:任何输入下都不出 NaN、不发散
import { describe, it, expect } from 'vitest';
import {
  PLANE_PARAMS as P,
  stepPlane,
  planePhase,
  planeSpeedKmh,
} from '../scene/plane-physics.mjs';

const flat = () => 0;
function fresh(over = {}) {
  return {
    pos: { x: 0, y: P.GROUND_CLEAR + P.WHEEL_R, z: 0 },
    yaw: 0,
    pitch: 0,
    roll: 0,
    speed: 0,
    throttle: 0,
    onGround: true,
    vspeed: 0,
    ...over,
  };
}
// 跑 n 步
function run(s, inp, n = 60, dt = 1 / 60) {
  let cur = s;
  const all = [];
  for (let i = 0; i < n; i++) {
    const r = stepPlane(cur, { groundHeightAt: flat, ...inp }, dt);
    cur = r.state;
    all.push(r);
  }
  return { state: cur, flags: all.map((r) => r.flags) };
}

describe('参数契约', () => {
  it('失速速度低于起飞速度(真机必须先加速才能维持高度)', () => {
    expect(P.STALL_SPEED).toBeLessThan(P.LIFT_ON);
  });
  it('限幅是有限数,不是 undefined(气动常数写错会得到 NaN 姿态)', () => {
    for (const k of ['THRUST_MAX', 'LIFT_K', 'DRAG_K', 'PITCH_RATE', 'ROLL_RATE', 'GRAVITY']) {
      expect(Number.isFinite(P[k])).toBe(true);
    }
  });
});

describe('积分稳定性', () => {
  it('高速滑跑后短暂抬头可以起飞，仍看得见沙漠而非瞬间蹿到天顶', () => {
    const result = run(fresh({ speed: 40, throttle: 1 }), { pitchIn: -1 }, 120);
    expect(result.flags.some((f) => f.liftoff)).toBe(true);
    expect(result.state.pos.y).toBeGreaterThan(3);
    expect(result.state.pos.y).toBeLessThan(30);
  });
  it('任意极端输入 600 步不出 NaN', () => {
    const cases = [
      { pitchIn: 1, rollIn: 1, yawIn: 1, throttleIn: 1 },
      { pitchIn: -1, rollIn: -1, yawIn: -1, throttleIn: -1 },
      { pitchIn: 1, rollIn: -1, throttleIn: 1, brakeHold: true },
      { pitchIn: 0, rollIn: 0, throttleIn: 0 },
    ];
    for (const inp of cases) {
      const { state } = run(fresh(), inp, 600);
      expect(Number.isFinite(state.pos.x)).toBe(true);
      expect(Number.isFinite(state.pos.y)).toBe(true);
      expect(Number.isFinite(state.pos.z)).toBe(true);
      expect(Number.isFinite(state.pitch)).toBe(true);
      expect(Number.isFinite(state.roll)).toBe(true);
      expect(Number.isFinite(state.yaw)).toBe(true);
      expect(state.speed).toBeGreaterThanOrEqual(0);
    }
  });
  it('姿态始终被限幅在设计范围内', () => {
    const { state } = run(
      fresh({ speed: 40, onGround: false, pos: { x: 0, y: 200, z: 0 } }),
      { pitchIn: 1, rollIn: 1, throttleIn: 1 },
      400
    );
    expect(Math.abs(state.pitch)).toBeLessThanOrEqual(P.PITCH_LIM + 1e-6);
    expect(Math.abs(state.roll)).toBeLessThanOrEqual(P.ROLL_LIM + 1e-6);
  });
  it('不入参:返回全新对象,不改入参(纯函数契约)', () => {
    const s = fresh();
    const snap = JSON.parse(JSON.stringify(s));
    stepPlane(s, { groundHeightAt: flat, throttleIn: 1 }, 1 / 60);
    expect(s).toEqual(snap);
  });
});

describe('油门与滑跑', () => {
  it('加油门 → 速度单调上升;松油门 → 衰减到怠速附近', () => {
    const up = run(fresh(), { throttleIn: 1 }, 180);
    expect(up.state.speed).toBeGreaterThan(8);
    const idle = run(up.state, { throttleIn: -1 }, 600);
    expect(idle.state.speed).toBeLessThan(up.state.speed);
  });
  it('刹车在地面有效(需先收油门:全油门时推力大于刹车,推着走是物理正确的)', () => {
    const rolling = run(fresh(), { throttleIn: 1 }, 120).state;
    const cut = run(rolling, { throttleIn: -1 }, 60).state; // 收油门到怠速
    const braked = run(cut, { throttleIn: 0, brakeHold: true }, 60).state;
    expect(braked.speed).toBeLessThan(cut.speed);
  });
  it('空中刹车无效(机轮不工作,速度只被阻力慢慢吃掉)', () => {
    const air = fresh({ speed: 45, onGround: false, pos: { x: 0, y: 300, z: 0 } });
    const { state } = run(air, { throttleIn: -1, brakeHold: true }, 5);
    // 5 帧内不该有任何"急停",速度基本不变
    expect(state.speed).toBeGreaterThan(44);
  });
  it('静止不加油门几乎不动(怠速微弱,不是 0)', () => {
    const { state } = run(fresh(), {}, 120);
    expect(state.speed).toBeGreaterThan(0);
    expect(state.speed).toBeLessThan(2);
  });
});

describe('起飞(2026-10-03 核心手感)', () => {
  it('地面 + 速度不足 + 拉杆 → 不会离地', () => {
    const slow = fresh({ speed: 5 });
    const { state, flags } = run(slow, { pitchIn: -1, throttleIn: 0 }, 60);
    expect(state.onGround).toBe(true);
    expect(flags.some((f) => f.liftoff)).toBe(false);
  });
  it('地面 + 速度过阈值 + 拉杆 → 离地', () => {
    const fast = fresh({ speed: P.LIFT_ON + 6 });
    const { state, flags } = run(fast, { pitchIn: -1, throttleIn: 0 }, 20);
    expect(flags.some((f) => f.liftoff)).toBe(true);
    expect(state.onGround).toBe(false);
  });
  it('离地后爬升:保持拉杆与油门会持续升高', () => {
    const air = fresh({ speed: 30, onGround: false, pos: { x: 0, y: 200, z: 0 } });
    const { state } = run(air, { pitchIn: -0.35, throttleIn: 1 }, 300);
    expect(state.pos.y).toBeGreaterThan(200);
  });
  // 2026-10-03 线上实锤的 bug:输入层按键盘直觉把 ↓ 映射成 pitchIn=+1(应低头),
  // 玩家拉杆反而压机头,飞机永远抬不起来。这里钉死"负输入 = 抬头",
  // 任何改动输入映射的人都会立刻撞到这条断言。
  it('符号回归:pitchIn<0 拉杆必须抬头(不能低头)', () => {
    const air = fresh({ speed: 30, onGround: false, pos: { x: 0, y: 200, z: 0 } });
    const pull = run(air, { pitchIn: -0.5, throttleIn: 0.5 }, 60).state;
    const push = run(air, { pitchIn: 0.5, throttleIn: 0.5 }, 60).state;
    expect(pull.pitch).toBeGreaterThan(0.05); // 拉杆 → pitch 为正 = 机头上仰
    expect(push.pitch).toBeLessThan(-0.05); // 压杆 → pitch 为负 = 机头下俯
  });
  it('符号回归:地面全油门 + 拉杆必须能离地(整条起飞链路)', () => {
    // 起点在负地形高度上(坠机点实测 gh≈-2.2),验证离地判定不依赖"地面为 0"的假设
    const gh = -2.2;
    const s = fresh({ pos: { x: 0, y: gh + P.GROUND_CLEAR + P.WHEEL_R, z: 0 } });
    let cur = s;
    for (let i = 0; i < 270; i++)
      cur = stepPlane(cur, { groundHeightAt: () => gh, throttleIn: 1 }, 1 / 60).state;
    expect(cur.speed).toBeGreaterThan(P.LIFT_ON); // 滑跑够快
    for (let i = 0; i < 180; i++)
      cur = stepPlane(cur, { groundHeightAt: () => gh, throttleIn: 1, pitchIn: -1 }, 1 / 60).state;
    expect(cur.onGround).toBe(false); // 拉杆后离地
    expect(cur.pitch).toBeGreaterThan(0.1); // 而且机头确实是抬起来的
  });
});

describe('失速(真机灵魂,别把它"优化"掉)', () => {
  it('空中低速 → 垂直速度为负(掉高度),stall 标志置位', () => {
    const air = fresh({ speed: 6, onGround: false, pos: { x: 0, y: 300, z: 0 } });
    const { state, flags } = run(air, { pitchIn: -0.6, throttleIn: 0 }, 120);
    expect(flags.some((f) => f.stall)).toBe(true);
    expect(state.pos.y).toBeLessThan(300);
  });
  it('高速巡航不会掉高度(升力能抵消重力)', () => {
    const cruise = fresh({ speed: 50, onGround: false, pos: { x: 0, y: 300, z: 0 } });
    const { state } = run(cruise, { pitchIn: 0, throttleIn: 0.5 }, 300);
    expect(state.pos.y).toBeGreaterThan(250);
  });
  it('加油门可以改出失速(权力在飞行员手上)', () => {
    const stalled = fresh({ speed: 6, onGround: false, pos: { x: 0, y: 300, z: 0 } });
    const { state } = run(stalled, { throttleIn: 1, pitchIn: -0.3 }, 600);
    expect(state.speed).toBeGreaterThan(P.STALL_SPEED);
  });
});

describe('重着陆与摔机', () => {
  it('高速 + 大机头下俯 触地 → crash', () => {
    // ⚠️ 必须**主动推杆**(pitchIn>0)才能把机头压下去:飞行器有强俯仰稳定性,
    // 松杆后 0.4s 内自动回平(见"松杆后姿态回中"一例)。想撞地就得一直压着杆——
    // 这正是真机行为,也是玩家该学会的第一件事。
    const dive = fresh({ speed: 45, onGround: false, pos: { x: 0, y: 30, z: 0 } });
    const { flags } = run(dive, { pitchIn: 1 }, 260); // 约 4.3s,从 30m 俯冲到地
    expect(flags.some((f) => f.crash)).toBe(true);
  });
  it('松杆俯冲不会摔机(自动回中救回来了)——稳定性是有意义的保护', () => {
    const dive = fresh({ speed: 45, onGround: false, pitch: -0.5, pos: { x: 0, y: 30, z: 0 } });
    const { flags } = run(dive, {}, 240);
    expect(flags.some((f) => f.crash)).toBe(false);
  });
  it('低速轻着陆 → 不 crash(可以正常降落)', () => {
    const gentle = fresh({ speed: 12, onGround: false, pitch: -0.2, pos: { x: 0, y: 4, z: 0 } });
    const { flags } = run(gentle, {}, 120);
    expect(flags.some((f) => f.crash)).toBe(false);
  });
  it('触地后自动拉平(不会一直趴着)', () => {
    const dive = fresh({ speed: 15, onGround: false, pitch: -0.4, pos: { x: 0, y: 5, z: 0 } });
    const { state } = run(dive, {}, 180);
    if (state.onGround) expect(Math.abs(state.pitch)).toBeLessThan(0.2);
  });
});

describe('转向', () => {
  it('方向舵改变偏航(不输入方向舵时滚转自动带偏航)', () => {
    const air = fresh({ speed: 45, onGround: false, pos: { x: 0, y: 300, z: 0 } });
    const rud = run(air, { yawIn: 1, throttleIn: 0.5 }, 180);
    expect(rud.state.yaw).toBeGreaterThan(air.yaw);
  });
  it('滚转会带出偏航(协调转弯)', () => {
    const air = fresh({ speed: 45, onGround: false, pos: { x: 0, y: 300, z: 0 } });
    const banked = run(air, { rollIn: 1, throttleIn: 0.5 }, 180);
    expect(Math.abs(banked.state.yaw)).toBeGreaterThan(0.01);
  });
  it('松杆后姿态回中(不会永久保持大坡度)', () => {
    const banked = fresh({ speed: 45, onGround: false, roll: 0.9, pos: { x: 0, y: 300, z: 0 } });
    const { state } = run(banked, {}, 400);
    expect(Math.abs(state.roll)).toBeLessThan(0.35);
  });
});

describe('疆域与地面跟随', () => {
  it('飞出 BOUND_R 被钳回并置 boundaryHit', () => {
    const far = fresh({ speed: 200, onGround: false, pos: { x: P.BOUND_R + 500, y: 400, z: 0 } });
    const { state, flags } = run(far, {}, 1);
    expect(Math.hypot(state.pos.x, state.pos.z)).toBeLessThanOrEqual(P.BOUND_R + 1e-6);
    expect(flags[0].boundaryHit).toBe(true);
  });
  it('地形起伏:地面高度被采样,飞机贴着地形而不是穿地', () => {
    const hilly = (x) => 50 + x * 0.1; // 斜坡
    let s = fresh({ speed: 25, onGround: false, pos: { x: 0, y: 200, z: 0 } });
    for (let i = 0; i < 900; i++)
      s = stepPlane(s, { groundHeightAt: hilly, throttleIn: 0.3 }, 1 / 60).state;
    const floor = hilly(s.pos.x) + P.GROUND_CLEAR + P.WHEEL_R;
    expect(s.pos.y).toBeGreaterThanOrEqual(floor - 1e-6);
  });
});

describe('HUD 读数', () => {
  it('planePhase 覆盖停机/滑跑/失速/巡航', () => {
    expect(planePhase(fresh()).phase).toBe('parked');
    expect(planePhase(fresh({ speed: 8 })).phase).toBe('roll');
    expect(planePhase(fresh({ speed: 5, onGround: false })).phase).toBe('stall');
    expect(planePhase(fresh({ speed: 50, onGround: false })).phase).toBe('cruise');
  });
  it('planeSpeedKmh 换算正确', () => {
    expect(planeSpeedKmh({ speed: 10 })).toBe(36);
    expect(planeSpeedKmh({ speed: 0 })).toBe(0);
  });
});
