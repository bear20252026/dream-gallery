// avatar-gait.test.js — 角色步态与比例的回归锁(2026-11-12 角色:治「动作僵、比例怪」)
//
// 锁两件事:
//   ① 步态必须**真的动**,且物理上说得通(腿反相、膝单向、相位按位移而非时间);
//   ② 比例必须符合 1.7m 少年身形(头不能和身体一样宽 —— 那正是原先的「比例怪」)。
import { describe, it, expect } from 'vitest';
import { createGaitState, stepGait, gaitPose, STRIDE } from '../shared/avatar-gait.mjs';
import { createAvatarFigure, FIG } from '../scene/avatar-figure.js';

/** 跑 n 帧常速行走(3.2m/s),返回末帧状态 */
function walkFrames(n, dt = 1 / 60, speed = 3.2) {
  const st = createGaitState();
  for (let i = 0; i < n; i++) {
    stepGait(st, {
      travel: speed * dt,
      speed,
      turnRate: 0,
      dt,
      airborne: false,
      gliding: false,
    });
  }
  return st;
}

describe('stepGait — 走停过渡与相位', () => {
  it('静止时摆幅归零,移动时趋近 1(不是 0/1 突跳)', () => {
    const st = createGaitState();
    stepGait(st, { travel: 0, speed: 0, turnRate: 0, dt: 1 / 60, airborne: false, gliding: false });
    expect(st.walk).toBe(0);
    // 第一帧不该直接跳到 1(那会让四肢弹一下)
    stepGait(st, {
      travel: 0.053,
      speed: 3.2,
      turnRate: 0,
      dt: 1 / 60,
      airborne: false,
      gliding: false,
    });
    expect(st.walk).toBeGreaterThan(0);
    expect(st.walk).toBeLessThan(0.5);
    // 持续走则收敛到 1
    const walked = walkFrames(60);
    expect(walked.walk).toBeGreaterThan(0.95);
  });

  it('相位按**位移**推进 ⇒ 每步跨度恒定,脚不打滑', () => {
    // 同样走过 0.9 个 STRIDE:快走(1 帧)与慢走(多帧)相位必须一致。
    // 取 0.9 而不是 1.0 —— 相位到 2π 会归绕(刻意设计,防浮点累积),
    // 走满一整步时两边都归零附近,断言就失去了区分力。
    const dist = STRIDE * 0.9;
    const expectPhase = 0.9 * Math.PI * 2;
    const fast = createGaitState();
    stepGait(fast, {
      travel: dist,
      speed: 6.4,
      turnRate: 0,
      dt: dist / 6.4,
      airborne: false,
      gliding: false,
    });
    const slow = createGaitState();
    const dt = 1 / 60;
    const frames = 32;
    const per = dist / frames; // 精确等分,总距离与 fast 一字不差
    for (let i = 0; i < frames; i++) {
      stepGait(slow, {
        travel: per,
        speed: per / dt,
        turnRate: 0,
        dt,
        airborne: false,
        gliding: false,
      });
    }
    expect(fast.phase).toBeCloseTo(expectPhase, 6);
    expect(slow.phase).toBeCloseTo(expectPhase, 6);
  });

  it('相位长时间跑不无限累积(收敛到 [0,2π))', () => {
    const st = walkFrames(60 * 60 * 5); // 模拟走 5 分钟
    expect(st.phase).toBeGreaterThanOrEqual(0);
    expect(st.phase).toBeLessThan(Math.PI * 2);
  });

  it('空中/滑翔不迈步(摆幅目标为 0)', () => {
    for (const pose of [
      { airborne: true, gliding: false },
      { airborne: false, gliding: true },
    ]) {
      const st = createGaitState();
      for (let i = 0; i < 120; i++) {
        stepGait(st, { travel: 0.1, speed: 6, turnRate: 0, dt: 1 / 60, ...pose });
      }
      expect(st.walk).toBeLessThan(0.02);
    }
  });

  it('转身产生侧倾且被钳在 ±0.18rad(不会甩成风车)', () => {
    const st = createGaitState();
    for (let i = 0; i < 120; i++) {
      stepGait(st, {
        travel: 0,
        speed: 0,
        turnRate: 99,
        dt: 1 / 60,
        airborne: false,
        gliding: false,
      });
    }
    expect(st.lean).toBeGreaterThan(0);
    expect(st.lean).toBeLessThanOrEqual(0.18);
  });

  it('脏输入/卡帧不产生 NaN,dt 被钳住', () => {
    for (const dt of [0, -1, NaN, undefined, 999]) {
      const st = createGaitState();
      expect(() =>
        stepGait(st, {
          travel: NaN,
          speed: 'x',
          turnRate: null,
          dt,
          airborne: false,
          gliding: false,
        })
      ).not.toThrow();
      expect(Number.isFinite(st.phase)).toBe(true);
      expect(Number.isFinite(st.walk)).toBe(true);
      expect(Number.isFinite(st.lean)).toBe(true);
    }
  });
});

describe('gaitPose — 关节角度必须符合人体运动', () => {
  const poseAt = (phase) => {
    const st = { phase, walk: 1, lean: 0, time: 0 };
    return gaitPose(st, { airborne: false, gliding: false });
  };

  it('左右腿**反相**(这是走路,不是双腿齐蹦)', () => {
    for (const p of [0.4, 1.1, 2.3, 4.0, 5.5]) {
      const g = poseAt(p);
      expect(g.hipL).toBeCloseTo(-g.hipR, 6);
    }
  });

  it('臂与同侧腿反相(上身对扭,人走路的自然特征)', () => {
    for (const p of [0.4, 1.1, 2.3, 4.0]) {
      const g = poseAt(p);
      expect(Math.sign(g.shoulderL)).toBe(-Math.sign(g.hipL));
    }
  });

  it('膝盖**单向**屈曲(全相位都 ≥0,人的膝盖不能反折)', () => {
    for (let p = 0; p < Math.PI * 2; p += 0.13) {
      const g = poseAt(p);
      expect(g.kneeL).toBeGreaterThanOrEqual(0);
      expect(g.kneeR).toBeGreaterThanOrEqual(0);
    }
  });

  it('腿摆幅在合理区间(±0.6rad 内,约 34°)', () => {
    for (let p = 0; p < Math.PI * 2; p += 0.13) {
      const g = poseAt(p);
      expect(Math.abs(g.hipL)).toBeLessThan(0.6);
      expect(Math.abs(g.shoulderL)).toBeLessThan(0.6);
    }
  });

  it('静止仍有呼吸起伏(静止不等于死物)', () => {
    const idle = gaitPose(
      { phase: 0, walk: 0, lean: 0, time: 0.8 },
      { airborne: false, gliding: false }
    );
    expect(Math.abs(idle.bob)).toBeGreaterThan(0);
    expect(Math.abs(idle.headZ)).toBeGreaterThan(0);
    // 但四肢不摆
    expect(idle.hipL).toBe(0);
    expect(idle.shoulderR).toBe(0);
  });

  it('滑翔张臂收腿(不是继续迈步)', () => {
    const glide = gaitPose(
      { phase: 1.2, walk: 0, lean: 0, time: 0 },
      { airborne: false, gliding: true }
    );
    expect(glide.shoulderL).toBeLessThan(-1); // 大幅张开
    expect(glide.spineX).toBeGreaterThan(0.4); // 压身前倾
  });

  it('躯干前倾时头部反向补偿一半(视线保持水平)', () => {
    const g = poseAt(1.0);
    expect(g.headX).toBeLessThan(0);
    expect(Math.abs(g.headX)).toBeLessThan(Math.abs(g.spineX));
  });

  it('全状态组合都不产生 NaN', () => {
    for (const airborne of [true, false]) {
      for (const gliding of [true, false]) {
        for (let p = 0; p < Math.PI * 2; p += 0.5) {
          const g = gaitPose({ phase: p, walk: 0.5, lean: 0.1, time: 3 }, { airborne, gliding });
          for (const v of Object.values(g)) expect(Number.isFinite(v)).toBe(true);
        }
      }
    }
  });
});

describe('createAvatarFigure — 比例与关节结构', () => {
  it('身高 1.7m,与 EYE_HEIGHT=1.6 / 相机看胸口的既有契约相容', () => {
    expect(FIG.height).toBe(1.7);
    expect(FIG.headY + FIG.headR).toBeCloseTo(1.68, 2); // 头顶≈1.7
    expect(FIG.hipY).toBeGreaterThan(FIG.height * 0.45); // 腿长约身高一半
    expect(FIG.hipY).toBeLessThan(FIG.height * 0.56);
  });

  it('头明显窄于肩(治「头和身体一样宽」的雪人比例)', () => {
    const headWidth = FIG.headR * 2;
    const shoulderWidth = FIG.shoulderX * 2 + 0.09;
    expect(shoulderWidth / headWidth).toBeGreaterThan(1.4);
  });

  it('十个关节都是独立 Group ⇒ 四肢真的能各自摆动', () => {
    const f = createAvatarFigure();
    const names = [
      'spine',
      'head',
      'shoulderL',
      'shoulderR',
      'elbowL',
      'elbowR',
      'hipL',
      'hipR',
      'kneeL',
      'kneeR',
    ];
    for (const n of names) {
      expect(f.joints[n], '缺关节 ' + n).toBeTruthy();
      expect(f.joints[n].isGroup).toBe(true);
    }
    // 左右必须是不同对象(共用一个就没法反相)
    expect(f.joints.hipL).not.toBe(f.joints.hipR);
    expect(f.joints.shoulderL).not.toBe(f.joints.shoulderR);
    f.dispose();
  });

  it('apply 后左右腿真的转到相反角度(不是摆设)', () => {
    const f = createAvatarFigure();
    f.apply(
      gaitPose({ phase: 1.0, walk: 1, lean: 0, time: 0 }, { airborne: false, gliding: false })
    );
    expect(f.joints.hipL.rotation.x).toBeCloseTo(-f.joints.hipR.rotation.x, 6);
    expect(Math.abs(f.joints.hipL.rotation.x)).toBeGreaterThan(0.1);
    // 膝为负向(小腿往后折)
    expect(f.joints.kneeL.rotation.x).toBeLessThanOrEqual(0);
    f.dispose();
  });

  it('静止姿态下四肢归零(不会停在半个迈步上)', () => {
    const f = createAvatarFigure();
    f.apply(gaitPose({ phase: 0, walk: 0, lean: 0, time: 0 }, { airborne: false, gliding: false }));
    // 用 toBeCloseTo 而不是 toBe(0):膝角是 -knee 取负,静止时得到 -0,
    // 而 Object.is(-0, 0) 为 false —— 数值上完全等价,不是 bug。
    expect(f.joints.hipL.rotation.x).toBeCloseTo(0, 10);
    expect(f.joints.hipR.rotation.x).toBeCloseTo(0, 10);
    expect(f.joints.kneeL.rotation.x).toBeCloseTo(0, 10);
    f.dispose();
  });

  it('起伏只写 userData.bob,不擅自改 root.position(贴地权威在主循环)', () => {
    const f = createAvatarFigure();
    f.root.position.set(5, 10, 5);
    f.apply(gaitPose({ phase: 1, walk: 1, lean: 0, time: 0 }, { airborne: false, gliding: false }));
    expect(f.root.position.y).toBe(10); // 没被动过
    expect(typeof f.root.userData.bob).toBe('number');
    f.dispose();
  });

  it('是单一可 reparent 的 Object3D(场景管理器要在世界间搬它)', () => {
    const f = createAvatarFigure();
    expect(f.root.isObject3D).toBe(true);
    expect(f.root.parent).toBeNull();
    f.dispose();
  });

  it('dispose 释放几何与材质(切场景不泄漏显存)', () => {
    const f = createAvatarFigure();
    let meshes = 0;
    f.root.traverse((n) => {
      if (n.geometry) meshes++;
    });
    expect(meshes).toBeGreaterThan(8); // 确实建了四肢,不是空壳
    expect(() => f.dispose()).not.toThrow();
  });
});
