# wire-entrygate-bootstate.py — entrygate 接入 boot-state(2026-09-06 审计 P2)
import io
p = r"C:\Users\17296\WorkBuddy\2026-08-29-08-24-29\dream-gallery\src\gate\entrygate.js"
t = io.open(p, encoding="utf-8").read()

old_imp = "import { ctx } from '../ctx.js';"
new_imp = "import { ctx } from '../ctx.js';\nimport * as bootState from '../core/boot-state.js';"
if new_imp not in t:
    assert old_imp in t, "import anchor missing"
    t = t.replace(old_imp, new_imp, 1)

old_fn = "export function setupEntryGate(opts) {\n  opts = opts || {};\n  build(opts);\n}"
new_fn = ("export function setupEntryGate(opts) {\n  opts = opts || {};\n"
          "  // 审计 P1-R2:引导期 60s 超时已放行的话,迟到的闸门不再构建\n"
          "  if (bootState.get('gateFailed')) return;\n  build(opts);\n}")
if new_fn not in t:
    assert old_fn in t, "fn anchor missing"
    t = t.replace(old_fn, new_fn, 1)

old_enter = "        startAgreementMusic();\n        window.__gatePassed = true;"
new_enter = "        startAgreementMusic();\n        bootState.markGatePassed();"
if old_enter in t:
    t = t.replace(old_enter, new_enter, 1)
# 注:ENTER 信号的主体接线在 main.js 的 onEnter(onEnter → bootState.markGatePassed),
# entrygate 自身无 window.__gatePassed,故此处无 ③。

io.open(p, "w", encoding="utf-8", newline="").write(t)
print("entrygate wired to boot-state")
