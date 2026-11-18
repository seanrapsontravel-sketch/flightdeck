// usage: node dcap.cjs <outdir> <steps.json> <page> [query]
// Headless capture for the 3D games. page e.g. games/demolition-3d.html. Steps:
//   {wait:ms} {eval:'js'} {shot:'name'} {step:n, dt?:s}  (step drives ?capture=1 pages via window.__<game>.step)
//   {video:'name', frames:n, fps:60, eval?:'js run before each frame'}  → <outdir>/<name>.mp4 via ffmpeg
const R='/Users/seanrapson/flightdeck-fork/';
const {chromium}=require(R+'node_modules/playwright');
const {startHost}=require(R+'tests/helpers.cjs');
const fs=require('fs'),path=require('path'),{execFileSync}=require('child_process');
(async()=>{
 const [OUT,stepsFile,pageP,q='']=process.argv.slice(2);
 const steps=JSON.parse(fs.readFileSync(stepsFile,'utf8'));
 const G=process.env.GLOBAL||'__demolition';
 fs.mkdirSync(OUT,{recursive:true});
 const host=await startHost();
 const b=await chromium.launch({args:['--enable-gpu','--use-angle=metal','--ignore-gpu-blocklist','--enable-unsafe-swiftshader']});
 const ctx=await b.newContext({ignoreHTTPSErrors:true,viewport:{width:1920,height:1080}});
 const page=await ctx.newPage();
 const logs=[];page.on('console',m=>{if(['error','warning'].includes(m.type()))logs.push(m.type()+': '+m.text())});page.on('pageerror',e=>logs.push('PAGEERROR: '+e.message));
 await page.goto(host.base+'/'+pageP+(q?'?'+q:''));
 await page.waitForFunction(g=>!!window[g],G,{timeout:30000}).catch(()=>logs.push('global '+G+' never appeared'));
 await page.waitForTimeout(1500);
 for(const s of steps){
  if(s.wait)await page.waitForTimeout(s.wait);
  if(s.eval)console.log('eval:',JSON.stringify(await page.evaluate(s.eval)));
  if(s.step)await page.evaluate(([g,n,dt])=>window[g].step(n,dt),[G,s.step,s.dt||1/60]);
  if(s.shot)await page.screenshot({path:`${OUT}/${s.shot}.png`});
  if(s.video){
   const dir=fs.mkdtempSync(path.join(OUT,'f-'));const fps=s.fps||60;
   for(let i=0;i<s.frames;i++){
    if(s.each)await page.evaluate(s.each);
    await page.evaluate(([g,dt])=>window[g].step(1,dt),[G,1/fps]);
    await page.screenshot({path:`${dir}/${String(i).padStart(5,'0')}.jpg`,type:'jpeg',quality:92});
   }
   execFileSync('ffmpeg',['-y','-loglevel','error','-framerate',String(fps),'-i',`${dir}/%05d.jpg`,'-c:v','libx264','-pix_fmt','yuv420p','-crf','18','-preset','slow',`${OUT}/${s.video}.mp4`]);
   fs.rmSync(dir,{recursive:true});
   console.log('video',`${OUT}/${s.video}.mp4`);
  }
 }
 if(!q.includes('capture')){
  const fps=await page.evaluate(()=>new Promise(r=>{let n=0,t0=performance.now();function f(){n++;if(performance.now()-t0<3000)requestAnimationFrame(f);else r(n/3)}requestAnimationFrame(f)}));
  console.log('fps',fps,'dpr',await page.evaluate(g=>window[g]&&window[g].engine&&window[g].engine.dpr,G));
 }
 console.log(logs.slice(0,40).join('\n'));
 await b.close();await host.stop();
})().catch(e=>{console.error(e);process.exit(1)});
