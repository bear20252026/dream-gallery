# Blender 无头检查:FBX → 对象统计 + 预览渲染
# 用法: blender --background --python scripts/inspect-fbx.py -- <fbx路径> <输出目录>
import bpy, sys, os, math

argv = sys.argv[sys.argv.index('--')+1:]
fbx_path, out_dir = argv[0], argv[1]
os.makedirs(out_dir, exist_ok=True)

bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.fbx(filepath=fbx_path)

print('\n===== FBX INSPECT: %s =====' % os.path.basename(fbx_path))
meshes, empties, others = [], [], []
for o in bpy.data.objects:
    if o.type == 'MESH':
        verts = len(o.data.vertices)
        tris = sum(len(p.vertices)-2 for p in o.data.polygons)
        mats = [m.name for m in o.data.materials if m]
        dims = tuple(round(v, 2) for v in o.dimensions)
        loc = tuple(round(v, 2) for v in o.matrix_world.translation)
        meshes.append((o.name, dims, verts, tris, mats, loc))
    elif o.type == 'EMPTY':
        empties.append(o.name)
    else:
        others.append((o.name, o.type))

print('objects: mesh=%d empty=%d other=%d' % (len(meshes), len(empties), len(others)))
# 合并包围盒
mins = [1e9]*3; maxs = [-1e9]*3
for o in bpy.data.objects:
    if o.type != 'MESH':
        continue
    for c in o.bound_box:
        w = o.matrix_world @ bpy.mathutils_vector(c) if False else o.matrix_world @ __import__('mathutils').Vector(c)
        for i in range(3):
            mins[i] = min(mins[i], w[i]); maxs[i] = max(maxs[i], w[i])
size = [round(maxs[i]-mins[i], 2) for i in range(3)]
print('world bbox size: %s (X×Y×Z)' % size)
print('-- top 20 meshes by tris --')
for name, dims, verts, tris, mats, loc in sorted(meshes, key=lambda x: -x[3])[:20]:
    print('  %-40s dims=%s tris=%d mats=%s loc=%s' % (name[:40], dims, tris, mats[:3], loc))
print('-- materials --')
for m in bpy.data.materials:
    imgs = []
    if m.use_nodes:
        for n in m.node_tree.nodes:
            if n.type == 'TEX_IMAGE' and n.image:
                imgs.append('%s(%dx%d)' % (n.image.name, n.image.size[0], n.image.size[1]))
    print('  %-30s nodes=%s images=%s' % (m.name, m.use_nodes, imgs[:3]))
print('-- armatures --')
for o in bpy.data.objects:
    if o.type == 'ARMATURE':
        print('  %s bones=%d' % (o.name, len(o.data.bones)))

# 渲染 3 视角预览
scene = bpy.context.scene
scene.render.engine = 'BLENDER_EEVEE_NEXT' if hasattr(bpy.types, 'SceneEEVEE') and 'NEXT' in str(getattr(scene.render, 'engine', '')) else scene.render.engine
scene.render.resolution_x = 960
scene.render.resolution_y = 540
# 简单灯光+相机
world = bpy.data.worlds.new('W'); scene.world = world; world.use_nodes = True
world.node_tree.nodes['Background'].inputs[0].default_value = (0.85, 0.85, 0.85, 1)
world.node_tree.nodes['Background'].inputs[1].default_value = 1.0
cx, cy, cz = (mins[0]+maxs[0])/2, (mins[1]+maxs[1])/2, (mins[2]+maxs[2])/2
r = max(size) * 1.6
sun = bpy.data.objects.new('Sun', bpy.data.lights.new('Sun', 'SUN'))
sun.data.energy = 3; sun.rotation_euler = (math.radians(50), 0, math.radians(30))
scene.collection.objects.link(sun)
cam_data = bpy.data.cameras.new('Cam'); cam = bpy.data.objects.new('Cam', cam_data)
cam_data.lens = 40
scene.collection.objects.link(cam); scene.camera = cam
angles = [('front', 0, 65), ('iso', 45, 35), ('top', 0, 5)]
for tag, az_deg, el_deg in angles:
    az, el = math.radians(az_deg), math.radians(el_deg)
    d = r
    cam.location = (cx + d*math.sin(az)*math.cos(el), cy - d*math.cos(az)*math.cos(el), cz + d*math.sin(el))
    import mathutils
    direction = mathutils.Vector((cx, cy, cz)) - cam.location
    cam.rotation_euler = direction.to_track_quat('-Z', 'Y').to_euler()
    scene.render.filepath = os.path.join(out_dir, os.path.basename(fbx_path).replace('.fbx','') + '_' + tag + '.png')
    bpy.ops.render.render(write_still=True)
    print('rendered:', scene.render.filepath)
print('===== DONE =====')
