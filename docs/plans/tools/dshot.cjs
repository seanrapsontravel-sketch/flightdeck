// usage: GAME=derby node dshot.cjs <outdir> <script.json> [query]   (GAME=demolition once it exists; demo global is window.__<game>Demo)   script: [{wait:ms}|{force:'kind',extra}|{shot:'name'}|{eval:'js'}|{resume:1}]
const R='/Users/seanrapson/flightdeck-fork/';
const {chromium}=require(R+'node_modules/playwright');
const {startHost}=require(R+'tests/helpers.cjs');
const fs=require('fs');
const GAME=process.env.GAME||'derby';
(async()=>{
 const OUT=process.argv[2]; const steps=JSON.parse(fs.readFileSync(process.argv[3],'utf8'));
 const q=process.argv[4]||'demo=1&seed=5&players=5';
 fs.mkdirSync(OUT,{recursive:true});
 const host=await startHost();
 const b=await chromium.launch({args:['--enable-gpu','--use-angle=metal','--ignore-gpu-blocklist','--enable-unsafe-swiftshader']});
 const ctx=await b.newContext({ignoreHTTPSErrors:true,viewport:{width:1920,height:1080}});
 const page=await ctx.newPage();
 const logs=[];page.on('console',m=>{if(['error','warning','info'].includes(m.type()))logs.push(m.type()+': '+m.text())});page.on('pageerror',e=>logs.push('PAGEERROR: '+e.message));
 await page.goto(host.base+'/games/'+GAME+'.html?'+q);
 await page.waitForTimeout(4000);
 for(const s of steps){
  if(s.wait)await page.waitForTimeout(s.wait);
  if(s.force)await page.evaluate(([g,k,e])=>window['__'+g+'Demo'].force(k,e),[GAME,s.force,s.extra||{}]);
  if(s.resume)await page.evaluate(g=>window['__'+g+'Demo'].resume(),GAME);
  if(s.eval)console.log('eval:',JSON.stringify(await page.evaluate(s.eval)));
  if(s.shot)await page.screenshot({path:`${OUT}/${s.shot}.png`});
 }
 const fps=await page.evaluate(()=>new Promise(r=>{let n=0,t0=performance.now();function f(){n++;if(performance.now()-t0<2000)requestAnimationFrame(f);else r(n/2)}requestAnimationFrame(f)}));
 console.log('fps',fps,'dpr',await page.evaluate(g=>{const w=window['__'+g];return w&&w.engine&&w.engine.dpr},GAME));
 console.log(logs.slice(0,30).join('\n'));
 await b.close();await host.stop();
})().catch(e=>{console.error(e);process.exit(1)});
