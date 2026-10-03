// 玩家只记录回忆，不改变原著中的人物、对白和结果。
const t = (zh, en) => ({ zh, en });
export const JOURNEY_TEXT = {
  heading: t('旅途手札', 'Travel notebook'),
  memory: t('回忆中的旁观者', 'A witness inside a memory'),
  rule: t(
    '过去听不见你。你可以观察、走近，把看见的留在手札里。',
    'The past cannot hear you. Explore and keep what you notice in your notebook.'
  ),
  observe: t('观察这里', 'Observe here'),
  approach: t('走近光点，再观察', 'Approach the light, then observe'),
  saved: t('一段记忆，留在了手札里', 'A memory kept in your notebook'),
  open: t('翻开手札', 'Open notebook'),
  close: t('继续旅途', 'Continue journey'),
  empty: t(
    '从沙漠出发。你看见的细节，会慢慢填满这些书页。',
    'Begin in the desert. The details you notice will fill these pages.'
  ),
  action: t('此刻要做', 'Your next action'),
  real: t('沙漠 · 现实', 'Desert · present'),
  home: t('B612 · 家的回忆', 'B612 · memories of home'),
  king: t('325 · 国王的回忆', '325 · memory of the King'),
  wrongClock: t(
    '再看看历书：不是八点，也不是七点。是七点四十分。',
    'Check the almanac: not eight, not seven. Twenty minutes to eight.'
  ),
  confirmClock: t('记下这个时刻', 'Mark this moment'),
  clockHint: t(
    '转动手札的时间刻度，找到历书里的 19:40。你定位的是回忆，不是在命令太阳。',
    'Move the notebook dial to 19:40, the time in the almanac. You locate a memory; you do not command the sun.'
  ),
  dialLabel: t('时间刻度 · 18:00—20:30', 'Time dial · 18:00–20:30'),
  keep: t('让它长大', 'Let it grow'),
  mark: t('标记需要留意的树苗', 'Mark the sprout to watch'),
  wrongPlant: t(
    '再看一眼画里的叶片与花苞。这里是在辨认，不是在拔掉过去的植物。',
    'Look again at the leaves and bud. You identify the drawing without changing the past.'
  ),
  pickCold: t(
    '哪一座没有烟？在手札上圈出来。',
    'Which one has no smoke? Circle it in your notebook.'
  ),
  wrongCold: t(
    '这座仍有细烟。再看一看另两座。',
    'This one still has a thread of smoke. Look at the other two.'
  ),
  reflection: t(
    '不用选“正确答案”。留下你最想记住的细节。',
    'There is no correct answer. Keep the detail you want to remember.'
  ),
  route: [
    t('开场', 'Opening'),
    t('沙漠', 'Desert'),
    t('B612 · 家', 'B612 · home'),
    t('325 · 国王', '325 · King'),
  ],
};

export const MEMORIES = {
  volcano: {
    title: t('三座火山', 'Three volcanoes'),
    note: t(
      '两座冒着烟，第三座安静着。“不过，谁知道呢。”',
      'Two smoke; the third is quiet. But one never knows.'
    ),
    symbol: 'volcano',
    source: 'Ch. 9 / 剧本第3场',
  },
  baobab: {
    title: t('小小的树苗', 'The little sprouts'),
    note: t(
      '同样幼小的芽，需要仔细分辨。有些事，不能留到明天。',
      'Small sprouts deserve attention. Some work cannot wait until tomorrow.'
    ),
    symbol: 'sprout',
    source: 'Ch. 5 / 剧本第3场',
  },
  sunset: {
    title: t('追着日落走', 'Following a sunset'),
    note: t(
      '在很小的星球上，只需挪动几步。他曾看过四十四次日落。',
      'On a tiny planet, a few steps are enough. Once he watched forty-four sunsets.'
    ),
    symbol: 'sunset',
    source: 'Ch. 6 / 剧本第3场',
  },
  rose: {
    title: t('她的告别', 'Her goodbye'),
    note: t(
      '记下她的香气、她的四根刺，或者她没让他看见的眼泪。',
      'Keep her fragrance, her four thorns, or the tears she did not let him see.'
    ),
    symbol: 'rose',
    source: 'Ch. 8–9 / 剧本第4–5场',
  },
  almanac: {
    title: t('七点四十分', 'Twenty minutes to eight'),
    note: t(
      '国王翻开历书，等时机成熟。手札记住了这个时刻。',
      'The King consults his almanac and waits for favourable conditions. Your notebook keeps the time.'
    ),
    symbol: 'clock',
    source: 'Ch. 10 / 剧本第6场',
  },
  rat: {
    title: t('王座后的声音', 'A sound behind the throne'),
    note: t(
      '他拥有整个星球，却只能提起一只夜里听见的老耗子。',
      'He rules a whole planet, yet speaks of one old rat he hears at night.'
    ),
    symbol: 'rat',
    source: 'Ch. 10 / 剧本第6场',
  },
  king: {
    title: t('一位大使，一颗星屑', 'An ambassador and a star'),
    note: t(
      '你见证了告别。故事仍要继续，星屑与观察都留在你的手札里。',
      'You witnessed a departure. The story continues; the star and your observations stay in your notebook.'
    ),
    symbol: 'star',
    source: 'Ch. 10 / 剧本第6场',
  },
};

export const TASKS = {
  volcano: {
    world: 'b612',
    kind: 'survey',
    title: t('走近三座火山，找出安静的那一座', 'Visit the three volcanoes; find the quiet one'),
    hint: t(
      '每座都走近看一眼。火山口的烟，会告诉你答案。',
      'Visit each one. The smoke above the craters holds the clue.'
    ),
    points: [
      {
        x: -4.6,
        z: -5.2,
        label: t('左侧火山', 'Left volcano'),
        detail: t('火山口升起一缕细烟。', 'A fine thread of smoke rises from the crater.'),
      },
      {
        x: -0.8,
        z: -6.6,
        label: t('中间火山', 'Middle volcano'),
        detail: t('这一座也在冒烟。', 'This one is smoking too.'),
      },
      {
        x: 3.8,
        z: -5.4,
        label: t('右侧火山', 'Right volcano'),
        detail: t('火山口是安静的，没有烟。', 'The crater is quiet. No smoke.'),
      },
    ],
    answer: 2,
  },
  baobab: {
    world: 'b612',
    kind: 'sort',
    title: t('在手札里辨认两株幼苗', 'Identify two sprouts in your notebook'),
    hint: t(
      '辨认已经长出特征的幼苗：玫瑰可以留下，面包树需要留意。',
      'Identify sprouts that have grown distinct features: keep the rose; watch the baobab.'
    ),
    plants: ['rose', 'baobab'],
  },
  sunset: {
    world: 'b612',
    kind: 'trail',
    title: t('挪动几步，把日落留在手札里', 'Take a few steps; keep the sunset'),
    hint: t(
      '跟着光点走，找到三个不同的观看位置。',
      'Follow the light to three different viewpoints.'
    ),
    points: [
      {
        x: -5.8,
        z: -0.6,
        label: t('第一处日落', 'First sunset view'),
        detail: t(
          '第一眼，太阳还在地平线上。换一个位置，再看一次。',
          'The sun rests above the horizon. Move a little and look again.'
        ),
      },
      {
        x: -5.1,
        z: 3.1,
        label: t('换一个位置', 'A different viewpoint'),
        detail: t(
          '挪了几步，金色渐渐变成橘红。还有最后一处观看位置。',
          'A few steps later, gold turns to orange. One more viewpoint awaits.'
        ),
      },
      {
        x: -1.4,
        z: 4.5,
        label: t('再看一眼', 'One more look'),
        detail: t('最后一抹红色，留在了手札里。', 'The last red glow stays in your notebook.'),
      },
    ],
  },
  rose: {
    world: 'b612',
    kind: 'keepsake',
    title: t('你想记住她的什么？', 'What will you remember about her?'),
    hint: JOURNEY_TEXT.reflection,
    choices: [
      t('她给他的香气', 'The fragrance she gave him'),
      t('那四根小小的刺', 'Her four little thorns'),
      t('她藏起来的眼泪', 'The tears she hid'),
    ],
  },
  almanac: {
    world: 'king325',
    kind: 'clock',
    title: t('读懂国王的历书', 'Read the King’s almanac'),
    hint: JOURNEY_TEXT.clockHint,
  },
  rat: {
    world: 'king325',
    kind: 'listen',
    title: t('绕过王座，留意夜里的声音', 'Walk around the throne; listen to the night'),
    hint: t(
      '走近光点听一听。你在追踪声音，没有谁需要被审判。',
      'Listen near the lights. You follow a sound; nobody needs to be judged.'
    ),
    points: [
      {
        x: 4.5,
        z: 1,
        label: t('披风旁', 'Beside the mantle'),
        detail: t('这里只有披风摩擦的细响。', 'Only the soft rustle of the mantle.'),
      },
      {
        x: -4.5,
        z: -1,
        label: t('王座另一侧', 'The other side of the throne'),
        detail: t(
          '暗处传来极轻的窸窣。把这个声音记下来。',
          'A faint rustle comes from the dark. Keep that sound.'
        ),
      },
    ],
    answer: 1,
  },
};

export function cleanMemories(raw) {
  if (!Array.isArray(raw)) return [];
  const seen = new Set();
  return raw
    .filter((e) => e && Object.hasOwn(MEMORIES, e.id) && !seen.has(e.id) && seen.add(e.id))
    .map((e) => ({
      id: e.id,
      choice: Number.isInteger(e.choice) && e.choice >= 0 && e.choice < 3 ? e.choice : null,
    }));
}

export function formatMemoryTime(minutes) {
  const m = Math.max(0, Math.min(1439, Math.round(Number(minutes) || 0)));
  return String(Math.floor(m / 60)).padStart(2, '0') + ':' + String(m % 60).padStart(2, '0');
}

export function isAlmanacTime(minutes) {
  return Number(minutes) === 19 * 60 + 40;
}

export function nearMemoryPoint(point, player, world, taskWorld, flightLock = false) {
  return !!(
    !flightLock &&
    world === taskWorld &&
    point &&
    player &&
    Math.hypot(player.x - point.x, player.z - point.z) <= 1.8
  );
}

// 只恢复任务内的已观察部分；完成奖励仍由真实互动收束。
export function taskCheckpoint(id, raw) {
  if (!Object.hasOwn(TASKS, id)) return null;
  const spec = TASKS[id];
  if (!spec || !raw || raw.id !== id || raw.world !== spec.world) return null;
  const maxStep =
    spec.kind === 'survey'
      ? spec.points.length
      : spec.points
        ? spec.points.length - 1
        : spec.kind === 'sort'
          ? spec.plants.length - 1
          : 0;
  const step = Math.min(maxStep, Math.max(0, Math.floor(Number(raw.step) || 0)));
  const minutes = raw.minutes == null ? NaN : Number(raw.minutes);
  return {
    step,
    visited: spec.kind === 'survey' ? Array.from({ length: step }, (_, i) => i) : [],
    minutes: Number.isFinite(minutes)
      ? Math.max(1080, Math.min(1230, Math.round(minutes / 5) * 5))
      : 1110,
  };
}
