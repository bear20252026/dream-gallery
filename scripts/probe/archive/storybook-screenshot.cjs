// storybook-screenshot.cjs — 截取 storybook GLB 渲染效果(一次性)
const http=require('http'),fs=require('fs'),path=require('path');
const {launch}=require('./browser.js');
const root=path.resolve(__dirname,'..','..','dev','kimi-planets');
const mime={'.html':'text/html','.js':'text/javascript','.glb':'model/gltf-binary'};
const srv=http.createServer((req,res)=>{
  let f=path.join(root,decodeURIComponent(req.url.split('?')[0]));
  fs.readFile(f,(e,d)=>{if(e){res.writeHead(404);res.end();return}res.writeHead(200,{'Content-Type':mime[path.extname(f)]||'application/octet-stream'});res.end(d)});
});
srv.listen(8882,async()=>{
  const b=await launch(),p=await b.newPage({viewport:{width:1280,height:800}});
  await p.goto('http://localhost:8882/storybook-test.html?src=storybook-pbr.glb',{waitUntil:'domcontentloaded',timeout:60000});
  await p.waitForTimeout(18000);
  await p.screenshot({path:path.resolve(__dirname,'..','artifacts','storybook-render.png')});
  console.log('screenshot saved');
  await b.close();srv.close();process.exit(0);
});
