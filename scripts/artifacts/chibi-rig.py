# chibi-prince 程序化绑骨 + 动画烘焙 (Blender 5.2 headless)
# 用法: blender.exe -b -P chibi-rig.py
# 产物: models/b612/chibi-prince-rigged-v2.glb (含 Idle/Walk/Wave/Hop 四段动画)
import bpy, math
from mathutils import Vector

SRC = "C:/Users/17296/WorkBuddy/2026-08-29-08-24-29/dream-gallery/models/b612/chibi-prince.glb"
OUT = "C:/Users/17296/WorkBuddy/2026-08-29-08-24-29/dream-gallery/models/b612/chibi-prince-rigged-v2.glb"

bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=SRC)

# ---------- 1. 碎岛化 + 分类 ----------
objs = [o for o in bpy.context.scene.objects if o.type == 'MESH']
bpy.ops.object.select_all(action='DESELECT')
for o in objs:
    o.select_set(True)
bpy.context.view_layer.objects.active = objs[0]
bpy.ops.mesh.separate(type='LOOSE')

def classify(name, ctr):
    base = name.split('.')[0]
    z, x, y = ctr.z, ctr.x, ctr.y
    if base == 'Object_2':
        return 'stars'
    if base == 'Object_9':
        return 'scarf'
    if base in ('Object_4', 'Object_6', 'Object_8', 'Object_7'):
        return 'head'
    if base == 'Object_3':
        if z < -128:
            return 'legL' if x < 0 else 'legR'
        if y > 90 and z > -75:
            return 'head'
        if abs(x) > 35:
            return 'armL' if x < 0 else 'armR'
        if z > -75:
            return 'head'
        return 'spine'
    if base == 'Object_5':
        if y < 60 and z > -60:
            return 'head'
        if z < -128:
            return 'legL' if x < 0 else 'legR'
        return 'spine'
    return 'stars'

islands = {}
for o in bpy.context.scene.objects:
    if o.type != 'MESH':
        continue
    mn = Vector((1e9,)*3); mx = Vector((-1e9,)*3)
    for c in o.bound_box:
        w = o.matrix_world @ Vector(c)
        mn = Vector(map(min, mn, w)); mx = Vector(map(max, mx, w))
    cls = classify(o.name, (mn + mx) / 2)
    islands.setdefault(cls, []).append(o)
print("RIG classes:", {k: len(v) for k, v in islands.items()})

# ---------- 2. 每个碎岛整体绑到对应骨骼 (顶点组 weight=1) ----------
for cls, lst in islands.items():
    for o in lst:
        vg = o.vertex_groups.new(name=cls)
        vg.add(list(range(len(o.data.vertices))), 1.0, 'REPLACE')

# ---------- 3. 按类合并 mesh (425 岛 -> 8 mesh) ----------
for cls in islands:
    bpy.ops.object.select_all(action='DESELECT')
    lst = islands[cls]
    for o in lst:
        o.select_set(True)
    bpy.context.view_layer.objects.active = lst[0]
    bpy.ops.object.join()
bpy.ops.object.select_all(action='DESELECT')
merged = [o for o in bpy.context.scene.objects if o.type == 'MESH']
print("RIG merged meshes:", len(merged))

# ---------- 4. 建骨架 ----------
arm_data = bpy.data.armatures.new("ChibiRig")
arm = bpy.data.objects.new("ChibiRig", arm_data)
bpy.context.scene.collection.objects.link(arm)
bpy.context.view_layer.objects.active = arm
bpy.ops.object.mode_set(mode='EDIT')

BONES = {  # name: (head, tail, parent)
    'root':   ((0, 0, -195), (0, 0, -140), None),
    'spine':  ((0, 0, -110), (0, 0, -62), 'root'),
    'head':   ((0, 95, -60), (0, 100, 25), 'spine'),
    'armL':   ((-28, 25, -60), (-50, 10, -85), 'spine'),
    'armRctl': ((33, 45, -65), (33, 45, -25), 'spine'),
    'armR':   ((28, 25, -60), (52, 40, -100), 'armRctl'),
    'legL':   ((-18, 70, -122), (-18, 70, -196), 'root'),
    'legR':   ((18, 70, -122), (18, 70, -196), 'root'),
    'scarf1': ((0, 75, -80), (0, 120, -72), 'spine'),
    'scarf2': ((0, 120, -72), (0, 175, -68), 'scarf1'),
    'scarf3': ((0, 175, -68), (0, 235, -64), 'scarf2'),
    'stars':  ((0, 0, -195), (0, 0, -100), 'root'),
}
ebs = arm_data.edit_bones
for name, (h, t, par) in BONES.items():
    eb = ebs.new(name)
    eb.head, eb.tail = Vector(h), Vector(t)
    if par:
        eb.parent = ebs[par]
        eb.use_connect = False
bpy.ops.object.mode_set(mode='OBJECT')

# mesh 挂骨架: parent + armature modifier (顶点组已建好, 不用自动权重)
for o in merged:
    o.parent = arm
    mod = o.modifiers.new("Armature", 'ARMATURE')
    mod.object = arm

# 关键(2026-09-25 位置偏移根因): join 后每个 mesh 的原点留在首个碎岛中心,
# three.js 对蒙皮网格用节点空间算包围盒、渲染却走骨骼空间 → 原点残差 = 视觉位移。
# 把平移烘进顶点数据, 节点变换归零, 包围盒=蒙皮渲染位, 游戏 Box3 贴地修正才正确。
for o in merged:
    bpy.ops.object.select_all(action='DESELECT')
    o.select_set(True)
    bpy.context.view_layer.objects.active = o
    bpy.ops.object.transform_apply(location=True, rotation=False, scale=False)

# ---------- 5. 动画 ----------
def new_action(name):
    act = bpy.data.actions.new(name)
    ad = arm.animation_data_create()
    ad.action = act
    try:
        if getattr(ad, 'action_slot', None) is None and getattr(act, 'slots', []):
            ad.action_slot = act.slots[0]
    except Exception as e:
        print("RIG slot warn:", e)
    return act

def key_bone(bone, channel, keys, frames):
    pb = arm.pose.bones[bone]
    pb.rotation_mode = 'XYZ'
    dp = "pose.bones[\"%s\"].%s" % (bone, channel)
    for f, v in zip(frames, keys):
        if channel == 'location':
            pb.location = v
        else:
            pb.rotation_euler = v
        pb.keyframe_insert(data_path=channel.replace('rotation_euler', 'rotation') if False else channel, frame=f)

V3 = lambda x=0, y=0, z=0: (x, y, z)

# --- Idle: 2s 循环 呼吸+点头+围巾飘+轻起伏 ---
new_action("ChibiIdle")
key_bone('spine', 'rotation_euler', [V3(0.025), V3(-0.02), V3(0.025)], [1, 25, 49])
key_bone('head', 'rotation_euler', [V3(0.03, 0, 0.05), V3(-0.025, 0, -0.05), V3(0.03, 0, 0.05)], [1, 25, 49])
key_bone('scarf1', 'rotation_euler', [V3(0.06), V3(-0.05), V3(0.06)], [1, 25, 49])
key_bone('scarf2', 'rotation_euler', [V3(-0.08), V3(0.07), V3(-0.08)], [1, 25, 49])
key_bone('scarf3', 'rotation_euler', [V3(0.12), V3(-0.10), V3(0.12)], [1, 25, 49])
key_bone('armL', 'rotation_euler', [V3(0.03), V3(-0.03), V3(0.03)], [1, 25, 49])
key_bone('armR', 'rotation_euler', [V3(-0.03), V3(0.03), V3(-0.03)], [1, 25, 49])
key_bone('root', 'location', [V3(z=0), V3(z=1.5), V3(z=0)], [1, 25, 49])
mark = bpy.data.actions["ChibiIdle"]
mark.use_cyclic = True

# --- Walk: 1.5s 循环 摆腿摆臂+起伏+轻摆身 ---
new_action("ChibiWalk")
F = [1, 10, 19, 28, 37]
key_bone('legL', 'rotation_euler', [V3(-0.3), V3(0), V3(0.3), V3(0), V3(-0.3)], F)
key_bone('legR', 'rotation_euler', [V3(0.3), V3(0), V3(-0.3), V3(0), V3(0.3)], F)
key_bone('armL', 'rotation_euler', [V3(0.2), V3(0), V3(-0.2), V3(0), V3(0.2)], F)
key_bone('armRctl', 'rotation_euler', [V3(-0.15), V3(0), V3(0.15), V3(0), V3(-0.15)], F)
key_bone('root', 'location', [V3(z=0), V3(z=3), V3(z=0), V3(z=3), V3(z=0)], F)
key_bone('spine', 'rotation_euler', [V3(0, 0, 0.025), V3(0, 0, -0.025), V3(0, 0, 0.025)], [1, 19, 37])
key_bone('head', 'rotation_euler', [V3(-0.03), V3(-0.03), V3(-0.03)], [1, 19, 37])
bpy.data.actions["ChibiWalk"].use_cyclic = True

# --- Wave: 2s 单次 右手举起挥动 (绕世界轴对齐的控制骨旋转) ---
new_action("ChibiWave")
key_bone('armRctl', 'rotation_euler',
         [V3(), V3(2.5, 0, 0), V3(2.3, 0, 0), V3(2.65, 0, 0), V3(2.3, 0, 0), V3(2.5, 0, 0), V3()],
         [1, 12, 20, 28, 36, 44, 49])
key_bone('head', 'rotation_euler', [V3(0, 0, 0.1), V3(0, 0, -0.06), V3(0, 0, 0.1)], [1, 25, 49])
key_bone('spine', 'rotation_euler', [V3(0, 0, -0.05), V3(0, 0, -0.05)], [1, 49])
key_bone('scarf2', 'rotation_euler', [V3(-0.1), V3(0.08), V3(-0.1)], [1, 25, 49])
key_bone('scarf3', 'rotation_euler', [V3(0.15), V3(-0.12), V3(0.15)], [1, 25, 49])

# --- Hop: 1s 单次 跳一下 ---
new_action("ChibiHop")
key_bone('root', 'location', [V3(z=0), V3(z=12), V3(z=0), V3(z=0)], [1, 9, 17, 25])
key_bone('legL', 'rotation_euler', [V3(0), V3(-0.22), V3(0), V3(0)], [1, 9, 17, 25])
key_bone('legR', 'rotation_euler', [V3(0), V3(-0.22), V3(0), V3(0)], [1, 9, 17, 25])
key_bone('spine', 'rotation_euler', [V3(0), V3(0.08), V3(0), V3(0)], [1, 9, 17, 25])

# 所有 action 设 fake user 保证导出器可见
for a in bpy.data.actions:
    a.use_fake_user = True

# ---------- 6. 导出 GLB ----------
bpy.ops.object.select_all(action='DESELECT')
arm.select_set(True)
for o in merged:
    o.select_set(True)
bpy.context.view_layer.objects.active = arm
bpy.ops.export_scene.gltf(
    filepath=OUT,
    export_format='GLB',
    use_selection=True,
    export_animations=True,
    export_apply=False,
    export_skins=True,
    export_morph=False,
    export_yup=True,
)
print("RIG_EXPORT_DONE ->", OUT)
