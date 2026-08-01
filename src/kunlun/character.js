// character.js — 加载蒙皮角色模型，放置到画廊中
// 2026-08-01
import * as THREE from 'three';
import 'three/examples/jsm/loaders/GLTFLoader.js';
import { ctx } from '../ctx.js';

let charGroup = null;
let mixer = null;

/**
 * 加载 GLB 蒙皮角色
 * @param {string} path - 模型路径
 * @param {{x:number, y:number, z:number, scale?:number, ry?:number}} pos
 */
function loadCharacter(path, pos) {
  const loader = new THREE.GLTFLoader();
  loader.load(
    path,
    function (gltf) {
      const model = gltf.scene;
      console.log(
        '[char] 加载完成:',
        model.children.length,
        '个子节点, 骨骼:',
        gltf.skins?.[0]?.bones?.length || 0
      );

      // 缩放和位置
      const s = pos.scale || 0.08;
      model.scale.set(s, s, s);
      model.position.set(pos.x, pos.y, pos.z);
      if (pos.ry != null) model.rotation.y = pos.ry;

      // 阴影
      model.traverse(function (child) {
        if (child.isMesh) {
          child.castShadow = true;
          child.receiveShadow = true;
        }
      });

      ctx.scene.s.add(model);
      charGroup = model;

      // 如果有动画，设置 AnimationMixer
      if (gltf.animations && gltf.animations.length > 0) {
        mixer = new THREE.AnimationMixer(model);
        gltf.animations.forEach(function (clip) {
          mixer.clipAction(clip).play();
        });
        console.log('[char] 动画:', gltf.animations.length, '个片段');
        // 注册帧更新
        ctx.onTick(function (dt) {
          if (mixer) mixer.update(dt);
        });
      }

      // 注册到实体表
      ctx.ent.register(model, { type: 'character', tags: ['remielle'], data: { mixer } });

      // 添加点光源照亮角色
      const charLight = new THREE.PointLight('#ffe8d0', 3, 8, 2);
      charLight.position.set(pos.x, pos.y + 2, pos.z + 1);
      ctx.scene.s.add(charLight);
    },
    function (xhr) {
      if (xhr.total > 0) {
        var pct = Math.round((xhr.loaded / xhr.total) * 100);
        if (pct % 20 === 0) console.log('[char] 加载中...', pct + '%');
      }
    },
    function (err) {
      console.error('[char] 加载失败:', err);
    }
  );
}

// 放置位置：户外白板附近（z=42 展示墙前）
setTimeout(function () {
  if (!ctx.scene.s) {
    var retry = setInterval(function () {
      if (ctx.scene.s) {
        clearInterval(retry);
        loadCharacter('/models/remielle/remielle.glb', {
          x: 0,
          y: 1.6,
          z: 40,
          scale: 0.08,
          ry: Math.PI,
        });
      }
    }, 200);
  } else {
    loadCharacter('/models/remielle/remielle.glb', {
      x: 0,
      y: 1.6,
      z: 40,
      scale: 0.08,
      ry: Math.PI,
    });
  }
}, 3000);
