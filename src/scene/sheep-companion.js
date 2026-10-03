import * as THREE from 'three';
import { ctx } from '../ctx.js';
import { defineSystem } from '../core/system.js';
import { eventBus } from '../core/event-bus.js';
import { getAudioSystem } from '../core/audio-system.js';
import { avAllowed } from '../core/av-switch.js';
import { tt } from '../shared/story-text.mjs';
import { Z } from '../shared/z-layers.mjs';
import { EYE_HEIGHT } from '../shared/constants.js';
import { sheepVisible, sheepTarget, stepSheep } from '../shared/sheep-companion-logic.mjs';
import { createGLTFLoader } from './gltf-loader.js';
import { prepareSheep } from './sheep-model.js';

const WORDS = {
  // 2026-10-03 测试反馈:「摸摸小羊」玩家看不懂是做什么的 → 写明是可选的小互动,不影响故事
  pat: { zh: '摸摸小羊(可选)', en: 'Pet the sheep (just for fun)' },
  box: { zh: '摸摸羊箱(可选)', en: 'Pat the sheep box (just for fun)' },
  dream: {
    zh: '你画的羊在回忆里陪着你。摸摸它只是好玩,不影响故事。',
    en: 'The sheep you drew keeps you company here. Petting it is just for fun; the story goes on either way.',
  },
  boxHint: {
    zh: '你画的羊睡在箱子里。拍拍箱子,它会轻轻回应。',
    en: 'The sheep you drew sleeps in this box. Pat it and it answers softly.',
  },
  answer: { zh: '咩……它轻轻歪了歪头', en: 'Baa… it tilts its head' },
  credit: {
    zh: '小羊模型：Kinga Kroliczek · CC BY 4.0；游戏添加动作',
    en: 'Sheep: Kinga Kroliczek · CC BY 4.0; animated for this game',
  },
};
const STYLE = `
#sheepCompanion{position:fixed;right:16px;top:174px;z-index:${Z.questBook};display:none;text-align:right;max-width:210px;color:#eadcbf;font-family:inherit}
#sheepCompanion button{min-height:44px;padding:9px 16px;border:1px solid #aa9168;border-radius:24px;background:#28232bea;color:#fff0d0;font:13px inherit;cursor:pointer;touch-action:manipulation}
#sheepCompanion button:disabled{opacity:.6}#sheepCompanion button:focus-visible{outline:2px solid #ffe6a0;outline-offset:3px}
#sheepCompanion small{display:block;font-size:10px;line-height:1.6;margin-top:5px;color:#d5c3a4;text-shadow:0 1px 4px #000}
@media(max-width:600px){#sheepCompanion{right:12px;top:174px;max-width:165px}#sheepCompanion small{font-size:9px}}
`;

export function createSheepCompanion() {
  let root, rig, shadow, panel, button, caption, style, touchApi, mainScene;
  let box,
    lid,
    boxScale = 1,
    lidHeight = 0;
  let world = null,
    loading = false,
    dead = false,
    visible = false;
  let retryAfter = 0;
  let time = 0,
    phase = 0,
    walk = 0,
    sit = 0,
    responseUntil = 0,
    patUntil = 0,
    lastPat = -10;
  let sittingUntil = 0,
    mode = 'idle',
    blinkUntil = 0,
    uiAcc = 0;
  const subscriptions = [],
    voices = new Set();
  const up = new THREE.Vector3(0, 1, 0),
    normal = new THREE.Vector3(0, 1, 0);
  const orientation = new THREE.Quaternion(),
    facing = new THREE.Quaternion();

  function clearVoices() {
    voices.forEach((voice) => voice.stop());
    voices.clear();
  }
  function bleat() {
    // 共用空间音频上下文，尊重全站音效开关；读对白时绝不插音。
    if (!avAllowed() || ctx.ui.dialogOpen?.() || ctx.overlay.anyOpen()) return;
    const listener = getAudioSystem()?.getListener();
    const ac = listener?.context;
    if (!ac || ac.state !== 'running') return;
    const t = ac.currentTime,
      osc = ac.createOscillator(),
      gain = ac.createGain();
    const vibrato = ac.createOscillator(),
      depth = ac.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(330, t);
    osc.frequency.linearRampToValueAtTime(265, t + 0.18);
    osc.frequency.linearRampToValueAtTime(310, t + 0.4);
    vibrato.frequency.value = 9;
    depth.gain.value = 22;
    vibrato.connect(depth);
    depth.connect(osc.frequency);
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.linearRampToValueAtTime(0.055, t + 0.06);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.65);
    osc.connect(gain);
    gain.connect(listener.getInput());
    const voice = {
      stop() {
        try {
          osc.stop();
          vibrato.stop();
        } catch {}
      },
    };
    voices.add(voice);
    osc.onended = () => {
      voices.delete(voice);
      osc.disconnect();
      vibrato.disconnect();
      depth.disconnect();
      gain.disconnect();
    };
    osc.start(t);
    vibrato.start(t);
    osc.stop(t + 0.67);
    vibrato.stop(t + 0.67);
  }
  function paused() {
    return !!(
      ctx.ui.dialogOpen?.() ||
      ctx.overlay.anyOpen() ||
      ctx.kunlun.flightLock ||
      document.hidden ||
      document.body.dataset.homeReveal
    );
  }
  function groundPoint(point, previous) {
    const memory = ctx.scene.worldManager?.getWorld(world);
    const surface = memory?.meta.surface;
    if (surface) {
      const p = surface.place(point, previous);
      return p ? { x: p.x, y: p.y - EYE_HEIGHT, z: p.z } : null;
    }
    const y = memory?.ground(point.x, point.z);
    return Number.isFinite(y) ? { x: point.x, y, z: point.z } : null;
  }
  function spawnNear() {
    const pl = ctx.player.pl;
    if (!root || !pl) return false;
    const p = groundPoint(sheepTarget(pl), pl.p);
    if (!p) return false;
    root.position.set(p.x, p.y, p.z);
    root.quaternion.setFromAxisAngle(up, (pl.y || 0) + Math.PI);
    blinkUntil = time + 0.3;
    return true;
  }
  function load() {
    if (loading || root || dead || time < retryAfter) return;
    loading = true;
    createGLTFLoader().load(
      '/models/b612/sheep-companion.glb',
      (g) => {
        const disposeSource = () =>
          g.scene.traverse((node) => {
            node.geometry?.dispose();
            if (Array.isArray(node.material)) node.material.forEach((m) => m.dispose());
            else node.material?.dispose();
          });
        if (dead) {
          disposeSource();
          return;
        }
        rig = prepareSheep(g.scene);
        disposeSource();
        root = new THREE.Group();
        root.name = 'sheepCompanion';
        root.add(rig.pose);
        shadow = new THREE.Mesh(
          new THREE.CircleGeometry(0.36, 20),
          new THREE.MeshBasicMaterial({
            color: 0xffdf9c,
            transparent: true,
            opacity: 0.09,
            depthWrite: false,
            side: THREE.DoubleSide,
          })
        );
        shadow.rotation.x = -Math.PI / 2;
        shadow.position.y = 0.018;
        shadow.scale.y = 1.25;
        root.add(shadow);
        root.visible = false;
        world = null; // 下一帧按实际世界落位，异步加载不向已经离开的世界加模型。
      },
      undefined,
      () => {
        loading = false;
        retryAfter = time + 15;
      }
    );
  }
  function pat() {
    if (paused() || time - lastPat < 2.5 || panel.style.display === 'none') return;
    const pl = ctx.player.pl;
    const anchor = visible ? root : box;
    if (!anchor || Math.hypot(pl.p.x - anchor.position.x, pl.p.z - anchor.position.z) > 2.6) return;
    lastPat = time;
    patUntil = time + 2.2;
    responseUntil = time + 2.2;
    bleat();
    if (visible) {
      const dx = root.position.x - pl.p.x,
        dz = root.position.z - pl.p.z;
      pl.y = Math.atan2(-dx, -dz);
      pl.pi = Math.atan2(root.position.y + 0.5 - pl.p.y, Math.max(0.5, Math.hypot(dx, dz)));
      if (ctx.player.viewMode === 1 && ctx.player.orbit) ctx.player.orbit.yaw = pl.y;
      facing.setFromAxisAngle(up, Math.atan2(-dx, -dz));
      root.quaternion.slerp(facing, 0.65);
    }
  }
  function language() {
    if (!button) return;
    const label = tt(visible ? WORDS.pat : WORDS.box);
    if (button.textContent !== label) button.textContent = label;
    button.title = tt(WORDS.credit);
    const hint = tt(
      time < patUntil
        ? visible
          ? WORDS.answer
          : WORDS.boxHint
        : visible
          ? WORDS.dream
          : WORDS.boxHint
    );
    if (caption.textContent !== hint) caption.textContent = hint;
  }
  function respond({ id, world: atWorld }) {
    if (!visible || world !== atWorld || paused()) return;
    responseUntil = time + 1.8;
    if (id === 'sunset') sittingUntil = time + 12;
    // 不制造新对白或重复通知。轻叫只随成功记入手札发生。
  }
  return defineSystem({
    name: 'sheep-companion',
    layer: 'gameplay',
    phase: 'animate',
    order: 4,
    init() {
      mainScene = ctx.scene.worldManager.getWorld('main').scene;
      style = document.createElement('style');
      style.textContent = STYLE;
      document.head.append(style);
      panel = document.createElement('div');
      panel.id = 'sheepCompanion';
      button = document.createElement('button');
      button.type = 'button';
      button.onclick = pat;
      caption = document.createElement('small');
      caption.setAttribute('aria-live', 'polite');
      panel.append(button, caption);
      document.body.append(panel);
      touchApi = ctx.overlay.register(panel, { touchOnly: true, closeOnOutside: false });
      subscriptions.push(
        eventBus.on('world:changed', () => {
          clearVoices();
          root?.removeFromParent();
          if (root) root.visible = false;
          visible = false;
          world = null;
          responseUntil = 0;
          sittingUntil = 0;
          patUntil = 0;
          panel.style.display = 'none';
        })
      );
      subscriptions.push(eventBus.on('journey:observed', respond));
      subscriptions.push(
        eventBus.on('journey:remembered', (data) => {
          respond(data);
          if (visible && data.world === world) bleat();
        })
      );
      window.addEventListener('script:lang', language);
      language();
    },
    update(dt) {
      if (dead) return;
      time += Math.min(0.05, dt);
      const active = ctx.scene.activeWorld;
      const drawn = ctx.store.flag('scene2');
      const shouldShow = sheepVisible(active, drawn) && ctx.store.num('endingStep') < 3;
      if (shouldShow && !root) load();
      if (root && active !== world) {
        root.removeFromParent();
        world = active;
        walk = 0;
        sit = 0;
        if (shouldShow) ctx.scene.worldManager.getWorld(active).scene.add(root);
        visible = shouldShow && spawnNear();
        root.visible = visible;
      }
      if (root && !shouldShow) {
        root.visible = false;
        visible = false;
      }
      if (root && shouldShow && !visible) {
        ctx.scene.worldManager.getWorld(active).scene.add(root);
        visible = spawnNear();
        root.visible = visible;
      }
      const stop = paused();
      if (visible) {
        const pl = ctx.player.pl;
        const next = stepSheep(root.position, sheepTarget(pl), dt);
        const task = ctx.ui.journey?.state();
        const watchingSunset =
          task?.id === 'sunset' &&
          task.preview &&
          Math.hypot(root.position.x - pl.p.x, root.position.z - pl.p.z) < 3.5;
        let travel = 0;
        if (!stop && !watchingSunset && time >= patUntil) {
          if (next.catchUp) {
            spawnNear();
            sittingUntil = 0;
          } else {
            const p = groundPoint(next, root.position);
            if (p) {
              travel = Math.hypot(p.x - root.position.x, p.z - root.position.z);
              root.position.set(p.x, p.y, p.z);
              if (travel > 0.001 && next.yaw != null) {
                orientation.setFromUnitVectors(up, normal.set(0, 1, 0));
                // 原星球曲面法线由邻近采样获得，脚下不悬空。
                const memory = ctx.scene.worldManager.getWorld(active);
                const hx = memory.ground(p.x + 0.08, p.z),
                  hz = memory.ground(p.x, p.z + 0.08);
                if (Number.isFinite(hx) && Number.isFinite(hz))
                  normal.set(-(hx - p.y) / 0.08, 1, -(hz - p.y) / 0.08).normalize();
                orientation.setFromUnitVectors(up, normal);
                facing.setFromAxisAngle(up, next.yaw);
                orientation.multiply(facing);
                root.quaternion.slerp(orientation, 1 - Math.exp(-dt * 8));
                sittingUntil = 0;
              }
            }
          }
        }
        const moving = travel > 0.001;
        walk += ((moving ? 1 : 0) - walk) * (1 - Math.exp(-dt * 12));
        phase += travel * 15;
        const seated = !moving && (time < sittingUntil || (task?.id === 'sunset' && task.preview));
        sit += ((seated ? 1 : 0) - sit) * (1 - Math.exp(-dt * 5));
        const reaction = !stop && time < responseUntil ? 1 : 0;
        rig.animate(phase, walk, time, reaction, sit);
        mode = stop
          ? 'waiting'
          : moving
            ? 'walking'
            : seated
              ? 'sitting'
              : reaction
                ? 'responding'
                : 'idle';
        root.scale.setScalar(time < blinkUntil ? Math.max(0.1, 1 - (blinkUntil - time) / 0.3) : 1);
        root.userData.companion = { mode, phase, walk, world };
      }
      if (active === 'main' && drawn) {
        box ||= mainScene.getObjectByName('sheepBox');
        if (box && !lid) {
          lid = mainScene.getObjectByName('sheepBoxLid');
          boxScale = box.scale.y;
          lidHeight = lid?.position.y || 0;
        }
        if (box) {
          const breath = Math.sin(time * 2.1) * (time < patUntil ? 0.035 : 0.009);
          box.scale.y = boxScale * (1 + breath);
          if (lid) lid.position.y = lidHeight + breath * 0.21;
        }
      }
      uiAcc += dt;
      if (uiAcc < 0.1) return;
      uiAcc = 0;
      // 告别之后(结局线 endingStep>=3)羊跟王子回家了:「摸摸箱子」从此消失(剧本第 12 场)
      const homeward = ctx.store.num('endingStep') >= 3;
      const anchor = visible ? root : active === 'main' && drawn && !homeward ? box : null;
      const p = ctx.player.pl?.p;
      const near =
        anchor && p && Math.hypot(p.x - anchor.position.x, p.z - anchor.position.z) <= 2.6;
      // 任务卡(如火山三选一)打开时不显示,避免玩家把两个按钮混在一起
      const taskOpen = !!document.body.dataset.journeyTask;
      // 有路要赶时(罗盘在指路/石门按钮亮着)也不显示:小羊是空闲时的乐趣,不和主线抢屏幕
      const compass = document.getElementById('storyCompass');
      const guiding =
        (compass && compass.style.display === 'flex') || !!document.body.dataset.gateReady;
      panel.style.display = near && !stop && !taskOpen && !guiding ? 'block' : 'none';
      button.disabled = time - lastPat < 2.5;
      language();
    },
    dispose() {
      dead = true;
      clearVoices();
      subscriptions.forEach((off) => off());
      window.removeEventListener('script:lang', language);
      touchApi?.unregister();
      panel?.remove();
      style?.remove();
      root?.removeFromParent();
      rig?.dispose();
      shadow?.geometry.dispose();
      shadow?.material.dispose();
      if (box) box.scale.y = boxScale;
      if (lid) lid.position.y = lidHeight;
    },
  });
}
