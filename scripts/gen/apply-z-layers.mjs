// apply-z-layers.mjs — 引导链四文件接入 z-layers 登记册(2026-09-06 审计 P2)
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(here, '..', '..');

function patch(rel, fn) {
  const p = path.join(root, rel);
  let t = fs.readFileSync(p, 'utf8');
  if (/z-layers/.test(t)) { console.log('skip(已接入):', rel); return; }
  const out = fn(t);
  fs.writeFileSync(p, out);
  console.log('patched:', rel);
}

// openfilm:z-580 → Z.film(样式在模板字符串内,用 ${} 注入)
patch('src/gate/openfilm.js', (t) =>
  t
    .replace(
      "import * as THREE from 'three';",
      "import * as THREE from 'three';\nimport { Z } from '../../shared/z-layers.mjs';",
      1
    )
    .replace(
      '#b612film{position:fixed;inset:0;z-index:580;',
      '#b612film{position:fixed;inset:0;z-index:${Z.film};',
      1
    )
);

// entrygate:z-150 → Z.gate(同为模板字符串)
patch('src/gate/entrygate.js', (t) =>
  t
    .replace(
      "import * as bootState from '../core/boot-state.js';",
      "import * as bootState from '../core/boot-state.js';\nimport { Z } from '../../shared/z-layers.mjs';",
      1
    )
    .replace(
      '#b612Gate{position:fixed;inset:0;z-index:150;',
      '#b612Gate{position:fixed;inset:0;z-index:${Z.gate};',
      1
    )
);

// story-dialogs:z-12 → Z.worldFx
patch('src/kunlun/story-dialogs.js', (t) =>
  t
    .replace(
      "import { hotBegin } from '../hot.js';",
      "import { hotBegin } from '../hot.js';\nimport { Z } from '../../shared/z-layers.mjs';",
      1
    )
    .replace(
      "labelRenderer.domElement.style.cssText =\n  'position:fixed;inset:0;z-index:12;",
      "labelRenderer.domElement.style.cssText =\n  'position:fixed;inset:0;z-index:' + Z.worldFx + ';",
      1
    )
);

// main.js:guideCard z-75 → Z.guideCard
patch('src/main.js', (t) =>
  t
    .replace(
      "import * as bootState from './core/boot-state.js';",
      "import * as bootState from './core/boot-state.js';\nimport { Z } from './shared/z-layers.mjs';",
      1
    )
    .replace(
      'transform:translateX(-50%);z-index:75;',
      "transform:translateX(-50%);z-index:' + Z.guideCard + ';",
      1
    )
);
console.log('z-layers applied');
