// ctx-alias-codemod.js — 一次性代号机:把指定目录里 ctx.<prop> 扁平访问改写为 ctx.<NS>.<prop>
// 用法: node scripts/gen/ctx-alias-codemod.js <目录> <kunlun|ui|player|all> [--dry]
// 安全:按标识符词边界替换,只动映射表内的属性;映射表与 ctx.js 别名层一一对应。
const fs = require('fs');
const path = require('path');

const MAPS = {
  ui: ['modeToast', 'kunlunSpeak'],
  kunlun: ['flightLock', 'eternalHandlers', 'eternalClick', 'eternalTeleport', 'eternalWelcome',
    'eternalKeepOut', 'groundOverride', 'arkTeleportToPeak', 'letgoRecall', 'peakVidEl', 'flyAudio',
    'spiritsGot', 'isDone', 'spiritMark', 'spiritsTTS', 'spiritsState', 'checkSkyMs', 'fadeTeleport'],
  player: ['pl', 'jD', 'ks', 'mv', 'drM', 'viewMode', 'quizPassed', 'quizPassScore'],
  scene: ['s', 'cam', 'rnd', 'ray', 'mP2', 'iG', 'tL', 'loadTexCapped', 'bounds',
    'WH', 'OL', 'OR', 'OT', 'OBE', 'OBR', 'IL', 'IR', 'IRT', 'IRB', 'floorW', 'floorD', 'bW', 'bD',
    'pyrHeight', 'groundUniforms', 'skyUniforms', 'pls', 'ambL', 'hemiL', 'L', 'jT', 'jB', 'aB', 'avatar'],
  media: ['vidEl', 'v45El', 'vidTex', 'v45Tex', 'vidMesh', 'v45Mesh', 'drawMusicCanvas', 'bigScreenHold',
    'desert', 'dayHour', 'updateFireworks', 'pG', 'pC', 'signMesh', 'signMat', 'wb', 'mpMesh', 'mpMat', 'guideMesh',
    'ytHeart', 'scrollLink', 'mA'],
  gallery: ['paintGroups', 'onC3D', 'zoomOut', 'zG', 'hangOne', 'houseMats', 'openHouseColor'],
  mode: ['siteMode', 'demoPhotos', 'myUploads', 'myLinks', 'customLinks', 'myUploadTokens', 'myCaptions',
    'applyPaintMode', 'applyMode', 'refreshMode', 'texAllowed', 'linkGuard', 'spawnLinkModel', 'trackClick',
    'LINK_MODEL_TYPES', 'MOUNTABLE_ICONS', 'openUpload'],
};

const dir = process.argv[2];
const which = process.argv[3] || 'all';
const dry = process.argv.includes('--dry');
if (!dir) { console.error('用法: node scripts/gen/ctx-alias-codemod.js <目录> <kunlun|ui|player|all> [--dry]'); process.exit(1); }

const nsList = which === 'all' ? Object.keys(MAPS) : [which];
let totalFiles = 0, totalHits = 0;
for (const ns of nsList) {
  for (const prop of MAPS[ns]) {
    const re = new RegExp('\\bctx\\.' + prop + '\\b', 'g');
    for (const f of fs.readdirSync(dir)) {
      if (!f.endsWith('.js')) continue;
      const base = path.resolve(dir);
      const p = `${base}${path.sep}${f}`; // 与 join 等价(dir/f 均无路径分隔符),只处理目录直接子文件
      const src = fs.readFileSync(p, 'utf8');
      const out = src.replace(re, 'ctx.' + ns + '.' + prop);
      if (out !== src) {
        const hits = (src.match(re) || []).length;
        totalHits += hits; totalFiles++;
        console.log(`${dry ? '[dry] ' : ''}${f}: ctx.${prop} ×${hits} → ctx.${ns}.${prop}`);
        if (!dry) fs.writeFileSync(p, out);
      }
    }
  }
}
console.log(`\n共改写 ${totalHits} 处(涉及 ${totalFiles} 个文件-属性组合)${dry ? '(演练,未落盘)' : ''}`);
