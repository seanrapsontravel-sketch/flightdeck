const R='/Users/seanrapson/flightdeck-fork/';
const {chromium}=require(R+'node_modules/playwright');
const {startHost}=require(R+'tests/helpers.cjs');
const OUT=process.argv[2]; const q=process.argv[3]||'';
(async()=>{
 require('fs').mkdirSync(OUT,{recursive:true});
 const host=await startHost();
 const b=await chromium.launch({args:['--enable-gpu','--use-angle=metal','--ignore-gpu-blocklist']});
 const op=await b.newContext({ignoreHTTPSErrors:true});
 const cookie=await host.pair();
 await op.addCookies([{name:'fd_device',value:cookie.split('=')[1],url:host.base,secure:true,httpOnly:true,sameSite:'Strict'}]);
 const page=await op.newPage(); await page.goto(host.base+'/control'); await page.waitForTimeout(1500);
 const act=async a=>{await page.evaluate(a=>sendAction(a),a);await page.waitForTimeout(120);};
 const state=()=>page.evaluate(()=>lastKnownControlState);
 for(const n of ['Alice','Ben','Chloe'])await act({action:'ADD_PLAYER',name:n});
 await act({action:'FILL_LINEUP'});
 await act({action:'SAVE_VENUE_CONFIG',patch:{viewerVideoEnabled:false}});
 const tvc=await b.newContext({ignoreHTTPSErrors:true,viewport:{width:1920,height:1080}});
 const tv=await tvc.newPage(); const errs=[];
 tv.on('pageerror',e=>errs.push('pageerror '+e.message)); tv.on('console',m=>{if(m.type()==='error')errs.push(m.text())});
 await tv.goto(host.base+'/viewer'+q);
 await act({action:'NAVIGATE',screen:'GAME_SELECTION'}); await act({action:'SELECT_GAME',gameType:'derby'});
 await tv.waitForTimeout(6000);
 console.log('frame src', await tv.locator('#gameFrame').getAttribute('src'));
 await tv.screenshot({path:`${OUT}/0-start.png`});
 let shots=1, champ=(await state()).gameData.players[0].id;
 for(let i=0;i<80;i++){
  const g=(await state()).gameData;
  if(['winner','draw'].includes(g.phase.type))break;
  if(g.phase.type!=='playing'||g.throwsThisTurn>=3){await act({action:'BOARD_COMMAND',command:'RESET_PHASE'});await page.waitForTimeout(500);continue;}
  const p=g.players[g.activeIdx];
  const other=g.players.find(o=>o.id!==p.id);
  const spec=p.id===champ?{number:p.targetNumber,multiplier:i%2?3:2}:(i%3===0?{number:g.players.find(o=>o.id===champ).targetNumber,multiplier:1}:{miss:true});
  await act({action:'FORWARD_GAME_ACTION',payload:{type:'TRIGGER_SPECIFIC_THROW',...spec}});
  await tv.waitForTimeout(1800);
  if(shots<7&&p.id===champ){await tv.screenshot({path:`${OUT}/${shots++}-play.png`});}
 }
 await tv.waitForTimeout(3500);
 const g=(await state()).gameData; console.log('final phase',g.phase.type,g.players.map(p=>p.name+':'+p.score).join(' '));
 await tv.screenshot({path:`${OUT}/9-end.png`});
 const frameState=await tv.frames().find(f=>f.url().includes('/games/derby'))?.evaluate(()=>window.__derby&&window.__derby.race.runners.map(r=>r.name+':'+r.score+'@'+r.x.toFixed(1)));
 console.log('tv runners',JSON.stringify(frameState));
 console.log('errors',errs.length?errs.slice(0,10).join('\n'):'none');
 await b.close(); await host.stop();
})().catch(e=>{console.error(e);process.exit(1)});
