import{n as e,r as t,t as n}from"./index-ljXWXIID.js";import{$ as r,B as i,D as a,E as o,F as s,Fn as c,H as l,I as u,K as d,L as f,Ln as p,Mn as m,N as h,Nn as g,O as _,On as v,Pn as y,R as b,S as x,St as S,T as ee,V as te,W as ne,Z as C,_n as re,a as w,at as T,bn as ie,c as ae,d as E,dt as oe,et as D,f as O,fn as se,gn as ce,gt as k,hn as le,ht as ue,i as A,in as de,it as j,j as M,l as fe,m as pe,mt as me,nn as he,pn as ge,pt as _e,q as ve,r as ye,s as N,tt as be,u as xe,un as Se,ut as Ce,v as P,wn as we,x as Te,y as Ee,yn as De,z as Oe}from"./three.core-DbUm3LuT.js";import{n as ke,r as Ae,t as F}from"./config-C_3XuXU6.js";import{Physics as je,RAPIER as Me}from"./physics-C_nInHgz.js";function I(e){let t=e>>>0;return()=>{t=t+1831565813>>>0;let e=t;return e=Math.imul(e^e>>>15,e|1),e^=e+Math.imul(e^e>>>7,e|61),((e^e>>>14)>>>0)/4294967296}}function Ne(e,t,n=0){let r=(Math.imul(e|0,668265261)^Math.imul(t|0,374761393)^Math.imul(n|0,2654435769))>>>0;return r=Math.imul(r^r>>>15,2246822507)>>>0,r=Math.imul(r^r>>>13,3266489909)>>>0,((r^r>>>16)>>>0)/4294967296}var Pe=e=>e*e*e*(e*(e*6-15)+10);function Fe(e,t,n=0){let r=Math.floor(e),i=Math.floor(t),a=e-r,o=t-i,s=(e,t,r,i)=>{let a=Ne(e,t,n)*Math.PI*2;return Math.cos(a)*r+Math.sin(a)*i},c=Pe(a),l=Pe(o),u=s(r,i,a,o),d=s(r+1,i,a-1,o),f=s(r,i+1,a,o-1),p=s(r+1,i+1,a-1,o-1),m=u+(d-u)*c;return(m+(f+(p-f)*c-m)*l)*1.41}function Ie(e,t,n=4,r=0){let i=0,a=.5,o=0;for(let s=0;s<n;s+=1){i+=Fe(e,t,r+s*17)*a,o+=a;let n=e*1.6-t*1.2;t=e*1.2+t*1.6,e=n,a*=.5}return i/o}function L(e,t,n){let r=Math.min(1,Math.max(0,(n-e)/(t-e)));return r*r*(3-2*r)}var Le=class{ctx;out;noise;started=!1;windGain;windFilter;whistleGain;whistleFilter;fluteGain;fluteOsc=[];flutterGain;flutterLfo;fluteNote=0;fluteTimer=0;constructor(e){this.ctx=e.ctx,this.out=e.output(`sfx`),this.noise=Be(this.ctx,4)}start(){if(this.started)return;this.started=!0;let e=this.ctx,t=e.currentTime;this.windFilter=e.createBiquadFilter(),this.windFilter.type=`lowpass`,this.windFilter.frequency.value=500,this.windFilter.Q.value=.6,this.windGain=ze(e,0),this.loopNoise(0).connect(this.windFilter).connect(this.windGain).connect(this.out),this.whistleFilter=e.createBiquadFilter(),this.whistleFilter.type=`bandpass`,this.whistleFilter.frequency.value=2100,this.whistleFilter.Q.value=9,this.whistleGain=ze(e,0),this.loopNoise(1.3).connect(this.whistleFilter).connect(this.whistleGain).connect(this.out),this.fluteGain=ze(e,0);let n=e.createBiquadFilter();n.type=`lowpass`,n.frequency.value=1400,n.connect(this.fluteGain).connect(this.out);let r=e.createOscillator();r.frequency.value=4.6;let i=ze(e,3.2);r.connect(i);for(let[r,a]of[[1,.6],[1.5,.22],[2,.12]]){let o=e.createOscillator();o.type=`sine`,o.frequency.value=Re[0]*r,i.connect(o.detune),o.connect(ze(e,a)).connect(n),o.start(t),this.fluteOsc.push(o)}let a=e.createBiquadFilter();a.type=`bandpass`,a.frequency.value=Re[0]*2,a.Q.value=3,this.loopNoise(2.1).connect(a).connect(ze(e,.5)).connect(n),r.start(t),this.flutterGain=ze(e,0);let o=e.createBiquadFilter();o.type=`bandpass`,o.frequency.value=180,o.Q.value=1.2;let s=ze(e,.5);this.flutterLfo=e.createOscillator(),this.flutterLfo.frequency.value=7;let c=ze(e,.5);this.flutterLfo.connect(c).connect(s.gain),this.loopNoise(.7).connect(o).connect(s).connect(this.flutterGain).connect(this.out),this.flutterLfo.start(t)}update(e,t,n,r,i,a){if(!this.started||this.ctx.state!==`running`)return;let o=this.ctx.currentTime,s=t.gust,c=a?.75+L(-20,8,n.y)*.35:.8;this.windGain.gain.setTargetAtTime((.1+s*.3)*c,o,.35),this.windFilter.frequency.setTargetAtTime(320+s*1100,o,.4),this.whistleGain.gain.setTargetAtTime(L(.55,1,s)*.05*c,o,.5),this.whistleFilter.frequency.setTargetAtTime(1900+s*900,o,.6);let l=1/(1+(n.distanceTo(r)/14)**2),u=L(.35,.9,s);if(this.fluteGain.gain.setTargetAtTime(u*(.015+l*.16),o,.6),this.fluteTimer-=e,u<.05&&this.fluteTimer<=0){this.fluteNote=(this.fluteNote+1+Math.floor(Math.random()*2))%Re.length,this.fluteTimer=2.5;let e=Re[this.fluteNote];this.fluteOsc.forEach((t,n)=>t.frequency.setTargetAtTime(e*[1,1.5,2][n],o,.3))}let d=n.distanceTo(i);this.flutterGain.gain.setTargetAtTime((.05+s*.3)/(1+(d/9)**2),o,.25),this.flutterLfo.frequency.setTargetAtTime(5+s*7,o,.3)}footstep(e){if(this.ctx.state!==`running`)return;let t=this.ctx,n=t.currentTime,r=t.createBufferSource();r.buffer=this.noise,r.playbackRate.value=.8+Math.random()*.5;let i=t.createBiquadFilter();i.type=`bandpass`,i.frequency.value=1800+Math.random()*1400,i.Q.value=.7;let a=ze(t,1e-4),o=(e?.2:.12)*(.8+Math.random()*.4);a.gain.exponentialRampToValueAtTime(o,n+.02),a.gain.exponentialRampToValueAtTime(1e-4,n+.16),r.connect(i).connect(a).connect(this.out),r.start(n,Math.random()*3),r.stop(n+.2)}land(e){if(this.ctx.state!==`running`)return;let t=this.ctx,n=t.currentTime,r=t.createOscillator();r.frequency.setValueAtTime(110,n),r.frequency.exponentialRampToValueAtTime(45,n+.14);let i=ze(t,1e-4);i.gain.exponentialRampToValueAtTime(.12+e*.25,n+.012),i.gain.exponentialRampToValueAtTime(1e-4,n+.18),r.connect(i).connect(this.out),r.start(n),r.stop(n+.2),this.footstep(!0)}loopNoise(e){let t=this.ctx.createBufferSource();return t.buffer=this.noise,t.loop=!0,t.start(this.ctx.currentTime,e),t}},Re=[293.66,329.63,369.99,440,493.88,587.33];function ze(e,t){let n=e.createGain();return n.gain.value=t,n}function Be(e,t){let n=Math.floor(e.sampleRate*t),r=e.createBuffer(1,n,e.sampleRate),i=r.getChannelData(0),a=0,o=0,s=0,c=0,l=0,u=0,d=0;for(let e=0;e<n;e++){let t=Math.random()*2-1;a=.99886*a+t*.0555179,o=.99332*o+t*.0750759,s=.969*s+t*.153852,c=.8665*c+t*.3104856,l=.55*l+t*.5329522,u=-.7616*u-t*.016898,i[e]=(a+o+s+c+l+u+d+t*.5362)*.11,d=t*.115926}let f=Math.floor(e.sampleRate*.05);for(let e=0;e<f;e++){let t=e/f;i[e]=i[e]*t+i[n-f+e]*(1-t)}return r}var Ve=`
float hash12(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}
float vnoise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  float a = hash12(i);
  float b = hash12(i + vec2(1.0, 0.0));
  float c = hash12(i + vec2(0.0, 1.0));
  float d = hash12(i + vec2(1.0, 1.0));
  return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
}
float fbm3(vec2 p) {
  float s = 0.0;
  float a = 0.5;
  for (int i = 0; i < 3; i++) {
    s += vnoise(p) * a;
    p = mat2(1.6, 1.2, -1.2, 1.6) * p;
    a *= 0.5;
  }
  return s / 0.875;
}
`,He=`
uniform float uTime;
uniform vec2 uWindDir;
uniform float uWindSpeed;
uniform float uWindScroll;
uniform float uWindGust;
vec2 windAt(vec2 xz) {
  vec2 side = vec2(-uWindDir.y, uWindDir.x);
  // Wind-frame coordinates of the fixed point xz; only 'a' moves, by the integrated scroll.
  float a = dot(xz, uWindDir) - uWindScroll;
  float c = dot(xz, side);
  float bands = vnoise(vec2(a * 0.045, c * 0.02 + uTime * 0.02)) * 0.65
              + vnoise(vec2(a * 0.11 + 3.1, c * 0.05 - uTime * 0.03)) * 0.35;
  float gust = smoothstep(0.3, 0.85, bands) * (0.75 + 0.25 * uWindGust);
  float sway = sin(a * 0.6 + vnoise(vec2(a * 0.07, c * 0.11)) * 5.0);
  return vec2(gust, sway);
}
`,Ue=`
vec3 skyColor(vec3 dir) {
  float y = dir.y;
  float up = clamp(y, 0.0, 1.0);
  vec3 zenith = vec3(0.030, 0.062, 0.52);
  vec3 mid = vec3(0.075, 0.135, 0.66);
  vec3 horizon = vec3(0.42, 0.55, 0.92);
  vec3 col = mix(horizon, mid, smoothstep(0.0, 0.32, up));
  col = mix(col, zenith, smoothstep(0.25, 0.95, up));
  // Below the horizon everything fades into the bright haze over the cloud sea.
  col = mix(col, vec3(0.58, 0.66, 0.92), smoothstep(0.0, -0.25, y));
  float s = max(dot(dir, uSunDir), 0.0);
  col += vec3(1.0, 0.92, 0.8) * (pow(s, 6.0) * 0.28 + pow(s, 64.0) * 0.6);
  col += vec3(1.0, 0.98, 0.9) * smoothstep(0.9994, 0.9998, s) * 40.0;
  return col;
}
`,We=`
vec3 meadowColor(vec2 xz) {
  float big = fbm3(xz * 0.016);
  float mid = fbm3(xz * 0.075 + 3.1);
  vec3 lush = vec3(0.13, 0.31, 0.04);
  vec3 sunny = vec3(0.31, 0.42, 0.07);
  vec3 deep = vec3(0.065, 0.2, 0.05);
  vec3 col = mix(lush, sunny, smoothstep(0.5, 0.8, big) * 0.75);
  return mix(col, deep, smoothstep(0.44, 0.22, mid) * 0.42);
}
// Faces turned from the sun lean to a cool blue-green, like the reference's shaded flank.
vec3 meadowShade(vec3 col, float ndl) {
  return mix(col * vec3(0.52, 0.74, 1.28), col, smoothstep(-0.08, 0.45, ndl));
}
`;function R(e,t){let n=Math.hypot(e,t),r=-.0055*n*n-.004*Math.max(0,n-45)**2.1,i=Math.exp(-((Math.atan2(e,t)-.25)**2)/.35)*L(14,70,n)*L(150,70,n);return r+=i*9,r-=Math.max(0,e)*.05*L(20,80,n),r+=Ie(e/46,t/46,3,11)*3.2*L(6,40,n),r+=Ie(e/13+7.3,t/13-2.1,2,23)*.42*L(4,18,n),r+=.55*Math.exp(-(n*n)/26),r}function Ge(e,t,n=new g){let r=.35,i=R(e+r,t)-R(e-r,t),a=R(e,t+r)-R(e,t-r);return n.set(-i,2*r,-a).normalize()}var Ke={size:512,extent:128},qe=class{mesh;heightTexture;material;uniforms={uTime:{value:0},uWindDir:{value:new m(1,0)},uWindSpeed:{value:6},uWindScroll:{value:0},uWindGust:{value:0},uSunDirT:{value:new g(-.72,.55,.42).normalize()}};heightData;texData;constructor(e){this.mesh=new D(this.buildGeometry(),this.material=this.buildMaterial()),this.mesh.receiveShadow=!0,this.mesh.name=`terrain`,this.addCollider(e);let{size:t,extent:n}=Ke;this.heightData=new Float32Array(t*t*4);let r=new g;for(let e=0;e<t;e+=1)for(let i=0;i<t;i+=1){let a=(i+.5)/t*2*n-n,o=(e+.5)/t*2*n-n;Ge(a,o,r);let s=(e*t+i)*4;this.heightData[s]=R(a,o),this.heightData[s+1]=r.x,this.heightData[s+2]=r.z,this.heightData[s+3]=1}this.texData=new Uint16Array(this.heightData.length),this.heightTexture=new Te(this.texData,t,t,S,f),this.heightTexture.minFilter=d,this.heightTexture.magFilter=d,this.upload()}upload(){for(let e=0;e<this.heightData.length;e+=1)this.texData[e]=x.toHalfFloat(this.heightData[e]);this.heightTexture.needsUpdate=!0}maskGrass(e){let{size:t,extent:n}=Ke,r=2*n/t;for(let i of e){let e=Math.max(0,Math.floor((i.x-i.r-1+n)/r)),a=Math.min(t-1,Math.ceil((i.x+i.r+1+n)/r)),o=Math.max(0,Math.floor((i.z-i.r-1+n)/r)),s=Math.min(t-1,Math.ceil((i.z+i.r+1+n)/r));for(let c=o;c<=s;c+=1)for(let o=e;o<=a;o+=1){let e=(o+.5)*r-n,a=(c+.5)*r-n,s=Math.hypot(e-i.x,a-i.z),l=(c*t+o)*4+3;this.heightData[l]=Math.min(this.heightData[l],L(i.r*.8,i.r+.6,s))}}this.upload()}update(e,t){this.uniforms.uTime.value=e,this.uniforms.uWindDir.value.copy(t.dir),this.uniforms.uWindSpeed.value=t.speed,this.uniforms.uWindScroll.value=t.scroll,this.uniforms.uWindGust.value=t.gustSmooth}buildGeometry(){let e=e=>64*e+396*e*e*e,t=90601,n=new Float32Array(t*3),r=new Float32Array(t*3),i=new g;for(let t=0;t<=300;t+=1)for(let a=0;a<=300;a+=1){let o=e(a/300*2-1),s=e(t/300*2-1),c=(t*301+a)*3;n[c]=o,n[c+1]=R(o,s),n[c+2]=s,Ge(o,s,i),r[c]=i.x,r[c+1]=i.y,r[c+2]=i.z}let a=new Uint32Array(54e4),o=0;for(let e=0;e<300;e+=1)for(let t=0;t<300;t+=1){let n=e*301+t,r=n+1,i=n+300+1,s=i+1;a.set([n,i,r,r,i,s],o),o+=6}let s=new w;return s.setAttribute(`position`,new A(n,3)),s.setAttribute(`normal`,new A(r,3)),s.setIndex(new A(a,1)),s.computeBoundingSphere(),s}addCollider(e){let t=new Float32Array(162867);for(let e=0;e<233;e+=1)for(let n=0;n<233;n+=1){let r=-116+n*1,i=-116+e*1,a=(e*233+n)*3;t[a]=r,t[a+1]=R(r,i),t[a+2]=i}let n=new Uint32Array(322944),r=0;for(let e=0;e<232;e+=1)for(let t=0;t<232;t+=1){let i=e*233+t,a=i+1,o=i+233,s=o+1;n.set([i,o,a,a,o,s],r),r+=6}e.world.createCollider(Me.ColliderDesc.trimesh(t,n).setFriction(.8))}buildMaterial(){let e=new j({color:16777215});return e.onBeforeCompile=e=>{Object.assign(e.uniforms,this.uniforms),e.vertexShader=e.vertexShader.replace(`#include <common>`,`#include <common>
varying vec3 vWorldPos;`).replace(`#include <worldpos_vertex>`,`#include <worldpos_vertex>
vWorldPos = (modelMatrix * vec4(transformed, 1.0)).xyz;`),e.fragmentShader=e.fragmentShader.replace(`#include <common>`,`#include <common>\nvarying vec3 vWorldPos;\nuniform vec3 uSunDirT;\n${Ve}\n${We}\n${He}`).replace(`#include <color_fragment>`,`#include <color_fragment>
          {
            vec2 xz = vWorldPos.xz;
            float fine = vnoise(xz * 1.7) * 0.6 + vnoise(xz * 5.3) * 0.4;
            vec3 col = meadowColor(xz) * (0.8 + fine * 0.34);
            // The turf seen between near blades is their shaded understory.
            col *= mix(0.8, 1.0, smoothstep(30.0, 110.0, distance(vWorldPos, cameraPosition)));
            // Distant meadow: wind waves brighten the grass as they pass.
            float gust = windAt(xz).x;
            col *= 1.0 + gust * 0.22;
            // Slopes turned from the sun lean blue (matches the grass).
            vec3 wn = normalize(cross(dFdx(vWorldPos), dFdy(vWorldPos)));
            wn *= sign(wn.y + 1e-4);
            col = meadowShade(col, dot(wn, uSunDirT));
            diffuseColor.rgb = col;
          }`)},e}};function Je(){let e=document.createElement(`canvas`);e.width=e.height=256;let t=e.getContext(`2d`);t.fillStyle=`rgb(128,128,128)`,t.fillRect(0,0,256,256);let n=I(3);for(let e=0;e<420;e+=1){let e=n()*256,r=n()*256,i=4+n()*9;for(let n of[-256,0,256])for(let a of[-256,0,256]){let o=t.createRadialGradient(e+n,r+a,0,e+n,r+a,i);o.addColorStop(0,`rgba(210,210,210,0.8)`),o.addColorStop(.7,`rgba(150,150,150,0.4)`),o.addColorStop(1,`rgba(90,90,90,0)`),t.fillStyle=o,t.fillRect(e+n-i,r+a-i,i*2,i*2)}}let r=new N(e);return r.wrapS=r.wrapT=de,r.repeat.set(3,3),r}function Ye(){let e=Je(),t=new T({color:new O(.8,.8,.83),roughness:1,bumpMap:e,bumpScale:.012});return t.onBeforeCompile=e=>{e.fragmentShader=e.fragmentShader.replace(`#include <opaque_fragment>`,`float fuzz = pow(1.0 - saturate(dot(normal, normalize(vViewPosition))), 2.2);
      outgoingLight += vec3(0.32, 0.34, 0.42) * fuzz * 0.55;
      #include <opaque_fragment>`)},t}var Xe=class{group=new u;body=new u;head=new u;ears=[];eyes=[];yaw=0;pitch=0;gazeYaw=0;gazePitch=.2;nextGaze=2;nextBlink=3;blink=0;nextFlick=2.5;flick=0;flickEar=0;t=0;R=I(99);baseQuat=new k;constructor(e,t,n){this.group.name=`critter`;let r=Ye(),i=new T({color:new O(.08,.075,.09),roughness:.7}),a=new T({color:new O(.62,.56,.46),roughness:.6}),o=new T({color:new O(.72,.68,.7),roughness:.9}),s=new le(1,24,16),c=(e,t,n,r,i,a,o=a,c=a)=>{let l=new D(s,t);return l.position.set(n,r,i),l.scale.set(a,o,c),l.castShadow=!0,l.receiveShadow=!0,e.add(l),l};c(this.body,r,0,.36,0,.46,.34,.36);for(let[e,t,n,i]of[[.22,.5,.12,.2],[.22,.5,-.12,.2],[-.05,.58,.14,.2],[-.05,.58,-.14,.2],[-.28,.42,.16,.2],[-.28,.42,-.16,.2],[-.12,.3,.26,.19],[-.12,.3,-.26,.19],[.16,.26,.24,.17],[.16,.26,-.24,.17],[-.4,.3,0,.18]])c(this.body,r,e,t,n,i);c(this.body,r,-.52,.42,0,.1);let l=new ae(.045,.2,4,8);for(let e of[.11,-.11]){let t=new D(l,i);t.position.set(.36,.12,e),t.rotation.z=1.2,t.castShadow=!0,this.body.add(t)}this.head.position.set(.4,.66,0),c(this.head,r,0,0,0,.19,.17,.16),c(this.head,o,.13,-.05,0,.1,.085,.085),c(this.head,r,-.02,.12,0,.1),c(this.head,i,.215,-.04,0,.022,.018,.03);for(let e of[.075,-.075]){let t=c(this.head,i,.14,.035,e,.024);this.eyes.push(t);let n=c(this.head,o,0,.03,e*2.1,.11,.035,.055);n.rotation.x=e>0?-.5:.5,this.ears.push(n);let r=new D(new De(.07,.022,8,16,Math.PI*1.4),a);r.position.set(-.03,.08,e*1.6),r.rotation.set(0,e>0?.3:-.3,.6),r.castShadow=!0,this.head.add(r)}this.body.add(this.head),this.group.add(this.body);let u=Ge(t.x,t.z);this.group.position.copy(t).addScaledVector(u,-.04);let d=new g(0,1,0).lerp(u,.6).normalize();this.group.quaternion.setFromUnitVectors(new g(0,1,0),d);let f=n.clone().sub(t).setY(0).normalize();this.group.rotateY(Math.atan2(-f.z,f.x)),this.group.updateMatrixWorld(!0),this.baseQuat.copy(this.group.quaternion),e.world.createCollider(Me.ColliderDesc.ball(.45).setTranslation(t.x,t.y+.4,t.z))}update(e,t){this.t+=e;let n=Math.sin(this.t*2.1);this.body.scale.set(1,1+n*.018,1+n*.01);let r=this.group.worldToLocal(t.clone()).sub(this.head.position),i=r.length(),a=Math.atan2(-r.z,r.x),o=Math.atan2(r.y,Math.hypot(r.x,r.z));this.nextGaze-=e,this.nextGaze<=0&&(this.nextGaze=2.5+this.R()*4,this.gazeYaw=(this.R()-.5)*1.6,this.gazePitch=.1+this.R()*.45);let s=this.gazeYaw,c=this.gazePitch;i<14&&Math.abs(a)<1.9&&(s=a,c=o),s=C.clamp(s,-1.25,1.25),c=C.clamp(c,-.5,.7);let l=1-Math.exp(-e*3.2);this.yaw+=(s-this.yaw)*l,this.pitch+=(c-this.pitch)*l,this.head.rotation.set(0,this.yaw,this.pitch*.8,`YZX`),this.nextBlink-=e,this.nextBlink<=0&&(this.nextBlink=2.5+this.R()*4,this.blink=.14),this.blink=Math.max(0,this.blink-e);for(let e of this.eyes)e.scale.y=this.blink>0?.004:.024;this.nextFlick-=e,this.nextFlick<=0&&(this.nextFlick=1.8+this.R()*4,this.flick=.3,this.flickEar=this.R()<.5?0:1),this.flick=Math.max(0,this.flick-e),this.ears.forEach((e,t)=>{let n=t===0?-.5:.5,r=t===this.flickEar?Math.sin(this.flick/.3*Math.PI)*.6:0;e.rotation.x=n+(t===0?-r:r)})}},Ze=170,Qe=16,$e=6,et=6,tt=[[.28,.5,.1],[.36,.56,.12],[.48,.6,.13],[.6,.62,.16],[.78,.62,.2]],nt=[[.97,.96,.91],[.98,.84,.88],[1,.88,.42],[.76,.62,.95]],rt=class{mesh;flakes=[];R=I(71);w=new g;q=new k;s=new g;m=new r;time=0;seeded=!1;constructor(e){let t=this.R,n=new _e(1,1),r=new Float32Array(Ze),a=new j({color:16777215,side:2});this.mesh=new l(n,a,Ze);let o=new O;for(let e=0;e<Ze;e+=1){let n=t()<.36;r[e]=+!!n;let i=n?nt[Math.floor(t()*nt.length)]:tt[Math.floor(t()*tt.length)];this.mesh.setColorAt(e,o.setRGB(i[0],i[1],i[2])),this.flakes.push({pos:new g,vel:new g,axis:new g(t()-.5,t()-.5,t()-.5).normalize(),angle:t()*Math.PI*2,spin:(n?3:2)+t()*4,size:n?.05+t()*.03:.1+t()*.07,fall:n?.35+t()*.3:.6+t()*.5,follow:n?2.6+t()*1.4:1.4+t()*1.2,phase:t()*Math.PI*2,rate:1.2+t()*2.2,rest:0})}n.setAttribute(`aKind`,new i(r,1)),a.onBeforeCompile=e=>{e.vertexShader=e.vertexShader.replace(`#include <common>`,`#include <common>
attribute float aKind;
varying vec2 vFUv;
varying float vFKind;`).replace(`#include <begin_vertex>`,`#include <begin_vertex>
vFUv = uv;
vFKind = aKind;`),e.fragmentShader=e.fragmentShader.replace(`#include <common>`,`#include <common>
varying vec2 vFUv;
varying float vFKind;`).replace(`#include <color_fragment>`,`#include <color_fragment>
{
  vec2 q = vFUv * 2.0 - 1.0;
  bool inside;
  if (vFKind < 0.5) {
    // Leaf: a pointed oval, fuller toward the stalk, with a short stalk and a darker midrib.
    float hw = 0.46 * (1.0 - q.y * q.y) * (1.0 - 0.28 * q.y);
    inside = abs(q.x) < hw || (abs(q.x) < 0.035 && q.y < -0.78);
    diffuseColor.rgb *= 1.0 - 0.28 * (1.0 - smoothstep(0.0, 0.07, abs(q.x))) * step(-0.8, q.y);
  } else {
    // Petal: a rounded teardrop narrowing to its base.
    float r = length(vec2(q.x * (1.25 + max(-q.y, 0.0) * 0.9), q.y * 0.95 - 0.08));
    inside = r < 0.84;
  }
  if (!inside) discard;
}`).replace(`#include <emissivemap_fragment>`,`#include <emissivemap_fragment>
totalEmissiveRadiance += diffuseColor.rgb * 0.38;`)},a.customProgramCacheKey=()=>`drift-v2`,this.mesh.frustumCulled=!1,this.mesh.name=`drift`,this.setDensity(e)}setDensity(e){this.mesh.count=Math.round(Ze*(.4+.6*Math.min(1,Math.max(0,e))))}update(e,t,n){let r=this.R;e=Math.min(e,.05),this.time+=e;let i=this.time;if(!this.seeded){this.seeded=!0;for(let e of this.flakes)this.respawn(e,t,n,!1)}let a=t.dir.x,o=t.dir.y;for(let s=0;s<this.mesh.count;s+=1){let c=this.flakes[s],l=c.pos,u=l.x-n.x,d=l.z-n.z;(u*u+d*d>1024||Math.abs(l.y-n.y)>60)&&(this.respawn(c,t,n,!1),u=l.x-n.x,d=l.z-n.z);let f=R(l.x,l.z),p=l.y-f;if(c.rest>0){if(c.rest-=e,t.gust<.55&&c.rest>0&&u*u+d*d<=256){this.place(s,c,n);continue}c.rest=0}let m=t.velocityAt(l,this.w);m.multiplyScalar(.3+.7*L(0,2.5,p)),m.y+=(t.gust-.3)*1.7*(.6+.4*Math.sin(i*.7+c.phase));let h=Math.sin(i*c.rate+c.phase);m.x+=-o*h*.8,m.z+=a*h*.8,m.y+=Math.cos(i*c.rate*1.3+c.phase)*.45-c.fall,c.vel.lerp(m,1-Math.exp(-e*c.follow)),l.addScaledVector(c.vel,e);let g=R(l.x,l.z)+.05;l.y<g&&(l.y=g,c.vel.y=Math.max(0,c.vel.y),c.vel.x*=.5,c.vel.z*=.5,t.gust<.45&&r()<.05&&(c.rest=1+r()*4)),c.angle+=c.spin*e*(.35+Math.min(c.vel.length(),8)*.12),u=l.x-n.x,d=l.z-n.z,(u*u+d*d>256||l.y>n.y+et+3)&&this.respawn(c,t,n,!0),this.place(s,c,n)}this.mesh.instanceMatrix.needsUpdate=!0}place(e,t,n){let r=t.pos.distanceTo(n),i=t.size*L(.35,.9,r);this.q.setFromAxisAngle(t.axis,t.angle),this.m.compose(t.pos,this.q,this.s.set(i,i,i)),this.mesh.setMatrixAt(e,this.m)}respawn(e,t,n,r){let i=this.R,a,o;if(r){let e=Math.atan2(t.dir.y,t.dir.x)+Math.PI+(i()-.5)*Math.PI*.95,r=Qe*(.9+i()*.08);a=n.x+Math.cos(e)*r,o=n.z+Math.sin(e)*r}else{let e=i()*Math.PI*2,t=Math.sqrt(i())*Qe*.95;a=n.x+Math.cos(e)*t,o=n.z+Math.sin(e)*t}let s=R(a,o),c=Math.max(s+.15,n.y-$e),l=Math.max(c+1,n.y+et);e.pos.set(a,c+(l-c)*i(),o),t.velocityAt(e.pos,e.vel),e.rest=0}dispose(){this.mesh.geometry.dispose(),this.mesh.material.dispose()}};function it(e,t=!1){let n=e[0].index!==null,r=new Set(Object.keys(e[0].attributes)),i=new Set(Object.keys(e[0].morphAttributes)),a={},o={},s=e[0].morphTargetsRelative,c=new w,l=0;for(let u=0;u<e.length;++u){let d=e[u],f=0;if(n!==(d.index!==null))return console.error(`THREE.BufferGeometryUtils: .mergeGeometries() failed with geometry at index `+u+`. All geometries must have compatible attributes; make sure index attribute exists among all geometries, or in none of them.`),null;for(let e in d.attributes){if(!r.has(e))return console.error(`THREE.BufferGeometryUtils: .mergeGeometries() failed with geometry at index `+u+`. All geometries must have compatible attributes; make sure "`+e+`" attribute exists among all geometries, or in none of them.`),null;a[e]===void 0&&(a[e]=[]),a[e].push(d.attributes[e]),f++}if(f!==r.size)return console.error(`THREE.BufferGeometryUtils: .mergeGeometries() failed with geometry at index `+u+`. Make sure all geometries have the same number of attributes.`),null;if(s!==d.morphTargetsRelative)return console.error(`THREE.BufferGeometryUtils: .mergeGeometries() failed with geometry at index `+u+`. .morphTargetsRelative must be consistent throughout all geometries.`),null;for(let e in d.morphAttributes){if(!i.has(e))return console.error(`THREE.BufferGeometryUtils: .mergeGeometries() failed with geometry at index `+u+`.  .morphAttributes must be consistent throughout all geometries.`),null;o[e]===void 0&&(o[e]=[]),o[e].push(d.morphAttributes[e])}if(t){let e;if(n)e=d.index.count;else if(d.attributes.position!==void 0)e=d.attributes.position.count;else return console.error(`THREE.BufferGeometryUtils: .mergeGeometries() failed with geometry at index `+u+`. The geometry must have either an index or a position attribute`),null;c.addGroup(l,e,u),l+=e}}if(n){let t=0,n=[];for(let r=0;r<e.length;++r){let i=e[r].index;for(let e=0;e<i.count;++e)n.push(i.getX(e)+t);t+=e[r].attributes.position.count}c.setIndex(n)}for(let e in a){let t=at(a[e]);if(!t)return console.error(`THREE.BufferGeometryUtils: .mergeGeometries() failed while trying to merge the `+e+` attribute.`),null;c.setAttribute(e,t)}for(let e in o){let t=o[e][0].length;if(t!==0){c.morphAttributes=c.morphAttributes||{},c.morphAttributes[e]=[];for(let n=0;n<t;++n){let t=[];for(let r=0;r<o[e].length;++r)t.push(o[e][r][n]);let r=at(t);if(!r)return console.error(`THREE.BufferGeometryUtils: .mergeGeometries() failed while trying to merge the `+e+` morphAttribute.`),null;c.morphAttributes[e].push(r)}}}return c}function at(e){let t,n,r,i=-1,a=0;for(let o=0;o<e.length;++o){let s=e[o];if(t===void 0&&(t=s.array.constructor),t!==s.array.constructor)return console.error(`THREE.BufferGeometryUtils: .mergeAttributes() failed. BufferAttribute.array must be of consistent array types across matching attributes.`),null;if(n===void 0&&(n=s.itemSize),n!==s.itemSize)return console.error(`THREE.BufferGeometryUtils: .mergeAttributes() failed. BufferAttribute.itemSize must be consistent across matching attributes.`),null;if(r===void 0&&(r=s.normalized),r!==s.normalized)return console.error(`THREE.BufferGeometryUtils: .mergeAttributes() failed. BufferAttribute.normalized must be consistent across matching attributes.`),null;if(i===-1&&(i=s.gpuType),i!==s.gpuType)return console.error(`THREE.BufferGeometryUtils: .mergeAttributes() failed. BufferAttribute.gpuType must be consistent across matching attributes.`),null;a+=s.count*n}let o=new t(a),s=new A(o,n,r),c=0;for(let t=0;t<e.length;++t){let r=e[t];if(r.isInterleavedBufferAttribute){let e=c/n;for(let t=0,i=r.count;t<i;t++)for(let i=0;i<n;i++){let n=r.getComponent(t,i);s.setComponent(t+e,i,n)}}else o.set(r.array,c);c+=r.count*n}return i!==void 0&&(s.gpuType=i),s}function ot(e,t=1e-4){t=Math.max(t,2**-52);let n={},r=e.getIndex(),i=e.getAttribute(`position`),a=r?r.count:i.count,o=0,s=Object.keys(e.attributes),c={},l={},u=[],d=[`getX`,`getY`,`getZ`,`getW`],f=[`setX`,`setY`,`setZ`,`setW`];for(let t=0,n=s.length;t<n;t++){let n=s[t],r=e.attributes[n];c[n]=new r.constructor(new r.array.constructor(r.count*r.itemSize),r.itemSize,r.normalized);let i=e.morphAttributes[n];i&&(l[n]||(l[n]=[]),i.forEach((e,t)=>{let r=new e.array.constructor(e.count*e.itemSize);l[n][t]=new e.constructor(r,e.itemSize,e.normalized)}))}let p=t*.5,m=10**Math.log10(1/t),h=p*m;for(let t=0;t<a;t++){let i=r?r.getX(t):t,a=``;for(let t=0,n=s.length;t<n;t++){let n=s[t],r=e.getAttribute(n),o=r.itemSize;for(let e=0;e<o;e++)a+=`${Math.trunc(r[d[e]](i)*m+h)},`}if(a in n)u.push(n[a]);else{for(let t=0,n=s.length;t<n;t++){let n=s[t],r=e.getAttribute(n),a=e.morphAttributes[n],u=r.itemSize,p=c[n],m=l[n];for(let e=0;e<u;e++){let t=d[e],n=f[e];if(p[n](o,r[t](i)),a)for(let e=0,r=a.length;e<r;e++)m[e][n](o,a[e][t](i))}}n[a]=o,u.push(o),o++}}let g=e.clone();for(let t in e.attributes){let e=c[t];if(g.setAttribute(t,new e.constructor(e.array.slice(0,o*e.itemSize),e.itemSize,e.normalized)),t in l)for(let e=0;e<l[t].length;e++){let n=l[t][e];g.morphAttributes[t][e]=new n.constructor(n.array.slice(0,o*n.itemSize),n.itemSize,n.normalized)}}return g.setIndex(u),g}var z=(e,t,n)=>new g(e,t,n),B=(e,t,n)=>new O().setRGB(e,t,n,Se),st={plane:{x:10.8,z:25.2,yaw:1.95},hat:{x:-17,z:24,yaw:.55},sprouts:[[1.5,17],[8.6,12.4],[-3.6,21],[6.3,5.9]]},ct=180;function V(e,t,n){let r=e.index?e.toNonIndexed():e;r!==e&&e.dispose(),r.deleteAttribute(`uv`),r.getAttribute(`normal`)||r.computeVertexNormals();let i=r.getAttribute(`position`),a=r.getAttribute(`normal`),o=new Float32Array(i.count*3),s=new g,c=new g,l=new O;for(let e=0;e<i.count;e+=1){if(l.copy(t),n){s.fromBufferAttribute(i,e),c.fromBufferAttribute(a,e);let t=n(s,c);typeof t==`number`?l.multiplyScalar(t):l.copy(t)}o[e*3]=l.r,o[e*3+1]=l.g,o[e*3+2]=l.b}return r.setAttribute(`color`,new A(o,3)),r}function H(e,t,n,i){return e.applyMatrix4(new r().compose(t,new k().setFromEuler(n??new _),i??z(1,1,1)))}var U=(e,t,n)=>new ye(e,t,n),W=(e,t,n,r=10)=>new P(e,t,n,r),G=(e,t=12,n=8)=>new le(e,t,n),K=(e=0,t=0,n=0)=>new _(e,t,n);function lt(e){return new ge({uniforms:{uSun:{value:e.clone().normalize()}},vertexShader:`
      varying vec3 vN;
      varying vec3 vV;
      void main() {
        vec4 wp = modelMatrix * vec4(position, 1.0);
        vN = normalize(mat3(modelMatrix) * normal);
        vV = cameraPosition - wp.xyz;
        gl_Position = projectionMatrix * viewMatrix * wp;
      }`,fragmentShader:`
      uniform vec3 uSun;
      varying vec3 vN;
      varying vec3 vV;
      void main() {
        vec3 n = normalize(vN);
        vec3 v = normalize(vV);
        if (!gl_FrontFacing) n = -n;
        float f = pow(1.0 - abs(dot(n, v)), 2.6);
        float spec = pow(max(dot(n, normalize(uSun + v)), 0.0), 90.0);
        float a = clamp(0.05 + 0.5 * f + spec * 0.8, 0.0, 0.85);
        gl_FragColor = vec4(vec3(0.82, 0.9, 1.0) * (0.7 + 0.5 * f) + vec3(spec * 2.4), a);
      }`,transparent:!0,depthWrite:!1,side:2})}var ut=class{group=new u;grassMask=[];reserved=[];planeFocus=new g;hatFocus=new g;boxFocus=new g;roseFocus=new g;sprouts=[];propeller=new u;rose=new u;dome;domeHome=new g;domeAside=new g;domeT=0;domeTarget=0;geometries=[];materials=[];constructor(e,t,n){this.group.name=`props`;let i=new j({vertexColors:!0}),a=new j({vertexColors:!0,flatShading:!0}),o=new j({vertexColors:!0,side:2}),s=lt(n);this.materials.push(i,a,o,s);let c=(e,t)=>{let n=it(e);for(let t of e)t.dispose();this.geometries.push(n);let r=new D(n,t);return r.castShadow=!0,r.receiveShadow=!0,r},l=z(t.forward.x,0,t.forward.z).normalize(),d=z(-l.z,0,l.x);{let t=st.plane,n=B(.93,.88,.78),r=B(.78,.2,.17),a=B(.17,.15,.14),o=B(.5,.4,.3),s=c([V(H(W(.46,.2,3.6,14),z(0,0,0),K(Math.PI/2)),n,e=>e.z>1.3?.78:1),V(H(W(.49,.48,.42,16),z(0,0,1.86),K(Math.PI/2)),r),V(H(G(.21,12,8),z(0,0,2.08),void 0,z(1,1,.55)),a),V(H(new De(.3,.06,8,20),z(0,.33,-.2),K(Math.PI/2)),B(.38,.22,.13)),V(H(W(.28,.28,.02,16),z(0,.31,-.2)),a),V(H(U(.5,.22,.03),z(0,.46,.22),K(-.4)),B(.7,.8,.86)),V(H(U(4.3,.08,.9),z(0,.95,.55)),n),V(H(U(.5,.085,.905),z(2.4,.95,.55)),r),V(H(U(.5,.085,.905),z(-2.4,.95,.55)),r),V(H(U(2.4,.08,.85),z(-1.35,-.28,.6)),n),V(H(U(2.3,.08,.85),z(1.3,-.42,.62),K(.05,0,-.22)),n,e=>e.x>1.9?.85:1),...[-1.6,1.6].flatMap(e=>[.3,.8].map(t=>V(H(W(.028,.028,1.22,6),z(e,e>0?.28:.34,t),K(0,0,e>0?.12:0)),o))),...[-.32,.32].map(e=>V(H(W(.025,.025,.72,6),z(e,.62,.55),K(0,0,-e*.9)),o)),V(H(U(1.7,.05,.55),z(0,.05,-1.72)),n),V(H(U(.05,.72,.62),z(0,.42,-1.78)),r),V(H(U(.055,.14,.64),z(0,.18,-1.78)),n),...[-.6,.6].map(e=>V(H(W(.23,.23,.1,14),z(e,-.78,.95),K(0,0,Math.PI/2)),a)),...[-.6,.6].map(e=>V(H(W(.03,.03,.62,6),z(e*.72,-.5,.92),K(0,0,e>0?-.45:.45)),o))],i),l=c([V(H(U(.16,1.1,.045),z(0,.55,0)),o),V(H(U(.16,.5,.045),z(0,-.25,0)),o),V(H(U(.16,.62,.045),z(0,-.72,-.2),K(.75)),o),V(H(G(.09,10,8),z(0,0,0)),a)],i);this.propeller.add(l),this.propeller.position.set(0,0,2.2);let d=new u;d.add(s,this.propeller);let f=R(t.x,t.z);d.position.set(t.x,f+1.05,t.z),d.rotation.set(.46,t.yaw,.12,`YXZ`),d.updateMatrixWorld(!0),this.group.add(d),this.planeFocus.copy(z(0,.3,-.2).applyMatrix4(d.matrixWorld));let p=d.quaternion;e.addStaticBox(z(0,0,.1).applyMatrix4(d.matrixWorld),z(1,1,4.2),p),e.addStaticBox(z(0,.33,.58).applyMatrix4(d.matrixWorld),z(5,1.4,1),p);let m=z(0,0,1.8).applyMatrix4(d.matrixWorld);this.grassMask.push({x:m.x,z:m.z,r:.9}),this.reserved.push({x:t.x,z:t.z,r:4.5})}{let t=st.hat,n=new Oe(1,4),r=n.getAttribute(`position`),i=new g;for(let e=0;e<r.count;e+=1){i.fromBufferAttribute(r,e);let t=i.x,n=.18+.07*(1-t*t)+1.02*Math.exp(-(((t-.1)/.38)**2)),a=.5+.55*Math.exp(-(((t-.05)/.52)**2));r.setXYZ(e,t*2.3,i.y>0?i.y*n*1.45:i.y*.3,i.z*a)}n.computeVertexNormals();let o=I(71),s=B(.6,.62,.64),l=B(.36,.5,.22),u=new O,d=0,f=1,p=c([V(n,s,(e,t)=>{d++%3==0&&(f=.88+o()*.2);let n=C.smoothstep(t.y,.55,.85)*C.smoothstep(e.y,.35,.9);return u.copy(s).lerp(l,n*.85).multiplyScalar(f)})],a),m=R(t.x,t.z);p.position.set(t.x,m-.12,t.z),p.rotation.y=t.yaw,p.updateMatrixWorld(!0),this.group.add(p),this.hatFocus.set(t.x,m+1,t.z);let h=Me.ColliderDesc.convexHull(new Float32Array(p.geometry.getAttribute(`position`).array));if(h){let t=p.quaternion;e.world.createCollider(h.setTranslation(p.position.x,p.position.y,p.position.z).setRotation({x:t.x,y:t.y,z:t.z,w:t.w}))}this.grassMask.push({x:t.x,z:t.z,r:1.9}),this.reserved.push({x:t.x,z:t.z,r:3.6})}{let n=t.critter.clone().addScaledVector(d,-1.05).addScaledVector(l,.35);n.y=R(n.x,n.z);let a=B(.74,.55,.34),o=B(.5,.35,.2),s=new r().makeTranslation(0,.42,-.23),u=V(U(.66,.04,.5),a,e=>e.y>0?1.06:.8);u.applyMatrix4(new r().makeTranslation(0,.02,.25)),u.applyMatrix4(new r().makeRotationX(-.55)),u.applyMatrix4(s);let f=c([V(H(U(.62,.42,.46),z(0,.21,0)),a,(e,t)=>(t.y>.5?.9:1)*(.94+.08*Math.sin(e.y*40))),V(H(U(.63,.014,.47),z(0,.14,0)),o),V(H(U(.63,.014,.47),z(0,.28,0)),o),V(H(U(.56,.05,.4),z(0,.39,0)),B(.86,.76,.42)),...[-.17,0,.17].map(e=>V(H(W(.038,.038,.02,12),z(e,.23,.231),K(Math.PI/2)),B(.1,.07,.05))),u],i);f.position.copy(n),f.rotation.y=Math.atan2(l.x,l.z)+.35,f.updateMatrixWorld(!0),this.group.add(f),this.boxFocus.copy(n).add(z(0,.3,0)),e.addStaticBox(z(0,.21,0).applyMatrix4(f.matrixWorld),z(.62,.42,.46),f.quaternion),this.grassMask.push({x:n.x,z:n.z,r:.5}),this.reserved.push({x:n.x,z:n.z,r:1.2})}{let e=B(.55,.78,.24),t=B(.34,.5,.17),n=B(.4,.3,.2),r=()=>[V(H(W(.016,.026,.3,6),z(0,.15,0)),t),V(H(G(1,12,6),z(-.1,.31,0),K(0,0,.35),z(.12,.022,.07)),e,(e,t)=>t.y>0?1.12:.72),V(H(G(1,12,6),z(.1,.31,0),K(0,0,-.35),z(.12,.022,.07)),e,(e,t)=>t.y>0?1.12:.72),V(H(G(.028,8,6),z(0,.335,0)),B(.72,.86,.36))],a=V(H(G(.2,12,6),z(0,0,0),void 0,z(1,.3,1)),n,(e,t)=>.85+t.y*.2);this.geometries.push(a),st.sprouts.forEach(([e,t],n)=>{let o=R(e,t),s=new D(a,i);s.position.set(e,o,t),s.receiveShadow=!0;let l=c(r(),i);l.position.set(e,o,t),l.scale.setScalar(1.3),l.rotation.y=n*1.7,this.group.add(s,l),this.sprouts.push({at:z(e,o+.32,t),mesh:l,state:`up`,t:0,phase:n*2.1}),this.grassMask.push({x:e,z:t,r:.5}),this.reserved.push({x:e,z:t,r:1.5})})}{let n=t.rose.clone();n.y=R(n.x,n.z);let a=B(.25,.43,.15),u=new fe([z(0,0,0),z(.015,.15,.01),z(-.01,.3,0),z(.004,.45,.004)]),f=[V(new ie(u,16,.011,6),a)];[.08,.17,.26,.35].forEach((e,t)=>{let n=t*2.2;f.push(V(H(new pe(.009,.035,5),z(Math.cos(n)*.012,e,Math.sin(n)*.012),K(Math.sin(n)*1.2,0,-Math.cos(n)*1.2)),B(.36,.3,.14)))}),[[.15,.4],[.25,2.6]].forEach(([e,t])=>{let n=H(G(1,10,6),z(.055,0,0),K(0,0,.45),z(.07,.012,.034));n.applyMatrix4(new r().makeRotationY(t)).applyMatrix4(new r().makeTranslation(0,e,0)),f.push(V(n,a,(e,t)=>t.y>0?1.1:.75))});for(let e=0;e<5;e+=1){let t=e/5*Math.PI*2;f.push(V(H(new pe(.012,.05,4),z(Math.cos(t)*.03,.445,Math.sin(t)*.03),K(Math.sin(t)*2.2,0,-Math.cos(t)*2.2)),a))}let p=.49,h=(e,t,n,r,i,a,o,s)=>{for(let c=0;c<r;c+=1){let l=new le(e,8,6,a+c/r*Math.PI*2,i,t,n-t);l.translate(0,o-p,0),f.push(V(l,s,t=>C.lerp(.62,1.2,C.clamp((t.y-(o-p)+e)/(e*1.6),0,1))))}},g=[],_=f.length;h(.092,.36*Math.PI,.9*Math.PI,5,.55*Math.PI,0,p,B(.76,.08,.12)),h(.068,.24*Math.PI,.86*Math.PI,5,.55*Math.PI,.63,.505,B(.84,.1,.14)),h(.046,.12*Math.PI,.8*Math.PI,3,.8*Math.PI,1.1,.518,B(.68,.05,.09)),g.push(...f.splice(_)),g.push(V(H(G(.03,10,8),z(0,.012,0),void 0,z(1,1.3,1)),B(.6,.04,.08)));for(let e of g)e.translate(0,p,0);let v=c(f,i),y=c(g,o);this.rose.add(v,y),this.rose.position.copy(n),this.rose.scale.setScalar(1.25),this.group.add(this.rose),this.roseFocus.copy(n).add(z(0,.55,0));let b=[z(.235,0,0),z(.235,.46,0),z(.225,.54,0),z(.195,.61,0),z(.14,.66,0),z(.065,.685,0),z(0,.69,0)].map(e=>new m(e.x,e.y)),x=it([new ne(b,32).deleteAttribute(`uv`),H(G(.032,12,8),z(0,.715,0)).deleteAttribute(`uv`)]);this.geometries.push(x),this.dome=new D(x,s),this.dome.renderOrder=2,this.domeHome.copy(n),this.domeAside.copy(n).addScaledVector(d,.7).addScaledVector(l,.25),this.domeAside.y=R(this.domeAside.x,this.domeAside.z),this.dome.position.copy(this.domeHome),this.group.add(this.dome),e.addStaticCylinder(z(n.x,n.y+.35,n.z),.24,.7),this.grassMask.push({x:n.x,z:n.z,r:.42},{x:this.domeAside.x,z:this.domeAside.z,r:.34}),this.reserved.push({x:n.x,z:n.z,r:1.5})}}sproutsStanding(){return this.sprouts.filter(e=>e.state===`up`).length}pullSprout(e){let t=this.sprouts[e];t&&t.state===`up`&&(t.state=`pulled`,t.t=0)}setDome(e){this.domeTarget=+!!e}update(e,t,n){this.propeller.rotation.z=.35+Math.sin(t*.6)*.06+n*.22*Math.sin(t*1.9);for(let r of this.sprouts){r.t+=e;let i=r.mesh;if(r.state===`up`)i.rotation.z=Math.sin(t*1.8+r.phase)*.07*(.5+n);else if(r.state===`pulled`){let t=Math.min(1,r.t/.9);i.position.y=r.at.y-.32+(1-(1-t)*(1-t))*.55,i.rotation.y+=e*7,i.scale.setScalar(1.3*(1-t)),t>=1&&(r.state=`gone`,r.t=0,i.visible=!1)}else if(r.state===`gone`&&r.t>ct)r.state=`growing`,r.t=0,i.visible=!0,i.position.y=r.at.y-.32;else if(r.state===`growing`){let e=Math.min(1,r.t/2.5);i.scale.setScalar(1.3*e*e*(3-2*e)),e>=1&&(r.state=`up`)}}let r=this.domeTarget-this.domeT;this.domeT+=Math.sign(r)*Math.min(Math.abs(r),e/.9);let i=this.domeT*this.domeT*(3-2*this.domeT);this.dome.position.lerpVectors(this.domeHome,this.domeAside,i),this.dome.position.y+=Math.sin(Math.PI*i)*.45,this.dome.rotation.z=Math.sin(Math.PI*i)*.25,this.rose.rotation.z=Math.sin(t*1.4)*(.01+.06*i*(.4+n)),this.rose.rotation.x=Math.sin(t*1.1+1)*(.008+.035*i*(.4+n))}dispose(){for(let e of this.geometries)e.dispose();for(let e of this.materials)e.dispose()}},dt=new g(0,1,0),ft=class{group=new u;focus=new g;body=new u;head=new u;legs=[];tail=[];eyes=[];ears=[];geometries=[];material=new j({vertexColors:!0});pos=new g;goal=new g;mode=`rest`;goalYaw=0;yaw=0;speed=0;rest=1;idle=10;phase=0;blink=2.5;earT=0;earSide=0;headYaw=0;headPitch=0;happy=0;tmp=new g;n=new g;qTilt=new k;qYaw=new k;constructor(){this.group.name=`fox`;let e=B(.9,.47,.17),t=B(.97,.94,.88),n=B(.23,.15,.11),r=B(.05,.045,.045),i=e=>{let t=it(e);for(let t of e)t.dispose();this.geometries.push(t);let n=new D(t,this.material);return n.castShadow=!0,n};this.body.add(i([V(H(G(.17,16,12),z(0,0,-.02),void 0,z(.95,.9,2)),e,e=>e.y<-.07?t:1),V(H(G(.11,12,10),z(0,-.01,.25),void 0,z(.95,1.15,.9)),t)])),this.head.add(i([V(H(G(.115,16,12),z(0,.06,.05),void 0,z(1.05,.92,1)),e,e=>e.y<.035&&e.z>.07?t:1),V(H(new pe(.068,.2,12),z(0,.025,.2),K(Math.PI/2)),e,e=>e.y<.018?t:1),V(H(G(.024,10,8),z(0,.03,.298)),r)]));let a=V(G(.02,10,8),r),o=V(new pe(.058,.17,10),e,e=>e.y>.035?n:1);this.geometries.push(a,o);for(let e of[-1,1]){let t=new D(a,this.material);t.position.set(e*.056,.09,.145),t.scale.set(1,.8,.5);let n=new D(o,this.material);n.position.set(e*.068,.19,.02),n.rotation.set(-.12,0,-e*.28),n.castShadow=!0,this.eyes.push(t),this.ears.push(n),this.head.add(t,n)}this.head.rotation.order=`YXZ`;let s=it([V(H(new P(.03,.024,.33,7),z(0,-.165,0)),e,e=>e.y<-.13?n:1),V(H(G(.034,10,6),z(0,-.33,.015),void 0,z(1,.6,1.35)),n)]);this.geometries.push(s);for(let[e,t,n]of[[!0,-1,0],[!0,1,Math.PI],[!1,-1,Math.PI],[!1,1,0]]){let r=new u,i=new D(s,this.material);i.castShadow=!0,r.add(i),r.position.set(t*(e?.075:.085),.34,e?.2:-.22),this.legs.push({g:r,front:e,side:t,phase:n}),this.group.add(r)}let c=[.07,.088,.094,.084,.062],l=this.group;c.forEach((n,r)=>{let i=new u,a=V(H(G(n,12,8),z(0,0,-.075),void 0,z(1,.95,1.6)),r===c.length-1?t:e);this.geometries.push(a);let o=new D(a,this.material);o.castShadow=!0,i.add(o),i.position.set(0,0,r===0?0:-.12),l.add(i),this.tail.push(i),l=i}),this.group.add(this.body,this.head)}get available(){return this.speed<.35&&!(this.mode===`go`&&Math.hypot(this.goal.x-this.pos.x,this.goal.z-this.pos.z)>.4)}get following(){return this.mode===`follow`}place(e,t,n){this.pos.set(e,0,t),this.goal.copy(this.pos),this.yaw=this.goalYaw=n,this.mode=`rest`,this.speed=0,this.rest=1,this.idle=10}goTo(e,t,n){this.goal.set(e,0,t),this.goalYaw=n,this.mode=`go`,this.idle=0}follow(){this.mode=`follow`,this.idle=0}cheer(){this.happy=1}update(e,t,n,r,i,a){if(this.mode===`follow`&&!a){let e=i.x,t=i.z,n=Math.hypot(e,t)||1;this.goal.set(r.x+-t/n*1.45-e/n*.55,0,r.z+e/n*1.45-t/n*.55)}let o=this.goal.x-this.pos.x,s=this.goal.z-this.pos.z,c=Math.hypot(o,s),l=0;a||(this.mode===`go`?l=c>.1?Math.min(2.8,.7+c*1.4):0:this.mode===`follow`&&(c>1.7||this.speed>.15&&c>.35)&&(l=c>8?6.8:Math.min(3.4,.6+c*.9)));let u=0;l>0?u=Math.atan2(o,s)-this.yaw:(this.mode===`rest`||this.mode===`go`&&c<=.1)&&(u=this.goalYaw-this.yaw),u=Math.atan2(Math.sin(u),Math.cos(u)),this.yaw+=C.clamp(u,-e*5,e*5),l>0&&(l*=Math.max(0,Math.cos(u))**2),this.speed+=(l-this.speed)*Math.min(1,e*4),this.speed<.01&&l===0&&(this.speed=0),this.pos.x+=Math.sin(this.yaw)*this.speed*e,this.pos.z+=Math.cos(this.yaw)*this.speed*e,this.mode===`go`&&c<.12&&this.speed<.2&&(this.mode=`rest`),this.idle=this.speed>.1?0:this.idle+e;let d=+(this.speed<.1&&this.idle>(this.mode===`follow`?2.8:.6));this.rest+=(d-this.rest)*Math.min(1,e*(d?1.8:6));let f=this.rest,p=R(this.pos.x,this.pos.z);this.group.position.set(this.pos.x,p,this.pos.z),Ge(this.pos.x,this.pos.z,this.n).lerp(dt,.4).normalize(),this.qTilt.setFromUnitVectors(dt,this.n),this.qYaw.setFromAxisAngle(dt,this.yaw),this.group.quaternion.copy(this.qTilt).multiply(this.qYaw);let m=Math.min(1,this.speed/1.2)*(1-f);this.phase+=e*(3+this.speed*4.2);let h=Math.abs(Math.sin(this.phase))*.028*m,g=Math.sin(t*2.1)*.006,_=C.lerp(.4,.19,f)+h;this.body.position.set(0,_,0),this.body.scale.set(1,1+g,1);for(let e of this.legs){e.g.position.y=_-.06;let t=Math.sin(this.phase+e.phase)*.6*m;e.front?(e.g.rotation.x=t-1.35*f,e.g.scale.y=C.lerp(1,.82,f)):(e.g.rotation.x=t+.4*f,e.g.scale.y=C.lerp(1,.3,f))}this.happy=Math.max(0,this.happy-e*.25);let v=.1+.3*this.happy+.1*m,y=1.6+6*this.happy;this.tail[0].position.set(0,_+.05,-.33),this.tail.forEach((e,n)=>{let r=n===0?C.lerp(-.55,-.12,f):C.lerp(.13,.03,f);e.rotation.x=r+(n===0?-m*.25:0),e.rotation.y=f*.5+Math.sin(t*y-n*.7)*v*(1-f*.6)}),this.head.position.set(0,C.lerp(.53,.31,f)+h*.6,.31),this.group.updateMatrixWorld(),this.tmp.copy(n),this.group.worldToLocal(this.tmp).sub(this.head.position);let b=n.distanceTo(this.group.position)<14,x=Math.sin(t*.31)*.7+Math.sin(t*.13)*.3,S=-.1+Math.sin(t*.23)*.1;(b||a)&&(x=C.clamp(Math.atan2(this.tmp.x,this.tmp.z),-1.2,1.2),S=C.clamp(-Math.atan2(this.tmp.y,Math.hypot(this.tmp.x,this.tmp.z)),-.6,.45)),m>.3&&!a&&(x*=.3,S=.05);let ee=Math.min(1,e*4);this.headYaw+=(x-this.headYaw)*ee,this.headPitch+=(S-this.headPitch)*ee,this.head.rotation.set(this.headPitch,this.headYaw,a?Math.sin(t*.9)*.12:0),this.blink-=e;let te=this.blink<.12;this.blink<0&&(this.blink=2.5+Math.random()*3.5);for(let e of this.eyes)e.scale.y=te?.12:.8;this.earT-=e,this.earT<-.25&&(this.earT=1.5+Math.random()*4,this.earSide=Math.random()<.5?0:1),this.ears.forEach((e,t)=>{let n=t===0?-1:1,r=this.earT<0&&t===this.earSide?Math.sin(-this.earT/.25*Math.PI)*.5:0;e.rotation.set(-.12-r*.6,0,-n*(.28+r*.3))}),this.focus.copy(this.head.position).add(this.tmp.set(0,.05,.1)),this.group.localToWorld(this.focus)}dispose(){for(let e of this.geometries)e.dispose();this.material.dispose()}},pt={x:7.2,z:15.2,yaw:-1.68},mt=.23,ht=class{group=new u;focus=new g;grassMask={x:pt.x,z:pt.z,r:.75};sound=null;bird=new u;body=new u;head=new u;jaw=new u;crest;eyes=[];geometries=[];material=new j({vertexColors:!0});headYaw=0;headPitch=.1;yawGoal=0;pitchGoal=.1;lookT=6;bowT=-1;clatterT=0;idleClatter=25;blink=4;tmp=new g;constructor(e){this.group.name=`shoebill`;let t=B(.5,.56,.61),n=B(.6,.65,.69),r=B(.45,.5,.55),i=B(.3,.33,.37),a=B(.28,.29,.31),o=B(.74,.69,.52),s=B(.52,.5,.43),c=e=>{let t=it(e);for(let t of e)t.dispose();return this.geometries.push(t),new D(t,this.material)},l=e=>Math.sin(e.x*97+1.3)*Math.sin(e.z*71+e.y*43)>.45?s:1,u=W(.5,.66,.56,7),d=u.getAttribute(`position`);for(let e=0;e<d.count;e+=1){let t=Math.atan2(d.getZ(e),d.getX(e)),n=1+.13*Math.sin(t*3+1)+.06*Math.sin(t*5+2);d.setXYZ(e,d.getX(e)*n,d.getY(e),d.getZ(e)*n*.85)}u.deleteAttribute(`normal`);let f=c([V(H(u,z(0,-.05000000000000002,0)),B(.6,.62,.6),(e,t)=>t.y>.7?B(.42,.55,.3):e.y<.03?.8:1)]);this.group.add(f);let p=[];for(let e of[-1,1]){let t=e*.07;for(let e of[-.4,0,.4])p.push(V(H(U(.014,.012,.15),z(t+Math.sin(e)*.075,.006,.02+Math.cos(e)*.075),K(0,e,0)),a));p.push(V(H(U(.012,.012,.08),z(t,.006,-.02)),a)),p.push(V(H(W(.016,.019,.3,8),z(t,.15,.02)),a)),p.push(V(H(G(.024,8,6),z(t,.3,.02)),a)),p.push(V(H(W(.022,.018,.24,8),z(e*.066,.42,.03),K(.25,0,0)),a))}this.bird.add(c(p));let m=e=>e.y<.68||e.z<-.17?i:1;this.body.add(c([V(H(G(.2,20,16),z(0,.78,0),K(.35,0,0),z(.85,1.35,1)),t,e=>e.z>.1&&e.y>.7?n:1),V(H(G(.16,16,12),z(-.13,.8,-.06),K(.45,0,0),z(.35,1.2,1.25)),r,m),V(H(G(.16,16,12),z(.13,.8,-.06),K(.45,0,0),z(.35,1.2,1.25)),r,m),V(H(G(.1,12,8),z(0,.57,-.19),K(-.6,0,0),z(.8,.5,1.4)),i),V(H(W(.075,.1,.2,14),z(0,1.04,.07),K(.25,0,0)),n)])),this.head.add(c([V(H(G(.105,18,14),z(0,.07,.02),void 0,z(.92,1,1.08)),t),V(H(G(1,20,12),z(0,.035,.2),void 0,z(.068,.05,.14)),o,l),V(H(G(1,12,8),z(0,.075,.19),void 0,z(.022,.022,.13)),o,l),V(H(new pe(.018,.05,8),z(0,.01,.335),K(Math.PI+.4,0,0)),B(.4,.38,.33))])),this.jaw.add(c([V(H(G(1,16,10),z(0,-.02,.125),void 0,z(.06,.028,.13)),B(.78,.73,.57),l)])),this.jaw.position.set(0,.015,.07);let h=it([V(G(.019,12,8),B(.86,.87,.78)),V(H(G(.009,8,6),z(0,0,.014)),B(.04,.04,.04))]);this.geometries.push(h);for(let e of[-1,1]){let t=new D(h,this.material);t.position.set(e*.058,.09,.075),t.rotation.y=e*.55,this.eyes.push(t),this.head.add(t)}this.crest=c([V(H(new pe(.028,.09,8),z(0,.045,0)),t)]),this.crest.position.set(0,.15,-.06),this.head.add(this.jaw,this.crest),this.head.position.set(0,1.12,.1),this.head.rotation.order=`YXZ`,this.body.add(this.head),this.bird.add(this.body),this.bird.position.y=mt,this.group.add(this.bird);let{x:g,z:_,yaw:v}=pt,y=R(g,_);this.group.position.set(g,y,_),this.group.rotation.y=v,e.addStaticCylinder(z(g,y+.75,_),.55,1.5)}bow(){this.bowT=0}clatter(){this.bowT>=0||(this.clatterT=1,this.sound=`clatter`)}birdYaw=0;update(e,t,n,r,i){this.group.updateMatrixWorld(),this.tmp.copy(n),this.bird.worldToLocal(this.tmp).sub(this.head.position);let a=Math.hypot(n.x-this.group.position.x,n.z-this.group.position.z)<12,o=Math.atan2(this.tmp.x,this.tmp.z);this.lookT-=e,a||r?(this.yawGoal=C.clamp(o,-1.3,1.3),this.pitchGoal=C.clamp(-Math.atan2(this.tmp.y,Math.hypot(this.tmp.x,this.tmp.z)),-.4,.5)):this.lookT<0&&(this.lookT=8+Math.random()*10,this.yawGoal=(Math.random()-.5)*1.1,this.pitchGoal=.05+Math.random()*.2),r&&Math.abs(o)>.9&&(this.birdYaw+=C.clamp(o,-e*.6,e*.6)),this.bird.rotation.y=this.birdYaw;let s=Math.min(1,e*.7);this.headYaw+=(this.yawGoal-this.headYaw)*s,this.headPitch+=(this.pitchGoal-this.headPitch)*s;let c=0;if(this.bowT>=0){let t=this.bowT;this.bowT+=e;let n=this.bowT,r=e=>e*e*(3-2*e);c=n<1.4?r(n/1.4):n<2.7?1:n<4.5?1-r((n-2.7)/1.8):0,t<1.25&&n>=1.25&&(this.clatterT=1.2,this.sound=`clatter`),n>=4.5&&(this.bowT=-1)}else a&&!r&&(this.idleClatter-=e,this.idleClatter<=0&&(this.idleClatter=50+Math.random()*50,this.clatterT=1,this.sound=`clatter`));this.clatterT=Math.max(0,this.clatterT-e);let l=this.clatterT>0,u=.16*c;this.body.rotation.x=u,this.body.position.set(0,.5*(1-Math.cos(u)),-.5*Math.sin(u)),this.body.scale.y=1+Math.sin(t*1.4)*.006;let d=l&&c<.5?-.25:0;this.head.rotation.set(C.lerp(this.headPitch+d,1.15,c),C.lerp(this.headYaw,0,c),0),this.jaw.rotation.x=l&&Math.sin(t*75)>0?.22:.02,this.crest.rotation.set(-1.05+Math.sin(t*3.1)*.06*(.4+i)+c*.3,0,Math.sin(t*2.3)*.05*(.4+i)),this.blink-=e,this.blink<0&&(this.blink=4+Math.random()*6);for(let e of this.eyes)e.scale.y=this.blink<.3?.12:1;this.head.updateMatrixWorld(),this.focus.set(0,.06,.12),this.head.localToWorld(this.focus)}dispose(){for(let e of this.geometries)e.dispose();this.material.dispose()}},gt=new g(0,1,0),_t={x:11,z:17.5,r:3},vt=[[7.2,15.2,1.9],[8.6,12.4,1.4]],yt=class{group=new u;focus=new g;sound=null;body=new u;head=new u;trunk=[];legs=[];eyes=[];ears=[];tail;geometries=[];material=new j({vertexColors:!0});pos=new g(_t.x,0,_t.z);goal=new g(_t.x,0,_t.z);mode=`graze`;timer=5;yaw=-2.2;speed=0;phase=0;headYaw=0;headPitch=.5;greetT=0;blink=3;earT=1;earSide=0;wasNear=!1;squeakCool=0;tmp=new g;n=new g;qTilt=new k;qYaw=new k;constructor(){this.group.name=`tapir`;let e=B(.1,.1,.115),t=B(.9,.89,.86),n=B(.32,.32,.34),r=B(.2,.19,.2),i=e=>{let t=it(e);for(let t of e)t.dispose();this.geometries.push(t);let n=new D(t,this.material);return n.castShadow=!0,n},a=t=>t.z>.14+(t.y-.62)*.35||t.z<-.5&&t.y<.5?e:1;this.body.add(i([V(H(G(.4,28,20),z(0,.64,-.08),void 0,z(.88,.86,1.95)),t,a),V(H(G(.36,22,16),z(0,.7,-.5),void 0,z(1,.95,1)),t,a),V(H(G(.3,20,14),z(0,.64,.42),void 0,z(.95,1,1.1)),t,a),V(H(G(.23,16,12),z(0,.63,.7),void 0,z(.9,1,1.2)),e)])),this.head.add(i([V(H(G(.2,18,14),z(0,-.02,.2),void 0,z(.8,.95,1.5)),e),V(H(G(.12,14,10),z(0,-.08,.44),void 0,z(.85,.8,1.3)),e),V(H(G(.032,10,8),z(-.128,.03,.25),void 0,z(.5,1,1)),n),V(H(G(.032,10,8),z(.128,.03,.25),void 0,z(.5,1,1)),n)])),this.head.position.set(0,.66,.74),this.head.rotation.order=`YXZ`;let o=it([V(G(.02,10,8),B(.04,.03,.03)),V(H(G(.006,6,4),z(0,.008,.017)),B(1,1,1))]),s=V(H(G(.075,14,10),z(0,.07,0),void 0,z(.75,1.15,.3)),e,e=>Math.hypot(e.x/.056,(e.y-.07)/.086)>.78?t:1);this.geometries.push(o,s);for(let e of[-1,1]){let t=new D(o,this.material);t.position.set(e*.14,.03,.26),t.rotation.y=e*1;let n=new D(s,this.material);n.position.set(e*.1,.15,.1),n.castShadow=!0,this.eyes.push(t),this.ears.push(n),this.head.add(t,n)}let c=this.head;for(let t=0;t<3;t+=1){let n=.055-t*.01,a=[V(H(W(n-.01,n,.1,10),z(0,0,.05),K(Math.PI/2)),e)];t===2&&a.push(V(H(G(n-.004,10,8),z(0,0,.1)),r));let o=new u;o.add(i(a)),o.position.set(0,t===0?-.1:0,t===0?.58:.1),c.add(o),this.trunk.push(o),c=o}for(let[t,n,r,a,o]of[[-.17,.44,.4,0,!1],[.17,.44,.4,Math.PI,!1],[-.19,.46,-.55,Math.PI,!0],[.19,.46,-.55,0,!0]]){let s=new u;s.add(i([V(H(W(.075,.066,.36,10),z(0,-.2,0)),e),V(H(G(.08,12,8),z(0,-.4,.02),void 0,z(1,.5,1.2)),e),V(H(G(o?.13:.1,12,10),z(0,-.02,0),void 0,o?z(.85,1.4,1.1):z(.9,1.2,1)),e)])),s.position.set(t,n,r),this.legs.push({g:s,phase:a}),this.group.add(s)}this.tail=i([V(H(G(.045,10,8),z(0,0,-.03),void 0,z(1,1.2,1.4)),e)]),this.tail.position.set(0,.8,-.9),this.group.add(this.body,this.head,this.tail)}get available(){return this.speed<.3}greet(){this.greetT=1,this.sound=`squeak`,this.squeakCool=20}curl=0;pickGoal(){for(let e=0;e<12;e+=1){let e=Math.random()*Math.PI*2,t=Math.sqrt(Math.random())*_t.r,n=_t.x+Math.cos(e)*t,r=_t.z+Math.sin(e)*t;if(!(Math.hypot(n-this.pos.x,r-this.pos.z)<1.2)&&!vt.some(([e,t,i])=>Math.hypot(n-e,r-t)<i)){this.goal.set(n,0,r),this.mode=`walk`;return}}this.timer=3}update(e,t,n,r){let i=Math.hypot(n.x-this.pos.x,n.z-this.pos.z)<5.5;this.squeakCool=Math.max(0,this.squeakCool-e),i&&!this.wasNear&&this.squeakCool===0&&(this.sound=`squeak`,this.squeakCool=40),this.wasNear=i;let a=0,o=0;if(r)o=Math.atan2(n.x-this.pos.x,n.z-this.pos.z)-this.yaw,o=Math.atan2(Math.sin(o),Math.cos(o)),Math.abs(o)<.5&&(o=0);else if(!i){if(this.mode===`graze`)this.timer-=e,this.timer<=0&&this.pickGoal();else{let e=this.goal.x-this.pos.x,t=this.goal.z-this.pos.z,n=Math.hypot(e,t);n<.15?(this.mode=`graze`,this.timer=7+Math.random()*9):(a=Math.min(.5,.15+n*.4),o=Math.atan2(e,t)-this.yaw)}}o=Math.atan2(Math.sin(o),Math.cos(o));let s=C.clamp(o,-e*1.2,e*1.2);this.yaw+=s;let c=Math.abs(s)/Math.max(e,1e-4);a>0&&(a*=Math.max(0,Math.cos(o))**2),this.speed+=(a-this.speed)*Math.min(1,e*2.5),this.speed<.005&&a===0&&(this.speed=0),this.pos.x+=Math.sin(this.yaw)*this.speed*e,this.pos.z+=Math.cos(this.yaw)*this.speed*e,this.group.position.set(this.pos.x,R(this.pos.x,this.pos.z),this.pos.z),Ge(this.pos.x,this.pos.z,this.n).lerp(gt,.35).normalize(),this.qTilt.setFromUnitVectors(gt,this.n),this.qYaw.setFromAxisAngle(gt,this.yaw),this.group.quaternion.copy(this.qTilt).multiply(this.qYaw);let l=Math.min(1,this.speed/.4+c*.5);l>.02&&(this.phase+=e*(2.2+this.speed*7));let u=Math.abs(Math.sin(this.phase))*.018*l;this.body.position.y=u,this.body.scale.y=1+Math.sin(t*1.6)*.008;for(let e of this.legs)e.g.rotation.x=Math.sin(this.phase+e.phase)*.42*l;this.group.updateMatrixWorld(),this.tmp.copy(n),this.group.worldToLocal(this.tmp).sub(this.head.position);let d=Math.sin(t*.21)*.25,f=this.mode===`graze`?.55+Math.sin(t*.37)*.08:.12;(i||r)&&(d=C.clamp(Math.atan2(this.tmp.x,this.tmp.z),-.9,.9),f=C.clamp(-Math.atan2(this.tmp.y,Math.hypot(this.tmp.x,this.tmp.z)),-.5,.3));let p=Math.min(1,e*2.2);this.headYaw+=(d-this.headYaw)*p,this.headPitch+=(f-this.headPitch)*p,this.head.position.y=.66+u*.7,this.head.rotation.set(this.headPitch,this.headYaw,0),this.greetT=Math.max(0,this.greetT-e*.35),this.curl+=(+(this.greetT>.25)-this.curl)*Math.min(1,e*4);let m=this.mode===`graze`&&!i&&!r;this.trunk.forEach((e,n)=>{let r=Math.sin(t*(m?9:2.3)+n*.9)*(m?.1:.07);e.rotation.x=C.lerp(.42+n*.12+r,-.75,this.curl),e.rotation.y=Math.sin(t*1.7+n*1.3)*(m?.12:.05)}),this.blink-=e,this.blink<0&&(this.blink=2.5+Math.random()*4);for(let e of this.eyes)e.scale.y=this.blink<.14?.15:1;this.earT-=e,this.earT<-.3&&(this.earT=1.2+Math.random()*3.5,this.earSide=Math.random()<.5?0:1);let h=i||r?1:0;this.ears.forEach((e,n)=>{let r=n===0?-1:1,i=this.earT<0&&n===this.earSide?Math.sin(-this.earT/.3*Math.PI):0;e.rotation.set(-.25-i*.5+h*.1,r*(h*.4+Math.sin(t*.5+n)*.1),-r*(.35+i*.3))}),this.tail.rotation.y=Math.sin(t*2.6)*.25,this.head.updateMatrixWorld(),this.focus.set(0,.02,.35),this.head.localToWorld(this.focus)}dispose(){for(let e of this.geometries)e.dispose();this.material.dispose()}},bt=[[-9,15.5],[-5.6,10.2],[-2.6,7.6]],xt=(e,t)=>Math.atan2(5.5-e,30-t),St=class{group=new u;props;fox=new ft;tapir=new yt;shoebill;grassMask;reserved;focus=null;talking=null;onStar;onPersist;onAwaken;onSound;state={stars:[],fox:0,awake:!1,visits:{},sproutsLeft:4,roseSmeltFox:!1};spots=[];pendingFox=-1;pendingStar=!1;camPos=new g;fwd=new g;d=new g;constructor(e,t,n){this.group.name=`encounters`,this.props=new ut(e,t,n),this.shoebill=new ht(e),this.group.add(this.props.group,this.fox.group,this.tapir.group,this.shoebill.group);let[r,i]=bt[0];this.fox.place(r,i,xt(r,i));let a=this.props,o=(e,t)=>e.clone().add(new g(0,t,0));this.spots.push({target:`plane`,index:0,at:a.planeFocus,reach:5.2},{target:`hat`,index:0,at:a.hatFocus,reach:4.6},{target:`box`,index:0,at:a.boxFocus,reach:2.8},{target:`rose`,index:0,at:a.roseFocus,reach:3},{target:`sheep`,index:0,at:o(t.critter,.45),reach:3.2},{target:`guardian`,index:0,at:o(t.handL,.1),reach:4},{target:`fox`,index:0,at:this.fox.focus,reach:4,ok:()=>this.fox.available},{target:`tapir`,index:0,at:this.tapir.focus,reach:4.2,ok:()=>this.tapir.available},{target:`shoebill`,index:0,at:this.shoebill.focus,reach:4.2},...a.sprouts.map((e,t)=>({target:`sprout`,index:t,at:e.at,reach:2.8,ok:()=>e.state===`up`}))),this.grassMask=[...a.grassMask,this.shoebill.grassMask],this.reserved=[...a.reserved,...bt.map(([e,t])=>({x:e,z:t,r:2})),{x:_t.x,z:_t.z,r:_t.r+1.5},{x:pt.x,z:pt.z,r:1.6}]}get awake(){return this.state.awake}get progress(){return{stars:[...this.state.stars],fox:this.state.fox,awake:this.state.awake}}get stars(){return this.state.stars}restore(t){this.state.stars=e.filter(e=>t.stars.includes(e)),this.state.fox=Math.max(0,Math.min(3,Math.floor(t.fox)||0)),this.state.awake=!!t.awake;let[n,r]=bt[Math.min(this.state.fox,bt.length-1)];this.fox.place(n,r,xt(n,r)),this.state.fox>=3&&this.fox.follow(),this.state.awake&&this.onAwaken?.(!0)}update(e,t,n,r,i,a){this.props.update(e,t,a),n.getWorldPosition(this.camPos),n.getWorldDirection(this.fwd),this.fox.update(e,t,this.camPos,r,this.fwd,this.talking?.target===`fox`),this.tapir.update(e,t,this.camPos,this.talking?.target===`tapir`),this.shoebill.update(e,t,this.camPos,this.talking?.target===`shoebill`,a);for(let e of[this.tapir,this.shoebill])e.sound&&this.onSound?.(e.sound),e.sound=null;if(this.focus=null,!i||this.talking)return;let o=1/0;for(let e of this.spots){if(e.ok&&!e.ok())continue;let t=e.target===`fox`&&this.state.fox===0?6.5:e.reach;this.d.subVectors(e.at,this.camPos);let n=this.d.length();if(n>t||n<.001)continue;let r=this.d.dot(this.fwd)/n;if(r<(n<1.6?.5:.84))continue;let i=(1-r)*6+n*.08;i<o&&(o=i,this.focus=e)}}interact(e){let r=this.focus;if(!r||this.talking)return null;let i=this.state;i.sproutsLeft=this.props.sproutsStanding();let a=t(n[e],r.target,i);a.repeat&&(i.visits[r.target]=(i.visits[r.target]??0)+1);let o=a.effects;return o.pullSprout&&this.props.pullSprout(r.index),o.liftDome&&this.props.setDome(!0),o.fox!==void 0&&(this.pendingFox=o.fox),o.roseSmeltFox&&(i.roseSmeltFox=!0),r.target===`tapir`&&this.tapir.greet(),r.target===`shoebill`&&this.shoebill.clatter(),o.awaken&&(i.awake=!0,this.onAwaken?.(!1)),o.star&&!i.stars.includes(o.star)&&(i.stars.push(o.star),this.pendingStar=!0),this.onPersist?.(this.progress),this.talking={target:r.target,lines:a.lines},this.focus=null,a.lines}endDialogue(){let t=this.talking;if(t){if(this.talking=null,t.target===`rose`&&this.props.setDome(!1),t.target===`fox`&&this.fox.cheer(),t.target===`shoebill`&&this.shoebill.bow(),this.pendingFox>=0){if(this.state.fox=this.pendingFox,this.pendingFox=-1,this.state.fox>=3)this.fox.follow();else{let[e,t]=bt[this.state.fox];this.fox.goTo(e,t,xt(e,t))}}this.pendingStar&&(this.pendingStar=!1,this.onStar?.(this.state.stars.length,e.length)),this.onPersist?.(this.progress)}}dispose(){this.props.dispose(),this.fox.dispose(),this.tapir.dispose(),this.shoebill.dispose()}};function Ct(e,t,n){let r={value:0},i=new j({vertexColors:!0,side:2});return i.onBeforeCompile=t=>{t.uniforms.uTime=r,t.vertexShader=t.vertexShader.replace(`#include <common>`,`#include <common>
attribute vec4 aFlap; // phase, rate (rad/s), glide phase, 1 = never glides
uniform float uTime;
float fSide, fInner, fOuter, fA1, fA2, fPh, fFlapping;`).replace(`#include <beginnormal_vertex>`,`fSide = sign(position.x);
float fAx = abs(position.x);
fPh = uTime * aFlap.y + aFlap.x;
fFlapping = aFlap.w > 0.5 ? 1.0 : smoothstep(-0.25, 0.35, sin(uTime * 0.42 + aFlap.z));
fA1 = ${e.lift.toFixed(3)} + mix(${e.glide.toFixed(3)}, sin(fPh) * ${e.amp.toFixed(3)}, fFlapping);
fA2 = fA1 + mix(0.05, sin(fPh - 0.9) * ${e.tipAmp.toFixed(3)}, fFlapping);
fInner = min(fAx, ${e.elbow.toFixed(3)});
fOuter = max(fAx - ${e.elbow.toFixed(3)}, 0.0);
float fNa = fOuter > 0.0 ? fA2 : fA1;
vec3 objectNormal = fAx > 0.0 ? vec3(-fSide * sin(fNa), cos(fNa), 0.0) : vec3(0.0, 1.0, 0.0);
#ifdef USE_TANGENT
vec3 objectTangent = vec3(1.0, 0.0, 0.0);
#endif`).replace(`#include <begin_vertex>`,`vec3 transformed = vec3(position);
transformed.x = fSide * (fInner * cos(fA1) + fOuter * cos(fA2));
transformed.y += fInner * sin(fA1) + fOuter * sin(fA2) - sin(fPh) * ${e.bob.toFixed(3)} * fFlapping;`),t.fragmentShader=t.fragmentShader.replace(`#include <emissivemap_fragment>`,`#include <emissivemap_fragment>\ntotalEmissiveRadiance += diffuseColor.rgb * ${n.toFixed(3)};`)},i.customProgramCacheKey=()=>`flap-${t}`,{material:i,time:r}}function wt(e){let t=[],n=[],r=[];for(let i of e)for(let e=0;e<3;e+=1)t.push(...i.pts[e]),n.push(...i.cols[e]),r.push(0,1,0);let i=new w;return i.setAttribute(`position`,new M(t,3)),i.setAttribute(`color`,new M(n,3)),i.setAttribute(`normal`,new M(r,3)),i}function Tt(){let e=[.88,.89,.92],t=[.8,.82,.88],n=[.5,.54,.62],r=[.2,.22,.27],i=[],a=[0,0,.21],o=[-.045,.012,.06],s=[.045,.012,.06],c=[-.028,0,-.1],l=[.028,0,-.1],u=[0,0,-.19];i.push({pts:[a,s,o],cols:[e,e,e]}),i.push({pts:[o,s,l],cols:[e,e,e]},{pts:[o,l,c],cols:[e,e,e]}),i.push({pts:[c,l,u],cols:[e,e,e]},{pts:[c,u,[-.075,0,-.27]],cols:[e,e,t]},{pts:[l,[.075,0,-.27],u],cols:[e,t,e]});for(let a of[1,-1]){let o=[.045*a,.012,.085],s=[.045*a,.012,-.065],c=[.26*a,.012,.075],l=[.26*a,.012,-.075],u=[.5*a,.012,-.14];i.push({pts:[o,c,l],cols:[e,t,t]},{pts:[o,l,s],cols:[e,t,e]}),i.push({pts:[c,u,l],cols:[n,r,n]})}return wt(i)}function Et(){let e=[.18,.16,.13],t=[.98,.98,.94],n=[.3,.3,.3],r=[];r.push({pts:[[0,.01,.2],[.018,.01,-.2],[-.018,.01,-.2]],cols:[e,e,e]});for(let e of[1,-1]){let i=[.02*e,0,.1],a=[.02*e,0,-.02],o=[.02*e,0,-.16],s=[[.24*e,0,.24],[.44*e,0,.2],[.5*e,0,.04],[.32*e,0,-.05]],c=[[.36*e,0,-.08],[.32*e,0,-.27],[.13*e,0,-.33]],l=[t,n,n,t];for(let e=0;e<s.length-1;e+=1)r.push({pts:[i,s[e],s[e+1]],cols:[t,l[e],l[e+1]]});r.push({pts:[i,s[s.length-1],a],cols:[t,t,t]}),r.push({pts:[a,s[s.length-1],c[0]],cols:[t,t,t]});for(let e=0;e<c.length-1;e+=1)r.push({pts:[a,c[e],c[e+1]],cols:[t,t,t]});r.push({pts:[a,c[c.length-1],o],cols:[t,t,t]})}return wt(r)}var Dt=[{count:6,spread:5,scale:1.7,path:(e,t)=>{let n=e*.22,r=34+Math.sin(e*.07)*8;return t.set(Math.cos(n)*r,24+Math.sin(e*.11)*5,Math.sin(n)*r)}},{count:9,spread:8,scale:1.9,path:(e,t)=>{let n=-e*.12+1.7,r=95+Math.sin(e*.05+1)*20;return t.set(-20+Math.cos(n)*r,36+Math.sin(e*.09)*6,-40+Math.sin(n)*r)}},{count:12,spread:16,scale:2.6,path:(e,t)=>{let n=e*.075+4;return t.set(-60+Math.cos(n)*170,18+Math.sin(e*.06)*8,-260+Math.sin(n)*120)}},{count:2,spread:2.5,scale:1.5,path:(e,t)=>{let n=e*.085;return t.set(Math.sin(n)*48,13+Math.sin(n*3)*4,8+Math.sin(n*2)*26)}}],Ot=[[3,25],[9.5,20],[-4.5,17],[12,11],[-9,9],[2,12]],kt=new g(0,1,0),At=class{group=new u;birds=[];birdMesh;butterflyMesh;birdTime;butterflyTime;butterflySeeds=[];m=new r;p0=new g;p1=new g;p2=new g;f=new g;acc=new g;up=new g;x=new g;y=new g;z=new g;constructor(e=29){let t=I(e);for(let e of Dt)for(let n=0;n<e.count;n+=1){let n=t()*Math.PI*2,r=Math.sqrt(t())*e.spread;this.birds.push({flock:e,slot:new g(Math.cos(n)*r,(t()-.5)*e.spread*.35,Math.sin(n)*r),weave:t()*Math.PI*2,lag:(t()-.5)*1.2})}let n=Ct({amp:.62,tipAmp:.55,lift:.1,glide:.08,elbow:.26,bob:.025},`bird`,.12);this.birdTime=n.time;let r=Tt(),a=new Float32Array(this.birds.length*4);for(let e=0;e<this.birds.length;e+=1)a.set([t()*6.28,8.5+t()*2.5,t()*6.28,0],e*4);r.setAttribute(`aFlap`,new i(a,4)),this.birdMesh=new l(r,n.material,this.birds.length),this.birdMesh.frustumCulled=!1,this.birdMesh.name=`birds`;let o=Ct({amp:.95,tipAmp:0,lift:.45,glide:.3,elbow:1,bob:.06},`butterfly`,.3);this.butterflyTime=o.time;let s=Et(),c=Ot.length,u=new Float32Array(c*4);for(let e=0;e<c;e+=1)u.set([t()*6.28,31+t()*7,0,1],e*4),this.butterflySeeds.push(t()*100);s.setAttribute(`aFlap`,new i(u,4)),this.butterflyMesh=new l(s,o.material,c),this.butterflyMesh.frustumCulled=!1,this.butterflyMesh.name=`butterflies`;let d=new O;for(let e=0;e<c;e+=1)this.butterflyMesh.setColorAt(e,d.setRGB(1,e%3==1?.9:1,e%3==1?.45:1));this.group.add(this.birdMesh,this.butterflyMesh)}update(e){this.birdTime.value=e,this.butterflyTime.value=e;let t=.25;for(let n=0;n<this.birds.length;n+=1){let r=this.birds[n],i=e+r.lag;this.birdAt(r,i-t,this.p0),this.birdAt(r,i,this.p1),this.birdAt(r,i+t,this.p2),this.orient(this.p0,this.p1,this.p2,t,1,r.flock.scale),this.birdMesh.setMatrixAt(n,this.m)}this.birdMesh.instanceMatrix.needsUpdate=!0;for(let t=0;t<Ot.length;t+=1){let n=this.butterflySeeds[t],r=.06;this.butterflyAt(t,n,e-r,this.p0),this.butterflyAt(t,n,e,this.p1),this.butterflyAt(t,n,e+r,this.p2),this.orient(this.p0,this.p1,this.p2,r,.15,.12),this.butterflyMesh.setMatrixAt(t,this.m)}this.butterflyMesh.instanceMatrix.needsUpdate=!0}birdAt(e,t,n){e.flock.path(t,n);let r=t*.55+e.weave;return n.add(e.slot).add(this.acc.set(Math.sin(r)*1.3,Math.sin(r*1.3+1)*.6,Math.cos(r*.8)*1.3))}butterflyAt(e,t,n,r){let[i,a]=Ot[e],o=i+Math.sin(n*.43+t)*2.6+Math.sin(n*1.37+t*2)*.9+Math.sin(n*3.1+t)*.18,s=a+Math.cos(n*.31+t*1.7)*2.2+Math.sin(n*1.11+t*3)*.8+Math.cos(n*2.7+t)*.18,c=R(o,s)+1.08+Math.sin(n*.9+t)*.28+Math.sin(n*4.3+t*5)*.1;return r.set(o,c,s)}orient(e,t,n,r,i,a){this.f.subVectors(n,e),this.f.lengthSq()<1e-8&&this.f.set(0,0,1),this.f.normalize(),this.acc.copy(n).add(e).addScaledVector(t,-2).multiplyScalar(1/(r*r)),this.acc.addScaledVector(this.f,-this.acc.dot(this.f)),this.up.copy(kt).multiplyScalar(9.8).addScaledVector(this.acc,i).normalize(),this.x.crossVectors(this.up,this.f).normalize(),this.y.crossVectors(this.f,this.x),this.m.makeBasis(this.x.multiplyScalar(a),this.y.multiplyScalar(a),this.z.copy(this.f).multiplyScalar(a)),this.m.setPosition(t)}dispose(){this.birdMesh.geometry.dispose(),this.birdMesh.material.dispose(),this.butterflyMesh.geometry.dispose(),this.butterflyMesh.material.dispose()}},jt=[{kind:`blade`,cell:.1,fadeIn:[-1,0],fadeOut:[10,13],rows:5,width:.05,height:1,rootDark:.66},{kind:`tuft`,cell:.3,fadeIn:[10,13],fadeOut:[34,40],rows:3,width:.55,height:1,rootDark:.7},{kind:`tuft`,cell:.72,fadeIn:[34,40],fadeOut:[100,118],rows:2,width:1.1,height:1.08,rootDark:.8},{kind:`flower`,cell:.42,fadeIn:[-1,0],fadeOut:[16,22],rows:1,width:.045,height:1,rootDark:1},{kind:`flower`,cell:.8,fadeIn:[16,22],fadeOut:[44,54],rows:1,width:.07,height:1,rootDark:1,far:!0}];function Mt(e){let t=[],n=[];for(let n=0;n<e;n+=1)t.push(-.5,n/e,0,.5,n/e,0);t.push(0,1,0);for(let t=0;t<e;t+=1){let r=t*2;t<e-1?n.push(r,r+1,r+2,r+1,r+3,r+2):n.push(r,r+1,r+2)}let r=new w;return r.setAttribute(`position`,new M(t,3)),r.setIndex(n),r}function Nt(e){let t=[],n=[];for(let n=0;n<=e;n+=1)t.push(-.5,n/e,0,.5,n/e,0);for(let t=0;t<e;t+=1){let e=t*2;n.push(e,e+1,e+2,e+1,e+3,e+2)}let r=new w;return r.setAttribute(`position`,new M(t,3)),r.setIndex(n),r}function Pt(){let e=[-.5,0,0,.5,0,0,-.5,1,0,.5,1,0,-.5,-.5,1,.5,-.5,1,-.5,.5,1,.5,.5,1],t=new w;return t.setAttribute(`position`,new M(e,3)),t.setIndex([0,1,2,1,3,2,4,5,6,5,7,6]),t}function Ft(e,t,n){let r=Math.ceil(n/e)+2,i=Math.max(0,t-e*2),a=n+e*2,o=[];for(let t=-r;t<=r;t+=1)for(let n=-r;n<=r;n+=1){let r=Math.hypot(n,t)*e;r>=i&&r<=a&&o.push(n,t)}return new Float32Array(o)}function It(){let e=document.createElement(`canvas`);e.width=512,e.height=512;let t=e.getContext(`2d`);if(!t)throw Error(`2D canvas unavailable`);let n=I(1337);for(let e=0;e<4;e+=1){let r=e%2*256,i=Math.floor(e/2)*256;t.save(),t.beginPath(),t.rect(r,i,256,256),t.clip();let a=(n()-.5)*.5,o=11+Math.floor(n()*5);for(let e=0;e<o;e+=1){let e=n()-.5,o=r+256*(.5+e*.46),s=i+256+3,c=256*(.5+n()*.46)*(1-Math.abs(e)*.5),l=a+e*1.25+(n()-.5)*.35,u=(n()-.5)*1.1+Math.sign(l)*.35,d=256*(.026+n()*.02),f=o+Math.sin(l)*c*.5,p=s-Math.cos(l)*c*.5,m=o+Math.sin(l+u)*c,h=s-Math.cos(l+u)*c*.96,g=[],_=[];for(let e=0;e<=18;e+=1){let t=e/18,n=(1-t)*(1-t)*o+2*(1-t)*t*f+t*t*m,r=(1-t)*(1-t)*s+2*(1-t)*t*p+t*t*h,i=2*(1-t)*(f-o)+2*t*(m-f),a=2*(1-t)*(p-s)+2*t*(h-p),c=Math.hypot(i,a)||1,l=d*(1-t)**.8*(.8+.2*Math.min(1,t*5))*.5;g.push([n-a/c*l,r+i/c*l]),_.push([n+a/c*l,r-i/c*l])}t.beginPath(),t.moveTo(g[0][0],g[0][1]);for(let[e,n]of g)t.lineTo(e,n);for(let e=_.length-1;e>=0;--e)t.lineTo(_[e][0],_[e][1]);t.closePath();let v=Math.round((.28+n()*.14)*255),y=Math.round((.82+n()*.18)*255),b=Math.floor(n()*255),x=t.createLinearGradient(o,s,m,h);x.addColorStop(0,`rgb(${v},${b},0)`),x.addColorStop(1,`rgb(${y},${b},0)`),t.fillStyle=x,t.fill()}t.restore()}let r=new N(e);return r.premultiplyAlpha=!0,r.generateMipmaps=!0,r.minFilter=ve,r.magFilter=d,r.wrapS=E,r.wrapT=E,r.colorSpace=``,r.needsUpdate=!0,r}var Lt=`
varying vec3 vGrassCol;
varying float vPress;
varying float vT;
varying float vSide;
varying vec3 vBladeN;
varying vec3 vBladeSide;
varying float vBack;
varying vec2 vTuftUv;
varying vec2 vFlowerUv;
varying float vPart;
varying float vKind;
uniform vec3 uSunDirG;
uniform float uRootDark;
`,Rt=`
attribute vec2 aGrid;
uniform vec2 uCamCell;
uniform float uCell;
uniform vec4 uFade;
uniform float uWidth;
uniform float uHeight;
uniform vec3 uCamPos;
uniform sampler2D uHeightTex;
uniform float uHeightExtent;
uniform sampler2D uTrample;
uniform float uTrampleExtent;
${Lt}
${Ve}
${We}
${He}
vec2 hash22(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * vec3(0.1031, 0.1030, 0.0973));
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.xx + p3.yz) * p3.zy);
}
vec3 gPos;
vec3 gNrm;
void grassPlace() {
  vec2 cell = uCamCell + aGrid;
  vec2 xz = (cell + hash22(cell)) * uCell;
  vec4 ht = texture2D(uHeightTex, xz / (2.0 * uHeightExtent) + 0.5);
  vec3 tn = normalize(vec3(ht.g, sqrt(max(1.0 - ht.g * ht.g - ht.b * ht.b, 0.01)), ht.b));
  float dist = length(xz - uCamPos.xz);
  float fade = smoothstep(uFade.x, uFade.y, dist) * (1.0 - smoothstep(uFade.z, uFade.w, dist));
  float rnd = hash12(cell * 1.37 + 5.1);
  float rnd2 = hash12(cell * 0.73 - 2.9);
  // Patchy lushness (tall drifts, shorter lawns) and half-metre clumps.
  float lush = vnoise(xz * 0.09) * 0.65 + vnoise(xz * 0.31 + 4.0) * 0.35;
  float clump = vnoise(xz * 1.7 + 11.0);
  float h = mix(0.28, 0.72, pow(rnd, 1.3)) * mix(0.55, 1.35, smoothstep(0.2, 0.8, lush)) * mix(0.72, 1.18, clump);
  h *= uHeight * ht.a * fade;
  float t = position.y;
  // Blades lean along a slowly turning field, so the meadow reads as combed brush strokes.
  float ang = (vnoise(xz * 0.21 + 7.0) - 0.5) * 4.0 + (rnd2 - 0.5) * 1.8;
  vec2 w = windAt(xz);
  // Where travellers walk the meadow is pressed down and lies their way; it springs back as the
  // print fades (see trample.ts). Pressed blades barely tremble.
  vec4 tr = texture2D(uTrample, xz / (2.0 * uTrampleExtent) + 0.5);
  float press = clamp(tr.r * 1.2, 0.0, 1.0);
  press *= press * (3.0 - 2.0 * press);
  // Gust fronts and their ripples roll across the meadow; on top of that every blade trembles at
  // its own rate and phase (livelier inside a gust), so neighbours never move in lockstep.
  float live = (0.25 + 0.75 * w.x) * (1.0 - 0.85 * press);
  float flick = sin(uTime * (4.6 + rnd * 2.8) + rnd2 * 6.2832) * live;
  float wob = sin(uTime * (3.1 + rnd2 * 2.2) + rnd * 6.2832) * live;
  float bend = 0.22 + rnd * 0.28 + w.x * 0.5 + w.y * 0.1 * (0.35 + w.x) + flick * 0.04;
  vec2 bdir = normalize(uWindDir * (0.5 + w.x * 0.9) + vec2(cos(ang), sin(ang)) * 0.55);
  bend = mix(bend, 1.72, press);
  if (dot(tr.gb, tr.gb) > 1e-4) {
    vec2 lay = mix(bdir, normalize(tr.gb), smoothstep(0.0, 0.45, press));
    if (dot(lay, lay) > 1e-6) bdir = normalize(lay);
  }
  vec3 bdir3 = vec3(bdir.x, 0.0, bdir.y);
  vec3 up = normalize(mix(vec3(0.0, 1.0, 0.0), tn, 0.35));
  vec3 base = vec3(xz.x, ht.r - 0.03, xz.y);
  vec3 p = base + up * h * t * (1.0 - 0.28 * bend * bend * t * t) + bdir3 * h * bend * t * t * 0.62;
  p.xz += vec2(-bdir.y, bdir.x) * wob * 0.05 * h * t * t;
  // Pressed flat: the whole blade sinks toward the ground.
  p.y = base.y + (p.y - base.y) * (1.0 - 0.45 * press);
  vT = t;
  vPress = press;
  vSide = 0.0;
  vBladeN = tn;
  vBladeSide = vec3(1.0, 0.0, 0.0);
  vBack = 0.0;
  vTuftUv = vec2(0.0);
  vFlowerUv = vec2(0.0);
  vPart = 0.0;
  vKind = 0.0;
#if defined(KIND_BLADE)
  // Leaf blade: widest just above the root, tapering smoothly to a fine curled point.
  float wd = uWidth * mix(0.7, 1.3, rnd2) * pow(1.0 - t, 0.75) * (0.78 + 0.22 * smoothstep(0.0, 0.2, t));
  float twist = (rnd - 0.5) * 1.4 + t * (rnd2 - 0.5) * 0.9;
  vec2 side = vec2(-bdir.y, bdir.x) * cos(twist) + bdir * sin(twist);
  p.xz += side * position.x * wd;
  vec3 side3 = vec3(side.x, 0.0, side.y);
  vec3 tang = normalize(up * (1.0 - 0.84 * bend * bend * t * t) + bdir3 * bend * t * 1.24);
  vBladeN = normalize(cross(side3, tang));
  vBladeSide = side3;
  vSide = position.x * 2.0;
  // Sun shining through the blade toward the eye.
  vBack = pow(max(dot(normalize(p - uCamPos), uSunDirG), 0.0), 3.0) * t;
#elif defined(KIND_TUFT)
  // Painted tuft card turned to the camera about the vertical, randomly mirrored, one of four.
  vec2 toCam = normalize(uCamPos.xz - xz + 1e-4);
  float wd = uWidth * mix(0.8, 1.2, rnd2) * mix(0.85, 1.15, lush);
  p.xz += vec2(-toCam.y, toCam.x) * position.x * wd;
  p.y -= 0.02;
  float vi = floor(rnd2 * 3.999);
  vec2 off = vec2(mod(vi, 2.0), 1.0 - floor(vi / 2.0)) * 0.5;
  float ux = rnd > 0.5 ? position.x + 0.5 : 0.5 - position.x;
  vTuftUv = off + (vec2(ux, t) * 0.96 + 0.02) * 0.5;
#elif defined(KIND_FLOWER)
  // Single-species drifts of small flowers: dense cores fading out at their edges, and only a
  // sparse scatter of singles between them. Heads ride just above the grass.
  float patchN = vnoise(xz * 0.11 + 21.0) * 0.7 + vnoise(xz * 0.43 - 3.0) * 0.3;
  float drift = smoothstep(0.5, 0.74, patchN) * step(0.3, lush);
#ifdef FLOWER_FAR
  float present = step(rnd, drift * 0.8 - 0.12);
#else
  float present = step(rnd, mix(0.03, 0.72, drift));
#endif
  // Buttercup, daisy or lilac vetch, mostly one kind per drift.
  float sp = vnoise(xz * 0.05 + 40.0) + (hash12(cell * 4.7 + 1.3) - 0.5) * 0.3;
  vKind = sp < 0.42 ? 0.0 : (sp < 0.66 ? 1.0 : 2.0);
  float hh = h * mix(1.0, 1.25, rnd2) * present;
  if (position.z < 0.5) {
    p = base + up * hh * t * (1.0 - 0.2 * bend * bend * t * t) + bdir3 * hh * bend * t * t * 0.45;
    vec2 toCam = normalize(uCamPos.xz - xz + 1e-4);
    p.xz += vec2(-toCam.y, toCam.x) * position.x * 0.007 * present;
    vPart = 0.0;
  } else {
    vec3 head = base + up * hh * (1.0 - 0.2 * bend * bend) + bdir3 * hh * bend * 0.45;
    vec3 camR = vec3(viewMatrix[0][0], viewMatrix[1][0], viewMatrix[2][0]);
    vec3 camU = vec3(viewMatrix[0][1], viewMatrix[1][1], viewMatrix[2][1]);
    float r = uWidth * mix(0.75, 1.3, rnd2) * present * fade;
    p = head + (camR * position.x + camU * position.y) * r * 2.0;
    vFlowerUv = position.xy * 2.0;
    vPart = 1.0;
  }
#endif
  gPos = p;
  gNrm = tn;
  // Every layer shares the turf's colour field; roots darken up close and tips catch the sun.
  vec3 ground = meadowColor(xz);
  vec3 body = ground * mix(0.9, 1.1, rnd);
#if defined(KIND_BLADE)
  vec3 tip = ground * 1.3 + mix(vec3(0.05, 0.07, 0.0), vec3(0.1, 0.1, 0.01), rnd2);
  vec3 col = mix(body * uRootDark, body, smoothstep(0.0, 0.45, t));
  col = mix(col, tip, smoothstep(0.5, 1.0, t) * mix(0.55, 1.0, lush));
#else
  vec3 col = body;
#endif
  col = meadowShade(col, dot(tn, uSunDirG));
  // Wind waves: gusts comb the grass over and flash its paler side.
  col *= 1.0 + w.x * 0.24;
  col += vec3(0.04, 0.05, 0.0) * w.x * t;
  vGrassCol = col;
}
`,zt=`
#if defined(KIND_BLADE)
  {
    // Folded leaf: the half turned to the sun is lighter, with a faint midrib between.
    vec3 nb = normalize(vBladeN) * (gl_FrontFacing ? 1.0 : -1.0);
    vec3 nh = normalize(nb + normalize(vBladeSide) * sign(vSide) * 0.8);
    float fold = mix(0.8, 1.16, smoothstep(-0.3, 0.5, dot(nh, uSunDirG)));
    fold *= 1.0 - 0.14 * (1.0 - smoothstep(0.0, 0.16, abs(vSide)));
    diffuseColor.rgb = vGrassCol * fold + vec3(0.1, 0.13, 0.0) * vBack;
  }
#elif defined(KIND_TUFT)
  {
    vec4 tx = texture2D(uTuft, vTuftUv);
    float a = tx.a;
    // Coverage thins out in the lower mips; restore it so distant tufts stay full.
    vec2 dx = dFdx(vTuftUv * 512.0);
    vec2 dy = dFdy(vTuftUv * 512.0);
    a *= 1.0 + max(0.0, 0.5 * log2(max(max(dot(dx, dx), dot(dy, dy)), 1e-8))) * 0.3;
  #ifdef GRASS_A2C
    a = clamp((a - 0.5) / max(fwidth(a), 1e-4) + 0.5, 0.0, 1.0);
    if (a < 0.02) discard;
  #else
    if (a < 0.5) discard;
    a = 1.0;
  #endif
    float shade = tx.r / max(tx.a, 1e-3);
    float tint = tx.g / max(tx.a, 1e-3);
    vec3 col = vGrassCol * mix(uRootDark, 1.24, shade) * mix(0.92, 1.08, tint);
    col += vec3(0.045, 0.06, 0.0) * smoothstep(0.65, 1.0, shade);
    diffuseColor = vec4(col, a);
  }
#elif defined(KIND_FLOWER)
  if (vPart > 0.5) {
    float r = length(vFlowerUv);
    float ang = atan(vFlowerUv.y, vFlowerUv.x);
    float petals = vKind > 0.5 && vKind < 1.5 ? 8.0 : 5.0;
    float edge = vKind > 1.5 ? mix(0.72, 1.0, pow(abs(cos(ang * petals * 0.5)), 0.5)) : mix(0.55, 1.0, pow(abs(cos(ang * petals * 0.5)), 0.7));
    float aa = fwidth(r) * 1.2;
    float a = 1.0 - smoothstep(edge - aa, edge + aa, r);
  #ifdef GRASS_A2C
    if (a < 0.02) discard;
  #else
    if (a < 0.5) discard;
    a = 1.0;
  #endif
    vec3 petal = vKind > 1.5 ? vec3(0.6, 0.36, 0.86) : (vKind > 0.5 ? vec3(0.95, 0.94, 0.88) : vec3(1.0, 0.74, 0.07));
    vec3 eye = vKind > 1.5 ? vec3(0.95, 0.82, 0.5) : (vKind > 0.5 ? vec3(1.0, 0.72, 0.06) : vec3(0.88, 0.52, 0.03));
    vec3 col = mix(eye, petal, smoothstep(0.24, 0.34, r));
    col *= mix(0.82, 1.0, smoothstep(0.2, 0.8, r / edge));
    diffuseColor = vec4(col, a);
  } else {
    diffuseColor.rgb = vGrassCol * 0.85;
  }
#endif
  // Flattened grass shows the paler, sunlit side of its blades, so a trodden path reads from afar.
  diffuseColor.rgb *= mix(vec3(1.0), vec3(1.08, 1.07, 0.9), vPress * 0.75);
`,Bt=class{terrain;trample;group=new u;meshes=[];tuftTexture=It();alphaToCoverage;constructor(e,t,n=!1,r={uTrample:{value:null},uTrampleExtent:{value:64}}){this.terrain=e,this.trample=r,this.group.name=`grass`,this.alphaToCoverage=n,this.build(t)}setDensity(e,t=this.alphaToCoverage){for(let e of this.meshes)e.mesh.geometry.dispose(),e.mesh.material.dispose(),this.group.remove(e.mesh);this.meshes.length=0,this.alphaToCoverage=t,this.build(e)}build(e){let t=1/Math.sqrt(Math.max(.2,e));for(let e of jt){let n={...e,cell:e.cell*t,width:e.kind===`flower`?e.width:e.width*Math.sqrt(t)},r=n.kind===`blade`?Mt(n.rows):n.kind===`tuft`?Nt(n.rows):Pt(),a=new te;a.index=r.index,a.setAttribute(`position`,r.getAttribute(`position`));let o=Ft(n.cell,Math.max(0,n.fadeIn[0]),n.fadeOut[1]);a.setAttribute(`aGrid`,new i(o,2)),a.instanceCount=o.length/2;let s={...this.terrain.uniforms,...this.trample,uCamCell:{value:new m},uCell:{value:n.cell},uFade:{value:new y(n.fadeIn[0],n.fadeIn[1],n.fadeOut[0],n.fadeOut[1])},uWidth:{value:n.width},uHeight:{value:n.height},uRootDark:{value:n.rootDark},uCamPos:{value:new g},uHeightTex:{value:this.terrain.heightTexture},uHeightExtent:{value:Ke.extent},uSunDirG:{value:F.sunDir.clone()},uTuft:{value:this.tuftTexture}},c=this.alphaToCoverage&&n.kind!==`blade`,l=new j({color:16777215,side:2});l.defines={[`KIND_${n.kind.toUpperCase()}`]:``,...c?{GRASS_A2C:``}:{},...n.far?{FLOWER_FAR:``}:{}},l.alphaToCoverage=c,c&&(l.blending=5,l.blendEquation=100,l.blendSrc=201,l.blendDst=200,l.blendSrcAlpha=201,l.blendDstAlpha=201),l.onBeforeCompile=e=>{Object.assign(e.uniforms,s),e.vertexShader=e.vertexShader.replace(`#include <common>`,`#include <common>\n${Rt}`).replace(`#include <beginnormal_vertex>`,`grassPlace();
vec3 objectNormal = gNrm;`).replace(`#include <begin_vertex>`,`vec3 transformed = gPos;`),e.fragmentShader=e.fragmentShader.replace(`#include <common>`,`#include <common>\n${Lt}\nuniform sampler2D uTuft;`).replace(`#include <color_fragment>`,zt).replace(`#include <normal_fragment_begin>`,Ae.normal_fragment_begin.replace(`normal *= faceDirection;`,``))},l.customProgramCacheKey=()=>`grass-v4-${n.kind}${n.far?`-far`:``}${c?`-a2c`:``}`;let u=new D(a,l);u.frustumCulled=!1,u.receiveShadow=!0,u.castShadow=!1,u.name=`grass-${n.kind}-${this.meshes.length}`,this.group.add(u),this.meshes.push({mesh:u,spec:n,uniforms:s})}}setSunDir(e){for(let t of this.meshes)t.uniforms.uSunDirG.value.copy(e)}update(e){let t=e.position;for(let e of this.meshes)e.uniforms.uCamCell.value.set(Math.floor(t.x/e.spec.cell),Math.floor(t.z/e.spec.cell)),e.uniforms.uCamPos.value.copy(t)}get instanceCount(){return this.meshes.reduce((e,t)=>e+t.mesh.geometry.instanceCount,0)}},Vt=new Ce(-1,1,1,-1,0,1),Ht=new class extends w{constructor(){super(),this.setAttribute(`position`,new M([-1,3,0,-1,-1,0,3,-1,0],3)),this.setAttribute(`uv`,new M([0,2,0,0,2,0],2))}},Ut=class{constructor(e){this._mesh=new D(Ht,e)}dispose(){this._mesh.geometry.dispose()}render(e){e.render(this._mesh,Vt)}get material(){return this._mesh.material}set material(e){this._mesh.material=e}},Wt=`
out vec2 vUv;
void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }
`,Gt=`
precision highp float;
in vec2 vUv;
uniform float uZ;
layout(location = 0) out vec4 outColor;
vec3 hash33(vec3 p) {
  p = fract(p * vec3(0.1031, 0.1030, 0.0973));
  p += dot(p, p.yxz + 33.33);
  return fract((p.xxy + p.yxx) * p.zyx);
}
// Worley with a periodic lattice (period in cells); returns 1 at feature points (billowy).
float worley(vec3 p, float period) {
  vec3 id = floor(p);
  vec3 f = fract(p);
  float d = 1.0;
  for (int x = -1; x <= 1; x++)
  for (int y = -1; y <= 1; y++)
  for (int z = -1; z <= 1; z++) {
    vec3 o = vec3(x, y, z);
    vec3 cell = mod(id + o, period);
    vec3 r = o + hash33(cell) - f;
    d = min(d, dot(r, r));
  }
  return 1.0 - sqrt(d);
}
float worleyDome(vec3 p, float period) {
  vec3 id = floor(p);
  vec3 f = fract(p);
  float d = 1.0;
  for (int x = -1; x <= 1; x++)
  for (int y = -1; y <= 1; y++)
  for (int z = -1; z <= 1; z++) {
    vec3 o = vec3(x, y, z);
    vec3 cell = mod(id + o, period);
    vec3 r = o + hash33(cell) - f;
    d = min(d, dot(r, r));
  }
  return 1.0 - clamp(d * 1.25, 0.0, 1.0);
}
vec3 grad(vec3 cell) { return normalize(hash33(cell) * 2.0 - 1.0); }
float perlin(vec3 p, float period) {
  vec3 i = floor(p);
  vec3 f = fract(p);
  vec3 u = f * f * f * (f * (f * 6.0 - 15.0) + 10.0);
  float n000 = dot(grad(mod(i + vec3(0, 0, 0), period)), f - vec3(0, 0, 0));
  float n100 = dot(grad(mod(i + vec3(1, 0, 0), period)), f - vec3(1, 0, 0));
  float n010 = dot(grad(mod(i + vec3(0, 1, 0), period)), f - vec3(0, 1, 0));
  float n110 = dot(grad(mod(i + vec3(1, 1, 0), period)), f - vec3(1, 1, 0));
  float n001 = dot(grad(mod(i + vec3(0, 0, 1), period)), f - vec3(0, 0, 1));
  float n101 = dot(grad(mod(i + vec3(1, 0, 1), period)), f - vec3(1, 0, 1));
  float n011 = dot(grad(mod(i + vec3(0, 1, 1), period)), f - vec3(0, 1, 1));
  float n111 = dot(grad(mod(i + vec3(1, 1, 1), period)), f - vec3(1, 1, 1));
  return mix(mix(mix(n000, n100, u.x), mix(n010, n110, u.x), u.y), mix(mix(n001, n101, u.x), mix(n011, n111, u.x), u.y), u.z);
}
float perlinFbm(vec3 p, float period, int octaves) {
  float s = 0.0, a = 0.5, n = 0.0;
  for (int i = 0; i < 6; i++) {
    if (i >= octaves) break;
    s += perlin(p, period) * a;
    n += a;
    p *= 2.0;
    period *= 2.0;
    a *= 0.5;
  }
  return s / n;
}
float worleyFbm(vec3 p, float period) {
  return worley(p, period) * 0.625 + worley(p * 2.0, period * 2.0) * 0.25 + worley(p * 4.0, period * 4.0) * 0.125;
}
float remap(float v, float a, float b, float c, float d) { return c + (v - a) / (b - a) * (d - c); }
`,Kt=`${Gt}
void main() {
  vec3 p = vec3(vUv, uZ);
  float pf = perlinFbm(p * 4.0, 4.0, 5) * 0.5 + 0.5;
  float wf = worleyFbm(p * 4.0, 4.0);
  float pw = clamp(remap(pf, wf - 1.0, 1.0, 0.0, 1.0), 0.0, 1.0);
  float big = worleyDome(p * 4.0, 4.0);
  float mid = worleyDome(p * 8.0, 8.0) * 0.68 + worleyDome(p * 16.0, 16.0) * 0.32;
  float low = perlinFbm(p * 2.0 + 17.0, 2.0, 3) * 0.5 + 0.5;
  outColor = vec4(pw, big, mid, low);
}
`,qt=`${Gt}
void main() {
  vec3 p = vec3(vUv, uZ);
  float w = worleyDome(p * 4.0, 4.0) * 0.62 + worleyDome(p * 8.0, 8.0) * 0.38;
  outColor = vec4(w, 0.0, 0.0, 1.0);
}
`;function Jt(e,t,n,r){let i=new c(t,t,t,{format:r,type:we,depthBuffer:!1}),a=i.texture;a.wrapS=a.wrapT=a.wrapR=de,a.minFilter=d,a.magFilter=d,a.generateMipmaps=!1;let o=new ge({glslVersion:s,vertexShader:Wt,fragmentShader:n,uniforms:{uZ:{value:0}},depthTest:!1,depthWrite:!1}),l=new Ut(o),u=e.getRenderTarget();for(let n=0;n<t;n+=1)o.uniforms.uZ.value=(n+.5)/t,e.setRenderTarget(i,n),l.render(e);return e.setRenderTarget(u),l.dispose(),o.dispose(),a}function Yt(e){return{shape:Jt(e,128,Kt,S),detail:Jt(e,64,qt,he)}}var Xt=`
out vec2 vUv;
void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }
`,Zt=`
uniform mat4 uInvProj;
uniform mat4 uCamWorld;
uniform vec3 uCamPos;
uniform float uNear;
uniform float uFar;
vec3 rayDir(vec2 uv) {
  vec4 v = uInvProj * vec4(uv * 2.0 - 1.0, 1.0, 1.0);
  return normalize((uCamWorld * vec4(v.xyz / v.w, 0.0)).xyz);
}
// Perspective depth-buffer value -> distance along the (normalised) ray.
float depthToDistance(float d, vec3 rd) {
  float z = (uNear * uFar) / (uFar - d * (uFar - uNear));
  vec3 fwd = normalize((uCamWorld * vec4(0.0, 0.0, -1.0, 0.0)).xyz);
  return z / max(dot(rd, fwd), 1e-4);
}
`,Qt=`
precision highp float;
precision highp sampler3D;
in vec2 vUv;
layout(location = 0) out vec4 outColor;
layout(location = 1) out vec4 outAux;
${Zt}
uniform sampler2D uWeather;
uniform sampler3D uShape;
uniform sampler3D uDetail;
uniform sampler3D uTowerSdf;
uniform vec3 uSdfMin;
uniform vec3 uSdfInvSize;
uniform sampler2D uDepth;
uniform vec2 uDepthSize;
uniform vec3 uSunDir;
uniform vec3 uSunLight;
uniform vec3 uAmbTop;
uniform vec3 uAmbBottom;
uniform vec3 uHaze;
uniform float uSeaBase;
uniform float uCeiling;
uniform float uInvSpan;
uniform float uSkipRadius;
uniform vec2 uFlow;
uniform float uBoil;
uniform float uTime;
uniform float uFrame;
uniform int uSteps;
uniform int uLightSteps;
uniform float uStepScale;
${Ve}
${Ue}

// Opaque, crisp-edged anime cumulus; SIGMA_L sets how deep lobes shade each other.
const float SIGMA = 0.075;
const float SIGMA_L = 0.01;
// Largest outward displacement of tower / sea surfaces (keeps empty-space skipping conservative).
const float TOWER_PAD = 250.0;
const float SEA_PAD = 125.0;

float smin(float a, float b, float k) {
  float h = max(k - abs(a - b), 0.0) / k;
  return min(a, b) - h * h * k * 0.25;
}
float towerDist(vec3 p) {
  vec3 uvw = (p - uSdfMin) * uSdfInvSize;
  if (any(lessThan(uvw, vec3(0.0))) || any(greaterThan(uvw, vec3(1.0)))) return 20000.0;
  return textureLod(uTowerSdf, uvw, 0.0).r;
}
// Flowing swell on top of the static sea.
float seaSwell(vec2 xz) {
  return (vnoise((xz - uFlow * 0.8) * 0.0017) - 0.5) * 40.0 + (vnoise((xz - uFlow * 1.3) * 0.006 + 7.0) - 0.5) * 12.0;
}
// Thin wind-driven mist hugging the foot of the hill, just above the local sea top.
float mistDensity(vec3 p, float seaTop) {
  float r = length(p.xz);
  float band = smoothstep(seaTop - 30.0, seaTop + 6.0, p.y) * (1.0 - smoothstep(seaTop + 18.0, seaTop + 80.0, p.y));
  float ring = smoothstep(120.0, 240.0, r) * (1.0 - smoothstep(650.0, 1150.0, r));
  if (band * ring <= 0.0) return 0.0;
  vec2 q = p.xz - uFlow * 2.4;
  float n = vnoise(q * 0.011 + vec2(p.y * 0.03, 0.0)) * 0.62 + vnoise(q * 0.034 + vec2(3.0, p.y * 0.05)) * 0.38;
  return band * ring * smoothstep(0.42, 0.78, n) * 0.3;
}

// Signed distance (m, < 0 inside) to the displaced cloud surface: towers merged with the sea.
// Beyond the displacement pad it returns a conservative bound. tw = tower factor.
float surfaceSd(vec3 p, bool detail, out float tw, out float seaTop) {
  vec4 w = textureLod(uWeather, p.xz * uInvSpan + 0.5, 0.0);
  float hump = w.g;
  seaTop = w.r;
  float ds = p.y - (w.r + seaSwell(p.xz) * (1.0 - hump * 0.5));
  float dt = towerDist(p);
  tw = smoothstep(300.0, -150.0, dt);
  float sd = smin(dt, ds, 140.0);
  float pad = mix(mix(80.0, SEA_PAD, hump), TOWER_PAD, tw);
  if (sd > pad) return sd - pad;
  // Near the hill the sea is seen up close: a little lumpier.
  float nearF = (1.0 - tw) * (1.0 - smoothstep(700.0, 2600.0, length(p.xz)));
  // Rounded lobes: towers boil upward, the sea rolls downwind.
  vec3 flow = vec3(uFlow.x, 0.0, uFlow.y);
  vec3 rise = vec3(0.0, uBoil * 2.4, 0.0);
  vec3 sp = (p - flow * (1.0 - tw * 0.85) - rise * tw) * mix(1.0 / 1150.0, 1.0 / 1600.0, tw);
  vec4 sn = textureLod(uShape, sp, 0.0);
  // Rounded cauliflower lobes of several sizes and very little fine cotton (painted look).
  float a0 = mix(mix(18.0, 34.0, hump), 90.0, tw);
  // Upper parts of the towers bulge harder (cauliflower heads); the sum stays under TOWER_PAD.
  float topF = tw * smoothstep(seaTop + 500.0, seaTop + 2100.0, p.y);
  float a1 = mix(mix(68.0, 110.0, hump), 185.0 + 70.0 * topF, tw) * (1.0 - nearF * 0.3);
  float a2 = mix(mix(24.0, 36.0, hump), 70.0, tw) * (1.0 + nearF * 0.4);
  float disp = (sn.r - 0.5) * a0 + (sn.g - 0.55) * a1 + (sn.b - 0.55) * a2;
  if (detail) {
    vec3 dp = (p - flow * 1.6 - rise * 1.7 * tw - vec3(uTime * 0.9, -uTime * 0.5, 0.0)) * (1.0 / 240.0);
    disp += (textureLod(uDetail, dp, 0.0).r - 0.55) * mix(mix(5.0, 9.0, nearF), 8.0, tw);
  }
  return sd - disp;
}

// Cloud body density 0..1 with a crisp edge; the mist band is returned separately.
float cloudDensity(vec3 p, bool detail, out float tw, out float s, out float mist) {
  float seaTop;
  s = surfaceSd(p, detail, tw, seaTop);
  mist = tw > 0.5 ? 0.0 : mistDensity(p, seaTop);
  float soft = mix(5.0, 9.0, tw);
  return clamp(-s / soft, 0.0, 1.0) * smoothstep(uSeaBase, uSeaBase + 150.0, p.y);
}

float lightOpticalDepth(vec3 p) {
  float od = 0.0;
  float stepL = 18.0;
  vec3 q = p;
  float tw, seaTop;
  for (int j = 0; j < 8; j++) {
    if (j >= uLightSteps) break;
    q += uSunDir * stepL;
    // Occupancy box-filtered over the step: the cloud edge is crisp, but the light through it
    // must vary continuously or the terminator breaks into posterised steps.
    od += clamp(0.5 - surfaceSd(q, false, tw, seaTop) / stepL, 0.0, 1.0) * stepL;
    stepL *= 2.0;
  }
  return od;
}

// Painted cumulus: the colour of the cloud skin at surface point ps. Where the path to the sun
// leaves the cloud at once the skin is flat cream-white; a soft painted terminator follows where
// that path starts to cross cloud, so every lobe (and each lobe under an overhang) carries its own
// light and shade. Shade is flat sky blue, deepening where cloud overhead hides the sky.
vec3 shadeSkin(vec3 ps, float cosT) {
  float od = lightOpticalDepth(ps) * SIGMA_L;
  float sunVis = exp(-od);
  // Direct light plus a soft multiple-scattering share: gentle gradients across lit faces.
  float lit = smoothstep(0.16, 0.92, sunVis * 0.72 + exp(-od * 0.3) * 0.28);
  float odUp = 0.0;
  float stepU = 40.0;
  vec3 q = ps;
  float tw, seaTop;
  for (int j = 0; j < 3; j++) {
    q.y += stepU;
    odUp += clamp(0.5 - surfaceSd(q, false, tw, seaTop) / stepU, 0.0, 1.0) * stepU;
    stepU *= 2.5;
  }
  vec3 shade = mix(uAmbBottom, uAmbTop, exp(-odUp * 0.004));
  vec3 col = mix(shade, uSunLight, lit);
  // A breath of lavender where light turns to shade.
  col += vec3(0.03, 0.0, 0.05) * (lit * (1.0 - lit) * 4.0);
  // Silver lining: with the sun behind the cloud its thin sunlit edges glow.
  col += uSunLight * pow(max(cosT, 0.0), 8.0) * sunVis * 0.5;
  return col;
}

void main() {
  vec3 rd = rayDir(vUv);
  vec3 ro = uCamPos;
  // Farthest depth in this low-res texel's footprint: thin foreground (the ribbon, strings, grass
  // tips) must not stop the rays. The composite hides cloud that lies behind each full-res
  // pixel's own surface, so the clouds behind thin objects stay correct on both sides.
  vec2 fp = vec2(dFdx(vUv).x, dFdy(vUv).y) * uDepthSize;
  float depth = 0.0;
  for (int y = -1; y <= 1; y++)
  for (int x = -1; x <= 1; x++) {
    ivec2 dpx = ivec2(clamp(vUv * uDepthSize + vec2(x, y) * fp * 0.36, vec2(0.0), uDepthSize - 1.0));
    depth = max(depth, texelFetch(uDepth, dpx, 0).r);
  }
  float sceneDist = depth >= 0.99999 ? 1e9 : depthToDistance(depth, rd);
  float tEnter = 0.0;
  float tExit = 60000.0;
  if (abs(rd.y) > 1e-5) {
    float t0 = (uSeaBase - ro.y) / rd.y;
    float t1 = (uCeiling - ro.y) / rd.y;
    tEnter = max(0.0, min(t0, t1));
    tExit = min(tExit, max(t0, t1));
  }
  tExit = min(tExit, sceneDist);
  vec3 L = vec3(0.0);
  float T = 1.0;
  float distAcc = 0.0;
  float wAcc = 0.0;
  // Interleaved gradient noise, rotated each frame (temporal accumulation averages it out).
  float jitter = fract(52.9829189 * fract(dot(gl_FragCoord.xy + uFrame * vec2(47.0, 17.0), vec2(0.06711056, 0.00583715))));
  float cosT = dot(rd, uSunDir);
  vec3 mistCol = mix(uAmbTop, uSunLight, 0.62);
  vec3 skin = mistCol;
  bool wasIn = false;
  float tOut = tEnter;
  float t = tEnter;
  bool started = false;
  bool exhausted = true;
  for (int i = 0; i < 220; i++) {
    if (i >= uSteps) break;
    if (t >= tExit || T < 0.012) {
      exhausted = false;
      break;
    }
    vec3 p = ro + rd * t;
    // Empty-space skipping against the tower SDF and the sea's max-filtered top.
    float dTower = towerDist(p) - TOWER_PAD;
    float seaAbove = p.y - (textureLod(uWeather, p.xz * uInvSpan + 0.5, 0.0).b + SEA_PAD);
    if (dTower > 0.0 && seaAbove > 0.0) {
      float seaStep = min(uSkipRadius / max(length(rd.xz), 1e-3), rd.y < -1e-4 ? seaAbove / -rd.y : 1e9);
      t += max(min(dTower, seaStep), 10.0) * (started ? 1.0 : 0.6 + 0.4 * jitter);
      wasIn = false;
      tOut = t;
      continue;
    }
    float dt = clamp(t * 0.006, 7.0, 120.0) * uStepScale;
    if (!started) {
      started = true;
      t += dt * jitter;
      p = ro + rd * t;
    }
    float tw, s, mist;
    float dens = cloudDensity(p, true, tw, s, mist);
    float ext = max(dens, mist * 0.6);
    if (ext > 0.002) {
      vec3 S = mistCol;
      if (dens > 0.002) {
        // Entering cloud: find the skin between the last outside point and here, and paint it
        // once (stable under the per-frame jitter; reused until the ray leaves this cloud).
        if (!wasIn) {
          float a = tOut;
          float b = t;
          for (int k = 0; k < 5; k++) {
            float m = 0.5 * (a + b);
            float twm, stm;
            if (surfaceSd(ro + rd * m, true, twm, stm) > 0.0) a = m;
            else b = m;
          }
          skin = shadeSkin(ro + rd * b, cosT);
          wasIn = true;
        }
        S = mix(mistCol, skin, clamp(dens / max(ext, 1e-4), 0.0, 1.0));
      } else {
        wasIn = false;
        tOut = t;
      }
      float Tr = exp(-ext * SIGMA * dt);
      L += T * S * (1.0 - Tr);
      distAcc += t * T * (1.0 - Tr);
      wAcc += T * (1.0 - Tr);
      T *= Tr;
    } else if (s > dt) {
      // Outside the displaced surface: approach it faster.
      wasIn = false;
      t += min(s * 0.6, 600.0);
      tOut = t;
      continue;
    } else {
      wasIn = false;
      tOut = t;
    }
    t += dt;
  }
  // Rays that graze a lobe's thin fringe can spend the whole budget there and would show the sky
  // through the cloud behind (blue cracks along lobe outlines on low step counts). Finish them
  // with a few long, cheap steps.
  if (exhausted && T > 0.03) {
    float stride = max(clamp(t * 0.006, 7.0, 120.0) * uStepScale * 4.0, 160.0);
    for (int k = 0; k < 18; k++) {
      if (t >= tExit || T < 0.03) break;
      vec3 p = ro + rd * t;
      float dTower = towerDist(p) - TOWER_PAD;
      float seaAbove = p.y - (textureLod(uWeather, p.xz * uInvSpan + 0.5, 0.0).b + SEA_PAD);
      if (dTower > 0.0 && seaAbove > 0.0) {
        float seaStep = min(uSkipRadius / max(length(rd.xz), 1e-3), rd.y < -1e-4 ? seaAbove / -rd.y : 1e9);
        t += max(min(dTower, seaStep), stride);
        continue;
      }
      float tw, s, mist;
      float dens = cloudDensity(p, false, tw, s, mist);
      if (dens > 0.002) {
        vec3 S = shadeSkin(p, cosT);
        float Tr = exp(-dens * SIGMA * stride);
        L += T * S * (1.0 - Tr);
        distAcc += t * T * (1.0 - Tr);
        wAcc += T * (1.0 - Tr);
        T *= Tr;
      }
      t += s > stride ? max(s * 0.6, stride) : stride;
    }
  }
  // The cloud sea is endless: any sky ray below the horizon ends in cloud. Grazing rays that ran
  // out of steps or skimmed between far bumps are closed with the lit sea colour.
  if (rd.y < 0.0 && sceneDist > 1e8 && T > 0.0) {
    vec3 seaCol = wAcc > 0.05 ? L / wAcc : mix(uAmbTop, uSunLight, 0.8);
    float tEnd = exhausted ? t : max(t, 20000.0);
    L += T * seaCol;
    distAcc += tEnd * T;
    wAcc += T;
    T = 0.0;
  }
  float dist = wAcc > 1e-4 ? distAcc / wAcc : 40000.0;
  // Aerial perspective: low, distant cloud (the far sea) melts into the horizon haze while the
  // high tower faces stay crisp.
  float haze = 1.0 - exp(-dist * mix(1.0 / 11000.0, 1.0 / 24000.0, smoothstep(-0.02, 0.1, rd.y)));
  vec3 hazeCol = mix(uHaze, skyColor(normalize(vec3(rd.x, max(rd.y, 0.0) * 0.4 + 0.01, rd.z))), 0.7);
  L = mix(L, hazeCol * (1.0 - T), haze * 0.9);
  outColor = vec4(L, T);
  // Half-float target: keep the sky's 'infinite' distance representable (matches the composite).
  outAux = vec4(min(dist, 60000.0), min(sceneDist, 60000.0), 0.0, 1.0);
}
`,$t=`
precision highp float;
in vec2 vUv;
layout(location = 0) out vec4 outColor;
${Zt}
uniform sampler2D uCurrent;
uniform sampler2D uCurrentAux;
uniform sampler2D uHistory;
uniform mat4 uPrevViewProj;
uniform vec2 uTexel;
uniform float uBlend;
uniform float uReset;
void main() {
  vec4 cur = texture(uCurrent, vUv);
  float dist = texture(uCurrentAux, vUv).r;
  vec3 rd = rayDir(vUv);
  vec3 wp = uCamPos + rd * min(dist, 40000.0);
  vec4 pc = uPrevViewProj * vec4(wp, 1.0);
  vec2 prevUv = pc.xy / pc.w * 0.5 + 0.5;
  vec4 mn = cur;
  vec4 mx = cur;
  for (int y = -1; y <= 1; y++)
  for (int x = -1; x <= 1; x++) {
    if (x == 0 && y == 0) continue;
    vec4 s = texture(uCurrent, vUv + vec2(x, y) * uTexel);
    mn = min(mn, s);
    mx = max(mx, s);
  }
  vec4 hist = clamp(texture(uHistory, prevUv), mn, mx);
  bool valid = uReset < 0.5 && pc.w > 0.0 && all(greaterThan(prevUv, vec2(0.0))) && all(lessThan(prevUv, vec2(1.0)));
  outColor = valid ? mix(hist, cur, uBlend) : cur;
}
`,en=[[-900,-3900,1350,3150],[1e3,-4400,1200,2700],[2700,-5e3,1150,3350],[-2800,-3500,1150,2550],[-4300,-2100,950,1900],[3900,-3e3,950,2150],[-5300,-100,1250,2750],[-5100,2500,1050,2150],[5300,-500,1150,2650],[5700,2400,950,1850],[1600,5600,1200,2450],[-1800,5900,1300,2950],[4400,6200,950,1750],[-4700,6400,1050,2050],[-8e3,-3900,1250,2350],[7700,-4500,1250,2550],[-700,-9300,1650,3450],[3200,-9100,1350,2650]];function tn(e,t,n,r,i){let a=[];nn(e,a,t,n,r,i);let o=i>1500?2+Math.floor(e()*2):Math.floor(e()*2);for(let s=0;s<o;s+=1){let o=e()*Math.PI*2,s=r*(.65+e()*.45);nn(e,a,t+Math.cos(o)*s,n+Math.sin(o)*s,r*(.55+e()*.2),i*(.35+e()*.35))}return a}function nn(e,t,n,r,i,a){let o=F.clouds.seaTop,s=t.length;for(let a=0;a<7;a+=1){let s=a/7*Math.PI*2+e()*.8,c=i*(.45+e()*.45),l=i*(.45+e()*.25);t.push({x:n+Math.cos(s)*c,z:r+Math.sin(s)*c,y:o-l*.4+e()*l*.25,r:l})}let c=o+i*.2,l=i*.7,u=n,d=r,f=(e()-.5)*.3,p=(e()-.5)*.3,m=o+a;for(;c+l<m;){let n=3+Math.floor(e()*3);for(let r=0;r<n;r+=1){let n=e()*Math.PI*2,r=l*(.25+e()*.5);t.push({x:u+Math.cos(n)*r,z:d+Math.sin(n)*r,y:c+(e()-.3)*l*.4,r:l*(.62+e()*.3)})}c+=l*(.5+e()*.25),l*=.89+e()*.05,u+=f*l,d+=p*l}t.push({x:u,z:d,y:m-l*.62,r:l*.74});let h=5+Math.floor(e()*3);for(let n=0;n<h;n+=1){let r=n/h*Math.PI*2+e()*.5,i=l*(.58+e()*.22);t.push({x:u+Math.cos(r)*i,z:d+Math.sin(r)*i,y:m-l*(.9+e()*.45),r:l*(.5+e()*.18)})}let _=(n,r,a,s)=>{for(let c=n;c<r;c+=1){let n=t[c];if(n.r<a)continue;let r=n.y>o+i*.35,l=s===0&&r?3+Math.floor(e()*2):2+Math.floor(e()*2);for(let i=0;i<l;i+=1){let i=e()*Math.PI*2,a=(r?.2:-.1)+e()*1.15,o=new g(Math.cos(i)*Math.cos(a),Math.sin(a),Math.sin(i)*Math.cos(a)),c=n.r*(s===0?.36+e()*.18:.4+e()*.14),l=n.r-c*.22;t.push({x:n.x+o.x*l,y:n.y+o.y*l,z:n.z+o.z*l,r:c})}}},v=t.length;_(s,v,220,0),_(v,t.length,250,1)}function rn(e=7){let t=F.clouds,n=I(e),r=[...en];for(let e=0;e<400&&r.length<en.length+26;e+=1){let e=n()*Math.PI*2,t=2200+n()*8800,i=Math.cos(e)*t,a=Math.sin(e)*t,o=380+n()*420;r.some(([e,t,n])=>Math.hypot(e-i,t-a)<n+o+500)||r.push([i,a,o,450+n()*1100])}let i=r.map(([e,t,r,i])=>{let a=tn(n,e,t,r,i),o=a.reduce((e,t)=>e+t.x,0)/a.length,s=a.reduce((e,t)=>e+t.y,0)/a.length,c=a.reduce((e,t)=>e+t.z,0)/a.length;return{lobes:a,cx:o,cy:s,cz:c,bound:Math.max(...a.map(e=>Math.hypot(e.x-o,e.y-s,e.z-c)+e.r))}}),a=[];for(let e=0;e<110;e+=1){let e=n()*Math.PI*2,r=1300+n()**.7*11500,i=160+n()*460;a.push({x:Math.cos(e)*r,z:Math.sin(e)*r,y:t.seaTop-i*(.55+n()*.3),r:i,hump:1})}for(let e=0;e<16;e+=1){let r=e/16*Math.PI*2+n()*.3,i=210+n()*280,o=60+n()*80;a.push({x:Math.cos(r)*i,z:Math.sin(r)*i,y:t.seaTop-o*.6+10+n()*22,r:o,hump:.6})}return{towers:i,caps:a}}function an(e,t=512){let n=F.clouds,r=n.extent*2/t,i=new Float32Array(t*t),a=new Float32Array(t*t);for(let e=0;e<t;e+=1)for(let a=0;a<t;a+=1){let o=(a+.5)*r-n.extent,s=(e+.5)*r-n.extent,c=Math.hypot(o,s),l=n.seaTop+Ie(o/2600,s/2600,3,5)*55+Ie(o/700,s/700,2,9)*20;l-=(1-L(150,900,c))*22,i[e*t+a]=l}for(let o of e){let e=Math.max(0,Math.floor((o.x-o.r+n.extent)/r)),s=Math.min(t-1,Math.ceil((o.x+o.r+n.extent)/r)),c=Math.max(0,Math.floor((o.z-o.r+n.extent)/r)),l=Math.min(t-1,Math.ceil((o.z+o.r+n.extent)/r));for(let u=c;u<=l;u+=1)for(let c=e;c<=s;c+=1){let e=(c+.5)*r-n.extent,s=(u+.5)*r-n.extent,l=(e-o.x)**2+(s-o.z)**2;if(l>=o.r*o.r)continue;let d=o.y+Math.sqrt(o.r*o.r-l),f=u*t+c;d>i[f]&&(i[f]=d,a[f]=Math.max(a[f],o.hump*L(n.seaTop-20,n.seaTop+160,d)))}}let o=Math.ceil(520/r)+1,s=new Float32Array(t*t),c=new Float32Array(t*t);for(let e=0;e<t;e+=1)for(let n=0;n<t;n+=1){let r=-1/0;for(let a=-o;a<=o;a+=1)r=Math.max(r,i[e*t+Math.min(t-1,Math.max(0,n+a))]);s[e*t+n]=r}for(let e=0;e<t;e+=1)for(let n=0;n<t;n+=1){let r=-1/0;for(let i=-o;i<=o;i+=1)r=Math.max(r,s[Math.min(t-1,Math.max(0,e+i))*t+n]);c[e*t+n]=r}let l=new Uint16Array(t*t*4);for(let e=0;e<t*t;e+=1)l[e*4]=x.toHalfFloat(i[e]),l[e*4+1]=x.toHalfFloat(a[e]),l[e*4+2]=x.toHalfFloat(c[e]),l[e*4+3]=x.toHalfFloat(1);let u=new Te(l,t,t,S,f);return u.minFilter=d,u.magFilter=d,u.wrapS=u.wrapT=E,u.needsUpdate=!0,u}function on(e,t=new g(256,48,256)){let n=new g(-12e3,-760,-12e3),r=new g(24e3,4480,24e3),i=t.x,a=t.y,o=t.z,s=r.x/i,c=r.y/a,l=r.z/o,u=new Float32Array(i*a*o),p=Math.hypot(s*8,c*8,l*8)*.5;for(let t=0;t<o;t+=8)for(let r=0;r<a;r+=8)for(let d=0;d<i;d+=8){let f=n.x+(d+4)*s,m=n.y+(r+4)*c,h=n.z+(t+4)*l,g=2e4;for(let t of e)g=Math.min(g,Math.hypot(f-t.cx,m-t.cy,h-t.cz)-t.bound-p);g=Math.max(g,420);for(let e=t;e<Math.min(o,t+8);e+=1)for(let t=r;t<Math.min(a,r+8);t+=1)u.fill(g,(e*a+t)*i+d,(e*a+t)*i+Math.min(i,d+8))}for(let t of e)for(let e of t.lobes){let t=e.r+420,r=Math.max(0,Math.floor((e.x-t-n.x)/s)),d=Math.min(i-1,Math.ceil((e.x+t-n.x)/s)),f=Math.max(0,Math.floor((e.y-t-n.y)/c)),p=Math.min(a-1,Math.ceil((e.y+t-n.y)/c)),m=Math.max(0,Math.floor((e.z-t-n.z)/l)),h=Math.min(o-1,Math.ceil((e.z+t-n.z)/l));for(let t=m;t<=h;t+=1){let o=n.z+(t+.5)*l-e.z;for(let l=f;l<=p;l+=1){let f=n.y+(l+.5)*c-e.y,p=(t*a+l)*i;for(let t=r;t<=d;t+=1){let r=n.x+(t+.5)*s-e.x,i=Math.sqrt(r*r+f*f+o*o)-e.r;if(i>420)continue;let a=u[p+t],c=Math.max(90-Math.abs(i-a),0)/90;u[p+t]=Math.min(i,a)-c*c*90*.25}}}}let m=new Uint16Array(i*a*o);for(let e=0;e<m.length;e+=1)m[e]=x.toHalfFloat(u[e]);let h=new Ee(m,i,a,o);return h.format=he,h.type=f,h.minFilter=d,h.magFilter=d,h.wrapS=h.wrapT=h.wrapR=E,h.unpackAlignment=1,h.needsUpdate=!0,{texture:h,min:n,size:r}}var sn=class{renderer;preset;timeScale=3.4;noise;weather;sdf;march;resolve;quad=new Ut;current;history=[];ping=0;frame=0;reset=!0;flow=new m;boil=0;time=0;prevViewProj=new r;viewProj=new r;width=0;height=0;constructor(e,t){this.renderer=e,this.preset=t,this.noise=Yt(e);let n=rn();this.weather=an(n.caps,512),this.sdf=on(n.towers);let i=F.clouds,a={uInvProj:{value:new r},uCamWorld:{value:new r},uCamPos:{value:new g},uNear:{value:.1},uFar:{value:1e3}};this.march=new ge({glslVersion:s,vertexShader:Xt,fragmentShader:Qt,depthTest:!1,depthWrite:!1,uniforms:{...a,uWeather:{value:this.weather},uShape:{value:this.noise.shape},uDetail:{value:this.noise.detail},uTowerSdf:{value:this.sdf.texture},uSdfMin:{value:this.sdf.min},uSdfInvSize:{value:new g(1/this.sdf.size.x,1/this.sdf.size.y,1/this.sdf.size.z)},uDepth:{value:null},uDepthSize:{value:new m(1,1)},uSunDir:{value:F.sunDir.clone()},uSunLight:{value:new g(1.12,1.07,.97)},uAmbTop:{value:new g(.43,.53,.86)},uAmbBottom:{value:new g(.25,.32,.62)},uHaze:{value:new g(.5,.6,.9)},uSeaBase:{value:i.seaBase},uCeiling:{value:i.ceiling},uInvSpan:{value:1/(i.extent*2)},uSkipRadius:{value:520*.92},uFlow:{value:new m},uBoil:{value:0},uTime:{value:0},uFrame:{value:0},uSteps:{value:t.cloudSteps},uLightSteps:{value:t.lightSteps},uStepScale:{value:1}}}),this.resolve=new ge({glslVersion:s,vertexShader:Xt,fragmentShader:$t,depthTest:!1,depthWrite:!1,uniforms:{uInvProj:a.uInvProj,uCamWorld:a.uCamWorld,uCamPos:a.uCamPos,uNear:a.uNear,uFar:a.uFar,uCurrent:{value:null},uCurrentAux:{value:null},uHistory:{value:null},uPrevViewProj:{value:this.prevViewProj},uTexel:{value:new m},uBlend:{value:.14},uReset:{value:1}}})}get output(){return this.history[this.ping].texture}get aux(){return this.current.textures[1]}get size(){return new m(this.width,this.height)}setQuality(e){this.preset=e,this.march.uniforms.uSteps.value=e.cloudSteps,this.march.uniforms.uLightSteps.value=e.lightSteps,this.width=0}invalidate(){this.reset=!0}setSize(e,t){let n=Math.max(64,Math.round(e*this.preset.cloudScale)),r=Math.max(36,Math.round(t*this.preset.cloudScale));if(n===this.width&&r===this.height)return;this.width=n,this.height=r,this.current?.dispose();for(let e of this.history)e.dispose();let i={type:f,format:S,depthBuffer:!1,minFilter:d,magFilter:d};this.current=new p(n,r,{...i,count:2}),this.current.textures[1].minFilter=d,this.current.textures[1].magFilter=d,this.history=[new p(n,r,i),new p(n,r,i)],this.resolve.uniforms.uTexel.value.set(1/n,1/r),this.reset=!0}update(e,t,n){let r=e*this.timeScale;this.time+=r,this.boil+=r,this.flow.addScaledVector(t,F.clouds.drift*(.85+n*.3)*r)}render(e,t,n){let r=this.march.uniforms;e.updateMatrixWorld(),r.uInvProj.value.copy(e.projectionMatrixInverse),r.uCamWorld.value.copy(e.matrixWorld),r.uCamPos.value.setFromMatrixPosition(e.matrixWorld),r.uNear.value=e.near,r.uFar.value=e.far,r.uDepth.value=t,r.uDepthSize.value.copy(n),r.uFlow.value.copy(this.flow),r.uBoil.value=this.boil,r.uTime.value=this.time,r.uFrame.value=this.frame%64,this.frame+=1;let i=this.renderer.getRenderTarget();this.quad.material=this.march,this.renderer.setRenderTarget(this.current),this.quad.render(this.renderer),this.viewProj.multiplyMatrices(e.projectionMatrix,e.matrixWorldInverse);let a=this.resolve.uniforms,o=this.history[this.ping],s=this.history[1-this.ping];a.uCurrent.value=this.current.textures[0],a.uCurrentAux.value=this.current.textures[1],a.uHistory.value=o.texture,a.uReset.value=+!!this.reset,this.quad.material=this.resolve,this.renderer.setRenderTarget(s),this.quad.render(this.renderer),this.renderer.setRenderTarget(i),this.ping=1-this.ping,this.prevViewProj.copy(this.viewProj),this.reset=!1}dispose(){this.current?.dispose();for(let e of this.history)e.dispose();this.quad.dispose(),this.march.dispose(),this.resolve.dispose(),this.weather.dispose(),this.sdf.texture.dispose(),this.noise.shape.dispose(),this.noise.detail.dispose()}},cn=`
precision highp float;
in vec2 vUv;
layout(location = 0) out vec4 outColor;
${Zt}
uniform sampler2D uScene;
uniform sampler2D uDepth;
uniform sampler2D uClouds;
uniform sampler2D uCloudAux;
uniform vec2 uCloudSize;
uniform vec3 uSunDir;
uniform float uExposure;
uniform float uSaturation;
uniform float uFade;
${Ue}

// Khronos PBR Neutral: keeps authored hues, rolls highlights softly to white.
vec3 neutralTonemap(vec3 color) {
  const float startCompression = 0.8 - 0.04;
  const float desaturation = 0.15;
  float x = min(color.r, min(color.g, color.b));
  float offset = x < 0.08 ? x - 6.25 * x * x : 0.04;
  color -= offset;
  float peak = max(color.r, max(color.g, color.b));
  if (peak < startCompression) return color;
  const float d = 1.0 - startCompression;
  float newPeak = 1.0 - d * d / (peak + d - startCompression);
  color *= newPeak / peak;
  float g = 1.0 - 1.0 / (desaturation * (peak - newPeak) + 1.0);
  return mix(color, vec3(newPeak), g);
}
vec3 toSrgb(vec3 c) {
  c = clamp(c, 0.0, 1.0);
  return mix(c * 12.92, 1.055 * pow(c, vec3(1.0 / 2.4)) - 0.055, step(0.0031308, c));
}
float hash(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }

// Depth-aware bilinear upsample: only blend low-res cloud texels that saw the same surface.
// Also returns the texels' mean in-scattering distance for the occlusion test in main().
vec4 cloudsAt(vec2 uv, float sceneDist, out float cloudDist) {
  vec2 st = uv * uCloudSize - 0.5;
  vec2 i = floor(st);
  vec2 f = st - i;
  vec4 acc = vec4(0.0);
  float distAcc = 0.0;
  float wsum = 0.0;
  vec4 best = vec4(0.0, 0.0, 0.0, 1.0);
  float bestDist = 60000.0;
  float bestRel = 1e9;
  float ls = log2(max(sceneDist, 0.05));
  for (int y = 0; y < 2; y++)
  for (int x = 0; x < 2; x++) {
    vec2 c = (clamp(i + vec2(x, y), vec2(0.0), uCloudSize - 1.0) + 0.5) / uCloudSize;
    float bw = (x == 0 ? 1.0 - f.x : f.x) * (y == 0 ? 1.0 - f.y : f.y);
    vec2 aux = texture(uCloudAux, c).rg;
    float d = aux.g;
    float rel = abs(log2(max(d, 0.05)) - ls);
    vec4 s = texture(uClouds, c);
    float w = bw * exp(-rel * 3.0);
    acc += s * w;
    distAcc += aux.r * w;
    wsum += w;
    if (rel < bestRel) { bestRel = rel; best = s; bestDist = aux.r; }
  }
  if (wsum > 1e-4 && bestRel < 0.7) {
    cloudDist = distAcc / wsum;
    return acc / wsum;
  }
  // Silhouette pixels (e.g. sky right next to the ruin) may have no matching texel in the 2x2
  // footprint: take the closest-depth texel from a wider 4x4 neighbourhood instead.
  for (int y = -1; y < 3; y++)
  for (int x = -1; x < 3; x++) {
    vec2 c = (clamp(i + vec2(x, y), vec2(0.0), uCloudSize - 1.0) + 0.5) / uCloudSize;
    vec2 aux = texture(uCloudAux, c).rg;
    float rel = abs(log2(max(aux.g, 0.05)) - ls) + length(vec2(x, y) - f) * 0.05;
    if (rel < bestRel) { bestRel = rel; best = texture(uClouds, c); bestDist = aux.r; }
  }
  cloudDist = bestDist;
  return best;
}

// Cubic B-spline reconstruction of the low-res clouds from 4 bilinear taps, so crisp cloud edges
// stop following the texel grid. Only for pure-sky footprints (the bilinear aux taps would show any
// texel that saw geometry), so nothing bleeds across a silhouette.
bool cloudsSmooth(vec2 uv, out vec4 col) {
  vec2 st = uv * uCloudSize - 0.5;
  vec2 i = floor(st);
  vec2 f = st - i;
  vec2 f2 = f * f;
  vec2 f3 = f2 * f;
  vec2 w0 = (1.0 - 3.0 * f + 3.0 * f2 - f3) / 6.0;
  vec2 w1 = (4.0 - 6.0 * f2 + 3.0 * f3) / 6.0;
  vec2 w2 = (1.0 + 3.0 * f + 3.0 * f2 - 3.0 * f3) / 6.0;
  vec2 w3 = f3 / 6.0;
  vec2 g0 = w0 + w1;
  vec2 g1 = w2 + w3;
  vec2 p0 = (i - 0.5 + w1 / g0) / uCloudSize;
  vec2 p1 = (i + 1.5 + w3 / g1) / uCloudSize;
  vec2 p01 = vec2(p0.x, p1.y);
  vec2 p10 = vec2(p1.x, p0.y);
  float skyAll = min(min(texture(uCloudAux, p0).g, texture(uCloudAux, p10).g), min(texture(uCloudAux, p01).g, texture(uCloudAux, p1).g));
  if (skyAll < 59000.0) return false;
  col = g0.y * (g0.x * texture(uClouds, p0) + g1.x * texture(uClouds, p10)) + g1.y * (g0.x * texture(uClouds, p01) + g1.x * texture(uClouds, p1));
  return true;
}

void main() {
  vec3 rd = rayDir(vUv);
  float depth = texture(uDepth, vUv).r;
  bool sky = depth >= 0.99999;
  float sceneDist = sky ? 60000.0 : depthToDistance(depth, rd);
  // The scene target is cleared to transparent black, so MSAA resolves partly covered edge pixels
  // (grass against the sky) into premultiplied colour plus coverage alpha. The resolved depth is a
  // single sample, so such pixels are blended over the sky by coverage instead of being snapped to
  // either side, which used to leave dark dashes along every silhouette.
  vec4 sc = texture(uScene, vUv);
  float cov = clamp(sc.a, 0.0, 1.0);
  float cloudDist;
  vec4 cl = cloudsAt(vUv, sceneDist, cloudDist);
  // Low-res texels look past thin foreground; cloud that lies behind this pixel's surface is hidden.
  float keep = sky ? 1.0 : 1.0 - smoothstep(0.9, 1.15, cloudDist / max(sceneDist, 0.05));
  cl = vec4(cl.rgb * keep, mix(1.0, cl.a, keep));
  vec3 col;
  if (sky) {
    vec4 cs;
    if (cloudsSmooth(vUv, cs)) cl = cs;
    vec3 bg = skyColor(rd) * cl.a + cl.rgb;
    col = cov > 0.002 ? sc.rgb + bg * (1.0 - cov) : bg;
  } else {
    vec3 surf = (sc.rgb / max(cov, 1e-3)) * cl.a + cl.rgb;
    col = surf;
    if (cov < 0.998) {
      float bgDist;
      vec4 cb = cloudsAt(vUv, 60000.0, bgDist);
      col = mix(skyColor(rd) * cb.a + cb.rgb, surf, cov);
    }
  }
  col = neutralTonemap(col * uExposure);
  float l = dot(col, vec3(0.2126, 0.7152, 0.0722));
  col = max(mix(vec3(l), col, uSaturation), 0.0);
  vec2 q = vUv - 0.5;
  col *= 1.0 - dot(q, q) * 0.32;
  col *= uFade;
  vec3 srgb = toSrgb(col) + (hash(gl_FragCoord.xy) - 0.5) / 255.0;
  outColor = vec4(srgb, 1.0);
}
`,ln=class{gl;preset;clouds;exposure=1;saturation=1.08;fade=1;sceneTarget;composite;quad;drawSize=new m;floatTargets;get multisampled(){return this.floatTargets&&this.preset.msaa>0}constructor(e,t){this.gl=e,this.preset=t,this.floatTargets=e.extensions.has(`EXT_color_buffer_float`)||e.extensions.has(`EXT_color_buffer_half_float`),this.clouds=new sn(e,t),this.composite=new ge({glslVersion:s,vertexShader:Xt,fragmentShader:cn,depthTest:!1,depthWrite:!1,uniforms:{uInvProj:{value:new r},uCamWorld:{value:new r},uCamPos:{value:new g},uNear:{value:.1},uFar:{value:1e3},uScene:{value:null},uDepth:{value:null},uClouds:{value:null},uCloudAux:{value:null},uCloudSize:{value:new m(1,1)},uSunDir:{value:F.sunDir.clone()},uExposure:{value:1},uSaturation:{value:1},uFade:{value:1}}}),this.quad=new Ut(this.composite),this.resize()}setQuality(e){this.preset=e,this.clouds.setQuality(e),this.drawSize.set(0,0),this.resize()}resize(){let e=this.gl.getDrawingBufferSize(new m);if(e.equals(this.drawSize)&&this.sceneTarget)return;this.drawSize.copy(e),this.sceneTarget?.dispose();let t=new ee(e.x,e.y,v);this.sceneTarget=new p(e.x,e.y,{type:this.floatTargets?f:we,samples:this.floatTargets?this.preset.msaa:0,depthTexture:t,depthBuffer:!0}),this.clouds.setSize(e.x,e.y)}render(e,t){this.resize();let n=this.gl;n.setRenderTarget(this.sceneTarget),n.setClearAlpha(0),n.clear(),n.render(e,t),n.setClearAlpha(1),this.clouds.render(t,this.sceneTarget.depthTexture,this.drawSize);let r=this.composite.uniforms;r.uInvProj.value.copy(t.projectionMatrixInverse),r.uCamWorld.value.copy(t.matrixWorld),r.uCamPos.value.setFromMatrixPosition(t.matrixWorld),r.uNear.value=t.near,r.uFar.value=t.far,r.uScene.value=this.sceneTarget.texture,r.uDepth.value=this.sceneTarget.depthTexture,r.uClouds.value=this.clouds.output,r.uCloudAux.value=this.clouds.aux,r.uCloudSize.value.copy(this.clouds.size),r.uExposure.value=this.exposure,r.uSaturation.value=this.saturation,r.uFade.value=this.fade,n.setRenderTarget(null),this.quad.render(n)}dispose(){this.sceneTarget?.dispose(),this.clouds.dispose(),this.quad.dispose(),this.composite.dispose()}},un=class{yaw;pitch;feet=new g;velocity=new g;grounded=!0;onStep;onLand;body;collider;kcc;prev=new g;cur=new g;coyote=0;jumpBuffer=0;stride=0;bob=0;bobAmp=0;sprintBlend=0;airTime=0;move=new g;constructor(e,t,n,r){let i=F.player;this.yaw=n,this.pitch=r;let a=R(t.x,t.z)+i.halfHeight+i.radius+.05;this.body=e.world.createRigidBody(Me.RigidBodyDesc.kinematicPositionBased().setTranslation(t.x,a,t.z)),this.collider=e.world.createCollider(Me.ColliderDesc.capsule(i.halfHeight,i.radius).setFriction(0),this.body),this.kcc=e.world.createCharacterController(.02),this.kcc.setUp({x:0,y:1,z:0}),this.kcc.setMaxSlopeClimbAngle(52*Math.PI/180),this.kcc.setMinSlopeSlideAngle(58*Math.PI/180),this.kcc.enableAutostep(.4,.25,!0),this.kcc.enableSnapToGround(.45),this.kcc.setApplyImpulsesToDynamicBodies(!1),this.cur.set(t.x,a,t.z),this.prev.copy(this.cur),this.feet.set(t.x,a-i.halfHeight-i.radius,t.z)}teleport(e,t,n){let r=F.player,i=R(e.x,e.z)+r.halfHeight+r.radius+.05;this.body.setTranslation({x:e.x,y:i,z:e.z},!0),this.body.setNextKinematicTranslation({x:e.x,y:i,z:e.z}),this.cur.set(e.x,i,e.z),this.prev.copy(this.cur),this.velocity.set(0,0,0),this.yaw=t,this.pitch=n}look(e,t){let n=F.camera;this.yaw-=e,this.pitch=C.clamp(this.pitch-t,n.minPitch,n.maxPitch)}step(e,t){let n=F.player;this.prev.copy(this.cur);let r=Math.hypot(t.move.x,t.move.y)<.05,i=t.held(`sprint`)&&t.move.y>.2,a=i?n.sprintSpeed:n.walkSpeed,o=Math.sin(this.yaw),s=Math.cos(this.yaw),c=(-o*t.move.y+s*t.move.x)*a,l=(-s*t.move.y-o*t.move.x)*a,u=this.grounded?1:.35,d=1-Math.exp(-n.acceleration*u*e);this.velocity.x+=(c-this.velocity.x)*d,this.velocity.z+=(l-this.velocity.z)*d;let f=Math.hypot(this.cur.x,this.cur.z);if(f>n.softRadius){let t=Math.min(1,(f-n.softRadius)/(n.hardRadius-n.softRadius));this.velocity.x-=this.cur.x/f*t*14*e,this.velocity.z-=this.cur.z/f*t*14*e}r&&this.grounded&&Math.hypot(this.velocity.x,this.velocity.z)<.15&&(this.velocity.x=0,this.velocity.z=0),this.jumpBuffer=t.consume(`jump`)?.14:Math.max(0,this.jumpBuffer-e),this.coyote=this.grounded?.12:Math.max(0,this.coyote-e),this.jumpBuffer>0&&this.coyote>0&&(this.velocity.y=n.jumpSpeed,this.jumpBuffer=0,this.coyote=0,this.grounded=!1),this.velocity.y+=n.gravity*e,this.grounded&&this.velocity.y<0&&(this.velocity.y=-1.5),this.move.copy(this.velocity).multiplyScalar(e),this.kcc.computeColliderMovement(this.collider,this.move);let p=this.kcc.computedMovement(),m=this.grounded;this.grounded=this.kcc.computedGrounded();let h=r&&m&&this.grounded&&this.velocity.x===0&&this.velocity.z===0&&this.velocity.y<=0&&Math.abs(p.x)+Math.abs(p.y)+Math.abs(p.z)<.003,g=h?this.cur.x:this.cur.x+p.x,_=h?this.cur.z:this.cur.z+p.z,v=Math.hypot(g,_);v>n.hardRadius&&(g*=n.hardRadius/v,_*=n.hardRadius/v),this.cur.set(g,h?this.cur.y:this.cur.y+p.y,_);let y=R(g,_)+n.halfHeight+n.radius-.05;this.cur.y<y&&(this.cur.y=y,this.velocity.y=Math.max(0,this.velocity.y)),this.body.setNextKinematicTranslation(this.cur),this.grounded?(!m&&this.airTime>.25&&this.onLand?.(Math.min(1,this.airTime/1.2)),this.airTime=0,this.velocity.y<0&&(this.velocity.y=0)):this.airTime+=e;let b=Math.hypot(p.x,p.z)/e;if(this.grounded&&b>.4){let t=Math.floor(this.stride);this.stride+=b*e/(i?1.05:.78),Math.floor(this.stride)!==t&&this.onStep?.(i)}this.bobAmp+=((this.grounded?Math.min(1,b/n.sprintSpeed):0)-this.bobAmp)*(1-Math.exp(-8*e)),this.sprintBlend+=((i&&b>3?1:0)-this.sprintBlend)*(1-Math.exp(-4*e)),this.bob=this.stride}get horizontalSpeed(){return Math.hypot(this.velocity.x,this.velocity.z)}applyCamera(e,t,n){let r=F.player,i=new g().lerpVectors(this.prev,this.cur,t);if(this.feet.set(i.x,i.y-r.halfHeight-r.radius,i.z),e.position.set(i.x,this.feet.y+r.eyeHeight,i.z),!n){let t=this.bob*Math.PI;e.position.y+=Math.abs(Math.sin(t))*.05*this.bobAmp-.025*this.bobAmp;let n=Math.cos(t)*.025*this.bobAmp;e.position.x+=Math.cos(this.yaw)*n,e.position.z-=Math.sin(this.yaw)*n}e.rotation.set(this.pitch,this.yaw,0,`YXZ`);let a=F.camera.fov+(n?0:this.sprintBlend*5);Math.abs(e.fov-a)>.01&&(e.fov=a,e.updateProjectionMatrix())}},dn=.72,fn=.2,pn=160,mn=class{cols;rows;length;pos;prev;inv;acc;index;cons;rest;stiff;mass;constructor(e,t,n,r,i,a,o){this.cols=e,this.rows=t,this.length=o;let s=e*t;this.pos=new Float32Array(s*3),this.prev=new Float32Array(s*3),this.inv=new Float32Array(s),this.acc=new Float32Array(s*3),this.mass=new Float32Array(s);let c=o/(t-1);for(let s=0;s<t;s+=1){let l=s/(t-1),u=a(l);for(let t=0;t<e;t+=1){let a=s*e+t,d=t/(e-1)-.5,f=n.clone().addScaledVector(i,l*o).addScaledVector(r,d*u);this.pos.set([f.x,f.y,f.z],a*3),this.prev.set([f.x,f.y,f.z],a*3),this.mass[a]=fn*u*c/e,this.inv[a]=s===0?0:1/this.mass[a]}}let l=[],u=[],d=(e,t,n)=>{l.push(e,t),u.push(n)};for(let n=0;n<t;n+=1)for(let r=0;r<e;r+=1){let i=n*e+r;r+1<e&&d(i,i+1,1),n+1<t&&d(i,i+e,1),n+1<t&&r+1<e&&(d(i,i+e+1,.6),d(i+1,i+e,.6)),n+2<t&&d(i,i+e*2,.12)}this.cons=new Int32Array(l),this.stiff=new Float32Array(u),this.rest=new Float32Array(u.length);for(let e=0;e<this.rest.length;e+=1){let t=this.cons[e*2]*3,n=this.cons[e*2+1]*3;this.rest[e]=Math.hypot(this.pos[t]-this.pos[n],this.pos[t+1]-this.pos[n+1],this.pos[t+2]-this.pos[n+2])}let f=[];for(let n=0;n<t-1;n+=1)for(let t=0;t<e-1;t+=1){let r=n*e+t;f.push(r,r+e,r+1,r+1,r+e,r+e+1)}this.index=new Uint16Array(f)}step(e,t,n,r){let{pos:i,prev:a,inv:o,acc:s,index:c}=this,l=o.length;s.fill(0);for(let e=0;e<l;e+=1)s[e*3+1]=-9.8;let u=gn;for(let n=0;n<c.length;n+=3){let r=c[n]*3,l=c[n+1]*3,d=c[n+2]*3,f=i[l]-i[r],p=i[l+1]-i[r+1],m=i[l+2]-i[r+2],h=i[d]-i[r],g=i[d+1]-i[r+1],_=i[d+2]-i[r+2],v=p*_-m*g,y=m*h-f*_,b=f*g-p*h,x=Math.hypot(v,y,b);if(x<1e-9)continue;let S=x*.5;v/=x,y/=x,b/=x,hn.set((i[r]+i[l]+i[d])/3,(i[r+1]+i[l+1]+i[d+1])/3,(i[r+2]+i[l+2]+i[d+2])/3),t.velocityAt(hn,u);let ee=(i[r]-a[r]+i[l]-a[l]+i[d]-a[d])/(3*e),te=(i[r+1]-a[r+1]+i[l+1]-a[l+1]+i[d+1]-a[d+1])/(3*e),ne=(i[r+2]-a[r+2]+i[l+2]-a[l+2]+i[d+2]-a[d+2])/(3*e),C=u.x-ee,re=u.y-te,w=u.z-ne,T=C*v+re*y+w*b,ie=dn*S*T*Math.abs(T),ae=C-T*v,E=re-T*y,oe=w-T*b,D=dn*.06*S;for(let e of[r,l,d]){let t=o[e/3]/3;s[e]+=(ie*v+D*ae)*t,s[e+1]+=(ie*y+D*E)*t,s[e+2]+=(ie*b+D*oe)*t}}let d=e*e;for(let e=0;e<l;e+=1){if(o[e]===0)continue;let t=e*3,n=s[t],r=s[t+1],c=s[t+2],l=Math.hypot(n,r,c);if(l>pn){let e=pn/l;n*=e,r*=e,c*=e}for(let e=0;e<3;e+=1){let o=i[t+e],s=(o-a[t+e])*.992;a[t+e]=o,i[t+e]=o+s+(e===0?n:e===1?r:c)*d}}for(let e=0;e<r;e+=1)for(let e=0;e<this.rest.length;e+=1){let t=this.cons[e*2],n=this.cons[e*2+1],r=o[t],a=o[n],s=r+a;if(s===0)continue;let c=t*3,l=n*3,u=i[l]-i[c],d=i[l+1]-i[c+1],f=i[l+2]-i[c+2],p=Math.hypot(u,d,f)||1e-6,m=(p-this.rest[e])/(p*s)*this.stiff[e];i[c]+=u*m*r,i[c+1]+=d*m*r,i[c+2]+=f*m*r,i[l]-=u*m*a,i[l+1]-=d*m*a,i[l+2]-=f*m*a}_n(i,o,n)}},hn=new g,gn=new g;function _n(e,t,n){for(let r=0;r<t.length;r+=1){if(t[r]===0)continue;let i=r*3;for(let t of n){let n=vn.subVectors(t.b,t.a),r=n.lengthSq(),a=e[i],o=e[i+1],s=e[i+2],c=r>1e-9?((a-t.a.x)*n.x+(o-t.a.y)*n.y+(s-t.a.z)*n.z)/r:0;c=Math.max(0,Math.min(1,c));let l=t.a.x+n.x*c,u=t.a.y+n.y*c,d=t.a.z+n.z*c,f=a-l,p=o-u,m=s-d,h=Math.hypot(f,p,m);if(h<t.r&&h>1e-6){let n=t.r/h;e[i]=l+f*n,e[i+1]=u+p*n,e[i+2]=d+m*n}}let a=R(e[i],e[i+2])+.04;e[i+1]<a&&(e[i+1]=a)}}var vn=new g,yn=class{count;pos;prev;inv;rest;constructor(e,t,n,r,i){this.count=e,this.pos=new Float32Array(e*3),this.prev=new Float32Array(e*3),this.inv=new Float32Array(e).fill(1),this.rest=r/(e-1);for(let a=0;a<e;a+=1){let o=a/(e-1),s=n?t.clone().lerp(n,o).addScaledVector(i,Math.sin(o*Math.PI)*r*.3):t.clone().addScaledVector(i,o*r);this.pos.set([s.x,s.y,s.z],a*3),this.prev.set([s.x,s.y,s.z],a*3)}this.inv[0]=0,n&&(this.inv[e-1]=0)}step(e,t,n,r){let{pos:i,prev:a,inv:o}=this,s=e*e;for(let n=0;n<this.count;n+=1){if(o[n]===0)continue;let c=n*3;hn.set(i[c],i[c+1],i[c+2]),t.velocityAt(hn,gn);for(let t=0;t<3;t+=1){let n=i[c+t],o=(n-a[c+t])*.985,l=o/e,u=t===0?gn.x:t===1?gn.y*.3:gn.z,d=(t===1?-9.8:0)+(u-l)*r;a[c+t]=n,i[c+t]=n+o+d*s}}for(let e=0;e<12;e+=1)for(let e=0;e<this.count-1;e+=1){let t=o[e],n=o[e+1],r=t+n;if(r===0)continue;let a=e*3,s=a+3,c=i[s]-i[a],l=i[s+1]-i[a+1],u=i[s+2]-i[a+2],d=Math.hypot(c,l,u)||1e-6,f=(d-this.rest)/(d*r);i[a]+=c*f*t,i[a+1]+=l*f*t,i[a+2]+=u*f*t,i[s]-=c*f*n,i[s+1]-=l*f*n,i[s+2]-=u*f*n}_n(i,o,n)}};function bn(){let e=document.createElement(`canvas`);e.width=64,e.height=512;let t=e.getContext(`2d`);t.fillStyle=`#fff`,t.fillRect(0,0,64,512),t.fillStyle=`#000`,t.beginPath(),t.moveTo(0,0),t.lineTo(64,0),t.lineTo(32,35.84),t.closePath(),t.fill();let n=I(5);for(let e=0;e<9;e+=1){let e=512*(.07+n()*.5),r=n()<.5,i=64*(.12+n()*.2);t.beginPath(),t.moveTo(r?0:64,e),t.lineTo(r?i:64-i,e+3+n()*6),t.lineTo(r?0:64,e+8+n()*10),t.closePath(),t.fill()}let r=new N(e);return r.colorSpace=``,r}var xn=class{group=new u;tails=[];ropes=[];body;material;ropeMaterial;constructor(e,t){this.group.name=`ribbon`;let n=e.bandAxis;this.body=e.body;let r=new g(t.dir.x,-.15,t.dir.y).normalize();this.material=new T({color:new O(.6,.03,.045),roughness:.62,side:2,alphaMap:bn(),alphaTest:.5}),this.material.onBeforeCompile=e=>{e.fragmentShader=e.fragmentShader.replace(`#include <lights_fragment_end>`,`#include <lights_fragment_end>
reflectedLight.indirectDiffuse += diffuseColor.rgb * vec3(0.55, 0.12, 0.1) * 0.35;`)};for(let t of[{len:13,rows:52,w0:1.05,w1:.7,offset:.12},{len:7,rows:28,w0:.75,w1:.5,offset:-.14}]){let i=e.knot.clone().addScaledVector(n,t.offset),o=new mn(4,t.rows,i,n,r,e=>t.w0+(t.w1-t.w0)*e,t.len),s=new w;s.setAttribute(`position`,new A(o.pos,3).setUsage(a));let c=new Float32Array(o.cols*o.rows*2);for(let e=0;e<o.rows;e+=1)for(let t=0;t<o.cols;t+=1)c.set([t/(o.cols-1),e/(o.rows-1)],(e*o.cols+t)*2);s.setAttribute(`uv`,new A(c,2)),s.setIndex(new A(o.index,1)),s.computeVertexNormals();let l=new D(s,this.material);l.frustumCulled=!1,l.castShadow=!0,this.group.add(l),this.tails.push({cloth:o,geo:s})}this.ropeMaterial=new T({color:new O(.5,.08,.07),roughness:.8,side:2});let i=new g(0,-1,0);this.addRope(new yn(30,e.stringTop,null,e.stringLength,i),.035,1.2),this.addRope(new yn(20,e.loopA,e.loopB,e.loopLength,i),.045,.6);for(let e=0;e<240;e+=1)this.step(1/60,t)}addRope(e,t,n){let r=new w;r.setAttribute(`position`,new A(new Float32Array(e.count*2*3),3).setUsage(a)),r.setAttribute(`normal`,new A(new Float32Array(e.count*2*3),3).setUsage(a));let i=[];for(let t=0;t<e.count-1;t+=1)i.push(t*2,t*2+2,t*2+1,t*2+1,t*2+2,t*2+3);r.setIndex(i);let o=new D(r,this.ropeMaterial);o.frustumCulled=!1,this.group.add(o),this.ropes.push({rope:e,geo:r,width:t,drag:n})}step(e,t){for(let n=0;n<2;n+=1)for(let n of this.tails)n.cloth.step(e/2,t,this.body,6);for(let n of this.ropes)n.rope.step(e,t,this.body,n.drag)}update(e){for(let e of this.tails)e.geo.getAttribute(`position`).needsUpdate=!0,e.geo.computeVertexNormals();let t=e.position,n=new g,r=new g,i=new g,a=new g;for(let e of this.ropes){let o=e.rope.pos,s=e.geo.getAttribute(`position`),c=e.geo.getAttribute(`normal`);for(let l=0;l<e.rope.count;l+=1){let u=Math.max(0,l-1)*3,d=Math.min(e.rope.count-1,l+1)*3;n.set(o[d]-o[u],o[d+1]-o[u+1],o[d+2]-o[u+2]).normalize(),i.set(t.x-o[l*3],t.y-o[l*3+1],t.z-o[l*3+2]).normalize(),r.crossVectors(n,i).normalize().multiplyScalar(e.width*.5),a.crossVectors(r,n).normalize(),s.setXYZ(l*2,o[l*3]-r.x,o[l*3+1]-r.y,o[l*3+2]-r.z),s.setXYZ(l*2+1,o[l*3]+r.x,o[l*3+1]+r.y,o[l*3+2]+r.z),c.setXYZ(l*2,a.x,a.y,a.z),c.setXYZ(l*2+1,a.x,a.y,a.z)}s.needsUpdate=!0,c.needsUpdate=!0}}get tip(){let e=this.tails[0].cloth,t=(e.rows*e.cols-2)*3;return new g(e.pos[t],e.pos[t+1],e.pos[t+2])}};function Sn(e){let t=I(e),n=[];for(let e=0;e<13;e+=1){let e=new g(t()*2-1,t()*2-1,t()*2-1).normalize();n.push({n:e,d:.72+t()*.28})}let r=new Oe(1,4),i=r.getAttribute(`position`),a=new g;for(let t=0;t<i.count;t+=1){a.fromBufferAttribute(i,t).normalize();let r=1.25;for(let e of n){let t=a.dot(e.n);t>.001&&(r=Math.min(r,e.d/t))}r*=1+Fe(a.x*2.3+e,a.z*2.3+a.y,3)*.05,i.setXYZ(t,a.x*r*1.15,a.y*r*.72,a.z*r)}return r.computeVertexNormals(),r}function Cn(){let e=new T({color:new O(.25,.265,.29),roughness:.92,metalness:0,flatShading:!1});return e.onBeforeCompile=e=>{e.vertexShader=e.vertexShader.replace(`#include <common>`,`#include <common>
varying vec3 vRockN;
varying vec3 vRockP;`).replace(`#include <worldpos_vertex>`,`#include <worldpos_vertex>
vRockN = normalize(mat3(modelMatrix) * objectNormal);
vRockP = (modelMatrix * vec4(transformed, 1.0)).xyz;`),e.fragmentShader=e.fragmentShader.replace(`#include <common>`,`#include <common>
varying vec3 vRockN;
varying vec3 vRockP;`).replace(`#include <color_fragment>`,`#include <color_fragment>
        float streak = fract(sin(dot(floor(vRockP * 3.1), vec3(12.9898, 78.233, 37.719))) * 43758.5453);
        diffuseColor.rgb *= 0.86 + streak * 0.22;
        float moss = smoothstep(0.55, 0.9, vRockN.y) * smoothstep(0.35, 0.65, fract(sin(dot(floor(vRockP * 1.7), vec3(7.1, 3.7, 5.3))) * 921.7) * 0.6 + 0.4);
        diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.1, 0.22, 0.04), moss * 0.75);
        // Bottoms blend into the turf.
        diffuseColor.rgb = mix(vec3(0.05, 0.12, 0.03), diffuseColor.rgb, smoothstep(-0.25, 0.25, vRockN.y + 0.2));`)},e}var wn=class{group=new u;grassMask=[];specs=[];constructor(e,t=[]){this.group.name=`rocks`;let n=I(19);this.specs.push({x:13,z:9,s:1.7,yaw:.4,tilt:.15},{x:15.2,z:11.6,s:.8,yaw:1.2,tilt:.2},{x:-11,z:14,s:1.2,yaw:2.1,tilt:.1},{x:24,z:-6,s:2.4,yaw:.9,tilt:.25},{x:26.5,z:-3.2,s:1.1,yaw:.2,tilt:.3},{x:9,z:41,s:1.4,yaw:1.9,tilt:.2},{x:-19,z:-16,s:1.9,yaw:.7,tilt:.12},{x:3,z:-23,s:1,yaw:2.8,tilt:.2});for(let e=0;e<400&&this.specs.length<26;e+=1){let e=n()*Math.PI*2,r=20+n()*70,i=Math.sin(e)*r,a=Math.cos(e)*r;Math.abs(i-4)<5&&a>8&&a<40||this.specs.some(e=>Math.hypot(e.x-i,e.z-a)<e.s+4)||t.some(e=>Math.hypot(e.x-i,e.z-a)<e.r+2.5)||this.specs.push({x:i,z:a,s:.5+n()**2*2.2,yaw:n()*6.28,tilt:n()*.3})}let r=Cn(),i=[11,23,37,53,71].map(Sn),a=new g,o=new g(0,1,0);this.specs.forEach((t,n)=>{let s=i[n%i.length],c=new D(s,r),l=R(t.x,t.z);Ge(t.x,t.z,a),c.position.set(t.x,l-t.s*.28,t.z),c.quaternion.setFromUnitVectors(o,a.clone().lerp(o,.5).normalize()),c.rotateY(t.yaw),c.rotateX(t.tilt),c.scale.setScalar(t.s),c.castShadow=!0,c.receiveShadow=!0,this.group.add(c),c.updateMatrixWorld(!0);let u=s.getAttribute(`position`),d=new Float32Array(u.count*3),f=new g;for(let e=0;e<u.count;e+=1)f.fromBufferAttribute(u,e).applyMatrix4(c.matrixWorld),d.set([f.x,f.y,f.z],e*3);let p=Me.ColliderDesc.convexHull(d);p&&e.world.createCollider(p.setFriction(.9)),this.grassMask.push({x:t.x,z:t.z,r:t.s*.95})})}},Tn=`
varying vec3 vN;
varying vec3 vV;
varying float vY;
void main() {
  vY = position.y;
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  vV = -mv.xyz;
  vN = normalize(normalMatrix * normal);
  gl_Position = projectionMatrix * mv;
}`,En=`
uniform vec3 uColor;
uniform float uAlpha;
uniform float uPulse;
uniform float uTime;
varying vec3 vN;
varying vec3 vV;
varying float vY;
void main() {
  float f = 1.0 - abs(dot(normalize(vN), normalize(vV)));
  f = f * f;
  float shimmer = 0.82 + 0.18 * sin(uTime * 2.1 + vY * 6.5);
  float feet = smoothstep(0.02, 0.5, vY);
  float a = uAlpha * (0.05 + 0.6 * f) * shimmer * feet + uPulse * (0.12 + 0.4 * f);
  vec3 c = uColor * (1.1 + 0.9 * f + uPulse * 1.6);
  gl_FragColor = vec4(c, clamp(a, 0.0, 0.9));
}`,Dn=`
uniform float uTime;
uniform float uGust;
varying float vU;
void main() {
  vec3 p = position;
  float u = p.x / 0.62;
  vU = u;
  float w = 0.6 + uGust;
  p.y += sin(uTime * 7.0 - u * 9.0) * 0.045 * u * w - u * u * 0.08;
  p.z += sin(uTime * 5.3 - u * 7.0 + 1.3) * 0.06 * u * w;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
}`,On=`
uniform vec3 uColor;
uniform float uAlpha;
varying float vU;
void main() {
  gl_FragColor = vec4(uColor, uAlpha * (0.62 - 0.35 * vU));
}`;function kn(){let e=document.createElement(`canvas`);e.width=e.height=64;let t=e.getContext(`2d`),n=t.createRadialGradient(32,32,0,32,32,32);n.addColorStop(0,`rgba(255,255,255,1)`),n.addColorStop(.25,`rgba(255,255,255,0.55)`),n.addColorStop(1,`rgba(255,255,255,0)`),t.fillStyle=n,t.fillRect(0,0,64,64);let r=new N(e);return r.colorSpace=Se,r}var An=8,jn=5,Mn=72,Nn=class{group=new u;focus=null;ghosts=new Map;flowers=[];remotes=[];time=0;bodyGeo;headGeo;scarfGeo;bloomGeo;stemGeo;dot=kn();bloomMat=new be({color:new O(2.3,1.95,1.2),toneMapped:!1});ownBloomMat=new be({color:new O(2.6,.75,.62),toneMapped:!1});stemMat=new j({color:new O(`#5f8f3a`)});heartMat=new be({color:new O(2.6,2.3,1.5),toneMapped:!1});motes;motePos;moteCol;sparks;sparkPos;sparkCol;sparkVel;sparkLife;sparkNext=0;constructor(){let e=[[.001,0],[.3,.03],[.33,.28],[.3,.62],[.25,.96],[.21,1.2],[.25,1.32],[.17,1.42],[.07,1.47],[.001,1.48]].map(([e,t])=>new m(e,t));this.bodyGeo=new ne(e,22),this.headGeo=new le(.15,18,12).translate(0,1.63,0),this.scarfGeo=new _e(.62,.085,10,1).translate(.31,0,0);let t=[];for(let e=0;e<6;e++){let n=new xe(.075,10).scale(.62,1,1).translate(0,.07,0);n.rotateX(-1.05).rotateY(e/6*Math.PI*2),t.push(n.toNonIndexed())}this.bloomGeo=Pn(t),this.stemGeo=new P(.009,.013,.52,5).translate(0,.26,0),this.bloomMat.side=this.ownBloomMat.side=2,this.motePos=new Float32Array(255),this.moteCol=new Float32Array(255);let n=new w;n.setAttribute(`position`,new A(this.motePos,3)),n.setAttribute(`color`,new A(this.moteCol,3)),this.motes=new me(n,this.pointsMaterial(.07)),this.motes.frustumCulled=!1,this.group.add(this.motes),this.sparkPos=new Float32Array(216),this.sparkCol=new Float32Array(216),this.sparkVel=new Float32Array(216),this.sparkLife=new Float32Array(Mn);let r=new w;r.setAttribute(`position`,new A(this.sparkPos,3)),r.setAttribute(`color`,new A(this.sparkCol,3)),this.sparks=new me(r,this.pointsMaterial(.11)),this.sparks.frustumCulled=!1,this.group.add(this.sparks)}pointsMaterial(e){return new ue({size:e,map:this.dot,vertexColors:!0,transparent:!0,depthWrite:!1,blending:2,sizeAttenuation:!0,toneMapped:!1})}setRemotes(e){this.remotes=e}get others(){return this.remotes}get travellersInView(){return this.ghosts.size}makeGhost(e){let t=new ge({vertexShader:Tn,fragmentShader:En,uniforms:{uColor:{value:new O(.95,.97,1)},uAlpha:{value:0},uPulse:{value:0},uTime:{value:0}},transparent:!0,depthWrite:!1}),n=new ge({vertexShader:Dn,fragmentShader:On,uniforms:{uColor:{value:new O(1.6,1.05,.35)},uAlpha:{value:0},uTime:{value:0},uGust:{value:0}},transparent:!0,depthWrite:!1,side:2}),r=new u,i=new D(this.bodyGeo,t),a=new D(this.headGeo,t);i.renderOrder=a.renderOrder=5;let o=new D(this.scarfGeo,n);return o.position.set(0,1.43,.02),o.renderOrder=6,r.add(i,a,o),this.group.add(r),{id:e,group:r,scarf:o,mat:t,scarfMat:n,fade:0,seen:!0,pulse:0,phase:Math.random()*6.28,x:0,z:0,y:0}}pulse(e){let t=this.ghosts.get(e);t&&(t.pulse=1,this.burst(new g(t.x,t.y+1.2,t.z),22))}bloom(e){let t=this.flowers.find(t=>t.note.id===e);t&&this.burst(t.at,26)}setNotes(e,t){for(let e of this.flowers)this.group.remove(e.group);this.flowers.length=0;let n=e.filter(e=>e.id!==t?.id).slice(0,16).map(e=>[e,!1]);t&&n.push([t,!0]);for(let[e,t]of n){let n=new u,r=R(e.x,e.z);n.position.set(e.x,r,e.z);let i=new D(this.stemGeo,this.stemMat),a=new u;a.position.y=.52,a.add(new D(this.bloomGeo,t?this.ownBloomMat:this.bloomMat));let o=new D(new le(.03,8,6),this.heartMat);o.position.y=.02,a.add(o);let s=new ce(new re({map:this.dot,color:t?new O(1,.42,.36):new O(1,.86,.52),transparent:!0,depthWrite:!1,blending:2,opacity:.6,toneMapped:!1}));s.scale.setScalar(.95),s.position.y=.55,n.add(i,a,s),this.group.add(n),this.flowers.push({note:e,own:t,group:n,halo:s,bloom:a,at:new g(e.x,r+.5,e.z),phase:Math.random()*6.28})}this.moteCol.fill(0),this.motes.geometry.attributes.color.needsUpdate=!0}burst(e,t){for(let n=0;n<t;n++){let t=this.sparkNext;this.sparkNext=(this.sparkNext+1)%Mn;let n=Math.random()*Math.PI*2,r=.2+Math.random()*.35;this.sparkPos.set([e.x+Math.cos(n)*r,e.y+(Math.random()-.3)*.6,e.z+Math.sin(n)*r],t*3),this.sparkVel.set([Math.cos(n)*.25,.6+Math.random()*.9,Math.sin(n)*.25],t*3),this.sparkLife[t]=1.2+Math.random()*.8}}update(e,t,n,r){this.time+=e;let i=this.time;for(let e of this.ghosts.values())e.seen=!1;for(let t of this.remotes.slice(0,An)){let n=this.ghosts.get(t.id);n||(n=this.makeGhost(t.id),this.ghosts.set(t.id,n)),n.seen=!0,n.x=t.x,n.z=t.z,n.phase+=e*(t.moving?7.5:1.2);let i=t.moving?Math.abs(Math.sin(n.phase))*.05:Math.sin(n.phase)*.012;n.y=R(t.x,t.z),n.group.position.set(t.x,n.y+i,t.z),n.group.rotation.set(t.moving?-.06:0,t.yaw,0,`YXZ`),n.scarf.rotation.y=Math.atan2(-r.dir.y,r.dir.x)-t.yaw}for(let[t,n]of this.ghosts)n.fade=Math.min(1,Math.max(0,n.fade+(n.seen?e:-e)*.9)),n.pulse=Math.max(0,n.pulse-e*.8),n.mat.uniforms.uAlpha.value=n.fade,n.mat.uniforms.uPulse.value=n.pulse*n.pulse,n.mat.uniforms.uTime.value=i+n.phase*.1,n.scarfMat.uniforms.uAlpha.value=n.fade,n.scarfMat.uniforms.uTime.value=i,n.scarfMat.uniforms.uGust.value=r.gust,!n.seen&&n.fade<=0&&(this.group.remove(n.group),n.mat.dispose(),n.scarfMat.dispose(),this.ghosts.delete(t));this.flowers.forEach((e,t)=>{let n=Math.sin(i*1.6+e.phase);e.halo.material.opacity=.42+.2*n,e.halo.scale.setScalar(.85+.12*n),e.bloom.rotation.set(Math.sin(i*1.3+e.phase)*.12*(.4+r.gust),i*.25+e.phase,Math.cos(i*1.1+e.phase)*.1*(.4+r.gust));for(let n=0;n<jn;n++){let r=t*jn+n,a=(i*.33+n/jn+e.phase)%1,o=e.phase*3+n*2.4+i*.4,s=.12+a*.25;this.motePos.set([e.at.x+Math.cos(o)*s,e.at.y-.25+a*1.3,e.at.z+Math.sin(o)*s],r*3);let c=Math.sin(a*Math.PI)*1.4;e.own?this.moteCol.set([c,c*.45,c*.38],r*3):this.moteCol.set([c,c*.85,c*.5],r*3)}});let a=this.motes.geometry.attributes;a.position.needsUpdate=!0,a.color.needsUpdate=!0;for(let t=0;t<Mn;t++){let n=this.sparkLife[t]=Math.max(0,this.sparkLife[t]-e);if(n<=0){this.sparkCol.set([0,0,0],t*3);continue}for(let n=0;n<3;n++)this.sparkPos[t*3+n]+=this.sparkVel[t*3+n]*e;this.sparkVel[t*3+1]*=1-e*.8;let r=Math.min(1,n)*1.8;this.sparkCol.set([r,r*.85,r*.45],t*3)}let o=this.sparks.geometry.attributes;o.position.needsUpdate=!0,o.color.needsUpdate=!0,this.focus=n?this.pickFocus(t):null}fwd=new g;to=new g;pickFocus(e){e.getWorldDirection(this.fwd);let t=e.position,n=null,r=-1/0;for(let e of this.ghosts.values()){if(!e.seen||e.fade<.5)continue;this.to.set(e.x-t.x,e.y+1.15-t.y,e.z-t.z);let i=this.to.length();if(i>6||i<.3)continue;let a=this.to.dot(this.fwd)/i;if(a<.94)continue;let o=a-i*.01;o>r&&(r=o,n={kind:`ghost`,id:e.id})}for(let e of this.flowers){this.to.subVectors(e.at,t);let i=this.to.length();if(i>3.2||i<.2)continue;let a=this.to.dot(this.fwd)/i;if(a<.86)continue;let o=a-i*.01-.02;o>r&&(r=o,n={kind:`note`,note:e.note,own:e.own})}return n}};function Pn(e){let t=[`position`,`normal`,`uv`],n=new w;for(let r of t){let t=e[0].getAttribute(r).itemSize,i=e.reduce((e,t)=>e+t.getAttribute(r).count,0),a=new Float32Array(i*t),o=0;for(let t of e){let e=t.getAttribute(r).array;a.set(e,o),o+=e.length}n.setAttribute(r,new A(a,t))}return n}var Fn=new g;function In(e,t,n,r,i,a){let o=2*Math.PI*i/4,s=Math.max(a-2*i,0),c=Math.PI/4;Fn.copy(t),Fn[r]=0,Fn.normalize();let l=.5*o/(o+s),u=1-Fn.angleTo(e)/c;return Math.sign(Fn[n])===1?u*l:s/(o+s)+l+l*(1-u)}var Ln=class e extends ye{constructor(e=1,t=1,n=1,r=2,i=.1){let a=r*2+1;if(i=Math.min(e/2,t/2,n/2,i),super(1,1,1,a,a,a),this.type=`RoundedBoxGeometry`,this.parameters={width:e,height:t,depth:n,segments:r,radius:i},a===1)return;let o=this.toNonIndexed();this.index=null,this.attributes.position=o.attributes.position,this.attributes.normal=o.attributes.normal,this.attributes.uv=o.attributes.uv;let s=new g,c=new g,l=new g(e,t,n).divideScalar(2).subScalar(i),u=this.attributes.position.array,d=this.attributes.normal.array,f=this.attributes.uv.array,p=u.length/6,m=new g,h=.5/a;for(let r=0,a=0;r<u.length;r+=3,a+=2)switch(s.fromArray(u,r),c.copy(s),c.x-=Math.sign(c.x)*h,c.y-=Math.sign(c.y)*h,c.z-=Math.sign(c.z)*h,c.normalize(),u[r+0]=l.x*Math.sign(s.x)+c.x*i,u[r+1]=l.y*Math.sign(s.y)+c.y*i,u[r+2]=l.z*Math.sign(s.z)+c.z*i,d[r+0]=c.x,d[r+1]=c.y,d[r+2]=c.z,Math.floor(r/p)){case 0:m.set(1,0,0),f[a+0]=In(m,c,`z`,`y`,i,n),f[a+1]=1-In(m,c,`y`,`z`,i,t);break;case 1:m.set(-1,0,0),f[a+0]=1-In(m,c,`z`,`y`,i,n),f[a+1]=1-In(m,c,`y`,`z`,i,t);break;case 2:m.set(0,1,0),f[a+0]=1-In(m,c,`x`,`z`,i,e),f[a+1]=In(m,c,`z`,`x`,i,n);break;case 3:m.set(0,-1,0),f[a+0]=1-In(m,c,`x`,`z`,i,e),f[a+1]=1-In(m,c,`z`,`x`,i,n);break;case 4:m.set(0,0,1),f[a+0]=1-In(m,c,`x`,`y`,i,e),f[a+1]=1-In(m,c,`y`,`x`,i,t);break;case 5:m.set(0,0,-1),f[a+0]=In(m,c,`x`,`y`,i,e),f[a+1]=1-In(m,c,`y`,`x`,i,t)}}static fromJSON(t){return new e(t.width,t.height,t.depth,t.segments,t.radius)}},q=(e,t,n)=>new O().setRGB(e,t,n,Se),Rn=q(.84,.83,.8),J=q(.76,.76,.75),zn=q(.88,.87,.83),Bn=q(.5,.51,.53),Vn=q(.3,.31,.34),Hn=q(.09,.1,.12),Y=new g(0,1,0),Un=new g(1,0,0),Wn=new g(0,0,1),X=1.35,Gn=1.5,Kn=1.4,qn=.2,Z=(e,t,n)=>new g(e,t,n),Jn=(e,t)=>new k().setFromAxisAngle(e,t),Yn=class{toWorld;R;list=[];constructor(e,t){this.toWorld=e,this.R=t}add(e,t,n,r=.035){let i=e.index?e:ot(e);i!==e&&e.dispose(),i.applyMatrix4(t),i.applyMatrix4(this.toWorld);let a=i.getAttribute(`position`).count,o=1-r+this.R()*r*2,s=new Float32Array(a*3);for(let e=0;e<a;e+=1)s.set([n.r*o,n.g*o,n.b*o],e*3);i.setAttribute(`color`,new A(s,3)),this.list.push(i)}merge(){let e=it(this.list,!1);if(!e)throw Error(`guardian: could not merge body parts`);for(let e of this.list)e.dispose();return this.list.length=0,e}};function Xn(e,t){let n=t.clone().sub(e),i=n.length(),a=new k().setFromUnitVectors(Y,n.divideScalar(i));return new r().compose(e.clone().add(t).multiplyScalar(.5),a,Z(1,i,1))}function Zn(e,t,n=0){let i=new k().setFromUnitVectors(Y,t.clone().normalize());return n&&i.multiply(Jn(Y,n)),new r().compose(e,i,Z(1,1,1))}function Q(e,t,n){return new r().compose(e,t??new k,n??Z(1,1,1))}function Qn(e,t,n=20){let r=Math.min(t*.16,e*.45),i=[[.001,0],[e*.8,0],[e,r],[e,t-r],[e*.8,t],[.001,t]];return new ne(i.map(([e,t])=>new m(e,t)),n)}var $=e=>new le(e,22,14),$n=(e,t)=>new P(t,e,1,18,1),er=(e,t,n=44)=>new De(e,t,8,n),tr=Jn(Un,-Math.PI/2),nr=Jn(Un,Math.PI/2);function rr(e,t,n,r,i){let a=t.clone().sub(e),o=a.length(),s=Math.min(o,(n+r)*.999),c=a.divideScalar(o),l=(n*n-r*r+s*s)/(2*s),u=Math.sqrt(Math.max(0,n*n-l*l)),d=i.clone().addScaledVector(c,-i.dot(c)).normalize();return{elbow:e.clone().addScaledVector(c,l).addScaledVector(d,u),wrist:e.clone().addScaledVector(c,s),reached:o<=n+r}}function ir(e){let t=e.f.clone().setY(0).normalize(),n=Y.clone().cross(t).normalize(),i=new k().setFromRotationMatrix(new r().makeBasis(n,Y,t)),a=e.wrist.clone().addScaledVector(t,.55).addScaledVector(Y,-.04),o=[],s=[],c=[],l=(e,t,r,i,a)=>{let l=e,u=t.clone();s.push({p:l,r:a});for(let e of r){u.applyAxisAngle(n,i);let t=l.clone().addScaledVector(u,e);o.push({a:l,b:t,r:a}),s.push({p:t,r:a*.97}),l=t}c.push(l)};for(let r=0;r<3;r+=1)l(e.wrist.clone().addScaledVector(t,.98).addScaledVector(n,(r-1)*.36).addScaledVector(Y,-.03),t.clone().applyAxisAngle(Y,(r-1)*.12),[.3,.24],.42,.19);return l(e.wrist.clone().addScaledVector(t,.42).addScaledVector(n,e.inner*.56).addScaledVector(Y,-.08),t.clone().addScaledVector(n,e.inner*.9).normalize(),[.28,.22],.3,.18),{q:i,palmC:a,bones:o,joints:s,tips:c}}function ar(e,t){let n=e.clone().normalize(),i=t.clone().cross(n).normalize(),a=n.clone().cross(i);return new k().setFromRotationMatrix(new r().makeBasis(i,a,n))}function or(e,t){for(let n=1;n<e.length;n+=1){let[r,i]=e[n-1],[a,o]=e[n];if(t<=o)return r+(a-r)*(t-i)/Math.max(1e-6,o-i)}return e[e.length-1][0]}function sr(e){return new ne(e.map(([e,t])=>new m(e,t)),56).applyMatrix4(new r().makeRotationY(Math.PI))}var cr=[[.001,0],[1.25,.02],[1.95,.24],[2.4,.66],[2.62,1.25],[2.64,1.85],[2.48,2.5],[2.16,3.05],[1.78,3.45],[1.5,3.66],[.001,3.74]],lr=[[.001,-.74],[1.18,-.74],[1.6,-.56],[1.83,-.22],[1.88,.12],[1.8,.5],[1.56,.86],[1.14,1.1],[.6,1.22],[.001,1.26]],ur={y:1.45,z:1.98,r:new g(1.75,1.5,.95)};function dr(e,t,n){let r=Math.min(1,Math.max(0,(n-e)/(t-e)));return r*r*(3-2*r)}var fr=class{eyeMat;glow=0;glowTarget=0;lids=[];group=new u;anchors;grassMask=[];materials=[];geometries=[];perched=[];R2=I(99);constructor(e,t){let n=F.ruin,i=R(0,0);this.group.name=`ruin`;let a=I(4051),o=new k().setFromEuler(new _(0,n.yaw,-n.lean,`YXZ`)),s=Z(0,i-.14,0),c=new r().compose(s,o,Z(X,X,X)),l=e=>e.clone().applyMatrix4(c),d=e=>e.clone().applyQuaternion(o).normalize(),f=(e,t)=>{let n=(i-s.y)/X;for(let r=0;r<4;r+=1){let r=l(Z(e,n,t));n+=(R(r.x,r.z)-r.y)/X}return n},p=new Yn(c,a),m=Jn(Un,-.1),h=new r().compose(Z(0,f(0,-.2)-.32,-.2),m,Z(1,1,.92)),g=(e,t,n)=>Z(e,t,n).applyMatrix4(h),v=e=>h.clone().multiply(e),y=e=>or(cr,e),b=(e,t,n=0)=>Z(Math.sin(t)*(y(e)+n),e,Math.cos(t)*(y(e)+n));p.add(sr(cr),h,Rn,.01);for(let e of[.62,2.72])p.add(er(y(e)+.02,.075,80),v(Q(Z(0,e,0),tr)),J);for(let e=-7;e<=7;e+=1)p.add($(.06),v(Q(b(2.88,e*.2,.01))),J);p.add($(1),v(Q(Z(0,ur.y,ur.z),void 0,ur.r)),zn,.01);for(let e=0;e<20;e+=1){let t=e/20*Math.PI*2,n=Math.cos(t)*1.6,r=ur.y+Math.sin(t)*1.36,i=1-(n/ur.r.x)**2-((r-ur.y)/ur.r.y)**2;p.add($(.055),v(Q(Z(n,r,ur.z+ur.r.z*Math.sqrt(Math.max(0,i))+.01))),J)}let x=Z(0,ur.y+.1,ur.z+ur.r.z-.04);p.add(new P(.72,.76,.14,44),v(Q(x,nr)),J);for(let e of[.62,.34])p.add(er(e,.045,48),v(Q(x.clone().add(Z(0,0,.08)))),zn);p.add(new P(.16,.18,.12,20),v(Q(x.clone().add(Z(0,0,.1)),nr)),Bn);for(let e=0;e<4;e+=1){let t=Math.PI/4+e*Math.PI/2;p.add($(.06),v(Q(x.clone().add(Z(Math.cos(t)*.48,Math.sin(t)*.48,.09)))),Rn)}for(let e of[-1,1])for(let t=0;t<3;t+=1){let n=e*1.32;p.add(new Ln(.62,.1,.16,2,.04),v(Q(b(1.75+t*.28,n,-.03),Jn(Y,n))),Vn)}{let e=b(1.95,Math.PI,-.03);p.add(new P(.7,.74,.12,40),v(Q(e,Jn(Y,Math.PI).multiply(nr))),zn);for(let t=0;t<8;t+=1){let n=t/8*Math.PI*2;p.add($(.055),v(Q(e.clone().add(Z(Math.cos(n)*.6,Math.sin(n)*.6,-.07)))),J)}let t=e.clone().add(Z(0,0,-.62));p.add(Qn(.24,.14),v(Zn(e.clone().add(Z(0,0,-.04)),Z(0,0,-1))),J),p.add($n(.13,.12),v(Xn(e,t)),Bn);let n=Z(Math.cos(.4),Math.sin(.4),0),r=new k().setFromUnitVectors(Y,Z(0,0,-1).cross(n).normalize());for(let e of[-1,1])p.add(new P(.4,.4,.11,30),v(Q(t.clone().addScaledVector(n,e*.42).add(Z(0,0,-.22)),r)),J);p.add($(.2),v(Q(t.clone().add(Z(0,0,-.1)))),Rn)}p.add($n(1.46,1.4),v(Xn(Z(0,3.42,0),Z(0,3.98,0))),Vn),p.add(er(1.58,.2,64),v(Q(Z(0,3.62,0),tr)),J);let S=m.clone().multiply(new k().setFromEuler(new _(.26,.22,-.1,`YXZ`))),ee=Y.clone().applyQuaternion(S),te=new r().compose(g(0,3.74,.04).addScaledVector(ee,.72),S,Z(1,1,.9)),ne=(e,t,n)=>Z(e,t,n).applyMatrix4(te),C=e=>te.clone().multiply(e),re=e=>or(lr,e),w=(e,t,n=0)=>{let r=re(t),i=Math.sqrt(Math.max(.01,r*r-e*e)),a=Z(e/r,20*(r-re(t+.05)),i/r*1.1).normalize();return{p:Z(e,t,i-n),n:a}};p.add(sr(lr),te,Rn,.01),p.add(er(re(-.1)+.01,.06,72),C(Q(Z(0,-.1,0),tr)),J);let ie=[];for(let e of[-1,1]){let{p:t,n}=w(e*.72,.3,.03),r=ar(n,Y);p.add(new P(.44,.44,.18,40),C(Q(t,r.clone().multiply(nr))),Hn,0),p.add(er(.47,.085,44),C(Q(t.clone().addScaledVector(n,.06),r)),J),ie.push({c:t.clone().addScaledVector(n,.03),q:r,side:e})}for(let e of[-1,1]){let{p:t,n}=w(e*1.12,-.2,.14);p.add($(.32),C(Q(t,ar(n,Y),Z(1,.85,.42))),zn)}{let{p:e,n:t}=w(0,-.36,.06);p.add(new Ln(.62,.14,.2,2,.06),C(Q(e,ar(t,Y))),Vn)}for(let e of[-1,1]){let t=Z(e*(re(.1)-.04),.1,-.05),n=new k().setFromUnitVectors(Y,Z(e,0,0));p.add(new P(.5,.56,.3,36),C(Q(t,n)),J),p.add(new P(.3,.3,.36,28),C(Q(t.clone().add(Z(e*.04,0,0)),n)),Vn),p.add(er(.42,.05,36),C(Q(t.clone().add(Z(e*.16,0,0)),ar(Z(e,0,0),Y))),zn)}let ae=Z(.3,1.14,-.32),E=Z(.18,1,-.14).normalize(),oe=ae.clone().addScaledVector(E,.8);p.add(Qn(.24,.12),C(Zn(ae.clone().addScaledVector(E,-.05),E)),J),p.add($n(.12,.1),C(Xn(ae,oe)),Bn),p.add($(.2),C(Q(oe)),zn);let se=[-1,1].map(e=>{let t=g(e*2.3,2.62,.1);p.add($(.62),Q(t),Bn);let n=m.clone().multiply(Jn(Wn,-e*.55)),r=g(e*2.38,2.88,.1);return p.add($(.76),Q(r,n,Z(1,.62,1.05)),zn),p.add(er(.74,.045,48),Q(r.clone().add(Z(0,-.07,0).applyQuaternion(n)),n.clone().multiply(tr),Z(1,1.05,1)),J),{sock:t,padC:r}}),ce=(e,t,n,r)=>{p.add($n(n,r),Xn(e,t),Rn);let i=t.clone().sub(e),a=i.length();i.divideScalar(a);let o=new k().setFromUnitVectors(Wn,i);for(let t of[.24,.76])p.add(er(n+(r-n)*t+.015,.065,40),Q(e.clone().addScaledVector(i,a*t),o),J)},ue=(e,t,n,r)=>{let i=se[e<0?0:1].sock.clone().add(Z(e*.3,-.18,0)),a=t=>({wrist:t,f:r,inner:e<0?1:-1}),o=Z(t,f(t,n)+.42,n);for(let e=0;e<3;e+=1){let e=ir(a(o)),t=e.palmC.y-.4-f(e.palmC.x,e.palmC.z);for(let n of e.tips)t=Math.min(t,n.y-.19-f(n.x,n.z));o=o.clone().add(Z(0,-.04-t,0))}let s=Z(e*.5,0,-1).normalize(),c=rr(i,o,Gn,Kn,s);p.add($(.52),Q(i),Bn),ce(i,c.elbow,.6,.56),p.add($(.57),Q(c.elbow),Bn),p.add($(.44),Q(c.elbow.clone().addScaledVector(s,.3),void 0,Z(1,1,.75)),zn),ce(c.elbow,c.wrist,.54,.5);let l=ir(a(c.wrist));p.add($(.44),Q(c.wrist),Bn),p.add($(1),Q(l.palmC,l.q,Z(.66,.4,.62)),Rn);for(let e of l.joints)p.add($(e.r),Q(e.p),J);for(let e of l.bones)p.add($n(e.r,e.r*.95),Xn(e.a,e.b),Rn);return{start:i,elbow:c.elbow,wrist:c.wrist,palmC:l.palmC,tips:l.tips,reached:c.reached}},de=ue(-1,-3.35,.85,Z(-.55,0,.83).normalize()),j=ue(1,3.35,1,Z(.45,0,.9).normalize());(!j.reached||!de.reached)&&console.warn(`guardian: an arm cannot reach its target`);let M=[-1,1].map(e=>{let t=g(e*1.22,.8,1.35),n=e*1.95,r=3.55,i=Z(n,f(n,r)+.62,r);p.add($(.9),Q(t),Bn),p.add($n(.78,.92),Xn(i,t),Rn);let a=t.clone().sub(i),o=a.length();a.divideScalar(o);let s=new k().setFromUnitVectors(Wn,a);for(let e of[.28,.7])p.add(er(.78+.14*e+.02,.07,44),Q(i.clone().addScaledVector(a,o*e),s),J);p.add($(.5),Q(i.clone().lerp(t,.5).add(Z(0,.74,0)),void 0,Z(1.05,.5,1.15)),zn),p.add($(.66),Q(i),Bn);let c=Jn(Y,e*.2).multiply(Jn(Un,-.25)),l=i.clone().add(Z(e*.08,.42,.4));p.add($(1),Q(l,c,Z(.86,1.02,.66)),J);let u=l.clone().add(Z(0,-.04,.6).applyQuaternion(c));return p.add(new P(.7,.7,.24,40),Q(u,c.clone().multiply(nr),Z(.92,1,1.2)),zn),p.add(er(.56,.05,40),Q(u.clone().add(Z(0,0,.12).applyQuaternion(c)),c,Z(.92,1.2,1)),J),p.add($(.26),Q(u.clone().add(Z(0,-.1,.1).applyQuaternion(c)),c,Z(1,1,.4)),J),{hip:t,ankle:i,fc:l,top:l.clone().add(Z(0,1.02,0).applyQuaternion(c))}}),fe=p.merge(),pe=pr(i),me=new D(fe,pe);me.castShadow=!0,me.receiveShadow=!0,me.name=`guardian`,this.group.add(me),this.geometries.push(fe),this.materials.push(pe);{let t=new Float32Array(fe.getAttribute(`position`).array),n=new Uint32Array(fe.getIndex().array);e.world.createCollider(Me.ColliderDesc.trimesh(t,n).setFriction(.6))}let he=new T({color:q(.06,.07,.09),roughness:.16,metalness:.1}),ge=ie.map(e=>$(.36).applyMatrix4(C(Q(e.c,e.q,Z(1,1,.45)))).applyMatrix4(c)),_e=it(ge);for(let e of ge)e.dispose();he.emissive.copy(q(1,.72,.38)),he.emissiveIntensity=0,this.eyeMat=he,this.group.add(new D(_e,he)),this.geometries.push(_e),this.materials.push(he);{let e=new le(.5,28,10,0,Math.PI*2,0,Math.PI/2),t=new xe(.5,28).applyMatrix4(new r().makeRotationX(Math.PI/2)),n=it([e,t]);e.dispose(),t.dispose();let i=n.getAttribute(`position`).count,a=new Float32Array(i*3);for(let e=0;e<i;e+=1)a.set([Rn.r,Rn.g,Rn.b],e*3);n.setAttribute(`color`,new A(a,3)),this.geometries.push(n);for(let e of ie){let t=new u;t.position.copy(l(e.c.clone().applyMatrix4(te))),t.quaternion.copy(o).multiply(S).multiply(e.q).multiply(Jn(Wn,-e.side*.22)),t.scale.set(X,X,X*.56);let r=new D(n,pe);r.rotation.x=qn,r.receiveShadow=!0,t.add(r),this.group.add(t),this.lids.push(r)}}let ve=mr(fe,i,t);this.group.add(ve),this.geometries.push(ve.geometry),this.materials.push(ve.material);let ye=l(ae.clone().addScaledVector(E,.42).applyMatrix4(te)),N=d(E.clone().transformDirection(te)),be=.17850000000000002,Se=Z(F.wind.dir.x,0,F.wind.dir.y),Ce=Se.clone().addScaledVector(N,-Se.dot(N)).normalize(),we=ye.clone().addScaledVector(Ce,be),Te=new T({color:new O(.62,.035,.05),roughness:.75,side:2});this.materials.push(Te);let Ee=new k().setFromUnitVectors(Y,N),De=e=>{let t=new D(e,Te);t.castShadow=!0,this.group.add(t),this.geometries.push(e)};for(let[e,t,n]of[[.02,.28,0],[-.21,.1,.012]])De(new P(be+n,be+n+.01,t,28,1,!0).applyMatrix4(Q(ye.clone().addScaledVector(N,e),Ee)));De($(.14).applyMatrix4(Q(we.clone().addScaledVector(Ce,.04),Ee,Z(1.25,.8,.85))));let Oe=l(Z(0,0,-1)).sub(l(Z(0,0,0))).normalize(),ke=Oe.addScaledVector(N,-Oe.dot(N)).normalize(),Ae=[[l(ne(.62,1.17,.3)),n.yaw+.6],[l(M[1].top),n.yaw+2.4]];for(let[e,t]of Ae){let n=hr();n.group.position.copy(e),n.group.rotation.y=t,this.group.add(n.group),this.perched.push({head:n.head,body:n.group,lift:n.lift,base:t,next:1+this.R2()*3,target:0,hop:0}),this.geometries.push(...n.geometries),this.materials.push(...n.materials)}let je=l(j.tips.slice(0,3).reduce((e,t)=>e.add(t),Z(0,0,0)).multiplyScalar(1/3).add(Z(-.25,0,.55)));je.y=R(je.x,je.z);let Ne=l(Z(-3,0,2.75));Ne.y=R(Ne.x,Ne.z),this.anchors={knot:we,knotOut:Ce,bandCenter:ye,bandAxis:N,bandRadius:be,stringTop:ye.clone().addScaledVector(ke,be),stringLength:.9,loopA:we.clone().addScaledVector(N,.09),loopB:we.clone().addScaledVector(N,-.09),loopLength:.8,body:[{a:l(de.start),b:l(de.elbow),r:.6*X},{a:l(de.elbow),b:l(de.wrist),r:.55*X},{a:l(de.palmC),b:l(de.palmC),r:.6*X},{a:l(se[0].padC),b:l(se[0].padC),r:.74*X},{a:l(se[1].padC),b:l(se[1].padC),r:.74*X},{a:l(g(0,1.6,.12)),b:l(g(0,1.6,.12)),r:2.5*X},{a:l(ne(0,-.55,0)),b:l(ne(0,-.55,0)),r:1.8*X},{a:l(ae.clone().applyMatrix4(te)),b:l(oe.clone().applyMatrix4(te)),r:.12*X},{a:l(j.start),b:l(j.elbow),r:.6*X},{a:l(j.elbow),b:l(j.wrist),r:.55*X},{a:l(j.palmC),b:l(j.palmC),r:.6*X},...M.map(e=>({a:l(e.ankle),b:l(e.hip),r:.85*X})),...M.map(e=>({a:l(e.fc),b:l(e.fc),r:.8*X}))],critter:je,rose:Ne,handR:l(de.wrist),handL:l(j.wrist),forward:l(Z(0,0,1)).sub(l(Z(0,0,0))).setY(0).normalize(),focus:l(g(0,2.4,.4))};let Pe=(e,t)=>{let n=l(e);this.grassMask.push({x:n.x,z:n.z,r:t})};Pe(g(0,0,.2),2.3*X);for(let e of M){for(let t of[.2,.55,.9])Pe(e.ankle.clone().lerp(e.hip,t),.8*X);Pe(e.fc,.78*X)}for(let e of[j,de]){Pe(e.palmC,.6*X);for(let t of e.tips)Pe(t,.24*X)}}setAwake(e,t=!1){this.glowTarget=+!!e,t&&(this.glow=this.glowTarget)}update(e,t,n){this.glow+=(this.glowTarget-this.glow)*(1-Math.exp(-e*.45)),this.eyeMat.emissiveIntensity=this.glow*(2.1+.5*Math.sin(t*1.3));let r=qn+-.75*dr(0,.7,this.glow);for(let e of this.lids)e.rotation.x=r;for(let t of this.perched)t.next-=e*(1+n*.8),t.next<=0&&(t.next=1.2+this.R2()*3.5,this.R2()<.2?(t.base+=(this.R2()-.5)*2.4,t.hop=1):t.target=(this.R2()-.5)*2.2),t.head.rotation.y+=(t.target-t.head.rotation.y)*(1-Math.exp(-e*14)),t.body.rotation.y+=(t.base-t.body.rotation.y)*(1-Math.exp(-e*9)),t.hop>0&&(t.hop=Math.max(0,t.hop-e*4)),t.lift.position.y=Math.sin(t.hop*Math.PI)*.09}dispose(){for(let e of this.geometries)e.dispose();for(let e of this.materials)e.dispose()}};function pr(e){let t=new T({vertexColors:!0,roughness:.9,metalness:0});return t.onBeforeCompile=t=>{t.uniforms.uGroundY={value:e},t.vertexShader=t.vertexShader.replace(`#include <common>`,`#include <common>
varying vec3 vRW;
varying vec3 vRN;`).replace(`#include <begin_vertex>`,`#include <begin_vertex>
vRW = (modelMatrix * vec4(transformed, 1.0)).xyz;
vRN = normalize(mat3(modelMatrix) * objectNormal);`),t.fragmentShader=t.fragmentShader.replace(`#include <common>`,`#include <common>\n${Ve}\nuniform float uGroundY;\nvarying vec3 vRW;\nvarying vec3 vRN;`).replace(`#include <color_fragment>`,`#include <color_fragment>
        {
          vec3 wn = normalize(vRN);
          vec3 wp = vRW;
          float n1 = fbm3(wp.xz * 0.55 + vec2(wp.y * 0.4, -wp.y * 0.3));
          float n2 = vnoise(wp.xz * 3.1 + wp.y * 2.3);
          float n3 = vnoise(vec2((wp.x + wp.z) * 2.6, wp.y * 0.22) + 7.0);
          float side = 1.0 - abs(wn.y);
          // Rain streaks run down the side faces; grime settles low on the legs.
          diffuseColor.rgb *= 1.0 - 0.28 * side * smoothstep(0.5, 0.84, n3);
          diffuseColor.rgb *= 1.0 - 0.16 * (1.0 - smoothstep(0.0, 3.5, wp.y - uGroundY));
          // Pale lichen specks.
          float lichen = smoothstep(0.8, 0.9, vnoise(wp.xz * 9.0 + wp.y * 7.0 + 3.0)) * (0.4 + 0.6 * n1);
          diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.5, 0.5, 0.2), lichen * 0.45);
          // Moss on every upward face, in patches, and creeping up from the turf.
          float moss = smoothstep(0.5, 0.82, wn.y + (n1 - 0.5) * 0.6) * smoothstep(0.32, 0.6, n1 * 0.7 + n2 * 0.45);
          moss = max(moss, (1.0 - smoothstep(0.1, 0.95, wp.y - uGroundY + (n2 - 0.5) * 0.6)) * 0.9);
          vec3 mossCol = mix(vec3(0.07, 0.15, 0.025), vec3(0.2, 0.3, 0.06), n2);
          diffuseColor.rgb = mix(diffuseColor.rgb, mossCol, clamp(moss, 0.0, 1.0) * 0.9);
        }`)},t}function mr(e,t,n){let r=e.getAttribute(`position`),i=e.getIndex(),a=i.count/3,o=new Float64Array(a),s=new g,c=new g,l=new g,u=new g,d=new g,f=new g,p=e=>(s.fromBufferAttribute(r,i.getX(e*3)),c.fromBufferAttribute(r,i.getX(e*3+1)),l.fromBufferAttribute(r,i.getX(e*3+2)),d.subVectors(c,s),f.subVectors(l,s),u.crossVectors(d,f).length()),m=0;for(let e=0;e<a;e+=1){let n=p(e);if(n>1e-9){let e=(s.y+c.y+l.y)/3-t;m+=n*.5*dr(.55,.92,u.y/n)*(e<1.4?.2:1)}o[e]=m}let h=I(771),_=()=>{let e=h()*m,t=0,n=a-1;for(;t<n;){let r=t+n>>1;o[r]<e?t=r+1:n=r}return t},v=[],y=[],b=[],x=[],S=[],ee=(e,t,n,r)=>(v.push(e.x,e.y,e.z),y.push(t.x,t.y,t.z),b.push(n.r,n.g,n.b),x.push(r),v.length/3-1),te=q(.16,.26,.07),ne=[q(.42,.6,.16),q(.56,.68,.22),q(.36,.54,.2)],C=q(.24,.4,.1),re=[q(.97,.96,.91),q(.97,.96,.91),q(.98,.9,.6)],T=q(.98,.74,.16),ie=(e,t,n,r,i,a,o,s)=>{let c=t.clone().addScaledVector(i,a).normalize(),l=c.clone().cross(i).normalize(),u=v.length/3,d=e;for(let a=0;a<=4;a+=1){let u=a/4,f=e.clone().addScaledVector(c,n*u).addScaledVector(i,n*.32*u*u),p=r/2*(1-u*.92),m=o.clone().lerp(s,u**.8);ee(f.clone().addScaledVector(l,-p),t,m,n*u*u),ee(f.clone().addScaledVector(l,p),t,m,n*u*u),d=f}for(let e=0;e<4;e+=1){let t=u+e*2;S.push(t,t+1,t+2,t+1,t+3,t+2)}return d},ae=Z(-.25,1,.2).normalize(),E=ae.clone().cross(Un).normalize(),oe=ae.clone().cross(E).normalize();for(let e=0;e<340;e+=1){p(_()),u.normalize();let e=h(),t=h();e+t>1&&(e=1-e,t=1-t);let n=s.clone().addScaledVector(d,e).addScaledVector(f,t),r=Y.clone().lerp(u,.3).normalize(),i=.75+h()*.8,a=ne[Math.floor(h()*ne.length)],o=8+Math.floor(h()*7);for(let e=0;e<o;e+=1){let e=h()*Math.PI*2,t=Z(Math.cos(e),0,Math.sin(e));t.addScaledVector(u,-t.dot(u));let o=n.clone().addScaledVector(t,.03+h()*.09*i).addScaledVector(u,-.02),s=e+(h()-.5);ie(o,r,(.12+h()*.22)*i,.035+h()*.025,Z(Math.cos(s),0,Math.sin(s)),.35+h()*.5,te,a.clone().multiplyScalar(.9+h()*.2))}if(h()<.16){let e=(.2+h()*.16)*i,t=h()*Math.PI*2,a=ie(n,r,e,.016,Z(Math.cos(t),0,Math.sin(t)),.12,C,C),o=.05+h()*.03,s=re[Math.floor(h()*re.length)],c=ee(a,ae,T,e);for(let t=0;t<18;t+=1){let n=t/18*Math.PI*2,r=t%2==0?o:o*.45;ee(a.clone().addScaledVector(E,Math.cos(n)*r).addScaledVector(oe,Math.sin(n)*r).addScaledVector(ae,t%2?.004:-.006),ae,s,e)}for(let e=0;e<18;e+=1)S.push(c,c+1+e,c+1+(e+1)%18)}}let O=new w;O.setAttribute(`position`,new M(v,3)),O.setAttribute(`normal`,new M(y,3)),O.setAttribute(`color`,new M(b,3)),O.setAttribute(`aSway`,new M(x,1)),O.setIndex(S),O.computeBoundingSphere();let se=new j({vertexColors:!0,side:2});se.onBeforeCompile=e=>{Object.assign(e.uniforms,{uTime:n.uTime,uWindDir:n.uWindDir,uWindSpeed:n.uWindSpeed,uWindScroll:n.uWindScroll,uWindGust:n.uWindGust}),e.vertexShader=e.vertexShader.replace(`#include <common>`,`#include <common>\n${Ve}\n${He}\nattribute float aSway;`).replace(`#include <begin_vertex>`,`#include <begin_vertex>
        {
          vec2 w = windAt(transformed.xz);
          vec2 across = vec2(-uWindDir.y, uWindDir.x);
          float s = aSway;
          transformed.xz += (uWindDir * (0.3 + w.x * 0.6) + across * w.y * 0.08) * s;
          transformed.y -= s * s * (0.2 + 0.35 * w.x);
        }`),e.fragmentShader=e.fragmentShader.replace(`#include <normal_fragment_begin>`,Ae.normal_fragment_begin.replace(`normal *= faceDirection;`,``))};let ce=new D(O,se);return ce.receiveShadow=!0,ce.name=`guardian-grass`,ce}function hr(){let e=new j({color:q(.96,.96,.94)}),t=new j({color:q(.44,.47,.55)}),n=new j({color:q(.96,.62,.2)}),r=new be({color:1118484}),i=[],a=(e,t,n,r,a=0)=>{i.push(t);let o=new D(t,n);return o.position.copy(r),o.rotation.x=a,o.castShadow=!0,e.add(o),o},o=new u,s=new u;o.add(s),a(s,new le(.1,14,10).scale(.85,.8,1.5),e,Z(0,.1,0),-.35);for(let e of[-1,1])a(s,new le(.08,10,8).scale(.35,.62,1.55),t,Z(e*.075,.125,-.035),-.3);a(s,new ye(.09,.016,.15),t,Z(0,.07,-.17),.35);let c=new u;c.position.set(0,.205,.1),s.add(c),a(c,new le(.066,12,10),e,Z(0,0,0)),a(c,new pe(.018,.065,8).rotateX(Math.PI/2),n,Z(0,-.005,.085));for(let e of[-1,1])a(c,new le(.012,6,6),r,Z(e*.037,.016,.045));return o.scale.setScalar(1.6),{group:o,lift:s,head:c,geometries:i,materials:[e,t,n,r]}}var gr=512,_r=8,vr=`
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = vec4(position.xy, 0.0, 1.0);
}
`,yr=`
uniform sampler2D uPrev;
uniform vec4 uWalk[${_r}];
uniform float uKeep;
uniform float uFall;
uniform float uExtent;
varying vec2 vUv;
void main() {
  vec4 prev = texture2D(uPrev, vUv);
  // Old prints fade: the grass springs back over several seconds.
  float s = max(prev.r * uKeep - uFall, 0.0);
  vec2 dir = prev.gb;
  vec2 xz = (vUv - 0.5) * 2.0 * uExtent;
  for (int i = 0; i < ${_r}; i++) {
    vec4 w = uWalk[i];
    float m = length(w.zw);
    vec2 f = m > 1e-3 ? w.zw / m : vec2(0.0);
    // Walking, the footprint runs a little ahead and wider, so the blades part before the traveller;
    // standing, the grass lies around the feet like a nest.
    vec2 d = xz - (w.xy + f * 0.35 * m);
    float r = length(d);
    float R = 0.85 + 0.3 * m;
    float k = 1.0 - smoothstep(0.2 * R, R, r);
    if (k > s) {
      vec2 lay = (r > 1e-3 ? d / r : f) * 0.8 + f * 0.9 * m;
      float l = length(lay);
      if (l > 1e-3) dir = lay / l;
      s = k;
    }
  }
  gl_FragColor = vec4(s, dir, 1.0);
}
`,br=class{uniforms={uTrample:{value:null},uTrampleExtent:{value:64}};read;write;scene=new se;camera=new Ce(-1,1,1,-1,0,1);material;walk=Array.from({length:_r},()=>new y(1e5,1e5,0,0));constructor(){let e=()=>new p(gr,gr,{type:f,format:S,minFilter:d,magFilter:d,wrapS:E,wrapT:E,depthBuffer:!1,stencilBuffer:!1,generateMipmaps:!1});this.read=e(),this.write=e(),this.material=new ge({uniforms:{uPrev:{value:null},uWalk:{value:this.walk},uKeep:{value:1},uFall:{value:0},uExtent:{value:64}},vertexShader:vr,fragmentShader:yr,depthTest:!1,depthWrite:!1});let t=new D(new _e(2,2),this.material);t.frustumCulled=!1,this.scene.add(t),this.uniforms.uTrample.value=this.read.texture}update(e,t,n){for(let e=0;e<_r;e+=1){let t=n[e];t?this.walk[e].set(t.x,t.z,t.dx*t.moving,t.dz*t.moving):this.walk[e].set(1e5,1e5,0,0)}let r=this.material.uniforms;r.uPrev.value=this.read.texture,r.uKeep.value=Math.exp(-t/6),r.uFall.value=t*.02;let i=e.getRenderTarget();e.setRenderTarget(this.write),e.render(this.scene,this.camera),e.setRenderTarget(i);let a=this.read;this.read=this.write,this.write=a,this.uniforms.uTrample.value=this.read.texture}dispose(){this.read.dispose(),this.write.dispose(),this.material.dispose()}},xr=class{dir=new m().copy(F.wind.dir);speed=F.wind.speed;gust=0;time=0;scroll=0;gustSmooth=0;baseAngle=Math.atan2(F.wind.dir.y,F.wind.dir.x);update(e){this.time+=e;let t=this.time,n=Fe(t*.21,.5,3)*.6+Fe(t*.83,4.5,5)*.4;this.gust=L(-.15,.55,n),this.speed=F.wind.speed*(.62+this.gust*.85),this.scroll+=this.speed*.8*e,this.gustSmooth+=(this.gust-this.gustSmooth)*(1-Math.exp(-e/1.2));let r=this.baseAngle+Fe(t*.045,9.5,7)*.22;this.dir.set(Math.cos(r),Math.sin(r))}velocityAt(e,t){let n=this.time,r=e.x*this.dir.x+e.z*this.dir.y,i=Fe(r*.08-n*.9,e.y*.12,11)*.5+.5,a=this.speed*(.75+i*.5),o=Fe(e.y*.35+n*1.7,r*.2,13),s=Fe(e.y*.4-n*1.3,r*.25+3,17);return t.set(this.dir.x*a+o*1.4*this.dir.y,s*.9+.05,this.dir.y*a-o*1.4*this.dir.x)}},Sr={move:{x:0,y:0},held:()=>!1,consume:()=>!1},Cr=class{renderer;input;audio;mode=`title`;reducedMotion=!1;debugCamera;scene=new se;camera;physics=new je(F.player.gravity);wind=new xr;pipeline;terrain;grass;trample=new br;walkers=[];lastFeet=new m(NaN,NaN);walkDir=new m(0,-1);walkSpeed=0;ruin;ribbon;rocks;critter;encounters;flyers;drift;social;frozen=!1;player;ambience;onCaption;sun;fluteAt=new g;seen=new Set;playTime=0;time=0;constructor(e,t,n,r){this.renderer=e,this.input=t,this.audio=n;let i=ke[r];this.camera=new oe(F.camera.fov,e.aspect,F.camera.near,2e3),this.pipeline=new ln(e.gl,i),e.onResize=()=>{this.camera.aspect=e.aspect,this.camera.updateProjectionMatrix(),this.pipeline.resize()},this.scene.fog=new h(new O(.5,.6,.9),.0032),this.sun=new o(new O(1,.95,.86),4.4),this.sun.castShadow=i.shadows,this.sun.shadow.mapSize.set(i.shadowMap,i.shadowMap);let a=this.sun.shadow.camera;a.left=-48,a.right=48,a.top=48,a.bottom=-48,a.near=1,a.far=320,a.updateProjectionMatrix(),this.sun.shadow.bias=-4e-4,this.sun.shadow.normalBias=.04,this.scene.add(this.sun,this.sun.target),this.scene.add(new b(new O(.5,.63,1),new O(.2,.26,.12),2.1)),this.terrain=new qe(this.physics),this.scene.add(this.terrain.mesh),this.ruin=new fr(this.physics,this.terrain.uniforms),this.scene.add(this.ruin.group),this.encounters=new St(this.physics,this.ruin.anchors,F.sunDir),this.encounters.onAwaken=e=>this.ruin.setAwake(!0,e),this.scene.add(this.encounters.group),this.rocks=new wn(this.physics,this.encounters.reserved),this.scene.add(this.rocks.group),this.critter=new Xe(this.physics,this.ruin.anchors.critter,new g(0,0,0)),this.scene.add(this.critter.group),this.terrain.maskGrass([...this.ruin.grassMask,...this.rocks.grassMask,...this.encounters.grassMask,{x:this.ruin.anchors.critter.x,z:this.ruin.anchors.critter.z,r:.45}]),this.grass=new Bt(this.terrain,i.grass,this.pipeline.multisampled,this.trample.uniforms),this.grass.setSunDir(F.sunDir),this.scene.add(this.grass.group),this.ribbon=new xn(this.ruin.anchors,this.wind),this.scene.add(this.ribbon.group),this.flyers=new At,this.scene.add(this.flyers.group),this.drift=new rt(i.grass),this.scene.add(this.drift.mesh),this.social=new Nn,this.scene.add(this.social.group);let s=F.player;this.player=new un(this.physics,s.spawn,s.spawnYaw,s.spawnPitch),this.ambience=new Le(n),this.player.onStep=e=>this.ambience.footstep(e),this.player.onLand=e=>this.ambience.land(e),this.fluteAt.copy(this.ruin.anchors.bandCenter).lerp(new g(0,R(0,0),0),.3),this.setTitleCamera(0)}setQuality(e){let t=ke[e];this.renderer.applyQuality(e),this.pipeline.setQuality(t),this.grass.setDensity(t.grass,this.pipeline.multisampled),this.drift.setDensity(t.grass),this.grass.setSunDir(F.sunDir),this.sun.castShadow=t.shadows,this.sun.shadow.mapSize.set(t.shadowMap,t.shadowMap),this.sun.shadow.map?.dispose(),this.sun.shadow.map=null}start(){let e=F.player;this.player.teleport(e.spawn,e.spawnYaw,e.spawnPitch),this.mode=`playing`,this.seen.clear(),this.playTime=0,this.encounters.endDialogue(),this.ambience.start()}pause(){this.mode===`playing`&&(this.mode=`paused`)}resume(){this.mode===`paused`&&(this.mode=`playing`)}toTitle(){this.mode=`title`}discover(){let e=this.player.feet,t=Math.hypot(e.x,e.z),n=this.ruin.anchors.critter,r=(e,t)=>{t&&!this.seen.has(e)&&(this.seen.add(e),this.onCaption?.(e))};r(`ruin`,t<9),r(`critter`,Math.hypot(e.x-n.x,e.z-n.z)<3.2),r(`edge`,t>F.player.softRadius-2),r(`arrive`,this.playTime>2.5&&this.encounters.stars.length===0)}setTitleCamera(e){let t=-.61+Math.sin(e*.025)*.05,n=88.5+Math.sin(e*.017)*3,r=Math.sin(t)*n,i=Math.cos(t)*n;this.camera.position.set(r,-2+Math.sin(e*.021)*1.5,i),this.camera.lookAt(0,20,0);let a=this.camera.aspect<1?50:36;this.camera.fov!==a&&(this.camera.fov=a,this.camera.updateProjectionMatrix())}step(e){this.mode===`playing`&&!this.debugCamera&&this.player.step(e,this.encounters.talking||this.frozen?Sr:this.input),this.ribbon.step(e,this.wind),this.physics.step(e)}pressGrass(e){let t=this.walkers;if(t.length=0,this.mode!==`title`&&!this.debugCamera){let n=this.player.feet,r=n.x-this.lastFeet.x,i=n.z-this.lastFeet.y,a=Math.hypot(r,i),o=Number.isFinite(a)&&a<2&&e>0?a/e:0;this.walkSpeed+=(o-this.walkSpeed)*Math.min(1,e*8),o>.2&&this.walkDir.lerp(new m(r/a,i/a),Math.min(1,e*10)).normalize(),this.lastFeet.set(n.x,n.z),n.y-R(n.x,n.z)<.35&&t.push({x:n.x,z:n.z,dx:this.walkDir.x,dz:this.walkDir.y,moving:C.smoothstep(this.walkSpeed,.4,2.6)})}for(let e of this.social.others){if(t.length>=8)break;t.push({x:e.x,z:e.z,dx:-Math.sin(e.yaw),dz:-Math.cos(e.yaw),moving:e.moving?.8:0})}this.trample.update(this.renderer.gl,e,t)}render(e,t){let n=Math.min(t,.1);if(this.time+=n,this.wind.update(n),this.terrain.update(this.time,this.wind),this.pipeline.clouds.update(n,this.wind.dir,this.wind.gust),this.debugCamera){let e=this.debugCamera,t=e.ground?R(e.x,e.z)+e.y:e.y;this.camera.position.set(e.x,t,e.z),this.camera.rotation.set(e.pitch,e.yaw,0,`YXZ`),this.camera.fov!==e.fov&&(this.camera.fov=e.fov,this.camera.updateProjectionMatrix())}else if(this.mode===`title`)this.setTitleCamera(this.time);else{if(this.mode===`playing`){let e=this.input.takeLook();this.player.look(e.x,e.y)}else this.input.takeLook();this.player.applyCamera(this.camera,e,this.reducedMotion)}this.pressGrass(n),this.grass.update(this.camera),this.ribbon.update(this.camera),this.ruin.update(n,this.time,this.wind.gust),this.critter.update(n,this.camera.position);let r=this.mode===`playing`&&!this.debugCamera;r&&(this.playTime+=n),this.encounters.update(n,this.time,this.camera,this.player.feet,r,this.wind.gust),this.flyers.update(this.time),this.drift.update(n,this.wind,this.camera.position),this.social.update(n,this.camera,r&&!this.encounters.talking&&!this.frozen,this.wind),this.ambience.update(n,this.wind,this.camera.position,this.fluteAt,this.ribbon.tip,this.mode!==`title`),this.mode===`playing`&&!this.debugCamera&&this.discover();let i=this.camera.position;this.sun.target.position.set(i.x*.5,0,i.z*.5),this.sun.position.copy(this.sun.target.position).addScaledVector(F.sunDir,160),this.pipeline.render(this.scene,this.camera),this.renderer.adapt(t)}};export{Cr as Game};