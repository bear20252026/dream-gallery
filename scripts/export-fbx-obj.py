# Blender: 模型3 FBX → 减面 → 导出 OBJ(供 Python 描摹轮廓)
# 用法: blender --background --python scripts/export-fbx-obj.py -- <fbx路径> <obj输出路径>
import bpy, sys

argv = sys.argv[sys.argv.index('--')+1:]
fbx_path, obj_path = argv[0], argv[1]

bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.fbx(filepath=fbx_path)

meshes = [o for o in bpy.data.objects if o.type == 'MESH']
print('meshes:', len(meshes))
for o in meshes:
    o.select_set(True)
bpy.context.view_layer.objects.active = meshes[0]
# 减面 95%(150万→~7万),轮廓提取用不到高模
mod = meshes[0].modifiers.new('dec', 'DECIMATE')
mod.ratio = 0.05
bpy.context.view_layer.objects.active = meshes[0]
bpy.ops.object.modifier_apply(modifier='dec')
print('after decimate tris:', sum(len(p.vertices) - 2 for p in meshes[0].data.polygons))

bpy.ops.wm.obj_export(filepath=obj_path, export_selected_objects=False)
print('exported:', obj_path)
