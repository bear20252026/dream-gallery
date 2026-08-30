# Blender 批处理:FBX → GLB(保留完整蒙皮权重)
# 用法: blender --background --python scripts/blender-fbx2glb.py -- <fbx路径> <glb输出路径>
#
# 为什么需要 Blender:Three.js 的 FBXLoader 会把 >4 骨骼影响的顶点砍到 4 个
#   ("Vertex has more than 4 skinning weights. Deleting additional weights."),
#   导致蒙皮绑定错乱、模型扭曲。Blender 的 FBX 导入器更成熟,能正确保留权重,
#   再由 glTF 导出器输出规范 GLB。
import sys
import bpy
import os


def clear_scene():
    bpy.ops.object.select_all(action='SELECT')
    bpy.ops.object.delete(use_global=False)
    # 清残留数据块
    for block in (bpy.data.meshes, bpy.data.armatures, bpy.data.materials,
                  bpy.data.images, bpy.data.actions):
        for item in list(block):
            if item.users == 0:
                block.remove(item)


def main():
    argv = sys.argv
    if '--' not in argv:
        print('参数错误: 需要 -- <fbx> <glb>')
        return 1
    args = argv[argv.index('--') + 1:]
    if len(args) < 2:
        print('用法: blender --background --python <script> -- <fbx路径> <glb输出路径>')
        return 1
    fbx_path = os.path.abspath(args[0])
    glb_path = os.path.abspath(args[1])

    if not os.path.exists(fbx_path):
        print('FBX 不存在:', fbx_path)
        return 1

    print('导入 FBX:', fbx_path)
    clear_scene()

    # 导入 FBX(自动按骨骼/几何体)
    bpy.ops.import_scene.fbx(filepath=fbx_path,
                             use_anim=True,
                             ignore_leaf_bones=False,
                             force_connect_children=False,
                             automatic_bone_orientation=False)

    # 统计
    armatures = [o for o in bpy.data.objects if o.type == 'ARMATURE']
    meshes = [o for o in bpy.data.objects if o.type == 'MESH']
    actions = list(bpy.data.actions)
    print('骨架:', len(armatures), '| 网格:', len(meshes), '| 动作:', len(actions))
    for a in armatures:
        print('  骨架 %s: %d 根骨' % (a.name, len(a.data.bones)))
    for m in meshes:
        print('  网格 %s: %d 顶点, 蒙皮修改器 %d 个' % (
            m.name, len(m.data.vertices),
            sum(1 for mod in m.modifiers if mod.type == 'ARMATURE')))
    for act in actions:
        print('  动作 %s: %.2fs' % (act.name, (act.frame_end - act.frame_start) / max(act.frame_end and 24, 1)))

    # 检查动作时长与帧率
    scene = bpy.context.scene
    print('场景帧范围:', scene.frame_start, '~', scene.frame_end, 'fps:', scene.render.fps)

    os.makedirs(os.path.dirname(glb_path), exist_ok=True)

    # 导出 GLB
    # 关键: 勾选 skinning + 导出动画, 让 glTF 导出器正确处理蒙皮
    print('导出 GLB:', glb_path)
    bpy.ops.export_scene.gltf(
        filepath=glb_path,
        export_format='GLB',
        export_animations=True,           # 导出动画
        export_skins=True,                # 导出蒙皮(关键)
        export_all_influences=True,       # 保留全部骨骼影响(不截断到4个)
        export_morph=True,
        export_yup=True,                  # glTF 标准 Y-up
        export_apply=False,               # 不应用修改器(保留蒙皮)
        export_image_format='WEBP',       # 转 WebP 减小体积(AUTO 会保留原始格式)
        export_texture_dir='',
        export_optimize_animation_size=True,
        export_anim_single_armature=True,
        export_def_bones=False,
    )
    print('导出完成:', os.path.getsize(glb_path), 'bytes')
    return 0


if __name__ == '__main__':
    sys.exit(main())
