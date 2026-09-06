// paintings.js — 挂画系统 + 3D原位放大系统(onC3D/zoomIn/zoomOut)
// 2026-09-03:原「白板作品固定展示区」(户外 z=47 玻璃墙 + 6 画位 + SSE 刷新)整套移除,
//   白板 3D 入口已下线;whiteboard-*.png 的排除过滤仍保留,避免旧作品串挂到其他墙。
import * as THREE from 'three';
import { ctx } from '../ctx.js';
import { onMediaChanged } from '../media-push.js'; // 服务端主动推送:后台增删照片/视频即同步新媒体墙(2026-08-29)
import { P, V, AI_DESC, LINKS, VIDEO_WALL_SOURCES } from '../../data.js';
import * as MR from '../shared/mediarules.mjs'; // 可见性决策表单一源(服务端 canServeMedia 同表,2026-07-28 深化④)
const {
  s,
  cam,
  ray,
  mP2,
  iG,
  tL,
  loadTexCapped,
  vidMesh,
  v45Mesh,
  signMesh,
  mpMesh,
  vidEl,
  v45El,
  signMat,
  mpMat,
  OL,
  OR,
  OT,
  OBR,
} = ctx;

// ===================== 挂画系统（版本27验证方式）=====================
const vE = [], // tL 由 scene.js 创建并经 ctx 共享
  fW = new THREE.MeshStandardMaterial({ color: '#5a3020', roughness: 0.7 }),
  mM = new THREE.MeshStandardMaterial({ color: '#fff8f5', roughness: 0.95 });
// 画框射灯限额:每盏 SpotLight 都会进入所有材质的着色器循环(比 PointLight 更贵,
//   多方向/角度/penumbra 计算)。原为 wi<40 → 40 盏射灯,实测是场景卡顿主因之一。
//   main.js 的灯光限额在初始化时执行,而画作是异步挂上的(晚于限额),故必须在源头限制。
const SPOT_PER_PAINTING = 8;
function iV(u) {
  return u.endsWith('.mp4') || u.endsWith('.webm');
}
// 媒体与配文一一绑定(下标不再依赖取模,动态追加的新媒体也不会错位)
let mi = 0;
const aM = P.map((u, i) => ({ u: u, d: AI_DESC[i] })).concat(
  V.map((u, j) => ({ u: u, d: AI_DESC[P.length + j] }))
);

const hW = [];
// 修复1：排除踢脚线（userData.isBaseboard），只选真正的墙壁
// 婚礼拱廊装修(2026-09-03)：排除已隐藏的外围墙(visible=false)，挂画自动重分配到内墙
s.traverse((o) => {
  if (
    o.isMesh &&
    o.geometry.type === 'BoxGeometry' &&
    !o.userData.isBaseboard &&
    o.visible !== false
  ) {
    const p = o.geometry.parameters;
    if (p.width < 0.5 && p.width > 0.15 && p.depth > 1.5) hW.push(o);
  }
});

// iG 可交互画框数组由 scene.js 创建并经 ctx 共享
iG.push(vidMesh); // 视频墙加入交互
iG.push(v45Mesh); // 视频4/5加入交互
iG.push(signMesh); // 户外牌子加入交互
iG.push(ctx.media.guideMesh); // 元素共鸣准则牌子加入交互
iG.push(mpMesh); // 音乐面板加入交互

// 挂画注册表:模式系统(mode.js)按 src 决定每幅画的可见性
const paintGroups = [];
ctx.gallery.paintGroups = paintGroups;

function hangOn(wall, wi, am, off) {
  off = off || 0;
  const mU = am.u,
    g = new THREE.Group();
  const pos = wall.position.clone(),
    rot = wall.rotation.y;
  const pX = Math.cos(rot),
    pZ = -Math.sin(rot);
  // 凸出0.25m：贴墙但不悬空，不被遮挡;off 为沿墙方向的偏移(避让已有画框)
  const dirX = Math.sin(rot),
    dirZ = Math.cos(rot);
  pos.x += dirX * off + pX * 0.25;
  pos.z += dirZ * off + pZ * 0.25;
  pos.y = 2.2;
  g.position.copy(pos);
  g.rotation.y = Math.atan2(pX, pZ);
  // 3D放大交互数据(配文随媒体绑定);src 供模式系统识别来源(图库/演示/本人上传)
  g.userData = {
    isPainting: true,
    ox: pos.x,
    oy: pos.y,
    oz: pos.z,
    nx: pX,
    nz: pZ,
    ry: g.rotation.y,
    zoomed: false,
    aiDesc: am.d,
    src: mU,
  };
  iG.push(g); // 直接收集可交互画框（版本57方式，可靠）
  paintGroups.push(g);
  const fw = 1,
    fh = 1.4,
    fd = 0.07;
  g.add(new THREE.Mesh(new THREE.BoxGeometry(fw, fh, fd), fW));
  // 隐形大碰撞盒：让点击更容易命中画框
  const hitBox = new THREE.Mesh(
    new THREE.BoxGeometry(fw + 0.6, fh + 0.6, 0.3),
    new THREE.MeshBasicMaterial({ visible: false }) // 完全透明不可见
  );
  hitBox.position.z = 0.1;
  g.add(hitBox);
  const mt = new THREE.Mesh(new THREE.BoxGeometry(fw - 0.12, fh - 0.12, 0.012), mM);
  mt.position.z = fd / 2 + 0.004;
  g.add(mt);
  const cg = new THREE.PlaneGeometry(fw - 0.22, fh - 0.22);
  let cm;
  if (iV(mU)) {
    const v = document.createElement('video');
    v.src = mU;
    v.crossOrigin = 'anonymous';
    v.loop = true;
    v.muted = true;
    v.playsInline = true;
    v.preload = 'none';
    v.style.display = 'none';
    document.body.appendChild(v);
    vE.push({ v, x: pos.x, z: pos.z });
    const vt = new THREE.VideoTexture(v);
    vt.colorSpace = THREE.SRGBColorSpace;
    cm = new THREE.MeshStandardMaterial({
      map: vt,
      roughness: 0.3,
      emissive: '#ffffff',
      emissiveIntensity: 0.08,
    });
    // 不在这里 play:十几路视频同时起播会拖垮弱网与解码(2026-07-24 血泪教训),由下方就近播放管理器统一调度
  } else {
    // 修复2：图片加载+错误处理，失败时显示粉色占位;pos 供距离懒加载(走近才拉纹理)
    const tex = loadTexCapped(
      mU,
      () => {
        const pc = document.createElement('canvas');
        pc.width = 256;
        pc.height = 256;
        const px = pc.getContext('2d');
        px.fillStyle = '#ffb6c8';
        px.fillRect(0, 0, 256, 256);
        px.fillStyle = '#fff';
        px.font = 'bold 20px Arial';
        px.textAlign = 'center';
        px.fillText('Photo', 128, 120);
        px.fillText('Loading...', 128, 150);
        const pt = new THREE.CanvasTexture(pc);
        pt.colorSpace = THREE.SRGBColorSpace;
        cm.map = pt;
        cm.needsUpdate = true;
      },
      { x: pos.x, z: pos.z } // 距离懒加载坐标
    );
    cm = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.4 });
  }
  const cM = new THREE.Mesh(cg, cm);
  cM.position.z = fd / 2 + 0.012;
  g.add(cM);
  s.add(g);
  // B612灵鉴 V3:古镜轮廓——每幅画内沿一圈淡金镜纹;纹理未加载时(答题前/普通模式被门禁)画位只剩空镜轮廓,暗合万镜画廊"千面空镜"
  const ghost = new THREE.LineSegments(
    new THREE.EdgesGeometry(new THREE.PlaneGeometry(fw - 0.16, fh - 0.16)),
    new THREE.LineBasicMaterial({ color: '#d8b36c', transparent: true, opacity: 0.22 })
  );
  ghost.position.z = fd / 2 + 0.02;
  g.add(ghost);
  // 画框射灯限额:每个 SpotLight 都会进入所有材质的着色器循环(比 PointLight 更贵,
  //   多方向/角度/penumbra 计算)。原为 wi<40 → 40 盏射灯,实测是场景卡顿主因之一。
  //   main.js 的灯光限额在初始化时执行,而画作是异步挂上的(晚于限额),故必须在源头限制。
  //   只给前 SPOT_PER_PAINTING 幅画配射灯,其余画作靠环境光 + 自发光材质表现。
  if (wi < SPOT_PER_PAINTING) {
    const sp = new THREE.SpotLight('#ffe8f0', 3, 5, Math.PI / 4, 0.8, 1);
    sp.position.set(0, 0.7, 0.35);
    sp.target = cM;
    g.add(sp);
    g.add(sp.target);
  }
  return g;
}

function hangPaintings() {
  // Fisher-Yates 均匀洗牌(2026-08-31 审计低危:sort(()=>random-0.5) 分布有偏)
  for (let si = hW.length - 1; si > 0; si--) {
    const sj = Math.floor(Math.random() * (si + 1));
    [hW[si], hW[sj]] = [hW[sj], hW[si]];
  }
  hW.forEach((wall, wi) => {
    if (mi >= aM.length) return; // 内容填完即止(2026-09-06:仅 5 张演示照片,不再绕圈重复挂同一张)
    hangOn(wall, wi, aM[mi++]);
  });
  if (ctx.mode.applyPaintMode) ctx.mode.applyPaintMode(); // 挂完立即按当前模式校正可见性(普通模式隐藏图库)
}

// 单幅上墙(访客上传后立即挂出):沿墙找空位,避开已有画框(曾直接覆盖图库画,点击全打到旧画上)
// 返回画框 Group(供悬浮箭头指引定位)
// B612灵鉴 M3-lite 四象方位(2026-07-26):aura=生机/炽烈/萧瑟/安宁 时优先归对应方位墙(东/南/西/北),
// 只对当次新上传生效,不重排存量挂画;方位墙满则退回任意空位
const AURA_WALL = { 生机: 'E', 炽烈: 'S', 萧瑟: 'W', 安宁: 'N' };
const LIB_SET = new Set(P.concat(V));
// 归位涟漪(B612灵鉴 M4):金色圆环在画框上荡开,宣告"它归位了"
function rippleAt(g) {
  const ring = new THREE.Mesh(
    new THREE.RingGeometry(0.6, 0.66, 48),
    new THREE.MeshBasicMaterial({
      color: '#ffd88a',
      transparent: true,
      opacity: 0.85,
      side: THREE.DoubleSide,
      depthWrite: false,
    })
  );
  ring.position.set(
    g.userData.ox + g.userData.nx * 0.4,
    g.userData.oy,
    g.userData.oz + g.userData.nz * 0.4
  );
  ring.rotation.y = Math.atan2(g.userData.nx, g.userData.nz);
  s.add(ring);
  const t0 = performance.now();
  (function ripple() {
    const p = Math.min((performance.now() - t0) / 1200, 1);
    ring.scale.setScalar(1 + p * 3.2);
    ring.material.opacity = 0.85 * (1 - p);
    if (p < 1) requestAnimationFrame(ripple);
    else {
      s.remove(ring);
      ring.geometry.dispose();
      ring.material.dispose();
    }
  })();
}
// 空框换芯(2026-07-27 主人定:框留下,照片拿掉,新上传的照片使用这些框)
// 普通模式下,新照片优先替换一个图库空框的内容面;画框位置/外框不动,来源改记本人上传(模式系统因此放行)
function frameDirOf(g) {
  const a = Math.atan2(g.userData.nz, g.userData.nx);
  return Math.abs(a) <= Math.PI / 4
    ? 'E'
    : Math.abs(a) >= (3 * Math.PI) / 4
      ? 'W'
      : a > 0
        ? 'S'
        : 'N';
}
function takeoverEmpty(mU, caption, aura) {
  const candidates = (ctx.gallery.paintGroups || []).filter((g) => {
    const src = g.userData.src || '',
      n = src.split('/').pop();
    return (
      LIB_SET.has(src) &&
      g.userData.empty &&
      !/\.(mp4|webm|mov|m4v|mkv|avi)$/i.test(src) &&
      !(ctx.mode.myUploads || []).includes(n) &&
      !(ctx.mode.demoPhotos || []).includes(n)
    );
  });
  if (!candidates.length) return null;
  const want = aura ? AURA_WALL[aura] : null;
  const target = (want && candidates.find((g) => frameDirOf(g) === want)) || candidates[0];
  const cm = target.children[3]; // 内容面(hangOn 固定子序)
  const tex = loadTexCapped(mU, undefined, { x: target.userData.ox, z: target.userData.oz });
  cm.material.map = tex;
  cm.material.needsUpdate = true;
  cm.visible = true;
  target.userData.src = mU;
  target.userData.aiDesc = caption || '访客上传的照片';
  target.userData.empty = false;
  if (ctx.mode.applyPaintMode) ctx.mode.applyPaintMode();
  rippleAt(target);
  return target;
}
function wallDir(wall) {
  const r = wall.rotation.y,
    nx = Math.cos(r),
    nz = -Math.sin(r),
    a = Math.atan2(nz, nx);
  return Math.abs(a) <= Math.PI / 4
    ? 'E'
    : Math.abs(a) >= (3 * Math.PI) / 4
      ? 'W'
      : a > 0
        ? 'S'
        : 'N';
}
// 墙体沿挂画方向的半长(含画框边距):防止新画挂到墙外的空气里(2026-07-26 主人修订)
function wallHalf(wall) {
  if (wall.userData._half === undefined) {
    const b = new THREE.Box3().setFromObject(wall);
    const r = wall.rotation.y,
      dx = Math.abs(Math.sin(r)),
      dz = Math.abs(Math.cos(r));
    const len = (b.max.x - b.min.x) * dx + (b.max.z - b.min.z) * dz; // 沿墙方向长度投影
    wall.userData._half = Math.max(0.6, len / 2 - 0.9);
  }
  return wall.userData._half;
}
function hangOne(mU, caption, aura) {
  // 普通模式:新照片优先换芯空框(2026-07-27 主人定);换不到再挂新框
  if (
    ctx.mode.siteMode === 'normal' &&
    /\.(jpe?g|png|webp|gif|bmp|avif|heic|heif|tiff?)$/i.test(mU)
  ) {
    const t = takeoverEmpty(mU, caption, aura);
    if (t) return t;
  }
  const offs = [0, 1.2, -1.2, 2.4, -2.4, 3.6, -3.6, 4.8, -4.8];
  function findSpot(walls) {
    for (const wall of walls) {
      const half = wallHalf(wall);
      for (const off of offs) {
        if (Math.abs(off) > half) continue; // 超出这面墙的实际长度,跳过(不往空气里挂)
        const rot = wall.rotation.y,
          dirX = Math.sin(rot),
          dirZ = Math.cos(rot);
        const px = wall.position.x + dirX * off,
          pz = wall.position.z + dirZ * off;
        let clash = false;
        for (const g of paintGroups) {
          if (Math.hypot(g.userData.ox - px, g.userData.oz - pz) < 1.0) {
            clash = true;
            break;
          }
        }
        if (!clash) return { wall, off };
      }
    }
    return null;
  }
  const want = aura ? AURA_WALL[aura] : null;
  let spot = want ? findSpot(hW.filter((w) => wallDir(w) === want)) : null;
  if (!spot) spot = findSpot(hW);
  const wall = spot ? spot.wall : hW[paintGroups.length % hW.length];
  const off = spot ? spot.off : 0;
  const g = hangOn(wall, paintGroups.length, { u: mU, d: caption || '访客上传的照片' }, off);
  if (ctx.mode.applyPaintMode) ctx.mode.applyPaintMode(); // 立即按当前模式校正可见性
  rippleAt(g); // B612灵鉴 M4:归位涟漪
  return g;
}
ctx.gallery.hangOne = hangOne;

// 新上传的媒体自动上墙:拉取公开目录,把不在 data.js 列表中的照片/视频补进展厅
// (排在列表最前保证一定挂得上;白板作品有专属展示墙,不重复上墙;失败则只挂静态列表)
// dynAdded:本机制动态上墙的 URL 集合,用于增量同步(新增挂上/删除移除,不重排已有挂画)
const dynAdded = new Set();
const knownStatic = new Set(P.concat(V, VIDEO_WALL_SOURCES));
fetch('/api/files', { cache: 'no-store' })
  .then(function (r) {
    return r.json();
  })
  .then(function (d) {
    const newP = (d.photos || [])
      .map(function (f) {
        return f.url.slice(1);
      })
      .filter(function (u) {
        return !knownStatic.has(u) && !/^photos\/whiteboard-/i.test(u);
      });
    const newV = (d.videos || [])
      .map(function (f) {
        return f.url.slice(1);
      })
      .filter(function (u) {
        return !knownStatic.has(u);
      });
    for (let i = newP.length - 1; i >= 0; i--) {
      aM.unshift({ u: newP[i], d: '新上传的照片' });
      dynAdded.add(newP[i]);
    }
    for (let i = newV.length - 1; i >= 0; i--) {
      aM.unshift({ u: newV[i], d: '新上传的视频' });
      dynAdded.add(newV[i]);
    }
    hangPaintings();
  })
  .catch(function () {
    hangPaintings();
  });
// 按 URL 移除动态上墙的挂画(含视频清理),用于后台删除后游戏内同步消失
function removePaintByUrl(url) {
  const idx = paintGroups.findIndex(function (g) {
    return g.userData.src === url;
  });
  if (idx < 0) return;
  const g = paintGroups[idx];
  if (iV(url)) {
    // 视频:暂停、清源、移除 body 元素与就近播放条目
    const ev = vE.findIndex(function (e) {
      return (e.v.src || '').endsWith(url);
    });
    if (ev >= 0) {
      try {
        vE[ev].v.pause();
        vE[ev].v.src = '';
        vE[ev].v.load();
        document.body.removeChild(vE[ev].v);
      } catch (e) {}
      vE.splice(ev, 1);
    }
  }
  g.traverse(function (obj) {
    if (obj.material) {
      const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
      for (const m of mats) {
        // 2026-08-31 审计 M7:跳过画框/内衬共享材质(fW/mM),否则删一张画全场景材质失效闪黑
        if (m === fW || m === mM) continue;
        if (m.map) {
          m.map.dispose();
          m.map = null;
        }
        m.dispose();
      }
    }
    if (obj.geometry) obj.geometry.dispose();
  });
  s.remove(g);
  const ii = iG.indexOf(g);
  if (ii >= 0) iG.splice(ii, 1);
  paintGroups.splice(idx, 1);
}
// 新媒体墙增量同步(2026-08-29):后台增删照片/视频后,游戏内实时跟随;只增删对应挂画,不重排已有
function syncNewMedia() {
  fetch('/api/files', { cache: 'no-store' })
    .then(function (r) {
      return r.json();
    })
    .then(function (d) {
      const photos = (d.photos || []).map(function (f) {
        return f.url.slice(1);
      });
      const videos = (d.videos || []).map(function (f) {
        return f.url.slice(1);
      });
      const nowSet = new Set(photos.concat(videos));
      // 1) 后台已删除 → 游戏内移除
      for (const u of Array.from(dynAdded)) {
        if (!nowSet.has(u)) {
          removePaintByUrl(u);
          const ai = aM.findIndex(function (am) {
            return am.u === u;
          });
          if (ai >= 0) aM.splice(ai, 1);
          dynAdded.delete(u);
        }
      }
      // 2) 新上传 → 挂上(空位挂,不重排)
      const newP = photos.filter(function (u) {
        return !knownStatic.has(u) && !dynAdded.has(u) && !/^photos\/whiteboard-/i.test(u);
      });
      const newV = videos.filter(function (u) {
        return !knownStatic.has(u) && !dynAdded.has(u);
      });
      for (let i = newP.length - 1; i >= 0; i--) {
        const u = newP[i];
        dynAdded.add(u);
        aM.unshift({ u: u, d: '新上传的照片' });
        hangOne(u, '新上传的照片');
      }
      for (let i = newV.length - 1; i >= 0; i--) {
        const u = newV[i];
        dynAdded.add(u);
        aM.unshift({ u: u, d: '新上传的视频' });
        hangOne(u, '新上传的视频');
      }
    })
    .catch(function () {});
}
// 每 45s 增量同步一次新媒体墙(晨光/白板/音乐各自有同步);标签页隐藏时暂停(终审 TOP2)
let syncTimer = setInterval(syncNewMedia, 45000);
document.addEventListener('visibilitychange', function () {
  if (document.hidden) {
    clearInterval(syncTimer);
  } else {
    syncNewMedia();
    syncTimer = setInterval(syncNewMedia, 45000);
  }
});
// 服务端主动推送:后台增删照片/视频 → 立即同步新媒体墙(不等轮询)
onMediaChanged(function (d) {
  if (!d || d.dir === 'photos' || d.dir === 'videos') syncNewMedia();
});

// ===== 3D原位放大系统（平滑飞出动效 + 景深虚化 + 物理摇晃）=====
// ray/mP2 由 scene.js 创建并经 ctx 共享
let oFog = null; // ctx.gallery.zG=当前放大画框,oFog=原雾密度;各画框动画句柄独立存于 userData.aF(避免竞态)

// 线性插值
function lerp(a, b, t) {
  return a + (b - a) * t;
}

function onC3D(e) {
  // 多世界切割(2026-09-06):非主世界禁用主世界交互射线——
  // iG 是主世界交互物登记册,three 射线不要求对象在当前渲染场景里,
  // 不守卫会在小世界隔空点响琴声/放大画框(污染主场景)/打开外链
  if ((ctx.scene.activeWorld || 'main') !== 'main') {
    if (ctx.gallery.zG) zoomOut();
    return;
  }
  let cx, cy;
  if (e.changedTouches && e.changedTouches[0]) {
    cx = e.changedTouches[0].clientX;
    cy = e.changedTouches[0].clientY;
  } else if (e.clientX !== undefined) {
    cx = e.clientX;
    cy = e.clientY;
  } else return;
  mP2.x = (cx / innerWidth) * 2 - 1;
  mP2.y = -(cy / innerHeight) * 2 + 1;
  ray.setFromCamera(mP2, cam);
  const hs = ray.intersectObjects(iG, true);
  if (hs.length === 0) {
    if (ctx.gallery.zG) zoomOut(ctx.gallery.zG);
    return;
  } // 点空白=关闭放大(退出普查 2026-07-26)
  if (hs.length > 0) {
    let cg = hs[0].object;
    while (cg.parent && cg.parent !== s) cg = cg.parent;
    // 解密通过前:门禁墙覆盖范围(建筑矩形+外墙凸出画框,外扩1米)内的任何交互一律不响应
    // 例外:围墙上的「心象共鸣」告示牌(isQuizGate)必须放行,否则答题入口失效
    if (
      !ctx.player.quizPassed &&
      !(cg.userData && cg.userData.isQuizGate) &&
      cg.position.x > -19 &&
      cg.position.x < 19 &&
      cg.position.z > -13 &&
      cg.position.z < 29
    )
      return;
    // ===== 视频墙/梦幻之门:按代码指令顺序连播,不提供暂停功能 =====
    if (cg.userData && cg.userData.isVideo45) {
      return; // 点击无效,视频按序自动播放
    }
    if (cg.userData && cg.userData.isVideoWall) {
      return; // 点击无效,视频按序自动播放
    }
    if (cg.userData && cg.userData.isMusic) {
      window.openPanel('music.html', '音乐播放器');
      mpMat.emissiveIntensity = 0.5;
      setTimeout(function () {
        mpMat.emissiveIntensity = 0.15;
      }, 300);
      return;
    }
    // ===== AI牌子点击:内嵌面板打开 =====
    if (cg.userData && cg.userData.isSign) {
      // 2026-08-31 审计 M12:外链 iframe 被自家 CSP frame-src 拦死,属死功能——已禁用
      if (false) window.openPanel('https://page.goose.cc.cd/s/Hi-AI-2-0', '外部链接');
      signMat.emissiveIntensity = 0.5;
      setTimeout(function () {
        signMat.emissiveIntensity = 0.15;
      }, 300);
      return;
    }
    // ===== 元素共鸣准则牌子:打开用户说明书 =====
    if (cg.userData && cg.userData.isGuide) {
      window.openPanel('guide.html', '元素共鸣准则');
      return;
    }
    // ===== 悬浮答题屏点击:打开入馆考试面板 =====
    if (cg.userData && cg.userData.isQuizGate) {
      window.startQuiz && window.startQuiz();
      return;
    }
    // ===== 永恒展厅(eternal.js)通用交互钩子:金门/返程金拱门等 =====
    if (cg.userData && cg.userData.eternalAction) {
      if (ctx.kunlun.eternalClick) ctx.kunlun.eternalClick(cg);
      return;
    }
    if (cg.userData && cg.userData.isPainting && !cg.userData.empty) {
      // 空框(图库隐藏帧)不可点,不放大
      if (ctx.gallery.zG && ctx.gallery.zG !== cg) zoomOut(ctx.gallery.zG, true); // 切换放大对象:旧的直接复位,避免动画竞态卡死
      if (!cg.userData.zoomed) {
        zoomIn(cg);
      } else {
        zoomOut(cg);
      }
      return;
    }
    // 然后检测3D墙面问卷面板
    if (cg.userData && cg.userData.isWallQuiz && cg.userData.handleClick) {
      const qHits = ray.intersectObject(cg, true);
      if (qHits.length > 0 && qHits[0].uv) cg.userData.handleClick(qHits[0].uv);
      return;
    }
    // ===== 自定义链接模型(后台链接/访客自己的链接):镶嵌式打开 =====
    if (cg.userData && cg.userData.isCustomLink) {
      window.openPanel(cg.userData.customUrl, cg.userData.linkName || '外部链接');
      return;
    }
    // ===== 场景超链接:全部内嵌面板打开,带"返回画廊"退出键（配置在 data.js 的 LINKS）=====
    if (cg.userData) {
      const linkKey = Object.keys(LINKS).find((k) => cg.userData[k]);
      // 模式门禁(mode.js):普通模式下屏蔽指定外链(金山文档/瑶华传/秘密花园),情书卷轴改写为说明书
      if (linkKey) {
        if (ctx.mode.linkGuard && ctx.mode.linkGuard(linkKey, cg)) return;
        window.openPanel(LINKS[linkKey], '外部链接');
        return;
      }
    }
  }
  if (ctx.gallery.zG) zoomOut();
}

// 显示/隐藏AI文字面板(2026-07-26《B612灵鉴》:配文统一加前缀「B612 替你记得：」,AI=B612的记忆回声;前缀幂等,HMR 重载不会叠两层)
const aiPanel = document.getElementById('aiPanel'),
  aiT = document.getElementById('aiT');
function showAI(text) {
  aiT.textContent = /^B612 替你记得：/.test(text) ? text : 'B612 替你记得：' + text;
  aiPanel.classList.add('show');
}
function hideAI() {
  aiPanel.classList.remove('show');
}
// 配文门禁:普通模式只显示演示照片和本人上传的配文,图库画框不显示(2026-07-25 主人修订)
// 决策表单一源=shared/mediarules.cjs(2026-07-28 深化④)
function captionAllowed(g) {
  const name = (g.userData.src || '').split('/').pop();
  return MR.captionAllowed({
    mode: ctx.mode.siteMode,
    isDemo: (ctx.mode.demoPhotos || []).includes(name),
    isMine: (ctx.mode.myUploads || []).includes(name),
  });
}

// 画框飞入放大
function zoomIn(cg) {
  const d = cg.userData;
  d.zoomed = true;
  ctx.gallery.zG = cg;
  d.gazeT0 = Date.now(); // B612灵鉴 M2:凝视计时起点
  if (!oFog) oFog = s.fog.density;
  // 添加环境光晕
  const hl = new THREE.PointLight('#ffc8e0', 5, 8, 1.5);
  hl.position.set(0, 0.3, 0.8);
  cg.add(hl);
  cg.userData.hl = hl;
  // 添加背光（凸显轮廓）
  const bl = new THREE.PointLight('#80c8ff', 2, 6, 1.5);
  bl.position.set(0, 0, -0.5);
  cg.add(bl);
  cg.userData.bl = bl;
  // 动画参数
  const dur = 500; // 500ms飞入
  const t0 = performance.now();
  const sx = cg.position.x,
    sy = cg.position.y,
    sz = cg.position.z;
  const ss = cg.scale.x;
  // 目标：沿法线推进0.5m，正对相机，缩放2x
  const tx = d.ox + d.nx * 0.5,
    tz = d.oz + d.nz * 0.5;
  const ty = d.oy + 0.15; // 微微抬高
  // 旋转：轻微调整确保正对相机
  const angleToCam = Math.atan2(cam.position.x - d.ox, cam.position.z - d.oz);
  const tRot = angleToCam;
  const sRot = cg.rotation.y;
  // 最短角度差
  let dRot = tRot - sRot;
  while (dRot > Math.PI) dRot -= Math.PI * 2;
  while (dRot < -Math.PI) dRot += Math.PI * 2;
  const ts = sRot + dRot * 0.15; // 只旋转15%对齐
  if (d.aF) cancelAnimationFrame(d.aF);
  function animateIn() {
    const elapsed = performance.now() - t0;
    const p = Math.min(elapsed / dur, 1);
    // 缓出曲线（ease-out-cubic）
    const ease = 1 - Math.pow(1 - p, 3);
    cg.position.x = lerp(sx, tx, ease);
    cg.position.y = lerp(sy, ty, ease);
    cg.position.z = lerp(sz, tz, ease);
    cg.rotation.y = lerp(sRot, ts, ease);
    const sc = lerp(ss, 2.0, ease);
    cg.scale.set(sc, sc, sc);
    // 景深虚化：增加雾密度（背景变模糊）
    s.fog.density = lerp(oFog, 0.08, ease);
    if (p < 1) {
      d.aF = requestAnimationFrame(animateIn);
    } else {
      // 到达后物理摇晃（弹性回弹，像挂在弹簧上）
      springBounce(cg, tx, ty, tz, ts);
      // 显示AI文字介绍(普通模式下图库画框不显示配文——配文残留清理,2026-07-25)
      if (cg.userData.aiDesc && captionAllowed(cg)) showAI(cg.userData.aiDesc);
    }
  }
  animateIn();
}

// 物理摇晃：弹性回弹效果
function springBounce(cg, tx, ty, tz, ts) {
  let t = 0;
  function shake() {
    if (!cg.userData.zoomed) return;
    t += 0.08;
    const decay = Math.exp(-t * 1.5); // 衰减
    const offset = Math.sin(t * 8) * 0.02 * decay; // 振幅2cm，频率8Hz
    cg.position.y = ty + offset;
    cg.position.x = tx + Math.sin(t * 5) * 0.005 * decay;
    if (decay > 0.01) requestAnimationFrame(shake);
  }
  shake();
}

// 画框缩回复位;instant=true 时直接复位(切换放大对象时用,避免与新放大动画争抢)
function zoomOut(cg, instant) {
  cg = cg || ctx.gallery.zG;
  if (!cg) return;
  const d = cg.userData;
  // B612灵鉴 M2:有效凝视(≥3秒)记一缕灵蕴
  if (d.gazeT0) {
    if (Date.now() - d.gazeT0 >= 3000) {
      const n = ctx.store.num('gaze') + 1;
      ctx.store.setNum('gaze', n);
      ctx.ui.modeToast && ctx.ui.modeToast('这一眼，B612记住了。');
    }
    d.gazeT0 = null;
  }
  if (d.aF) cancelAnimationFrame(d.aF);
  if (d.hl) {
    cg.remove(d.hl);
    d.hl = null;
  }
  if (d.bl) {
    cg.remove(d.bl);
    d.bl = null;
  }
  if (instant) {
    cg.position.set(d.ox, d.oy, d.oz);
    cg.rotation.y = d.ry;
    cg.scale.set(1, 1, 1);
    d.zoomed = false;
    if (ctx.gallery.zG === cg) ctx.gallery.zG = null;
    return;
  }
  const dur = 400; // 400ms缩回
  const t0 = performance.now();
  const sx = cg.position.x,
    sy = cg.position.y,
    sz = cg.position.z;
  const ss = cg.scale.x;
  const sRot = cg.rotation.y;
  function animateOut() {
    const elapsed = performance.now() - t0;
    const p = Math.min(elapsed / dur, 1);
    const ease = 1 - Math.pow(1 - p, 3);
    cg.position.x = lerp(sx, d.ox, ease);
    cg.position.y = lerp(sy, d.oy, ease);
    cg.position.z = lerp(sz, d.oz, ease);
    cg.rotation.y = lerp(sRot, d.ry, ease);
    const sc = lerp(ss, 1, ease);
    cg.scale.set(sc, sc, sc);
    // 恢复景深
    s.fog.density = lerp(s.fog.density, oFog, ease);
    if (p < 1) {
      d.aF = requestAnimationFrame(animateOut);
    } else {
      d.zoomed = false;
      if (ctx.gallery.zG === cg) {
        ctx.gallery.zG = null;
        hideAI();
      } // 竞态防护:期间已有新画放大则不抢状态
      s.fog.density = oFog;
    }
  }
  animateOut();
}

// 建筑内挂画视频:答题通过 + 走近才播放(2026-07-24 规则)
// 规则:答题通过(ctx.player.quizPassed)前,室内视频一律不播(preload='none' 不下载),
// 带宽全留给室外大屏轮播;通过后按距离调度:走近 18m 起播,走出 22m 暂停(滞回防抖动)
setInterval(function () {
  if (!ctx.player.pl || !ctx.player.quizPassed) return;
  const px = ctx.player.pl.p.x,
    pz = ctx.player.pl.p.z;
  for (const e of vE) {
    // 普通模式:图库视频不播(2026-07-25 主人修订:本人上传的两模式都可播;决策表=shared/mediarules.cjs)
    const vn = (e.v.src || '').split('/').pop();
    const vidAllowed = MR.contentAllowed({
      mode: ctx.mode.siteMode,
      isDemo: (ctx.mode.demoPhotos || []).includes(vn),
      isMine: (ctx.mode.myUploads || []).includes(vn),
      isLib: true,
    }); // 非本人/非演示的挂画视频按图库论:普通模式不播
    if (!vidAllowed) {
      if (!e.v.paused) e.v.pause();
      continue;
    }
    const d2 = (e.x - px) * (e.x - px) + (e.z - pz) * (e.z - pz);
    if (d2 < 18 * 18) {
      if (e.v.paused) e.v.play().catch(function () {});
    } else if (d2 > 22 * 22 && !e.v.paused) e.v.pause();
  }
}, 500);

Object.assign(ctx.gallery, { onC3D, zoomOut });
ctx.zoomIn = zoomIn; // 命名空间注册(zoomIn 仅本模块外用潜力,暂留扁平)
