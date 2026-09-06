// light-budget.js — 灯光限额选择器(纯逻辑,2026-09-07 场景自动化拆出)
// 背景(血泪):手机 GPU uniform 上限远低于电脑,点光源过多 → 着色器链接失败 →
// 建筑地形"整片隐形"且只有 console.error。此模块决定"留谁删谁",main.js 负责执行删除。
// 保留名单:命中的吊顶灯(每 keepEvery 留 1) + 画框射灯(前 spotKeep 盏)
//         + 高空钻石灯(y>30) + 远方信标(|x|>500)。其余一律在删除名单。
// 纯函数:传入遍历器与灯位清单,返回选择结果,不碰 three 场景(vitest 直接测)。

export function selectLightsToRemove(traverse, pls, opts = {}) {
  const isMobile = !!opts.isMobile;
  const keepEvery = isMobile ? 3 : 2;
  const spotKeep = isMobile ? 4 : 10;
  const ceil = new Set(pls.filter((p, i) => i % keepEvery === 0).map((p) => p.l));
  const remove = [];
  let spotSeen = 0;
  traverse(function (o) {
    if (o.isSpotLight) {
      if (spotSeen < spotKeep) spotSeen++;
      else {
        remove.push(o);
        if (o.target && o.target.parent) remove.push(o.target); // 射灯目标点随灯一起删
      }
      return;
    }
    if (!o.isPointLight) return;
    if (ceil.has(o)) return; // 保留:命中的吊顶灯
    if (o.position.y > 30 || Math.abs(o.position.x) > 500) return; // 保留:钻石灯/远方信标
    remove.push(o);
  });
  return { remove, ceil, keepEvery, spotKeep };
}
