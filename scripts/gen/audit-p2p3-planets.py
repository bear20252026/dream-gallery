# audit-p2p3-planets.py — planets.js 审计整改(P2 常量提顶/Z登记册接入/P3 死代码清理)
import io, re
p = r"C:\Users\17296\WorkBuddy\2026-08-29-08-24-29\dream-gallery\src\kunlun\planets.js"
t = io.open(p, encoding="utf-8").read()
orig_len = len(t)

# ---------- P2:z-index 接入登记册 ----------
t = t.replace(
    "import { hotBegin } from '../hot.js';",
    "import { hotBegin } from '../hot.js';\nimport { Z } from '../../shared/z-layers.mjs';",
    1,
)
t = t.replace(
    "'position:fixed;left:50%;bottom:95px;transform:translateX(-50%);z-index:60;",
    "'position:fixed;left:50%;bottom:95px;transform:translateX(-50%);z-index:'+Z.navBtn+';",
    1,
)
t = t.replace(
    "'position:fixed;left:50%;bottom:150px;transform:translateX(-50%);z-index:60;display:none;flex-direction:column;gap:10px;align-items:center'",
    "'position:fixed;left:50%;bottom:150px;transform:translateX(-50%);z-index:'+Z.navBtn+';display:none;flex-direction:column;gap:10px;align-items:center'",
    1,
)
t = t.replace(
    "'position:fixed;left:50%;bottom:120px;transform:translateX(-50%);z-index:60;display:none;padding:14px 36px;",
    "'position:fixed;left:50%;bottom:120px;transform:translateX(-50%);z-index:'+Z.navBtn+';display:none;padding:14px 36px;",
    1,
)

# ---------- P2:常量提顶(出生点/半径阈值,此前散落 2~3 份) ----------
consts = """
// ===================== 常量登记(2026-09-06 审计 P2:此前散落 2~3 份) =====================
const B612_SPAWN = { pos: [-1.5, 2, -8.5], yaw: Math.PI }; // 天幕壳内、星球正前方
const KING_SPAWN_Y = () => R * 0.42 + 1.6; // 星球岛面站立高度
const GATE_RADIUS = 4;   // 主世界石门自动传送半径(m)
const PAD_RADIUS = 3;    // 石台触发半径(m)
const DOOR_RADIUS = 2.5; // 岛上回程门半径(m)
const PICK_RADIUS = 3;   // 星屑拾取半径(m)
"""
anchor = "const worldManager = initSceneManager({"
assert anchor in t, "worldManager anchor missing"
t = t.replace(anchor, consts + "\n" + anchor, 1)

# 出生点替换(3 份 → 常量)
t = t.replace(
    """        // 天幕壳内、星球正前方(-z 侧),yaw=π 正对星球——第一眼即 SceneFull2 构图
        position: new THREE.Vector3(-1.5, 2, -8.5),
        yaw: Math.PI,""",
    """        position: new THREE.Vector3(...B612_SPAWN.pos),
        yaw: B612_SPAWN.yaw,""",
    1,
)
t = t.replace(
    """          // 天幕壳内、星球正前方,yaw=π 正对星球(与石台入口一致)
          position: new THREE.Vector3(-1.5, 2, -8.5),
          yaw: Math.PI,""",
    """          position: new THREE.Vector3(...B612_SPAWN.pos),
          yaw: B612_SPAWN.yaw,""",
    1,
)
t = t.replace(
    "        position: new THREE.Vector3(0, R * 0.42 + 1.6, 4),\n        yaw: 0,",
    "        position: new THREE.Vector3(0, KING_SPAWN_Y(), 4),\n        yaw: 0,",
    1,
)
t = t.replace(
    "          position: new THREE.Vector3(0, R * 0.42 + 1.6, 4),\n          yaw: 0,",
    "          position: new THREE.Vector3(0, KING_SPAWN_Y(), 4),\n          yaw: 0,",
    1,
)

# 距离阈值替换(平方比较使用常量)
t = t.replace(
    "const nearGate = dgx * dgx + dgz * dgz < 16; // 4m 范围自动传送",
    "const nearGate = dgx * dgx + dgz * dgz < GATE_RADIUS * GATE_RADIUS; // 石门自动传送半径",
    1,
)
t = t.replace(
    "const atGate = dgx * dgx + dgz * dgz < 9;",
    "const atGate = dgx * dgx + dgz * dgz < PAD_RADIUS * PAD_RADIUS;",
    1,
)
t = t.replace(
    "const near = dm2 < 9 && Math.abs(p.y - onIsland.topY) < 4;",
    "const near = dm2 < PICK_RADIUS * PICK_RADIUS && Math.abs(p.y - onIsland.topY) < 4;",
    1,
)

# ---------- P3:死代码清理 ----------
# ① veil(veilOn 全项目无调用点;veilOff 仅 backToGallery 空转)
m = re.search(r"/\* =+ 天幕色罩[^*]*?= \*/\nlet veil = null;\nfunction veilOn\(cfg\) \{.*?\n\}\nfunction veilOff\(\) \{.*?\n\}\n", t, re.S)
assert m, "veil block not found"
t = t.replace(m.group(0), "", 1)
t = t.replace(
    "function backToGallery() {\n  veilOff();\n  ctx.scene.toMainWorld();",
    "function backToGallery() {\n  ctx.scene.toMainWorld();",
    1,
)
# ② hookedDoor(无调用点)
m = re.search(r"function hookedDoor\(\) \{\n  backToGallery\(\);\n\}\n\n?", t)
assert m, "hookedDoor not found"
t = t.replace(m.group(0), "", 1)
# ③ 不可达后备分支(太空分支已 return;b612/king 段永不执行)+onIsland 拾取/回程门死逻辑
m = re.search(
    r"  setNav\(false\);\n  padBtn\.style\.display = 'none';\n"
    r"  // ==== B612 世界\(后备路径,正常被上方太空分支接管\) ====.*?"
    r"\n  \} else \{\n    pickBtn\.style\.display = 'none';\n    hud\.style\.display = 'none';\n  \}\n",
    t,
    re.S,
)
assert m, "unreachable tail not found"
t = t.replace(m.group(0), "  setNav(false);\n  padBtn.style.display = 'none';\n", 1)

# ④ pickBtn 整体退役(拾取玩法已由 spiritsCollectExternal 接管,显示逻辑全在死分支)
m = re.search(r"const pickBtn = document\.createElement\('button'\);\npickBtn\.style\.cssText =\n.*?\n", t, re.S)
assert m, "pickBtn creation not found"
t = t.replace(m.group(0), "", 1)
for pat in [
    r"    pickBtn\.style\.display = 'none';\n",
    r"      \} else pickBtn\.style\.display = 'none';\n",
    r"    pickBtn\.style\.display = 'none';\n",
]:
    t = re.sub(pat, "", t)
m = re.search(r"pickBtn\.onclick = function \(\) \{.*?\n\};\n", t, re.S)
assert m, "pickBtn onclick not found"
t = t.replace(m.group(0), "", 1)
t = t.replace("  pickBtn.remove();\n", "", 1)

io.open(p, "w", encoding="utf-8", newline="").write(t)
print("planets.js: %d -> %d chars" % (orig_len, len(t)))
