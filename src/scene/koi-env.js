// koi-env.js — 锦鲤天空/太阳/环境灯/云(2026-11-18 H1 从 koi-ship.js 抽出)
// 内聚子系统:setSun 一处驱动 sunDir/四灯/天穹 uniforms/太阳盘三层,
// 云层动画注册进编排层 updaters。构建顺序与 rng 调用序列与拆分前逐字一致
// (sky→lights→clouds),体素场景外观零变化;水面 uSunDir 引用同一 sunDir 实例。
import * as THREE from 'three';

/**
 * @param {object} deps
 * @param {import('../shared/vox-core.js').VoxCore} deps.voxCore createVoxCore 实例(rnd/rr/clamp/lerp/Vox/solid,共享 rng 保序)
 * @param {THREE.Scene} deps.scene envGroup 桥接(运行时是 Group,但原作品按 Scene 形状写 fog;编排层预置 envFog,类型如实声明为 Scene)
 * @param {THREE.Group} deps.koiGroup 庭园暖色点光挂这里(随鲤身)
 * @param {THREE.Group} deps.cloudGroup 云簇容器
 * @param {THREE.MeshStandardMaterial} deps.matSoft 云簇共享软材质
 * @param {Array<Function>} deps.updaters 每帧回调注册表(云漂移)
 */
export function createKoiEnv({ voxCore, scene, koiGroup, cloudGroup, matSoft, updaters }) {
  const { rnd, rr, clamp, lerp, Vox, solid } = voxCore;
  const sunDir = new THREE.Vector3();
  let sunLight, hemi, fillLight, ambLight, skyMat, sunDisc, sunGlow, sunHalo;

  function setSun(elev) {
    sunDir.set(-0.62, elev, -0.745).normalize();
    const t = clamp((elev - 0.015) / 0.5, 0, 1);
    const lc = new THREE.Color(0xff5f22).lerp(new THREE.Color(0xffd7a6), t);
    const fc = new THREE.Color(0xd2603a).lerp(new THREE.Color(0xf6bb8c), t);
    if (sunLight) {
      sunLight.position.copy(sunDir).multiplyScalar(420);
      sunLight.color.copy(lc);
      sunLight.intensity = lerp(2.5, 3.6, t);
      fillLight.color.copy(new THREE.Color(0x4d6ea8).lerp(new THREE.Color(0x8fb0dd), t));
      fillLight.intensity = lerp(0.85, 0.55, t);
      hemi.color.copy(fc);
      hemi.intensity = lerp(0.55, 0.85, t);
      scene.fog.color.copy(new THREE.Color(0xc9522f).lerp(new THREE.Color(0xf0ae80), t));
      skyMat.uniforms.uSunDir.value.copy(sunDir);
      skyMat.uniforms.uHorizon.value.copy(
        new THREE.Color(0xff6a2e).lerp(new THREE.Color(0xffc795), t)
      );
      skyMat.uniforms.uSunCol.value.copy(
        new THREE.Color(0xffb055).lerp(new THREE.Color(0xfff0c8), t)
      );
      skyMat.uniforms.uZenith.value.copy(
        new THREE.Color(0x1d2c4d).lerp(new THREE.Color(0x3d6ea5), t)
      );
      sunDisc.position.copy(sunDir).multiplyScalar(2400);
      sunGlow.position.copy(sunDir).multiplyScalar(2380);
      sunHalo.position.copy(sunDir).multiplyScalar(2360);
    }
  }

  function radialTexture(stops) {
    const c = document.createElement('canvas');
    c.width = c.height = 256;
    const g = c.getContext('2d');
    const grd = g.createRadialGradient(128, 128, 0, 128, 128, 128);
    stops.forEach((s) => grd.addColorStop(s[0], s[1]));
    g.fillStyle = grd;
    g.fillRect(0, 0, 256, 256);
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
  }

  function buildSky() {
    // 半径须小于游戏相机 far(2000),否则天穹被远裁剪面切掉→天空发黑(原作品相机 far=7000)
    const geo = new THREE.SphereGeometry(1500, 48, 32);
    skyMat = new THREE.ShaderMaterial({
      side: THREE.BackSide,
      depthWrite: false,
      fog: false,
      uniforms: {
        uZenith: { value: new THREE.Color(0x2b4a76) },
        uHorizon: { value: new THREE.Color(0xff8c46) },
        uGround: { value: new THREE.Color(0x6d3b4a) },
        uSunCol: { value: new THREE.Color(0xffc070) },
        uSunDir: { value: new THREE.Vector3(-0.6, 0.2, -0.75) },
      },
      vertexShader: `varying vec3 vD;
      void main(){ vec4 w=modelMatrix*vec4(position,1.0); vD=w.xyz-cameraPosition;
        gl_Position=projectionMatrix*viewMatrix*w; }`,
      fragmentShader: `varying vec3 vD;
      uniform vec3 uZenith,uHorizon,uGround,uSunCol,uSunDir;
      void main(){
        vec3 d=normalize(vD); float h=d.y;
        vec3 col;
        if(h>0.0){ float k=pow(1.0-h,3.1); col=mix(uZenith,uHorizon,k); }
        else { col=mix(uHorizon,uGround,pow(min(1.0,-h*2.4),0.75)); }
        float sd=max(dot(d,normalize(uSunDir)),0.0);
        col += uSunCol*pow(sd,420.0)*4.0;
        col += uSunCol*pow(sd,26.0)*0.75;
        col += uSunCol*pow(sd,5.0)*0.30;
        col += uSunCol*pow(sd,1.6)*0.10;
        float band=smoothstep(-0.02,0.10,h)*(1.0-smoothstep(0.10,0.42,h));
        col *= 1.0 + band*0.16*sin(d.x*4.0+d.z*3.0);
        gl_FragColor=vec4(col,1.0);
      }`,
    });
    const skyMesh = new THREE.Mesh(geo, skyMat);
    // 必须先于一切几何绘制(同沙漠天穹):否则体素先写深度,天穹 depthWrite:false 会被深度测试挡掉→天空发黑
    skyMesh.renderOrder = -1;
    skyMesh.frustumCulled = false;
    scene.add(skyMesh);

    // sun disc + glows
    const discMat = new THREE.MeshBasicMaterial({
      color: new THREE.Color().setRGB(6.5, 4.6, 3.0),
      fog: false,
      transparent: true,
    });
    sunDisc = new THREE.Mesh(new THREE.CircleGeometry(96, 40), discMat);
    sunDisc.lookAt(0, 0, 0);
    scene.add(sunDisc);

    const glowTex = radialTexture([
      [0, 'rgba(255,225,175,1)'],
      [0.22, 'rgba(255,170,90,.72)'],
      [0.55, 'rgba(255,120,60,.20)'],
      [1, 'rgba(255,90,50,0)'],
    ]);
    sunGlow = new THREE.Sprite(
      new THREE.SpriteMaterial({
        map: glowTex,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        fog: false,
        opacity: 0.95,
      })
    );
    sunGlow.scale.setScalar(1500);
    scene.add(sunGlow);
    const haloTex = radialTexture([
      [0, 'rgba(255,190,140,.55)'],
      [0.35, 'rgba(255,140,90,.18)'],
      [1, 'rgba(120,60,90,0)'],
    ]);
    sunHalo = new THREE.Sprite(
      new THREE.SpriteMaterial({
        map: haloTex,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        fog: false,
        opacity: 0.8,
      })
    );
    sunHalo.scale.setScalar(3400);
    scene.add(sunHalo);

    // far haze bands near the horizon
    const bandVox = new Vox();
    for (let i = 0; i < 26; i++) {
      const a = rnd() * Math.PI * 2,
        r = rr(1500, 2600);
      const w = rr(220, 620),
        y = rr(-30, 150);
      bandVox.box(
        Math.cos(a) * r,
        y,
        Math.sin(a) * r,
        w,
        rr(9, 26),
        rr(60, 180),
        new THREE.Color(0xff9a5a).multiplyScalar(rr(0.35, 0.75))
      );
    }
    const bands = solid(bandVox, {
      mat: new THREE.MeshBasicMaterial({
        vertexColors: true,
        fog: true,
        transparent: true,
        opacity: 0.5,
        depthWrite: false,
      }),
      cast: false,
      recv: false,
      fc: false,
    });
    bands.renderOrder = -2;
    scene.add(bands);
  }
  function buildLights() {
    sunLight = new THREE.DirectionalLight(0xffb070, 3.1);
    sunLight.castShadow = false;
    sunLight.shadow.mapSize.set(2048, 2048);
    const c = sunLight.shadow.camera;
    c.left = -115;
    c.right = 115;
    c.top = 115;
    c.bottom = -115;
    c.near = 90;
    c.far = 780;
    sunLight.shadow.bias = -0.0006;
    sunLight.shadow.normalBias = 0.55;
    sunLight.shadow.radius = 2.2;
    scene.add(sunLight);
    scene.add(sunLight.target);

    hemi = new THREE.HemisphereLight(0xffb27a, 0x6a4a72, 0.72);
    scene.add(hemi);
    fillLight = new THREE.DirectionalLight(0x6f8fc8, 0.62);
    fillLight.position.set(320, 120, 420);
    scene.add(fillLight);
    ambLight = new THREE.AmbientLight(0x4a3348, 0.42);
    scene.add(ambLight);

    setSun(0.2);

    // warm practical lights for the garden
    const L1 = new THREE.PointLight(0xffb066, 26, 34, 2);
    L1.position.set(-2.5, 12.6, -10);
    koiGroup.add(L1);
    const L2 = new THREE.PointLight(0xffb873, 16, 26, 2);
    L2.position.set(-4.5, 11.6, -1.5);
    koiGroup.add(L2);
    const L3 = new THREE.PointLight(0xffc98a, 13, 22, 2);
    L3.position.set(4.6, 11.4, 15.5);
    koiGroup.add(L3);
  }
  const clouds = [];
  function cloudCluster(size, flat, puff) {
    const vx = new Vox();
    const n = Math.round(clamp(puff * size * 0.62, 22, 78));
    const litTop = new THREE.Color(0xfff2e2),
      litSide = new THREE.Color(0xf8c39c),
      shadow = new THREE.Color(0x9c7d99),
      deep = new THREE.Color(0x6b5878);
    for (let i = 0; i < n; i++) {
      const u = rnd() * Math.PI * 2,
        v = Math.acos(rr(-1, 1));
      const rx = size * rr(0.2, 1),
        ry = size * flat * rr(0.15, 0.85),
        rz = size * rr(0.2, 1);
      const x = Math.sin(v) * Math.cos(u) * rx,
        y = Math.cos(v) * ry - size * flat * 0.15,
        z = Math.sin(v) * Math.sin(u) * rz;
      const s = size * rr(0.2, 0.46);
      const h = clamp(0.5 + y / (size * flat) + rr(-0.15, 0.15), 0, 1);
      const c = deep
        .clone()
        .lerp(shadow, clamp(h * 1.6, 0, 1))
        .lerp(litSide, clamp(h * 1.25 - 0.25, 0, 1))
        .lerp(litTop, clamp(h * 1.5 - 0.72, 0, 1));
      c.multiplyScalar(rr(0.88, 1.12));
      vx.box(x, y, z, s * rr(1.1, 2.1), s * rr(0.5, 0.85), s * rr(1.1, 2.1), c);
    }
    return solid(vx, { mat: matSoft, cast: false, recv: false });
  }
  function buildClouds() {
    const layers = [
      {
        n: 16,
        rMin: 70,
        rMax: 300,
        y: [-96, -62],
        size: [16, 34],
        flat: [0.22, 0.34],
        spd: [7, 13],
      },
      {
        n: 20,
        rMin: 280,
        rMax: 640,
        y: [-104, -58],
        size: [26, 58],
        flat: [0.16, 0.26],
        spd: [3.5, 8],
      },
      {
        n: 12,
        rMin: 620,
        rMax: 1250,
        y: [-112, -52],
        size: [60, 130],
        flat: [0.1, 0.18],
        spd: [1.4, 3.4],
      },
    ];
    layers.forEach((L, li) => {
      for (let i = 0; i < L.n; i++) {
        const size = rr(L.size[0], L.size[1]);
        const m = cloudCluster(size, rr(L.flat[0], L.flat[1]), rr(0.7, 1.5));
        if (!m) continue;
        const a = rnd() * Math.PI * 2,
          r = rr(L.rMin, L.rMax);
        m.position.set(Math.cos(a) * r, rr(L.y[0], L.y[1]), Math.sin(a) * r);
        m.rotation.y = rnd() * Math.PI;
        cloudGroup.add(m);
        clouds.push({
          m,
          vz: rr(L.spd[0], L.spd[1]),
          vx: rr(-2, 2) * (1 + li * 0.3),
          ph: rnd() * 6.28,
          y0: m.position.y,
          amp: rr(0.6, 2.4),
          lim: 1300,
        });
      }
    });
    // high wisps
    const w = new Vox();
    for (let i = 0; i < 22; i++) {
      const a = rnd() * Math.PI * 2,
        r = rr(400, 1100);
      w.box(
        Math.cos(a) * r,
        rr(40, 130),
        Math.sin(a) * r,
        rr(60, 190),
        rr(3, 7),
        rr(16, 46),
        new THREE.Color(0xffb98a).multiplyScalar(rr(0.2, 0.42))
      );
    }
    const wisps = solid(w, {
      mat: new THREE.MeshBasicMaterial({
        vertexColors: true,
        transparent: true,
        opacity: 0.42,
        depthWrite: false,
        fog: true,
      }),
      cast: false,
      recv: false,
      fc: false,
    });
    wisps.renderOrder = -1;
    cloudGroup.add(wisps);
    clouds.push({ m: wisps, vz: 1.2, vx: 0, ph: 0, y0: 0, amp: 0, lim: 1e9 });
  }
  updaters.push((dt, t) => {
    for (const c of clouds) {
      c.m.position.z += c.vz * dt;
      c.m.position.x += c.vx * dt;
      c.m.position.y = c.y0 + Math.sin(t * 0.22 + c.ph) * c.amp;
      if (c.m.position.z > c.lim) {
        c.m.position.z -= c.lim * 2;
        c.m.position.x = rr(-c.lim, c.lim) * 0.8;
      }
      if (c.m.position.x > c.lim) c.m.position.x -= c.lim * 2;
      if (c.m.position.x < -c.lim) c.m.position.x += c.lim * 2;
    }
  });

  return {
    setSun,
    buildSky,
    buildLights,
    buildClouds,
    sunDir, // 水面 uniforms.uSunDir 引用同一实例,setSun 改向即同步
    get sunLight() {
      return sunLight;
    }, // applyEnv 隐藏沙漠灯时须放行锦鲤自己的太阳灯(buildLights 前为 undefined)
  };
}
