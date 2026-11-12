// worldvoice-probe.cjs — 世界观文案统一实机验收(2026-11-12)
// 背景:项目曾叠两套世界观(昆仑/女娲补天 与 小王子/B612)。3D 玩法层早已收口,
// 但文案层仍是女娲语汇(天穹/裂痕/缝合/答对的题),玩家在小王子沙漠里读补天叙事。
// 本探针钉死"玩家真的看到统一后的文案",不是"代码里改了字符串":
//   ① 罗盘菜单:星图 / 六颗星(不再是天穹/六星屑)
//   ② 星图页:标题、进度读数、副标题无补天词汇;统计行不再列已搁置的答题玩法
//   ③ 成就页:徽章名与星球名同源,无昆仑语汇
//   ④ 聊天机器人署名 = B612之灵(与界面教的召唤词一致)
//   ⑤ 全程零 pageerror
// 数据根隔离:自起 server.js 并打 GATE_DATA_FILE 到临时目录(项目铁律)。
const fs=require('fs'),path=require('path'),os=require('os');
const {spawn}=require('child_process');
const { launch } = require('./browser.js');
const ROOT = path.resolve(__dirname, '../..');const TMP=fs.mkdtempSync(path.join(os.tmpdir(),'dg-voice-'));
const PORT = Number(process.env.VOICE_PORT || 3295);
const BASE = 'http://localhost:' + PORT;
let child=null,browser=null,pass=0,fail=0;
const ok=(c,n)=>{if(c){pass++;console.log('  ✓ '+n);}else{fail++;console.error('  ✗ '+n);}};
const cleanup=()=>{try{browser&&browser.close();}catch(e){}try{child&&child.kill();}catch(e){}try{fs.rmSync(TMP,{recursive:true,force:true});}catch(e){}};
process.on('exit',cleanup);
(async()=>{
child=spawn(process.execPath,['server.js'],{cwd:ROOT,env:{...process.env,PORT: String(PORT),USE_SQLITE:'0',GATE_DATA_FILE:path.join(TMP,'g.json')},stdio:['ignore','pipe','pipe']});
await new Promise((r,j)=>{const t=setTimeout(()=>j(new Error('srv timeout')),20000);child.stdout.on('data',d=>{if(d.toString().includes('服务器已启动')){clearTimeout(t);r();}});child.once('error',j);});
browser=await launch();const p=await browser.newPage({viewport:{width:1280,height:800}});
const errs=[];p.on('pageerror',e=>errs.push(e.message));
await p.addInitScript(()=>{localStorage.setItem('b612GateEntered','1');localStorage.setItem('scriptLang','zh');sessionStorage.setItem('agreementConsented','1');sessionStorage.setItem('privacyConsented','1');sessionStorage.setItem('communityConsented','1');});
await p.goto(BASE + '/?av=0',{waitUntil:'domcontentloaded',timeout:90000});
await p.waitForFunction(()=>window.__ctx&&window.__ctx.store,null,{timeout:90000});
await p.waitForSelector('#b612Gate',{timeout:60000});
await p.evaluate(()=>{const c=document.getElementById('gAgreeChk');if(c){c.checked=true;c.dispatchEvent(new Event('change',{bubbles:true}));}const e=document.querySelector('.gEnter');if(e)e.click();});
await p.waitForTimeout(2000);
for(let i=0;i<3;i++){const s=await p.evaluate(()=>{const b=document.getElementById('fSkip')||document.querySelector('[id$="Skip"]');if(b){b.click();return true;}return false;});if(s)break;await p.keyboard.press('Escape');await p.waitForTimeout(1200);}
await p.waitForFunction(()=>!!document.getElementById('gmSky'),null,{timeout:90000});
console.log('\n[1] 罗盘菜单文案');
const menu=await p.evaluate(()=>({sky:document.getElementById('gmSky').textContent,stars:document.getElementById('gmSpirits').textContent,ach:document.getElementById('gmAchieve').textContent}));
ok(menu.sky.includes('星图')&&!menu.sky.includes('天穹'),'菜单入口为「星图」不再叫「天穹」: '+menu.sky);
ok(menu.stars.includes('六颗星'),'菜单为「六颗星」: '+menu.stars);
console.log('\n[2] 星图页文案(注入进度后)');
await p.evaluate(()=>{const st=window.__ctx.store;st.setNum('up',6);st.setNum('wishN',2);});
await p.evaluate(()=>document.getElementById('gmSky').click());
await p.waitForTimeout(900);
const sky=await p.evaluate(()=>({tx:document.getElementById('skyTx')?document.getElementById('skyTx').textContent:'',sub:document.getElementById('skySub')?document.getElementById('skySub').textContent:'',stats:document.getElementById('skyStats')?document.getElementById('skyStats').textContent:'',title:document.getElementById('skyPageTitle')?document.getElementById('skyPageTitle').textContent:''}));
console.log('   实际:',JSON.stringify(sky));
ok(sky.title.includes('星图'),'三级页标题为「星图」');
ok(!/天穹|裂痕|缝合|愈合/.test(sky.tx+sky.sub),'标题/副标题无补天词汇');
ok(sky.tx.includes('已点亮'),'进度读数为「已点亮 x/100」');
ok(!sky.stats.includes('答对'),'统计行不再列已关闭的答题玩法');
ok(sky.stats.includes('上传')&&sky.stats.includes('一念'),'统计行列上传与一念');
console.log('\n[3] 成就页文案');
await p.keyboard.press('Escape');await p.waitForTimeout(300);
await p.evaluate(()=>document.getElementById('gmAchieve').click());
await p.waitForTimeout(600);
const ach=await p.evaluate(()=>[...document.querySelectorAll('#achList > div')].map(r=>r.children[1].children[0].textContent));
console.log('   徽章名:',ach.join(' / '));
ok(!ach.some(n=>/春生之芽|夏炽之焰|六合归位|补天者/.test(n)),'成就名无昆仑语汇');
ok(ach.some(n=>n.includes('国王之星')),'成就名与星球名同源(国王之星)');
console.log('\n[4] 机器人署名');
const botName=await p.evaluate(async()=>{const m=await import('/src/shared/chat-words.mjs');return m.BOT_NAME;});
ok(botName==='B612之灵','机器人署名为 B612之灵,实际: '+botName);
ok(errs.length===0,'全程零 pageerror('+errs.length+')'+(errs.length?': '+errs.slice(0,2).join('|'):''));
console.log('\n结果: '+pass+' 通过, '+fail+' 失败');
process.exit(fail?1:0);
})().catch(e=>{console.error('执行失败:',e.message);process.exit(1);});
