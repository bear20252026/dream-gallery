// opening-bg.js — 首页专属开场:chartogne-taillet 风格全屏流动着色器背景
// 2026-08-29:协议三连读全部签完后出现(z-index 600,压在残镜序章之上),
// 作为「首页正式开场」——全屏 snoise 流动紫金渐变 + 鼠标涟漪 + 暗角颗粒,
// 居中标题(流光字) + 副标题 + 「进入画廊 ▸」按钮。点击进入后淡出并驱动序章。
//
// 设计要点:
//  - 程序化生成画面,不依赖任何外部素材(规避品牌素材版权,且离线可跑)
//  - 自带独立 WebGLRenderer + rAF;hide() 时 dispose 释放 GPU,不在画廊里常驻第二上下文
//  - 若 WebGL 不可用/初始化失败,showOpening 直接 no-op,不影响既有协议/序章/画廊链路
import * as THREE from 'three';

let ov = null;
let canvas = null;
let renderer = null;
let scene = null;
let camera = null;
let uniforms = null;
let raf = 0;
let started = false;
let onEnterCb = null;
let phase = 'intro'; // intro(逐字仪式) | main(标题层)
let introEl = null;

// 全屏 quad:用 clip-space 顶点,无需相机变换
const VERT = `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = vec4(position.xy, 0.0, 1.0);
}
`;

// Ashima/Gustavson 3D simplex 噪声(公有领域 MIT)—— chartogne 用的同款 snoise 思路
const SNOISE = `
vec3 mod289(vec3 x){return x - floor(x*(1.0/289.0))*289.0;}
vec4 mod289(vec4 x){return x - floor(x*(1.0/289.0))*289.0;}
vec4 permute(vec4 x){return mod289(((x*34.0)+1.0)*x);}
vec4 taylorInvSqrt(vec4 r){return 1.79284291400159 - 0.85373472095314 * r;}
float snoise(vec3 v){
  const vec2 C = vec2(1.0/6.0, 1.0/3.0);
  const vec4 D = vec4(0.0, 0.5, 1.0, 2.0);
  vec3 i  = floor(v + dot(v, C.yyy));
  vec3 x0 = v - i + dot(i, C.xxx);
  vec3 g = step(x0.yzx, x0.xyz);
  vec3 l = 1.0 - g;
  vec3 i1 = min(g.xyz, l.zxy);
  vec3 i2 = max(g.xyz, l.zxy);
  vec3 x1 = x0 - i1 + C.xxx;
  vec3 x2 = x0 - i2 + C.yyy;
  vec3 x3 = x0 - D.yyy;
  i = mod289(i);
  vec4 p = permute( permute( permute(
            i.z + vec4(0.0, i1.z, i2.z, 1.0))
          + i.y + vec4(0.0, i1.y, i2.y, 1.0))
          + i.x + vec4(0.0, i1.x, i2.x, 1.0));
  float n_ = 0.142857142857;
  vec3 ns = n_ * D.wyz - D.xzx;
  vec4 j = p - 49.0 * floor(p * ns.z * ns.z);
  vec4 x_ = floor(j * ns.z);
  vec4 y_ = floor(j - 7.0 * x_);
  vec4 x = x_ * ns.x + ns.yyyy;
  vec4 y = y_ * ns.x + ns.yyyy;
  vec4 h = 1.0 - abs(x) - abs(y);
  vec4 b0 = vec4(x.xy, y.xy);
  vec4 b1 = vec4(x.zw, y.zw);
  vec4 s0 = floor(b0)*2.0 + 1.0;
  vec4 s1 = floor(b1)*2.0 + 1.0;
  vec4 sh = -step(h, vec4(0.0));
  vec4 a0 = b0.xzyw + s0.xzyw*sh.xxyy;
  vec4 a1 = b1.xzyw + s1.xzyw*sh.zzww;
  vec3 p0 = vec3(a0.xy, h.x);
  vec3 p1 = vec3(a0.zw, h.y);
  vec3 p2 = vec3(a1.xy, h.z);
  vec3 p3 = vec3(a1.zw, h.w);
  vec4 norm = taylorInvSqrt(vec4(dot(p0,p0), dot(p1,p1), dot(p2,p2), dot(p3,p3)));
  p0 *= norm.x; p1 *= norm.y; p2 *= norm.z; p3 *= norm.w;
  vec4 m = max(0.6 - vec4(dot(x0,x0), dot(x1,x1), dot(x2,x2), dot(x3,x3)), 0.0);
  m = m * m;
  return 42.0 * dot(m*m, vec4(dot(p0,x0), dot(p1,x1), dot(p2,x2), dot(p3,x3)));
}
`;

// 主着色器:程序化梦境渐变(深紫→玫瑰→金) + 噪声液化流动 + 鼠标涟漪 + 暗角 + 颗粒
const FRAG =
  SNOISE +
  `
uniform float uTime;
uniform vec2 uResolution;
uniform vec2 uMouse;
varying vec2 vUv;

void main() {
  vec2 uv = vUv;
  vec2 p = uv - 0.5;
  p.x *= uResolution.x / max(uResolution.y, 1.0);

  float t = uTime * 0.07;

  // 流场:两层噪声驱动画面像液体一样缓慢涌动
  float n1 = snoise(vec3(p * 1.4, t));
  float n2 = snoise(vec3(p * 2.6 + 11.3, t * 1.35));
  float n3 = snoise(vec3(p * 0.8 - 4.0, t * 0.6));
  vec2 flow = vec2(n1, n2);

  // 程序化梦境底色(与画廊紫金主题一致)
  vec3 deep  = vec3(0.13, 0.05, 0.13);   // 深紫
  vec3 rose  = vec3(0.42, 0.16, 0.30);   // 玫瑰
  vec3 gold  = vec3(0.96, 0.74, 0.44);   // 金辉
  vec3 base = mix(deep, rose, smoothstep(-0.3, 0.9, uv.y + n3 * 0.5));
  base = mix(base, gold, pow(max(0.0, n2), 3.0) * 0.45); // 偶现金斑

  // 逐通道液化扰动(像 chartogne 那样把图"晃"起来)
  vec3 color = base;
  color += flow.x * 0.07 * vec3(1.0, 0.55, 0.8);
  color += flow.y * 0.05 * vec3(0.7, 0.9, 1.0);
  color += n1 * 0.03 * gold;

  // 鼠标涟漪:指针处轻微提亮,呼应"活"的感觉
  float md = distance(p, uMouse);
  color += 0.06 * exp(-md * 4.0) * vec3(1.0, 0.85, 0.65);

  // 暗角(电影质感)
  float vig = smoothstep(1.15, 0.25, length(p));
  color *= mix(0.5, 1.0, vig);

  // 颗粒(细微胶片噪点)
  float grain = snoise(vec3(uv * uResolution * 0.35, uTime * 4.0)) * 0.035;
  color += grain;

  gl_FragColor = vec4(color, 1.0);
}
`;

function resize() {
  if (!renderer || !uniforms) return;
  const w = window.innerWidth;
  const h = window.innerHeight;
  renderer.setSize(w, h, false);
  uniforms.uResolution.value.set(w * Math.min(window.devicePixelRatio || 1, 2), h * Math.min(window.devicePixelRatio || 1, 2));
}

function onMove(e) {
  if (!uniforms) return;
  const x = (e.clientX / window.innerWidth - 0.5) * (window.innerWidth / Math.max(window.innerHeight, 1));
  const y = -(e.clientY / window.innerHeight - 0.5);
  uniforms.uMouse.value.set(x, y);
}

function loop() {
  raf = requestAnimationFrame(loop);
  if (uniforms) uniforms.uTime.value = performance.now() * 0.001;
  if (renderer && scene && camera) renderer.render(scene, camera);
}

function build() {
  // 注入字体(同款 Sabon/Shipley,用户已确认版权自担) + 开屏仪式 keyframes(自包含)
  const style = document.createElement('style');
  style.textContent =
    "@font-face{font-family:'Sabon';src:url('/fonts/SabonLTStd-Roman.woff2') format('woff2');font-weight:400;font-display:swap}" +
    "@font-face{font-family:'Sabon';src:url('/fonts/SabonLTStd-Bold.woff2') format('woff2');font-weight:700;font-display:swap}" +
    "@font-face{font-family:'SabonNext';src:url('/fonts/SabonNextLT-BlackItalic.woff2') format('woff2');font-weight:900;font-style:italic;font-display:swap}" +
    "@font-face{font-family:'Shipley';src:url('/fonts/ShipleyRegular.woff2') format('woff2');font-weight:400;font-display:swap}" +
    "@font-face{font-family:'Shipley';src:url('/fonts/ShipleyItalic.woff2') format('woff2');font-weight:400;font-style:italic;font-display:swap}" +
    '@keyframes obShimmer{0%{background-position:0% center}100%{background-position:200% center}}' +
    '@keyframes obRise{from{opacity:0;transform:translateY(18px)}to{opacity:1;transform:translateY(0)}}' +
    '@keyframes obChar{from{opacity:0;filter:blur(8px);transform:translateY(10px)}to{opacity:1;filter:blur(0);transform:none}}' +
    '@keyframes obBreath{0%,100%{opacity:.3}50%{opacity:.9}}' +
    '@keyframes obLineGrow{from{transform:scaleX(0)}to{transform:scaleX(1)}}';
  document.head.appendChild(style);

  ov = document.createElement('div');
  ov.id = 'openingOv';
  ov.setAttribute('role', 'dialog');
  ov.setAttribute('aria-label', '首页开场');
  ov.style.cssText =
    'position:fixed;inset:0;z-index:600;background:#0a0410;opacity:0;transition:opacity .9s;display:flex;flex-direction:column;align-items:center;justify-content:center;overflow:hidden';

  canvas = document.createElement('canvas');
  canvas.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;display:block;opacity:0;transition:opacity 2.2s ease';
  ov.appendChild(canvas);

  // ===== 阶段A:开屏仪式(chartogne 式逐字浮现 + 轻触启程) =====
  phase = 'intro';
  introEl = document.createElement('div');
  introEl.style.cssText =
    'position:absolute;inset:0;z-index:3;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:24px;background:#040206;cursor:pointer;transition:opacity 1.4s ease';
  const line = document.createElement('div');
  line.style.cssText = 'display:flex;letter-spacing:.4em;padding-left:.4em';
  const INTRO_TEXT = '凡人一念，可补天缺。';
  [...INTRO_TEXT].forEach((ch, i) => {
    const sp = document.createElement('span');
    sp.textContent = ch;
    sp.style.cssText =
      "opacity:0;font-family:'Sabon','Songti SC','STSong','SimSun',serif;font-size:clamp(22px,4.6vw,40px);color:#e9d9b8;text-shadow:0 0 26px rgba(201,169,110,.25);animation:obChar 1.1s ease " + (0.4 + i * 0.16) + 's both';
    line.appendChild(sp);
  });
  introEl.appendChild(line);
  const hr = document.createElement('div');
  hr.style.cssText =
    'width:min(190px,42vw);height:1px;background:linear-gradient(90deg,transparent,rgba(201,169,110,.8),transparent);transform:scaleX(0);animation:obLineGrow 1.2s ease 2.9s both';
  introEl.appendChild(hr);
  const en = document.createElement('div');
  en.textContent = 'Kunlun Lingjian · A Gallery of Dreams';
  en.style.cssText =
    "font-family:'Shipley',serif;font-style:italic;font-size:clamp(13px,2.2vw,17px);letter-spacing:2px;color:rgba(201,169,110,.78);opacity:0;animation:obChar 1.2s ease 3.4s both";
  introEl.appendChild(en);
  const tap = document.createElement('div');
  tap.textContent = '轻 触 启 程';
  tap.style.cssText =
    "margin-top:22px;font-family:'Sabon','Songti SC','STSong',serif;font-size:13px;letter-spacing:9px;padding-left:9px;color:rgba(233,217,184,.65);opacity:0;animation:obChar 1s ease 4.2s both, obBreath 2.6s ease-in-out 5.4s infinite";
  introEl.appendChild(tap);
  ov.appendChild(introEl);

  const wrap = document.createElement('div');
  wrap.id = 'obWrap';
  wrap.style.cssText =
    'position:relative;z-index:2;display:flex;flex-direction:column;align-items:center;gap:18px;opacity:0;transition:opacity 1.8s ease .7s;pointer-events:none';
  ov.appendChild(wrap);

  const title = document.createElement('div');
  title.textContent = '梦幻画廊 · 昆仑灵鉴';
  title.style.cssText =
    "font-family:'Sabon','Songti SC','STSong','SimSun',serif;font-size:clamp(28px,7vw,56px);letter-spacing:12px;font-weight:600;background:linear-gradient(100deg,#ffd9a8,#ff9ab0,#c89bff,#ffd9a8);-webkit-background-clip:text;background-clip:text;color:transparent;background-size:200% auto;animation:obShimmer 6s linear infinite;text-shadow:0 0 30px rgba(255,180,150,.18)";
  wrap.appendChild(title);

  const sub = document.createElement('div');
  sub.textContent = '每一幅被你凝视过的画，都在昆仑多亮一盏灯。';
  sub.style.cssText =
    "font-family:'Sabon','Songti SC','STSong',serif;font-size:clamp(12px,2.6vw,15px);letter-spacing:3px;color:rgba(255,210,200,0.62)";
  wrap.appendChild(sub);

  const btn = document.createElement('button');
  btn.textContent = '进 入 画 廊 ▸';
  btn.setAttribute('aria-label', '进入画廊');
  btn.style.cssText =
    'margin-top:14px;padding:12px 34px;border:1px solid rgba(255,200,170,0.45);border-radius:30px;background:rgba(255,255,255,0.04);color:rgba(255,225,205,0.92);font-size:14px;letter-spacing:6px;cursor:pointer;backdrop-filter:blur(4px);transition:background .3s,transform .3s';
  btn.onmouseenter = () => {
    btn.style.background = 'rgba(255,180,150,0.14)';
    btn.style.transform = 'scale(1.04)';
  };
  btn.onmouseleave = () => {
    btn.style.background = 'rgba(255,255,255,0.04)';
    btn.style.transform = 'scale(1)';
  };
  btn.onclick = () => {
    if (onEnterCb) onEnterCb();
  };
  wrap.appendChild(btn);

  // 初始化 Three.js(独立上下文)
  try {
    renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    scene = new THREE.Scene();
    camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    const geo = new THREE.PlaneGeometry(2, 2);
    const mat = new THREE.ShaderMaterial({
      vertexShader: VERT,
      fragmentShader: FRAG,
      uniforms: {
        uTime: { value: 0 },
        uResolution: { value: new THREE.Vector2(1, 1) },
        uMouse: { value: new THREE.Vector2(0, 0) },
      },
    });
    uniforms = mat.uniforms;
    scene.add(new THREE.Mesh(geo, mat));
  } catch (e) {
    // WebGL 不可用:降级为纯色背景,标题仍可见
    console.warn('[opening-bg] WebGL 初始化失败,降级纯色:', e && e.message);
    if (canvas) canvas.style.display = 'none';
  }
}

// 阶段切换:仪式层(逐字引言) → 标题层(chartogne 式展开:背景渐亮+标题浮现)
function toMain() {
  if (phase !== 'intro' || !introEl) return;
  phase = 'main';
  introEl.style.opacity = '0';
  introEl.style.pointerEvents = 'none';
  setTimeout(() => {
    if (introEl) {
      introEl.remove();
      introEl = null;
    }
  }, 1500);
  if (canvas) canvas.style.opacity = '1';
  const wrap = ov && document.getElementById('obWrap');
  if (wrap) {
    wrap.style.opacity = '1';
    setTimeout(() => {
      wrap.style.pointerEvents = 'auto';
    }, 1800);
  }
}
function onKey(e) {
  if (e.key === 'Enter') toMain();
}

// 协议全签完后调用:showOpening(onEnter)
export function showOpening(onEnter) {
  if (started) return;
  if (!ov) build();
  if (!ov) return;
  started = true;
  onEnterCb = onEnter;
  // 告知 prologue:开场由本层接管,勿自动抢跑(模块失败则不会置位,prologue 仍自动播)
  window.__openingSplashHandlesPrologue = true;
  document.body.appendChild(ov);
  resize();
  window.addEventListener('resize', resize);
  window.addEventListener('pointermove', onMove);
  window.addEventListener('keydown', onKey);
  if (introEl) introEl.onclick = toMain; // 轻触启程
  if (renderer) loop();
  requestAnimationFrame(() => {
    if (ov) ov.style.opacity = '1';
  });
}

export function hideOpening() {
  if (!ov) return;
  ov.style.opacity = '0';
  const dead = ov;
  setTimeout(() => {
    cancelAnimationFrame(raf);
    raf = 0;
    window.removeEventListener('resize', resize);
    window.removeEventListener('pointermove', onMove);
    window.removeEventListener('keydown', onKey);
    if (renderer) {
      renderer.dispose();
      renderer = null;
    }
    if (dead && dead.parentNode) dead.parentNode.removeChild(dead);
    ov = null;
    started = false;
    uniforms = null;
    introEl = null;
    phase = 'intro';
  }, 900);
}
