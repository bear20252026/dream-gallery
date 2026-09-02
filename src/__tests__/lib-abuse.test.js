// lib/abuse.js 反刷预警测试(2026-09-02 补覆盖第二批)
// 锁行为:单文件 >300MB 预警、同设备 10 分钟 >8 个文件预警、同类同人同文件去重、
//        正常小上传不误报。预警会写 gate_data + saveGateData,测试后快照恢复并回写。
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { gateData, saveGateData } = require('../../lib/store.js');
const { abuseCheck } = require('../../lib/abuse.js');

const DK = 'abuse-test-dk';
let snap;
beforeEach(() => {
  snap = JSON.stringify({
    uploads: gateData.uploads,
    applicants: gateData.applicants,
    alerts: gateData.alerts,
  });
  gateData.uploads = {};
  gateData.applicants = {};
  gateData.alerts = [];
});
afterEach(() => {
  const s = JSON.parse(snap);
  gateData.uploads = s.uploads;
  gateData.applicants = s.applicants;
  gateData.alerts = s.alerts;
  saveGateData(); // 回写干净快照,抵消 pushAlert 期间的落盘
});

function alertsOf(type) {
  return gateData.alerts.filter((a) => a.type === type && !a.dismissed);
}

describe('abuseCheck 反刷预警', () => {
  it('正常小上传(无历史)不产生任何预警', () => {
    abuseCheck(DK, 'photo1.jpg', 2 * 1024 * 1024);
    expect(gateData.alerts).toHaveLength(0);
  });

  it('单文件 >300MB → bigfile 预警', () => {
    abuseCheck(DK, 'huge.mp4', 301 * 1024 * 1024);
    expect(alertsOf('bigfile')).toHaveLength(1);
    expect(gateData.alerts[0].dk).toBe(DK);
  });

  it('同设备 10 分钟内 >8 个文件 → rate 预警(9 条历史触发)', () => {
    const now = Date.now();
    for (let i = 0; i < 9; i++) gateData.uploads['r' + i + '.jpg'] = { dk: DK, ts: now };
    abuseCheck(DK, 'r9.jpg', 1024);
    expect(alertsOf('rate')).toHaveLength(1);
    // 8 条历史恰好等于上限,不预警(规则是 >8);清掉上一段的 9 条历史再验
    gateData.alerts = [];
    gateData.uploads = {};
    const now2 = Date.now();
    for (let i = 0; i < 8; i++) gateData.uploads['e' + i + '.jpg'] = { dk: DK, ts: now2 };
    abuseCheck(DK, 'e8.jpg', 1024);
    expect(alertsOf('rate')).toHaveLength(0);
  });

  it('10 分钟外的历史不计入速率窗口', () => {
    const old = Date.now() - 11 * 60 * 1000;
    for (let i = 0; i < 20; i++) gateData.uploads['o' + i + '.jpg'] = { dk: DK, ts: old };
    abuseCheck(DK, 'new.jpg', 1024);
    expect(alertsOf('rate')).toHaveLength(0);
  });

  it('同类同人同文件 10 分钟内去重:连续触发 bigfile 只报一次', () => {
    abuseCheck(DK, 'huge.mp4', 301 * 1024 * 1024);
    abuseCheck(DK, 'huge.mp4', 301 * 1024 * 1024);
    expect(alertsOf('bigfile')).toHaveLength(1);
    // 换文件名则再报
    abuseCheck(DK, 'huge2.mp4', 301 * 1024 * 1024);
    expect(alertsOf('bigfile')).toHaveLength(2);
  });

  it('设备档案被标记 suspicious', () => {
    gateData.applicants['a1'] = { dk: DK, answer: '小明' };
    abuseCheck(DK, 'huge.mp4', 301 * 1024 * 1024);
    expect(gateData.applicants['a1'].suspicious).toBe(true);
    expect(gateData.alerts[0].name).toBe('小明');
  });
});
