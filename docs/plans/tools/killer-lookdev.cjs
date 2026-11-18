// Killer look-dev deliverables: 8 stills (1920×1080), a contact sheet, a 20 s fixed-step clip of a real visit and its
// filmstrip. Seeded, fake clock. usage: node docs/plans/tools/killer-lookdev.cjs docs/plans/killer-lookdev
const R='/Users/seanrapson/flightdeck-fork/';
const {chromium}=require(R+'node_modules/playwright');const {startHost}=require(R+'tests/helpers.cjs');
const fs=require('fs'),path=require('path'),{execFileSync}=require('child_process');
(async()=>{
 const OUT=process.argv[2];fs.mkdirSync(OUT,{recursive:true});
 const host=await startHost();
 const b=await chromium.launch({args:['--enable-gpu','--use-angle=metal','--ignore-gpu-blocklist','--enable-unsafe-swiftshader']});
 const logs=[];
 async function open(q='capture=1&dpr=1&demo=1&players=4&seed=3'){
  const ctx=await b.newContext({ignoreHTTPSErrors:true,viewport:{width:1920,height:1080}});
  await ctx.addInitScript(()=>{let s=0x9e3779b9;Math.random=()=>{s|=0;s=(s+0x6d2b79f5)|0;let t=Math.imul(s^(s>>>15),1|s);t=(t+Math.imul(t^(t>>>7),61|t))^t;return((t^(t>>>14))>>>0)/4294967296;};});
  const page=await ctx.newPage();page.on('pageerror',e=>logs.push('PAGEERROR '+e.message));page.on('console',m=>{if(['error','warning'].includes(m.type()))logs.push(m.type()+' '+m.text())});
  const T0=new Date('2026-11-18T12:00:00Z').getTime();await page.clock.install({time:T0});await page.clock.pauseAt(T0+1000);
  await page.goto(host.base+'/games/killer.html?'+q);
  for(let i=0;i<300&&!(await page.evaluate(()=>!!(window.__killer&&window.__killerDemo)));i++)await new Promise(r=>setTimeout(r,100));
  const step=async n=>{for(let i=0;i<n;i++){await page.clock.runFor(1000/60);await page.evaluate(()=>__killer.step(1,1/60));}};
  return {ctx,page,step};
 }
 const shot=async(page,name)=>page.screenshot({path:`${OUT}/${name}.png`});
 const hold=(page,name,p)=>page.evaluate(([n,p])=>{const D=__killer.director;const P={};for(const k in p)P[k]=k==='agent'?__killer.agents[p[k]]:p[k];D.shot={name:n,t:0,p:P};D.snap=true;D.set=()=>{};},[name,p]);
 // mid-game state: a killer, marks, an out player
 const midgame=(round)=>`(()=>{const d=__killerDemo;d.pause();d.set(0,{isKiller:true,killerMarks:3,lives:3});d.set(1,{killerMarks:2,lives:2});d.set(2,{killerMarks:0,lives:-1});d.set(3,{killerMarks:1,lives:1,round:${round}});})()`;
 for(const [name,round] of [['1-master-round1',1],['2-master-round8',8],['3-master-round11',11]]){
  const {ctx,page,step}=await open();await step(260);await page.evaluate(midgame(round));await step(240);await hold(page,'master',{});await step(2);await shot(page,name);await ctx.close();
 }
 {const {ctx,page,step}=await open();await step(260);await page.evaluate(midgame(8));await step(60);await hold(page,'agent',{agent:0});await step(90);await shot(page,'4-agent');await ctx.close();}
 {const {ctx,page,step}=await open();await step(260);await page.evaluate(()=>__killerDemo.force('death'));await step(54+8);await shot(page,'5-dartcam');await step(80);await shot(page,'8-death');await ctx.close();}
 {const {ctx,page,step}=await open();await step(260);await page.evaluate(()=>__killerDemo.force('boost'));await step(54);await hold(page,'wedge',{n:6});await step(50);await shot(page,'6-wedge-fill');await ctx.close();}
 {const {ctx,page,step}=await open();await step(260);await page.evaluate(()=>__killerDemo.force('became'));await step(54+14+85);await shot(page,'7-became-killer');await ctx.close();}
 // the clip: a real visit (mark → killer, strike, kill), 20 s at 60 fps
 {const {ctx,page,step}=await open();await step(260);await page.evaluate(()=>__killerDemo.force('visit'));
  const dir=fs.mkdtempSync(path.join(OUT,'f-'));
  for(let i=0;i<1200;i++){await step(1);await page.screenshot({path:`${dir}/${String(i).padStart(5,'0')}.jpg`,type:'jpeg',quality:90});}
  execFileSync('ffmpeg',['-y','-loglevel','error','-framerate','60','-i',`${dir}/%05d.jpg`,'-c:v','libx264','-pix_fmt','yuv420p','-crf','18','-preset','slow',`${OUT}/killer-lookdev-visit.mp4`]);
  // a filmstrip of the clip for review
  execFileSync('ffmpeg',['-y','-loglevel','error','-i',`${OUT}/killer-lookdev-visit.mp4`,'-vf','fps=0.8,scale=480:270,tile=4x4','-frames:v','1',`${OUT}/visit-filmstrip.jpg`]);
  fs.rmSync(dir,{recursive:true});await ctx.close();}
 console.log(logs.slice(0,20).join('\n')||'no console errors');
 await b.close();await host.stop();
})().catch(e=>{console.error(e);process.exit(1)});
