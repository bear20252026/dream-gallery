// scene/scene-ground-shader.js — 云影外部地面着色器(2026-11-11 巨型文件拆分:从 scene.js 抽离)
// 纯 GLSL 字符串,无副作用、无闭包依赖。该地面当前停用(scene.js groundM.visible=false,
// 沙海地形接管近处),但着色器逐字保留以便恢复。抽离原则:文本一字不改。
export const GROUND_VERTEX = `
    varying vec3 vWorldPos;
    void main(){
      vec4 wp=modelMatrix*vec4(position,1.0);
      vWorldPos=wp.xyz;
      gl_Position=projectionMatrix*viewMatrix*wp;
    }
  `;
export const GROUND_FRAGMENT = `
    precision highp float;
    varying vec3 vWorldPos;
    uniform float uTime;
    uniform vec3 uSunDir;
    uniform float uSunHeight;
    uniform float uCloudCoverage;
    uniform float uWindSpeed;
    uniform vec3 uCameraPos;
    uniform float uDetail;
    uniform float uScale;

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

    void main(){
      vec3 pos=vWorldPos;
      vec3 gColor;
      if(uSunHeight>0.3){
        gColor=vec3(0.93,0.94,0.96);
      }else if(uSunHeight>0.0){
        float f=uSunHeight/0.3;
        gColor=mix(vec3(0.96,0.72,0.55),vec3(0.93,0.94,0.96),f);
      }else{
        float f=clamp(-uSunHeight/0.3,0.0,1.0);
        gColor=mix(vec3(0.93,0.94,0.96),vec3(0.18,0.20,0.28),f);
      }
      vec2 grid=abs(fract(pos.xz*0.5)-0.5);
      float gline=min(grid.x,grid.y);
      float gfac=1.0-smoothstep(0.0,0.025,gline);
      float dist=length(pos.xz-uCameraPos.xz);
      float gfade=1.0-smoothstep(15.0,55.0,dist);
      gColor=mix(gColor,gColor*0.78,gfac*gfade*0.55);
      vec3 sunDir=normalize(uSunDir);
      float cloudY=80.0;
      float t=(cloudY-pos.y)/max(sunDir.y,0.04);
      vec2 cuv=pos.xz+sunDir.xz*t;
      float shadow=sampleCloud(cuv,uTime,uCloudCoverage,uWindSpeed,uDetail,uScale);
      float shStrength=smoothstep(0.0,0.45,uSunHeight);
      shadow*=shStrength*0.62;
      gColor=mix(gColor,gColor*0.38,shadow);
      vec3 fogCol;
      if(uSunHeight>0.3){
        fogCol=vec3(0.78,0.88,0.96);
      }else if(uSunHeight>0.0){
        float f=uSunHeight/0.3;
        fogCol=mix(vec3(0.96,0.58,0.38),vec3(0.78,0.88,0.96),f);
      }else{
        float f=clamp(-uSunHeight/0.3,0.0,1.0);
        fogCol=mix(vec3(0.78,0.88,0.96),vec3(0.07,0.09,0.16),f);
      }
      float fogF=smoothstep(35.0,180.0,dist);
      gColor=mix(gColor,fogCol,fogF);
      gColor=pow(gColor,vec3(1.0/2.2));
      gl_FragColor=vec4(gColor,1.0);
    }
  `;
