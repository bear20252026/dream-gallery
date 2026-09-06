// openfilm.js — B612 开幕电影(2026-09-05 定稿,自 dev/b612-opening-full.html 移植)
// 开场电影时间轴总览(2026-09-06 审计 P3:节拍集中登记,改节奏先看这里)
//   第一幕 手绘:纸张登场 0.4s → 画帽子 3s+0.9s → 选择题出现(等用户)
//   选择后:画真相 slow 绘制 ~40s → 折纸 6×0.6s → act2 揭幕
//   第二幕 飞行:DUR=19s 沿曲线飞行 → startImpact 落定
//   收束(三路汇合,唯一出口 finish→done→onDone):
//     自然播完  startImpact +5.6s
//     skip      later(finish,1.6s)
//     WebGL降级 startFlight 内 +2.6s
//   done 之后:main.js onDone → finishIntro → startWorld(3D 世界才启动)
// ============================================================

// 约 60 秒连续开场:黑场画帽→选择→蛇腹大象→真折纸→纸飞机→古地图俯视→
// 翻转入 3D→挣扎坠落→撞击→推镜「B612 Gallery」木牌→淡出交棒给游戏本体。
// 取代旧「开屏层+残镜序章」(?oldintro 回滚通道仍走旧链)。
// 生命周期: playOpeningFilm(onDone) → 播完/跳过 → 自清理(WebGL 强制释放) → onDone()
// 音画分工:配乐=协议配乐(入口闸门 Enter 起,onDone 侧停止);音效=铅笔/折纸/风/撞地。
// 跳过:skip 按钮 / Esc → 直落定 → 短停 → 交棒。
import * as THREE from 'three';
import { Z } from '../shared/z-layers.mjs';
import { createFilmGate } from './film-gate.mjs';
import { HAT, TRUTH } from './film-strokes.mjs';
import { FILM } from '../shared/story-text.mjs';

let active = false;

export function playOpeningFilm(onDone) {
  const timers = new Set();
  const later = (fn, ms) => {
    const id = window.setTimeout(() => {
      timers.delete(id);
      if (active) fn();
    }, ms);
    timers.add(id);
    return id;
  };
  if (active) return;
  active = true;
  let renderer = null;
  let noGL = false; // WebGL 不可用降级标志:play() 在 startFlight 后须立即返回
  function done() {
    if (!active) return;
    active = false;
    try {
      if (renderer) {
        renderer.dispose();
        renderer.forceContextLoss();
      }
    } catch (e) {}
    try {
      const el = document.getElementById('b612film');
      if (el) el.remove();
    } catch (e) {}
    try {
      window.removeEventListener('resize', onResize);
    } catch (e) {}
    timers.forEach((id) => window.clearTimeout(id));
    timers.clear();
    try {
      document.removeEventListener('keydown', onEsc);
    } catch (e) {}
    if (onDone) onDone();
  }
  function onResize() {
    if (!renderer) return;
    cam.aspect = innerWidth / innerHeight;
    cam.updateProjectionMatrix();
    renderer.setSize(innerWidth, innerHeight);
  }
  function onEsc() {
    skip();
  }

  /* ================= 容器 ================= */
  const root = document.createElement('div');
  root.id = 'b612film';
  root.innerHTML = `
  <style>
  @import url('https://fonts.googleapis.com/css2?family=Satisfy&display=swap');
  #b612film{position:fixed;inset:0;z-index:${Z.film};background:#0d0b09;overflow:hidden;
    font-family:'Satisfy',cursive;user-select:none}
  #b612film #fc{position:absolute;inset:0;opacity:0;transition:opacity 1.4s ease}
  #b612film.act2 #fc{opacity:1}
  #b612film #fFrame{position:absolute;inset:14px;border:1px solid rgba(90,72,50,.55);pointer-events:none;z-index:5;opacity:0;transition:opacity 1.4s ease}
  #b612film #fFrame::after{content:'';position:absolute;inset:5px;border:2px solid rgba(90,72,50,.25)}
  #b612film #fRose{position:absolute;right:30px;top:28px;width:64px;height:64px;z-index:6;pointer-events:none;opacity:0;transition:opacity 1.4s ease}
  #b612film.act2 #fFrame{opacity:1}#b612film.act2 #fRose{opacity:.55}
  #b612film #fDark{position:absolute;inset:0;background:#0d0b09;transition:opacity 1.6s ease;pointer-events:none;z-index:1}
  #b612film.act2 #fDark{opacity:0}
  #b612film #fPaper{position:absolute;left:50%;top:50%;translate:-50% -50%;width:min(94vw,940px);aspect-ratio:720/460;z-index:10;
    background:radial-gradient(120% 90% at 50% 40%, #f8f1df 0%, #f3ead2 55%, #eadfc2 100%);
    border-radius:3px;box-shadow:0 30px 80px rgba(0,0,0,.65),0 4px 18px rgba(0,0,0,.4);
    transform:rotate(-.5deg);opacity:0;transition:opacity 1.6s ease}
  #b612film #fPaper.show{opacity:1}
  #b612film #fCrease{position:absolute;left:50%;top:50%;translate:-50% -50%;width:min(94vw,940px);aspect-ratio:720/460;pointer-events:none;z-index:11}
  #b612film #fCrease line{opacity:0;transition:opacity .22s ease}
  #b612film #fSketch{position:absolute;inset:4% 2%}
  #b612film .ftline{white-space:pre-line;position:absolute;left:0;right:0;text-align:center;color:#54463a;opacity:0;transition:opacity 1.4s ease;pointer-events:none;text-shadow:0 0 1px rgba(90,76,58,.35)}
  #b612film #fT0{top:6%;font-size:clamp(18px,3vw,30px)}
  #b612film #fTq{top:7%;font-size:clamp(26px,4.4vw,48px);color:#463a2d}
  #b612film #fReply{top:7%;font-size:clamp(20px,3.2vw,36px)}
  #b612film #fMind{top:80%;font-size:clamp(15px,2.4vw,24px)}
  #b612film .show{opacity:1}
  #b612film #fChoice{position:absolute;left:0;right:0;top:14%;display:flex;gap:30px;justify-content:center;opacity:0;transition:opacity 1.2s ease;pointer-events:none}
  #b612film #fChoice.show{opacity:1;pointer-events:auto}
  #b612film #fChoice button{font-family:'Satisfy',cursive;font-size:clamp(16px,2.6vw,28px);color:#54463a;
    background:rgba(255,252,244,.55);border:1px solid rgba(122,102,74,.5);border-radius:4px;
    padding:6px 24px 10px;cursor:pointer;transition:all .3s}
  #b612film #fChoice button:hover{background:#fff;color:#2f261b;box-shadow:0 4px 14px rgba(90,70,40,.25)}
  #b612film #fPlaneDom{position:absolute;left:50%;top:50%;width:min(30vw,300px);transform:translate(-50%,-50%) rotate(-14deg);opacity:0;z-index:12;pointer-events:none;transition:opacity .8s ease}
  #b612film #fPlaneDom.show{opacity:1}
  #b612film .ffline{white-space:pre-line;position:fixed;left:0;right:0;text-align:center;color:#4e4237;z-index:14;opacity:0;transition:opacity 1.6s ease;pointer-events:none;text-shadow:0 1px 0 rgba(255,250,235,.5)}
  #b612film #tFly1{top:12%;font-size:clamp(20px,3.4vw,36px)}
  #b612film #tFly2{top:20%;font-size:clamp(17px,2.8vw,28px);color:rgba(78,66,55,.8)}
  #b612film #tLand{bottom:16%;font-size:clamp(18px,3vw,32px)}
  #b612film .ftshow{opacity:1 !important}
  #b612film #fEnd{position:absolute;left:0;right:0;bottom:7%;text-align:center;color:rgba(78,66,55,.55);font-size:16px;z-index:14;opacity:0;transition:opacity 1.6s ease}
#b612film #fSleep{position:absolute;left:0;right:0;top:40%;text-align:center;color:#f8f1df;font-size:clamp(16px,2.6vw,26px);line-height:1.9;letter-spacing:.04em;opacity:0;transition:opacity 1.2s ease;z-index:30;white-space:pre-line;padding:0 8vw;pointer-events:none}
  #b612film #fSleep.show{opacity:1}
    #b612film #fSkip{position:absolute;right:26px;bottom:24px;z-index:20;color:rgba(139,125,99,.75);background:none;
    border:none;border-bottom:1px dashed rgba(139,125,99,.5);cursor:pointer;font-family:'Satisfy',cursive;font-size:15px;pointer-events:auto}
  </style>
  <canvas id="fc"></canvas>
  <div id="fFrame"></div>
  <svg id="fRose" viewBox="0 0 64 64" fill="none" stroke="#6b5c48" stroke-width="1.2">
    <circle cx="32" cy="32" r="22"/><circle cx="32" cy="32" r="3" fill="#6b5c48" stroke="none"/>
    <path d="M32,6 L36,26 L32,32 L28,26 Z" fill="#6b5c48" stroke="none"/>
    <path d="M32,58 L28,38 L32,32 L36,38 Z" fill="rgba(107,92,72,.4)" stroke="none"/>
    <path d="M6,32 L26,28 L32,32 L26,36 Z" fill="rgba(107,92,72,.4)" stroke="none"/>
    <path d="M58,32 L38,36 L32,32 L38,28 Z" fill="rgba(107,92,72,.4)" stroke="none"/>
  </svg>
  <div id="fDark"></div>
  <div id="fPaper">
    <svg id="fSketch" viewBox="0 0 720 460" fill="none" stroke-linecap="round" stroke-linejoin="round"></svg>
    <div class="ftline" id="fTq">${FILM.question}</div>
    <div class="ftline" id="fReply"></div>
    <div class="ftline" id="fSleep"></div>
    <div id="fChoice">
      <button id="cHat" type="button">A Hat</button>
      <button id="cBoa" type="button">A Boa Constrictor</button>
    </div>
  </div>
  <div id="fCrease"><svg viewBox="0 0 100 100" preserveAspectRatio="none" width="100%" height="100%">
    <line id="cl1" x1="50" y1="0" x2="0" y2="50" stroke="rgba(90,72,50,.55)" stroke-width=".45" vector-effect="non-scaling-stroke"/>
    <line id="cl2" x1="50" y1="0" x2="100" y2="50" stroke="rgba(90,72,50,.55)" stroke-width=".45" vector-effect="non-scaling-stroke"/>
    <line id="cl3" x1="50" y1="0" x2="50" y2="100" stroke="rgba(90,72,50,.55)" stroke-width=".45" vector-effect="non-scaling-stroke"/>
  </svg></div>
  <svg id="fPlaneDom" viewBox="0 0 300 160" fill="none" stroke="#cfc2a6" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round">
    <path d="M12,84 L288,20 L196,96 Z"/><path d="M196,96 L178,138 L150,102"/>
    <path d="M12,84 L150,102"/><path d="M96,64 C104,58 116,58 124,64" opacity=".55"/>
  </svg>
  <div class="ffline" id="tFly1">${FILM.fly1}</div>
  <div class="ffline" id="tFly2">${FILM.fly2}</div>
  <button id="fSkip" type="button">skip ▸</button>`;
  document.body.appendChild(root);
  document.addEventListener('keydown', onEsc);
  const $ = (id) => document.getElementById(id);
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));

  /* ================= 第二幕:古地图俯冲(Three.js) ================= */
  // WebGL 上下文健壮创建(2026-09-06 主人报「折纸后黑屏」):
  // 关键发现——本 three 版本上下文创建失败时只 console.error 不抛异常,
  // 构造函数"成功"返回但 getContext() 为 null → 渲染永远黑屏。
  // 因此构造后必须体检 getContext();失败重试一次(关抗锯齿+低功耗),
  // 仍失败进入「无 GL 降级」:手绘各幕照常播,飞行段以落定文字收束,绝不黑屏卡死。
  function mkRenderer(attempt) {
    try {
      const r = new THREE.WebGLRenderer({
        canvas: $('fc'),
        antialias: attempt === 0,
        powerPreference: attempt === 0 ? undefined : 'low-power',
      });
      if (!r.getContext()) {
        // 构造"成功"但上下文缺失(本 three 版本不抛错)——视为失败
        try {
          r.dispose();
        } catch (e) {}
        return null;
      }
      return r;
    } catch (e) {
      return null;
    }
  }
  renderer = mkRenderer(0) || mkRenderer(1);
  if (!renderer) {
    console.warn('[film] WebGL 不可用,飞行段降级为文字落定');
    if (window.__reportError)
      window.__reportError('webgl', 'film WebGL 不可用(构造后体检为空),已降级跳过飞行段');
  } else {
    renderer.setPixelRatio(Math.min(devicePixelRatio, 1.75));
    renderer.setSize(innerWidth, innerHeight);
    // 飞行中上下文丢失:不再渲染,优雅收束进游戏(而非冻结黑屏)
    $('fc').addEventListener('webglcontextlost', function (e) {
      e.preventDefault();
      renderer = null; // 后续帧直接走降级
      if (window.__reportError)
        window.__reportError('webgl', 'film WebGL context lost,已降级收束');
      later(function () {
        gate.finish(); // 上下文丢失收束:与 skip/自然播完同口,幂等只放一次
      }, 400);
    });
  }
  const scene = new THREE.Scene();
  const PAPER = '#f3ead2';
  scene.background = new THREE.Color(PAPER);
  scene.fog = new THREE.Fog(PAPER, 260, 980);
  const cam = new THREE.PerspectiveCamera(58, innerWidth / innerHeight, 0.1, 2400);
  const INK = new THREE.Color(0.42, 0.35, 0.27);
  window.addEventListener('resize', onResize);

  /* 地形 */
  const SEG = 140,
    SIZE = 760;
  function noise2(x, z) {
    return (
      Math.sin(x * 0.013 + 1.7) * Math.cos(z * 0.016 + 0.6) * 7.5 +
      Math.sin(x * 0.045 + z * 0.031 + 2.2) * 3.2 +
      Math.cos(x * 0.021 - z * 0.027 + 4.1) * 4.2 +
      Math.sin(x * 0.093 + z * 0.087) * 1.1
    );
  }
  function heightAt(x, z) {
    const d = Math.hypot(x, z - 40);
    const flat = THREE.MathUtils.smoothstep(d, 26, 90);
    return Math.max(0, noise2(x, z) * flat + flat * 2.2 - 1.2);
  }
  const geo = new THREE.PlaneGeometry(SIZE, SIZE, SEG, SEG);
  geo.rotateX(-Math.PI / 2);
  {
    const pos = geo.attributes.position;
    for (let i = 0; i < pos.count; i++) pos.setY(i, heightAt(pos.getX(i), pos.getZ(i)));
    geo.computeVertexNormals();
  }
  const mat = new THREE.ShaderMaterial({
    uniforms: { uInk: { value: INK } },
    vertexShader: `varying float vH;varying vec3 vN;varying vec3 vW;
      void main(){vH=position.y;vN=normal;vW=position;
      gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}`,
    fragmentShader: `varying float vH;varying vec3 vN;varying vec3 vW;
      uniform vec3 uInk;
      float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
      void main(){
        float wob=(hash(floor(vW.xz*5.0))-.5)*.9;
        float h=vH+wob;
        vec3 col=mix(vec3(.957,.933,.866),vec3(.930,.890,.796),smoothstep(0.,20.,h));
        float bl=sin(vW.x*.021+3.1)*sin(vW.z*.017+1.3);
        col=mix(col,vec3(.902,.846,.712),bl*.5+.5)*.5+col*.5;
        float band=h/2.6;
        float aa=fwidth(band)*1.4;
        float line=1.0-smoothstep(0.,aa,min(fract(band),1.0-fract(band)));
        line*=mix(.22,1.0,smoothstep(.3,2.5,vH));
        col=mix(col,uInk*.9,line*.42);
        float slope=clamp(1.0-vN.y,0.,1.);
        col=mix(col,vec3(.806,.748,.616),smoothstep(.04,.5,slope)*.55);
        vec2 g=abs(fract(vW.xz/95.0)-.5);
        float grid=1.0-smoothstep(0.,.004,min(g.x,g.y)*2.0/(fwidth(vW.x/95.0)+1e-4));
        col=mix(col,uInk,grid*.10);
        float edge=smoothstep(340.,240.,length(vW.xz));
        col=mix(vec3(.953,.925,.847),col,edge);
        gl_FragColor=vec4(col,1.0);
      }`,
  });
  scene.add(new THREE.Mesh(geo, mat));

  /* 木牌 */
  const sign = new THREE.Group();
  let signCv = null,
    signBoard = null;
  {
    const wood = new THREE.MeshBasicMaterial({ color: 0x6b5a44 });
    const p1 = new THREE.Mesh(new THREE.BoxGeometry(0.5, 4.6, 0.5), wood);
    p1.position.set(-2.4, 2.3, 0);
    const p2 = p1.clone();
    p2.position.x = 2.4;
    signCv = document.createElement('canvas');
    signCv.width = 512;
    signCv.height = 160;
    signBoard = new THREE.Mesh(
      new THREE.BoxGeometry(6.4, 2, 0.3),
      new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(signCv) })
    );
    signBoard.position.set(0, 4.4, 0);
    sign.add(p1, p2, signBoard);
  }
  sign.position.set(0, heightAt(0, 52), 54);
  scene.add(sign);
  function drawSign() {
    const x = signCv.getContext('2d');
    x.fillStyle = '#efe5cc';
    x.fillRect(0, 0, 512, 160);
    x.strokeStyle = 'rgba(90,72,50,.8)';
    x.lineWidth = 6;
    x.strokeRect(6, 6, 500, 148);
    x.fillStyle = '#4e4237';
    x.textAlign = 'center';
    x.textBaseline = 'middle';
    x.font = "56px 'Satisfy', cursive";
    x.fillText('B612 Gallery', 256, 66);
    x.font = "30px 'Satisfy', cursive";
    x.fillText('six drawings unfinished', 256, 120);
    signBoard.material.map.needsUpdate = true;
  }
  drawSign();
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(drawSign);

  /* 纸飞机(3D) */
  const plane = new THREE.Group();
  {
    const white = new THREE.MeshBasicMaterial({ color: 0xfdfaf2, side: THREE.DoubleSide });
    const g = new THREE.BufferGeometry();
    g.setAttribute(
      'position',
      new THREE.BufferAttribute(
        new Float32Array([
          0, 0, -2.6, 1.4, 0, 1.2, 0, 0.35, 1.0, 0, 0, -2.6, 0, 0.35, 1.0, -1.4, 0, 1.2, 0, 0, -2.6,
          0, -0.12, 1.1, 1.4, 0, 1.2, 0, 0, -2.6, -1.4, 0, 1.2, 0, -0.12, 1.1,
        ]),
        3
      )
    );
    g.computeVertexNormals();
    plane.add(new THREE.Mesh(g, white));
    plane.add(
      new THREE.LineSegments(
        new THREE.EdgesGeometry(g, 0.9),
        new THREE.LineBasicMaterial({ color: 0x5a4c3a, transparent: true, opacity: 0.75 })
      )
    );
  }
  scene.add(plane);

  const curve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(-170, 205, -430),
    new THREE.Vector3(-85, 140, -265),
    new THREE.Vector3(-25, 84, -125),
    new THREE.Vector3(14, 44, -18),
    new THREE.Vector3(2, 17, 14),
    new THREE.Vector3(0, heightAt(0, 38) + 1.6, 38),
  ]);

  /* 墨线航线 */
  const route = new THREE.Line(
    new THREE.BufferGeometry().setFromPoints(
      curve.getPoints(90).map((p) => new THREE.Vector3(p.x, heightAt(p.x, p.z) + 0.8, p.z))
    ),
    new THREE.LineDashedMaterial({
      color: 0x4e4237,
      dashSize: 3.4,
      gapSize: 2.8,
      transparent: true,
      opacity: 0.55,
    })
  );
  route.computeLineDistances();
  scene.add(route);

  /* 地面软影 */
  const shadow = (() => {
    const s = 64,
      c = document.createElement('canvas');
    c.width = c.height = s;
    const x = c.getContext('2d');
    const g = x.createRadialGradient(32, 32, 2, 32, 32, 30);
    g.addColorStop(0, 'rgba(58,47,33,.9)');
    g.addColorStop(1, 'rgba(58,47,33,0)');
    x.fillStyle = g;
    x.fillRect(0, 0, s, s);
    const sp = new THREE.Sprite(
      new THREE.SpriteMaterial({
        map: new THREE.CanvasTexture(c),
        transparent: true,
        opacity: 0,
        depthWrite: false,
      })
    );
    scene.add(sp);
    return sp;
  })();

  /* 水彩漂粒与落地尘埃 */
  function blobTex(hue) {
    const s = 64,
      c = document.createElement('canvas');
    c.width = c.height = s;
    const x = c.getContext('2d');
    for (let i = 0; i < 5; i++) {
      const r = s * 0.32 * (0.7 + Math.random() * 0.5),
        a = s / 2 + (Math.random() - 0.5) * 8;
      const gr = x.createRadialGradient(a, a, 1, a, a, r);
      gr.addColorStop(0, `hsla(${hue},45%,62%,.55)`);
      gr.addColorStop(1, `hsla(${hue},45%,62%,0)`);
      x.fillStyle = gr;
      x.beginPath();
      x.arc(a, a, r, 0, 7);
      x.fill();
    }
    return new THREE.CanvasTexture(c);
  }
  const drift = [];
  for (let i = 0; i < 44; i++) {
    const sp = new THREE.Sprite(
      new THREE.SpriteMaterial({
        map: blobTex(34 + Math.random() * 14),
        transparent: true,
        opacity: 0.16,
        depthWrite: false,
      })
    );
    sp.position.set(
      (Math.random() - 0.5) * 420,
      40 + Math.random() * 160,
      (Math.random() - 0.5) * 420
    );
    sp.scale.setScalar(6 + Math.random() * 14);
    sp.userData.v = 0.6 + Math.random() * 1.4;
    scene.add(sp);
    drift.push(sp);
  }
  const dust = [];
  for (let i = 0; i < 26; i++) {
    const sp = new THREE.Sprite(
      new THREE.SpriteMaterial({
        map: blobTex(38),
        transparent: true,
        opacity: 0,
        depthWrite: false,
      })
    );
    sp.position.set(0, heightAt(0, 38) + 1, 38);
    scene.add(sp);
    dust.push(sp);
  }
  let burstT = -1;
  function burst() {
    burstT = 0;
    for (const s of dust) {
      s.material.opacity = 0.85;
      s.position.set(0, heightAt(0, 38) + 0.8, 38);
      s.userData.vx = (Math.random() - 0.5) * 16;
      s.userData.vy = 4 + Math.random() * 9;
      s.userData.vz = (Math.random() - 0.5) * 16;
      s.scale.setScalar(2.5 + Math.random() * 4);
    }
  }

  /* 声音 */
  let AC = null,
    windGain = null;
  function wind(on) {
    try {
      if (on) {
        AC = AC || new (window.AudioContext || window.webkitAudioContext)();
        const n = AC.sampleRate * 2,
          buf = AC.createBuffer(1, n, AC.sampleRate),
          ch = buf.getChannelData(0);
        for (let i = 0; i < n; i++) ch[i] = Math.random() * 2 - 1;
        const src = AC.createBufferSource();
        src.buffer = buf;
        src.loop = true;
        const f = AC.createBiquadFilter();
        f.type = 'lowpass';
        f.frequency.value = 420;
        f.Q.value = 0.6;
        windGain = AC.createGain();
        windGain.gain.value = 0;
        src.connect(f).connect(windGain).connect(AC.destination);
        src.start();
      } else if (windGain && AC && AC.state === 'running' && Number.isFinite(AC.currentTime)) {
        windGain.gain.linearRampToValueAtTime(0, AC.currentTime + 0.6);
      }
    } catch (e) {}
  }
  function thump() {
    try {
      AC = AC || new (window.AudioContext || window.webkitAudioContext)();
      const n = AC.sampleRate * 0.35,
        b = AC.createBuffer(1, n, AC.sampleRate),
        ch = b.getChannelData(0);
      for (let i = 0; i < n; i++) ch[i] = (Math.random() * 2 - 1) * (1 - i / n);
      const s = AC.createBufferSource();
      s.buffer = b;
      const f = AC.createBiquadFilter();
      f.type = 'lowpass';
      f.frequency.value = 150;
      const g = AC.createGain();
      g.gain.value = 0.75;
      s.connect(f).connect(g).connect(AC.destination);
      s.start();
      const o = AC.createOscillator();
      o.frequency.value = 62;
      const g2 = AC.createGain();
      g2.gain.setValueAtTime(0.5, AC.currentTime);
      if (Number.isFinite(AC.currentTime))
        g2.gain.exponentialRampToValueAtTime(0.001, AC.currentTime + 0.3);
      o.connect(g2).connect(AC.destination);
      o.start();
      o.stop(AC.currentTime + 0.32);
    } catch (e) {}
  }

  /* 飞行状态机 */
  const DUR = 19;
  let u = 0,
    flying = false,
    landed = false,
    impact = -1,
    pushT = 0,
    last = 0;
  let restPos = null,
    restDir = null;
  const bump = (x, c, w) => Math.exp(-Math.pow((x - c) / w, 2));
  const ease = (x) => x * x * (3 - 2 * x);
  const V = new THREE.Vector3(),
    T = new THREE.Vector3(),
    UP = new THREE.Vector3(0, 1, 0);
  function startFlight() {
    // 降级路径(无 WebGL 渲染器或上下文已失效):跳过 3D 飞行,以落定文字收束进游戏
    if (!renderer || !renderer.getContext()) {
      renderer = null;
      noGL = true;
      $('fc').style.background = '#f3ead2'; // 无渲染器时画布是黑的,垫纸色保住落定文字可读
      $('fSleep').textContent = FILM.crash;
      $('fSleep').classList.add('show');
      $('fSkip').style.display = 'none';
      scheduleFinish(4200);
      return;
    }
    u = 0;
    flying = true;
    landed = false;
    impact = -1;
    burstT = -1;
    for (const s of dust) s.material.opacity = 0;
    route.material.opacity = 0.55;
    curve.getPoint(0, V);
    curve.getTangent(0, T);
    plane.position.copy(V);
    plane.lookAt(V.clone().add(T));
    cam.position.set(V.x, V.y + 26, V.z + 0.001);
    cam.up.set(0, 1, 0);
    cam.lookAt(V.x, V.y, V.z);
    wind(true);
  }
  function startImpact() {
    landed = true;
    impact = 0;
    thump();
    wind(false);
    burst();
    restDir = new THREE.Vector3();
    plane.getWorldDirection(restDir);
    restDir.y = 0;
    restDir.normalize();
    restPos = plane.position.clone();
    // 收尾三拍(2026-09-07 对稿):坠机字幕 → 晕(失焦下沉) → 黑场落「睡去」字幕
    later(() => {
      $('fSleep').textContent = FILM.crash;
      $('fSleep').classList.add('show');
    }, 1300);
    later(() => {
      if (gate.dead) return;
      root.style.transition = 'filter 1.2s ease-in, transform 1.2s ease-in';
      root.style.filter = 'blur(9px) brightness(.55)';
      root.style.transform = 'scale(1.06) translateY(2%)'; // 眼前一晕
    }, 4200);
    later(() => {
      $('fDark').style.opacity = '1'; // 沉入全黑
      $('fSleep').classList.remove('show');
    }, 5500);
    later(() => {
      $('fSleep').textContent = FILM.sleep;
      $('fSleep').classList.add('show'); // 黑场上落「睡去」一行
    }, 6300);
    later(() => {
      $('fSkip').style.display = 'none';
    }, 1900);
    // 自然收束改到新节拍末(film-gate 后来居上,skip 仍可随时收束)
    scheduleFinish(9600);
  }
  function forceLand() {
    if (landed) return;
    flying = false;
    wind(false);
    u = 1;
    plane.position.copy(curve.getPoint(1));
    plane.rotation.set(0, 0, 0);
    restDir = new THREE.Vector3(0, 0, 1);
    plane.lookAt(plane.position.clone().add(restDir));
    plane.rotateX(-0.06);
    landed = true;
    impact = -2;
    pushT = 0;
    cam.position.set(20, 9, 62);
    cam.lookAt(0, 2, 40);
    for (const s of dust) s.material.opacity = 0;
    route.material.opacity = 0;
    $('fSkip').style.display = 'none';
  }
  function tick(now) {
    if (!active) return;
    requestAnimationFrame(tick);
    const dt = Math.min((now - last) / 1000, 0.05);
    last = now;
    for (const s of drift) {
      s.position.y += s.userData.v * dt;
      s.position.x += Math.sin(now * 0.0004 + s.userData.v * 9) * dt * 2;
      if (s.position.y > 230) s.position.y = 30;
    }
    if (flying && !landed) {
      const tPrev = u;
      u = Math.min(1, u + dt / DUR);
      const e = ease(u),
        t = now * 0.001;
      const stall = -7.5 * bump(e, 0.4, 0.055) - 9.5 * bump(e, 0.68, 0.06);
      const buffet = Math.sin(t * 2.4) * 1.1 + Math.sin(t * 4.9) * 0.55;
      curve.getPoint(e, V);
      curve.getTangent(e, T);
      plane.position.set(
        V.x,
        V.y + stall + buffet * (0.25 + 0.75 * Math.sin(Math.PI * Math.min(e * 1.15, 1))),
        V.z
      );
      plane.up.copy(UP);
      plane.lookAt(plane.position.clone().add(T));
      plane.rotateX(-0.12 + 0.12 * bump(e, 0.4, 0.06) + 0.16 * bump(e, 0.68, 0.07));
      plane.rotateZ(Math.sin(t * 3.1) * 0.16 + Math.sin(t * 5.6) * 0.09);
      plane.rotateY(Math.sin(t * 1.8) * 0.05);
      const v = (e - ease(tPrev)) / Math.max(dt, 1e-4);
      if (windGain)
        windGain.gain.value =
          Math.min(0.18, Math.abs(v) * 1.2 + 0.02) * (1 + 0.45 * Math.sin(t * 4.3)) +
          (bump(e, 0.4, 0.06) + bump(e, 0.68, 0.07)) * 0.06;
      const chasePos = plane.position
        .clone()
        .addScaledVector(T, -11)
        .add(new THREE.Vector3(0, 4.5, 0));
      const topPos = plane.position.clone().add(new THREE.Vector3(0, 26, 0.001));
      const k = THREE.MathUtils.smoothstep(e, 0.1, 0.24);
      cam.position.lerpVectors(topPos, chasePos, k);
      cam.lookAt(new THREE.Vector3().lerpVectors(plane.position, plane.position.clone().add(T), k));
      route.material.opacity = 0.55 * (1 - THREE.MathUtils.smoothstep(e, 0.14, 0.26));
      if (u >= 1) startImpact();
    }
    if (landed && impact >= 0) {
      impact += dt;
      const k = Math.min(impact / 1.4, 1);
      plane.position
        .copy(restPos)
        .addScaledVector(restDir, (1 - Math.pow(1 - Math.min(k * 1.5, 1), 2)) * 2.0);
      const gy2 = heightAt(plane.position.x, plane.position.z);
      const pitch =
        k < 0.12
          ? -0.5 * (k / 0.12)
          : k < 0.4
            ? THREE.MathUtils.lerp(-0.5, 0.3, (k - 0.12) / 0.28)
            : THREE.MathUtils.lerp(0.3, -0.06, (k - 0.4) / 0.6);
      plane.rotation.set(0, 0, 0);
      plane.lookAt(plane.position.clone().add(restDir));
      plane.rotateX(pitch);
      plane.position.y = gy2 + 0.55 + Math.sin(Math.min(k * 1.9, 1) * Math.PI) * 0.8;
      if (k >= 1) {
        impact = -2;
        pushT = 0;
      }
    }
    if (impact === -2) {
      pushT += dt;
      const kk = Math.min(pushT / 5, 1),
        ee = kk * kk * (3 - 2 * kk);
      cam.position.lerpVectors(
        new THREE.Vector3(20, 9, 62),
        new THREE.Vector3(11, 5.2, 56),
        ee * 0.6
      );
      cam.lookAt(
        new THREE.Vector3().lerpVectors(
          new THREE.Vector3(0, 2, 40),
          new THREE.Vector3(0, 4.4, 54),
          ee
        )
      );
    }
    {
      const gy = heightAt(plane.position.x, plane.position.z);
      const alt = plane.position.y - gy;
      shadow.position.set(plane.position.x, gy + 0.35, plane.position.z);
      const sc = 4.5 + alt * 0.55;
      shadow.scale.set(sc, sc, 1);
      shadow.material.opacity = landed ? 0.28 : THREE.MathUtils.clamp(0.4 - alt * 0.011, 0.05, 0.4);
    }
    // 飞行帧渲染:上下文中途失效时(渲染抛错)立即降级收束,绝不留在黑屏
    if (renderer) {
      try {
        renderer.render(scene, cam);
      } catch (e) {
        renderer = null;
        if (window.__reportError)
          window.__reportError('webgl', 'film flight render threw,已降级收束: ' + e.message);
        gate.finish(); // 渲染抛错立即收束:幂等,若 skip 已收过则静默
        return;
      }
    }
  }
  // 降级模式(无渲染器)不启动渲染循环:手绘幕由 DOM/CSS 驱动,不依赖此循环
  if (renderer) requestAnimationFrame(tick);

  /* ================= 第一幕:手绘 ================= */
  // HAT/TRUTH 笔画数据已外置到 film-strokes.mjs(2026-09-07 P4):本文件只留绘制机制
  const svg = $('fSketch'),
    NS = 'http://www.w3.org/2000/svg';
  function mk(s) {
    const p = document.createElementNS(NS, 'path');
    p.setAttribute('d', s.d);
    p.setAttribute('stroke', s.soft ? 'rgba(84,70,58,.4)' : '#4e4237');
    p.setAttribute('stroke-width', s.w || 3.1);
    if (s.fill) {
      p.setAttribute('fill', '#4e4237');
      p.setAttribute('stroke', 'none');
    }
    p.style.opacity = 0;
    svg.appendChild(p);
    return p;
  }
  function grow(p, t) {
    if (p.getAttribute('fill'))
      return p.animate([{ opacity: 0 }, { opacity: 1 }], { duration: t * 2, fill: 'forwards' })
        .finished;
    const L = p.getTotalLength();
    p.style.strokeDasharray = L;
    p.style.strokeDashoffset = L;
    p.style.opacity = 1;
    return p.animate([{ strokeDashoffset: L }, { strokeDashoffset: 0 }], {
      duration: t,
      easing: 'cubic-bezier(.42,.08,.58,.92)',
      fill: 'forwards',
    }).finished;
  }
  function scratch(t) {
    try {
      AC = AC || new (window.AudioContext || window.webkitAudioContext)();
      const n = (AC.sampleRate * t) / 1000,
        buf = AC.createBuffer(1, n, AC.sampleRate),
        ch = buf.getChannelData(0);
      for (let i = 0; i < n; i++)
        ch[i] = (Math.random() * 2 - 1) * (0.5 + 0.5 * Math.sin((Math.PI * i) / n));
      const src = AC.createBufferSource();
      src.buffer = buf;
      const f = AC.createBiquadFilter();
      f.type = 'bandpass';
      f.frequency.value = Math.max(1500, 3300 - t * 0.55);
      f.Q.value = 1.4;
      const g = AC.createGain();
      g.gain.value = 0.05 - Math.min(t, 3000) * 0.000004;
      src.connect(f).connect(g).connect(AC.destination);
      src.start();
    } catch (e) {}
  }
  function foldSound() {
    try {
      AC = AC || new (window.AudioContext || window.webkitAudioContext)();
      const n = AC.sampleRate * 0.32,
        buf = AC.createBuffer(1, n, AC.sampleRate),
        ch = buf.getChannelData(0);
      for (let i = 0; i < n; i++) ch[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / n, 1.6);
      const src = AC.createBufferSource();
      src.buffer = buf;
      const f = AC.createBiquadFilter();
      f.type = 'bandpass';
      f.frequency.value = 760 + Math.random() * 260;
      f.Q.value = 0.8;
      const g = AC.createGain();
      g.gain.value = 0.14;
      src.connect(f).connect(g).connect(AC.destination);
      src.start();
    } catch (e) {}
  }
  async function drawGroup(list, slow, speed) {
    speed = speed || 1;
    for (const s of list) {
      scratch(Math.min(s.t * speed, 1400));
      const p = mk(s);
      if (slow && !s.fill) {
        p.setAttribute('stroke', 'rgba(84,70,58,.30)');
        await grow(p, s.t * 0.7 * speed);
        p.setAttribute('stroke', s.soft ? 'rgba(84,70,58,.4)' : '#4e4237');
        await grow(p, s.t * speed);
      } else await grow(p, slow ? s.t * 1.4 * speed : s.t);
      await wait((slow ? 90 : 150 + Math.random() * 240) * speed);
    }
  }
  async function foldPaper() {
    const P = $('fPaper');
    const flash = (id) => {
      const el = $(id);
      el.style.opacity = 1;
      setTimeout(() => (el.style.opacity = 0), 620);
    };
    P.style.animation = 'none';
    P.style.transition = 'clip-path .18s ease, transform .18s ease';
    flash('cl1');
    flash('cl2');
    foldSound();
    P.style.clipPath = 'polygon(50% 0%,100% 50%,100% 100%,0% 100%,0% 50%)';
    P.style.transform = 'rotate(-.5deg) scale(.97,1.03)';
    await wait(600);
    flash('cl3');
    foldSound();
    P.style.clipPath = 'polygon(50% 0%,82% 100%,18% 100%)';
    P.style.transform = 'rotate(-.5deg) scale(.93,1.05)';
    await wait(600);
    flash('cl3');
    foldSound();
    P.style.transition = 'clip-path .72s ease-in-out, transform .72s ease-in-out';
    P.style.clipPath = 'polygon(50% 0%,50% 100%,18% 100%)';
    P.style.transform = 'rotate(90deg) scale(.42,.55)';
    await wait(950);
    P.style.transition = 'opacity .7s ease';
    P.style.opacity = '0';
    const pd = $('fPlaneDom');
    pd.classList.add('show');
    pd.animate(
      [
        { transform: 'translate(-50%,-50%) rotate(-14deg) scale(1,1.3)' },
        { transform: 'translate(-50%,-50%) rotate(-14deg) scale(1,1)' },
      ],
      { duration: 680, easing: 'ease-out' }
    );
    await wait(820);
  }

  /* ================= 总控 ================= */
  // 收束状态机(film-gate.mjs 纯逻辑):running/skipped/幂等 finish/后来居上的收束定时器
  let choseBoa = false;
  const gate = createFilmGate(function () {
    root.style.transition = 'opacity 1.6s ease';
    root.style.opacity = '0';
    setTimeout(done, 1700);
  });
  function skip() {
    if (!gate.skip()) return; // 幂等+播放中才有效(原 skipped||!running 判断内聚进状态机)
    root.classList.add('act2');
    ['fTq', 'fReply'].forEach((i) => $(i).classList.remove('show'));
    $('fChoice').classList.remove('show');
    $('fPlaneDom').classList.remove('show');
    $('fPaper').style.opacity = '0';
    ['tFly1', 'tFly2'].forEach((i) => $(i).classList.remove('ftshow'));
    forceLand();
    scheduleFinish(1600);
  }
  function answer(text, quote, res, boa) {
    choseBoa = boa;
    $('fReply').textContent = text; // 答案句先出
    $('fReply').classList.add('show');
    $('fChoice').classList.remove('show');
    $('fTq').classList.remove('show');
    later(function () {
      if (gate.dead) return;
      $('fReply').textContent = quote; // 1.7s 后切旁白字幕(文学译本)
    }, 1700);
    res();
  }
  async function play() {
    if (!gate.begin()) return;
    // skip 后 play 的 async 序列不会自动取消,done() 会移除 DOM——
    // 每个 await 后必须检查 dead,否则摸到已删元素报 null.classList(2026-09-06 线上抓获)
    const dead = () => gate.dead;
    ['fTq', 'fReply'].forEach((i) => $(i).classList.remove('show'));
    $('fChoice').classList.remove('show');
    $('fPlaneDom').classList.remove('show');
    ['tFly1', 'tFly2'].forEach((i) => $(i).classList.remove('ftshow'));
    choseBoa = false;
    $('fPaper').style.clipPath = '';
    $('fPaper').style.transform = '';
    $('fPaper').style.transition = '';
    $('fPaper').style.animation = '';
    $('fPaper').style.opacity = '';
    await wait(400);
    if (dead()) return;
    $('fPaper').classList.add('show');
    await wait(1400);
    if (dead()) return;
    await drawGroup(HAT, false);
    await wait(900);
    if (dead()) return;
    $('fTq').classList.add('show');
    $('fChoice').classList.add('show');
    await new Promise((res) => {
      $('cHat').onclick = () => answer(FILM.answerHat, FILM.quoteHat, res, false);
      $('cBoa').onclick = () => answer(FILM.answerBoa, FILM.quoteBoa, res, true);
    });
    if (dead()) return;
    await wait(5400); // 答案句 1.7s + 旁白字幕 3.7s
    if (dead()) return;
    $('fReply').classList.remove('show');
    await wait(choseBoa ? 350 : 1200);
    if (dead()) return;
    await drawGroup(TRUTH, true, choseBoa ? 0.8 : 1);
    await wait(1000);
    if (dead()) return;
    await wait(3200);
    if (dead()) return;
    await wait(900);
    if (dead()) return;
    await foldPaper();
    if (dead()) return;
    root.classList.add('act2'); // 黑幕揭开:古地图已在头顶,DOM 纸飞机交给 3D 纸飞机
    startFlight();
    if (noGL) return; // 降级:startFlight 已排定落定文字与收束,后续 DOM 动画全部跳过
    await wait(300);
    if (dead()) return;
    const pd = $('fPlaneDom');
    pd.animate(
      [
        { transform: 'translate(-50%,-50%) rotate(-14deg) scale(1)', opacity: 1 },
        { transform: 'translate(-50%,-50%) rotate(-14deg) scale(.55)', opacity: 0 },
      ],
      { duration: 1100, easing: 'ease-in', fill: 'forwards' }
    );
    await wait(1200);
    if (dead()) return;
    $('tFly1').classList.add('ftshow');
    await wait(3600);
    if (dead()) return;
    $('tFly2').classList.add('ftshow');
    await wait(4200);
    if (dead()) return;
    $('tFly1').classList.remove('ftshow');
    $('tFly2').classList.remove('ftshow');
    gate.endRun();
  }
  // 落定收束:推镜与尾字站稳 2.2s,整层淡出交棒
  // 收束调度唯一入口(三路汇合:自然播完/skip/降级;状态机幂等防重)
  function scheduleFinish(ms) {
    gate.schedule(ms);
  }
  $('fSkip').onclick = function (e) {
    e.stopPropagation();
    skip();
  };

  play();
}
