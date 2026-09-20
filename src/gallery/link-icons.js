// link-icons.js — 平面链接图标配置与建造(2026-09-20 自 links.js 拆分,审计「大文件拆分」)
// ICON_CFG(配置数组)+ makePlane/decoLight 工具 + buildIcons(s,iG) 建造器。加链接只改 ICON_CFG。
import * as THREE from 'three';

function makePlane(w, h, drawFn, emissiveColor, emissiveInt) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const x = c.getContext('2d');
  drawFn(x, w, h);
  const t = new THREE.CanvasTexture(c);
  return new THREE.MeshStandardMaterial({
    map: t,
    transparent: true,
    side: THREE.DoubleSide,
    emissive: emissiveColor,
    emissiveIntensity: emissiveInt,
  });
}
// 通用:装饰小灯(模式系统按 userData.deco 管理)
export function decoLight(color, intensity, dist, pos, parent, scene) {
  const pl = new THREE.PointLight(color, intensity, dist, 1.5);
  pl.userData.deco = 1;
  pl.position.set(pos[0], pos[1], pos[2]);
  (parent || scene).add(pl);
  return pl;
}

// ===================== 平面图标配置 =====================
// {key,size:[w,h],pos,rotY,emissive,ei,light:[color,i,dist],draw}
const ICON_CFG = [
  {
    key: 'isLink4',
    size: [1.2, 1.8],
    pos: [15.7, 2.5, -9],
    rotY: -Math.PI / 2,
    emissive: '#c04030',
    ei: 0.15,
    light: ['#c04030', 2, 5],
    draw(x, w, h) {
      // 水墨中国风
      x.fillStyle = '#f5f0e0';
      x.fillRect(0, 0, w, h);
      x.fillStyle = 'rgba(80,80,80,0.08)';
      for (let i = 0; i < 8; i++) {
        x.beginPath();
        x.moveTo(0, 100 + i * 80);
        for (let j = 0; j <= w; j += 20) x.lineTo(j, 80 + i * 80 + Math.sin(j * 0.01 + i) * 30);
        x.lineTo(w, h);
        x.lineTo(0, h);
        x.fill();
      }
      x.strokeStyle = 'rgba(180,40,40,0.7)';
      x.lineWidth = 6;
      x.strokeRect(30, 30, w - 60, h - 60);
      x.fillStyle = '#1a1a1a';
      x.font = 'bold 80px "Noto Serif SC",serif';
      x.textAlign = 'center';
      x.fillText('墨', w / 2, 200);
      x.fillText('韵', w / 2, 340);
      x.fillText('文', w / 2, 480);
      x.fillText('档', w / 2, 620);
      x.fillStyle = 'rgba(180,40,40,0.8)';
      x.font = 'bold 36px serif';
      x.fillText('点击', w / 2, 720);
    },
  },
  {
    key: 'isLink8',
    size: [2, 1],
    pos: [0, 2.5, 10.7],
    rotY: 0,
    emissive: '#00ffc8',
    ei: 0.4,
    light: ['#00ffc8', 3, 5],
    draw(x, w, h) {
      // 全息投影
      x.fillStyle = 'rgba(0,20,40,0.3)';
      x.fillRect(0, 0, w, h);
      x.strokeStyle = 'rgba(0,255,200,0.1)';
      x.lineWidth = 1;
      for (let i = 0; i < h; i += 3) {
        x.beginPath();
        x.moveTo(0, i);
        x.lineTo(w, i);
        x.stroke();
      }
      x.strokeStyle = 'rgba(0,255,200,0.6)';
      x.lineWidth = 3;
      x.strokeRect(40, 40, w - 80, h - 80);
      x.fillStyle = '#00ffc8';
      x.fillRect(30, 30, 40, 5);
      x.fillRect(30, 30, 5, 40);
      x.fillRect(w - 70, 30, 40, 5);
      x.fillRect(w - 35, 30, 5, 40);
      x.fillRect(30, h - 35, 40, 5);
      x.fillRect(30, h - 70, 5, 40);
      x.fillRect(w - 70, h - 35, 40, 5);
      x.fillRect(w - 35, h - 70, 5, 40);
      x.shadowBlur = 20;
      x.shadowColor = '#00ffc8';
      x.fillStyle = '#00ffc8';
      x.font = 'bold 80px "Courier New",monospace';
      x.textAlign = 'center';
      x.fillText('HOLO DOC', w / 2, 200);
      x.font = '48px "Courier New",monospace';
      x.fillStyle = '#00c8a0';
      x.fillText('全息档案访问', w / 2, 310);
      x.font = '36px Arial';
      x.fillStyle = '#80ffd0';
      x.fillText('点击进入', w / 2, 400);
      x.shadowBlur = 0;
      x.fillStyle = 'rgba(0,255,200,0.2)';
      for (let i = 0; i < 20; i++) {
        x.fillRect(
          50 + Math.random() * (w - 100),
          50 + Math.random() * (h - 100),
          2,
          20 + Math.random() * 50
        );
      }
    },
  },
  {
    key: 'isLink9',
    size: [0.5, 0.75],
    pos: [-11, 2.5, -11],
    rotY: 0,
    emissive: '#3c9664',
    ei: 0.2,
    light: ['#3c9664', 1.5, 3],
    draw(x, w, h) {
      // 翡翠玉佩
      x.fillStyle = 'rgba(60,150,100,0.8)';
      x.beginPath();
      x.ellipse(128, 160, 80, 120, 0, 0, Math.PI * 2);
      x.fill();
      x.strokeStyle = 'rgba(200,220,180,0.6)';
      x.lineWidth = 4;
      x.beginPath();
      x.ellipse(128, 160, 80, 120, 0, 0, Math.PI * 2);
      x.stroke();
      x.strokeStyle = 'rgba(200,220,180,0.3)';
      x.lineWidth = 1;
      for (let i = -60; i <= 60; i += 15) {
        x.beginPath();
        x.ellipse(128, 160, Math.abs(i) * 1.2, Math.abs(i) * 1.6, 0, 0, Math.PI * 2);
        x.stroke();
      }
      x.fillStyle = 'rgba(255,250,220,0.9)';
      x.font = 'bold 36px "Noto Serif SC",serif';
      x.textAlign = 'center';
      x.fillText('翠', 128, 130);
      x.fillText('玉', 128, 180);
      x.strokeStyle = 'rgba(180,160,100,0.7)';
      x.lineWidth = 3;
      x.beginPath();
      x.moveTo(128, 40);
      x.lineTo(128, 0);
      x.stroke();
      x.fillStyle = 'rgba(180,160,100,0.7)';
      x.beginPath();
      x.arc(128, 35, 6, 0, Math.PI * 2);
      x.fill();
    },
  },
  {
    key: 'isLink10',
    size: [0.5, 0.75],
    pos: [11, 2.5, -11],
    rotY: 0,
    emissive: '#c82828',
    ei: 0.25,
    light: ['#c82828', 1.5, 3],
    draw(x, w, h) {
      // 红灯笼
      x.fillStyle = 'rgba(200,40,40,0.85)';
      x.beginPath();
      x.moveTo(128, 60);
      x.bezierCurveTo(200, 60, 220, 120, 200, 180);
      x.bezierCurveTo(220, 240, 200, 300, 128, 300);
      x.bezierCurveTo(56, 300, 36, 240, 56, 180);
      x.bezierCurveTo(36, 120, 56, 60, 128, 60);
      x.fill();
      x.strokeStyle = 'rgba(180,160,80,0.6)';
      x.lineWidth = 3;
      x.stroke();
      x.strokeStyle = 'rgba(180,160,80,0.3)';
      x.lineWidth = 1;
      x.beginPath();
      x.moveTo(128, 60);
      x.lineTo(128, 300);
      x.stroke();
      x.beginPath();
      x.moveTo(60, 120);
      x.quadraticCurveTo(128, 140, 196, 120);
      x.stroke();
      x.beginPath();
      x.moveTo(56, 180);
      x.quadraticCurveTo(128, 200, 200, 180);
      x.stroke();
      x.beginPath();
      x.moveTo(60, 240);
      x.quadraticCurveTo(128, 260, 196, 240);
      x.stroke();
      x.strokeStyle = 'rgba(180,160,80,0.7)';
      x.lineWidth = 2;
      for (let i = 108; i <= 148; i += 10) {
        x.beginPath();
        x.moveTo(i, 300);
        x.lineTo(i + 5, 340);
        x.stroke();
      }
      x.fillStyle = 'rgba(255,220,100,0.9)';
      x.font = 'bold 40px "Noto Serif SC",serif';
      x.textAlign = 'center';
      x.fillText('福', 128, 200);
    },
  },
  {
    key: 'isLink11',
    size: [0.75, 0.5],
    pos: [-11, 2.5, -3],
    rotY: Math.PI / 6,
    emissive: '#f0e6d2',
    ei: 0.15,
    light: ['#f0e6d2', 1.5, 3],
    draw(x, w, h) {
      // 折扇
      x.fillStyle = 'rgba(240,230,210,0.9)';
      x.beginPath();
      x.moveTo(50, 220);
      x.quadraticCurveTo(192, 20, 334, 220);
      x.closePath();
      x.fill();
      x.strokeStyle = 'rgba(100,60,40,0.6)';
      x.lineWidth = 3;
      x.stroke();
      x.strokeStyle = 'rgba(100,60,40,0.4)';
      x.lineWidth = 1;
      for (let i = 0; i <= 12; i++) {
        const a = 0.3 + (i / 12) * 0.7;
        x.beginPath();
        x.moveTo(50, 220);
        x.lineTo(192 - Math.cos(a) * 140, 220 - Math.sin(a) * 140);
        x.stroke();
      }
      x.fillStyle = 'rgba(200,80,80,0.7)';
      x.font = '30px serif';
      x.textAlign = 'center';
      x.fillText('❀', 160, 140);
      x.fillText('❀', 220, 170);
      x.fillText('❀', 180, 110);
      x.fillStyle = 'rgba(60,40,20,0.8)';
      x.font = 'bold 28px "Noto Serif SC",serif';
      x.textAlign = 'center';
      x.fillText('雅集', 192, 200);
    },
  },
  {
    key: 'isLink12',
    size: [0.6, 0.6],
    pos: [11, 2.2, -3],
    rotY: -Math.PI / 6,
    emissive: '#8c7850',
    ei: 0.15,
    light: ['#8c7850', 1.5, 3],
    draw(x, w, h) {
      // 古铜钱
      x.fillStyle = 'rgba(140,120,80,0.9)';
      x.beginPath();
      x.arc(128, 128, 100, 0, Math.PI * 2);
      x.fill();
      x.strokeStyle = 'rgba(180,160,100,0.5)';
      x.lineWidth = 3;
      x.stroke();
      x.fillStyle = 'rgba(40,30,20,0.9)';
      x.fillRect(108, 108, 40, 40);
      x.fillStyle = 'rgba(60,45,25,0.8)';
      x.font = 'bold 24px "Noto Serif SC",serif';
      x.textAlign = 'center';
      x.fillText('文', 128, 80);
      x.fillText('档', 128, 190);
      x.fillText('金', 80, 140);
      x.fillText('库', 176, 140);
      for (let i = 0; i < 20; i++) {
        x.fillStyle = `rgba(${80 + Math.random() * 40},${60 + Math.random() * 30},${30 + Math.random() * 20},0.3)`;
        x.beginPath();
        x.arc(
          60 + Math.random() * 136,
          60 + Math.random() * 136,
          3 + Math.random() * 6,
          0,
          Math.PI * 2
        );
        x.fill();
      }
    },
  },
  {
    key: 'isLink13',
    size: [1, 0.5],
    pos: [-1.5, 3.2, 3],
    rotY: Math.PI,
    emissive: '#d2c4a8',
    ei: 0.1,
    light: ['#d2c4a8', 1.5, 3],
    draw(x, w, h) {
      // 祥云纹
      x.fillStyle = 'rgba(200,180,160,0.2)';
      x.fillRect(0, 0, w, h);
      function drawCloud(cx, cy, scale, color) {
        x.fillStyle = color;
        x.beginPath();
        x.arc(cx - 30 * scale, cy, 20 * scale, 0, Math.PI * 2);
        x.arc(cx + 10 * scale, cy - 15 * scale, 25 * scale, 0, Math.PI * 2);
        x.arc(cx + 40 * scale, cy, 22 * scale, 0, Math.PI * 2);
        x.arc(cx, cy + 10 * scale, 30 * scale, 0, Math.PI * 2);
        x.fill();
      }
      drawCloud(120, 100, 1.2, 'rgba(220,200,180,0.5)');
      drawCloud(280, 130, 1.5, 'rgba(200,180,160,0.4)');
      drawCloud(400, 90, 1, 'rgba(230,210,190,0.3)');
      x.strokeStyle = 'rgba(180,150,100,0.6)';
      x.lineWidth = 2;
      x.beginPath();
      x.moveTo(40, 150);
      x.quadraticCurveTo(150, 80, 256, 140);
      x.quadraticCurveTo(360, 100, 472, 150);
      x.stroke();
      x.fillStyle = 'rgba(100,60,40,0.85)';
      x.font = 'bold 36px "Noto Serif SC",serif';
      x.textAlign = 'center';
      x.fillText('祥云', 256, 180);
      x.font = '24px serif';
      x.fillText('文档', 256, 215);
    },
  },
];

export function buildIcons(s, iG) {
for (const cfg of ICON_CFG) {
  const mat = makePlane(512, 768, cfg.draw, cfg.emissive, cfg.ei);
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(cfg.size[0], cfg.size[1]), mat);
  mesh.position.set(cfg.pos[0], cfg.pos[1], cfg.pos[2]);
  mesh.rotation.y = cfg.rotY;
  s.add(mesh);
  decoLight(cfg.light[0], cfg.light[1], cfg.light[2], [
    cfg.pos[0] - 0.2,
    cfg.pos[1],
    cfg.pos[2] - 0.2,
  ], s);
  mesh.userData = { [cfg.key]: true };
  iG.push(mesh);
}

}
