// sky-shader.js — 主世界天空 ShaderMaterial(2026-09-20 自 scene.js 拆分,审计「大文件拆分」)
// 纯工厂:天幕网格构建(shader 全文在此);启停与昼夜驱动仍归 scene.js/desert.js——
// 云影天空当前停用(mesh.visible=false,西域纯色天空+日/月/星接管),保留以便随时恢复。
import * as THREE from 'three';

export const skyUniforms = {
  uTime: { value: 0 },
  uSunDir: { value: new THREE.Vector3(0, 1, 0) },
  uSunHeight: { value: 1.0 },
  uCloudCoverage: { value: 0.55 },
  uWindSpeed: { value: 0.3 },
  uCameraPos: { value: new THREE.Vector3() },
  uDetail: { value: 0.5 },
  uScale: { value: 1.0 },
  uExposure: { value: 1.0 },
};
export function createSkyMesh(s) {
const skyMat = new THREE.ShaderMaterial({
  uniforms: skyUniforms,
  side: THREE.BackSide,
  depthWrite: false,
  vertexShader: `
    varying vec3 vWorldDir;
    void main(){
      vWorldDir=normalize(position);
      gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);
    }
  `,
  fragmentShader: `
    precision highp float;
    varying vec3 vWorldDir;
    uniform float uTime;
    uniform vec3 uSunDir;
    uniform float uSunHeight;
    uniform float uCloudCoverage;
    uniform float uWindSpeed;
    uniform vec3 uCameraPos;
    uniform float uDetail;
    uniform float uScale;
    uniform float uExposure;
    
float hash21(vec2 p){
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}
float vnoise(vec2 p){
  vec2 i = floor(p);
  vec2 f = fract(p);
  f = f*f*(3.0-2.0*f);
  float a = hash21(i);
  float b = hash21(i+vec2(1.0,0.0));
  float c = hash21(i+vec2(0.0,1.0));
  float d = hash21(i+vec2(1.0,1.0));
  return mix(mix(a,b,f.x), mix(c,d,f.x), f.y);
}
float fbm(vec2 p){
  float v = 0.0;
  float a = 0.5;
  mat2 rot = mat2(0.8, 0.6, -0.6, 0.8);
  for(int i=0;i<5;i++){
    v += a * vnoise(p);
    p = rot * p * 2.02 + vec2(1.7, 9.2);
    a *= 0.5;
  }
  return v;
}
float sampleCloud(vec2 uv, float time, float coverage, float wind, float detail, float scale){
  vec2 p = uv * 0.045 / scale;
  p += vec2(time * wind * 0.4, time * wind * 0.1);
  vec2 q = vec2(
    vnoise(p * 1.3 + vec2(0.0, time * 0.04)),
    vnoise(p * 1.3 + vec2(5.2, 1.3) + vec2(time * 0.035, 0.0))
  );
  float base = fbm(p + q * 0.7);
  float det = fbm(p * 3.0 + 11.3 + q * 0.4);
  float covField = vnoise(p * 0.2 + vec2(time * 0.025, time * 0.018) + 17.3);
  float effCov = coverage + (covField - 0.5) * 0.55;
  effCov = clamp(effCov, 0.0, 1.0);
  float d = base + det * detail * 0.35;
  d = d - (1.0 - effCov) * 0.85;
  d = smoothstep(0.0, 0.28, d);
  return d;
}

    vec3 getSkyColor(vec3 dir,float sh){
      float t=clamp(dir.y*0.5+0.5,0.0,1.0);
      vec3 dayHorizon=vec3(0.78,0.88,0.96);
      vec3 dayZenith=vec3(0.30,0.55,0.92);
      vec3 nightHorizon=vec3(0.09,0.11,0.20);
      vec3 nightZenith=vec3(0.02,0.03,0.07);
      vec3 sunsetHoriz=vec3(1.0,0.50,0.22);
      vec3 sunsetZen=vec3(0.35,0.22,0.42);
      float dayF=smoothstep(-0.15,0.28,sh);
      float sunsetF=clamp(1.0-abs(sh)*2.6,0.0,1.0);
      sunsetF*=smoothstep(-0.22,0.06,sh);
      vec3 horizon=mix(nightHorizon,dayHorizon,dayF);
      vec3 zenith=mix(nightZenith,dayZenith,dayF);
      horizon=mix(horizon,sunsetHoriz,sunsetF*0.88);
      zenith=mix(zenith,sunsetZen,sunsetF*0.42);
      return mix(horizon,zenith,pow(t,0.55));
    }
    vec3 getSun(vec3 dir,vec3 sunDir,float sh){
      float sd=max(0.0,dot(dir,sunDir));
      float disk=smoothstep(0.9995,0.99978,sd);
      float glow=pow(sd,80.0)*0.55+pow(sd,8.0)*0.22+pow(sd,2.0)*0.06;
      vec3 sunCol=vec3(1.0,0.96,0.88);
      if(sh<0.35) sunCol=mix(vec3(1.0,0.42,0.15),sunCol,smoothstep(0.0,0.35,sh));
      if(sh<0.0) sunCol=vec3(0.85,0.9,1.0);
      return disk*sunCol*2.2+glow*sunCol*0.7;
    }
    void main(){
      vec3 dir=normalize(vWorldDir);
      vec3 sky=getSkyColor(dir,uSunHeight);
      sky+=getSun(dir,uSunDir,uSunHeight);
      if(uSunHeight<0.1){
        float nightF=smoothstep(0.1,-0.25,uSunHeight);
        float s=step(0.9986,hash21(dir.xy*900.0+dir.z*120.0));
        float tw=0.55+0.45*sin(uTime*2.5+hash21(dir.xy*40.0)*30.0);
        sky+=s*vec3(0.95,0.98,1.0)*nightF*tw*0.9;
      }
      if(dir.y>0.02){
        float cloudY=80.0;
        float t=(cloudY-uCameraPos.y)/dir.y;
        vec2 cuv=dir.xz*t+uCameraPos.xz;
        float density=sampleCloud(cuv,uTime,uCloudCoverage,uWindSpeed,uDetail,uScale);
        float edge=smoothstep(0.0,0.18,dir.y);
        density*=edge;
        vec3 sunDir=normalize(uSunDir);
        float sunLight=clamp(sunDir.y*1.6+0.25,0.0,1.0);
        vec3 cLit,cShadow;
        if(uSunHeight>0.35){
          cLit=vec3(1.0,0.99,0.97);cShadow=vec3(0.48,0.54,0.66);
        }else if(uSunHeight>0.0){
          float f=uSunHeight/0.35;
          cLit=mix(vec3(1.0,0.55,0.30),vec3(1.0,0.99,0.97),f);
          cShadow=mix(vec3(0.42,0.28,0.42),vec3(0.48,0.54,0.66),f);
        }else{
          cLit=vec3(0.28,0.32,0.44);cShadow=vec3(0.10,0.13,0.20);
        }
        vec3 dirXZ=normalize(vec3(dir.x,0.0,dir.z)+1e-5);
        vec3 sunXZ=normalize(vec3(sunDir.x,0.0,sunDir.z)+1e-5);
        float sunInfl=max(0.0,dot(dirXZ,sunXZ));
        sunInfl=pow(sunInfl,3.0);
        float sunsetF=clamp(1.0-abs(uSunHeight)*2.6,0.0,1.0)*step(-0.22,uSunHeight);
        vec3 warmTint=vec3(1.0,0.55,0.30);
        vec3 coolTint=vec3(0.65,0.42,0.62);
        vec3 dirTint=mix(coolTint,warmTint,sunInfl);
        vec3 cloudCol=mix(cShadow,cLit,sunLight);
        cloudCol=mix(cloudCol,dirTint,sunsetF*0.45);
        cloudCol=mix(cloudCol,cLit*1.25,sunInfl*sunsetF*0.55);
        sky=mix(sky,cloudCol,density);
      }
      sky*=uExposure;
      sky=sky/(sky+vec3(1.0));
      sky=pow(sky,vec3(1.0/2.2));
      gl_FragColor=vec4(sky,1.0);
    }
  `,
});
const skyGeo = new THREE.SphereGeometry(800, 32, 16);
const skyMesh = new THREE.Mesh(skyGeo, skyMat);
skyMesh.frustumCulled = false;
// 云影天空停用:改用西域原版纯色天空+日/月/星(desert.js 驱动);mesh 保留以便随时恢复
skyMesh.visible = false;
s.add(skyMesh);
  return skyMesh;
}