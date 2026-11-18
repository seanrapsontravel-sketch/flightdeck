const {test,expect}=require('@playwright/test');
const fs=require('node:fs');
const {startHost}=require('../helpers.cjs');
let host;
// the TV renders WebGL: give the browser the GPU, so this measures the real thing
test.use({launchOptions:{args:['--enable-gpu','--use-angle=metal','--ignore-gpu-blocklist','--enable-unsafe-swiftshader']}});
test.beforeEach(async()=>{process.env.ZEROHOUR_PACE='fast';host=await startHost();});
test.afterEach(async()=>{delete process.env.ZEROHOUR_PACE;if(host){await host.stop();fs.rmSync(host.dataDir,{recursive:true,force:true});host=null;}});

const PAGE='/games/zerohour.html';
const SEATS=['#e8edf2','#2f6fe0','#d8323c','#8a4fe0','#f08a24','#23b8c8']; // common.js SEAT_COLORS

async function pairAndStart(page,browser,names){
    await page.goto(host.base+'/control');
    await page.getByRole('heading',{name:'Pair this tablet'}).waitFor();
    await page.locator('input[name="code"]').fill(host.codes.operator);
    await page.locator('.fd-modal select').selectOption('operator');
    await page.getByRole('button',{name:'Pair device',exact:true}).click();
    await expect(page.locator('.fd-session-bar')).toContainText('Operator paired');
    const viewerContext=await browser.newContext({ignoreHTTPSErrors:true,viewport:{width:1920,height:1080}});
    const tv=await viewerContext.newPage();await tv.goto(host.base+'/viewer');
    const action=async a=>{await page.evaluate(a=>sendAction(a),a);await page.waitForTimeout(80);};
    const state=()=>page.evaluate(()=>lastKnownControlState);
    for(const name of names)await action({action:'ADD_PLAYER',name});
    await action({action:'FILL_LINEUP'});
    await action({action:'SAVE_VENUE_CONFIG',patch:{viewerVideoEnabled:false,dartCalloutMode:'off'}});
    await page.getByRole('button',{name:'Start timed session'}).click();
    await page.locator('#sessionMinutes').selectOption('60');await page.getByRole('button',{name:'Start session',exact:true}).click();
    await expect.poll(async()=>(await state()).session?.status).toBe('active');
    await page.locator('#tabSocial').click();await page.locator('.game-card[data-game="zerohour"]').click();await page.locator('#btnSelectionPlay').click();
    await expect.poll(async()=>(await state()).gameData?.gameType).toBe('zerohour');
    await expect(tv.locator('#gameFrame')).toHaveAttribute('src',/games\/zerohour\.html/);
    let frame=null;
    await expect.poll(async()=>{frame=tv.frames().find(f=>f.url().includes(PAGE));return !!frame&&await frame.evaluate(()=>!!(window.__zerohour&&window.__zerohour.game&&window.__zerohour.game.gd)).catch(()=>false);},{timeout:30000}).toBe(true);
    return {tv,viewerContext,action,state,frame};
}

/** what the TV shows must equal the engine's state: chips per number per seat, leader rims, the strip, the hot numbers */
async function lies(frame,state){
    const g=(await state()).gameData;
    const t=await frame.evaluate(()=>window.__zerohour.truth());
    if(!t||!t.settled)return 'unsettled '+JSON.stringify(t&&t.busy);
    const m=[];
    const want={};
    g.players.forEach((p,seat)=>{for(const d of p.drops||[]){const k=d.pocket+'|'+seat;want[k]=(want[k]||0)+d.chips;}});
    const keys=new Set([...Object.keys(want),...Object.keys(t.chips)]);
    for(const k of keys)if((want[k]||0)!==(t.chips[k]||0))m.push(`chips ${k}: ${t.chips[k]||0} vs ${want[k]||0}`);
    for(const c of g.zh.cells){
        const seat=c.leader!=null?g.players.findIndex(p=>p.id===c.leader):-1;
        const shown=t.cells[c.pocket].rim;
        if((seat>=0?SEATS[seat]:null)!==(shown?shown.toLowerCase():null))m.push(`rim ${c.pocket}: ${shown} vs seat ${seat}`);
    }
    const strip=await frame.evaluate(()=>[...document.querySelectorAll('.zh-card')].map(c=>({numbers:Number(c.dataset.numbers),chance:Number(c.dataset.chance),points:Number(c.dataset.points),led:c.querySelector('.zh-led').textContent,pts:c.querySelector('.zh-pts').textContent,fav:c.classList.contains('is-fav')})));
    g.zh.standings.forEach((s,i)=>{const c=strip[i];
        if(!c)return m.push('card missing '+i);
        if(c.numbers!==s.numbersLed||c.points!==s.total||Math.abs(c.chance-s.chancePct)>1e-9)m.push(`card ${i} ${JSON.stringify(c)} vs ${JSON.stringify(s)}`);
        if(!c.led.startsWith(String(s.numbersLed)+' ')||c.pts!==`${s.total} PTS`)m.push(`card ${i} text "${c.led}" "${c.pts}"`);
        if(c.fav!==(s.id===g.zh.favourite))m.push(`crown ${i}`);
    });
    if(g.phase.type==='playing'&&t.hot!==g.zh.hot.join(','))m.push(`hot ${t.hot} vs ${g.zh.hot}`);
    if(g.phase.type==='playing'&&t.boardHot.join(',')!==g.zh.hot.join(','))m.push(`board hot ${t.boardHot} vs ${g.zh.hot}`);
    if(t.round!==g.zh.round)m.push(`round ${t.round} vs ${g.zh.round}`);
    return m.join('; ');
}

// Zero Hour on the TV through the real server (fast pace). After every visit, once the TV has settled, what it shows
// must equal the server's state: every chip in its number and seat spot, every leader rim, every standings card and
// the crown, the hot numbers on the HUD and the board, the round. Then the spin: the ball comes to rest in the
// server's pocket, the reveal names it, and the winner's name and the placings are in the DOM.
test('Zero Hour on the TV shows the true table, standings and spin through a whole game',async({page,browser})=>{
    test.setTimeout(400000);
    const errors=[];page.on('pageerror',e=>errors.push(e.message));
    const {tv,viewerContext,state,frame,action}=await pairAndStart(page,browser,['Christopher & Maximilian','Ben','Chloe']);
    tv.on('pageerror',e=>errors.push('TV: '+e.message));
    tv.on('console',m=>{if(m.type()==='error')errors.push('TV console: '+m.text());});
    await expect(tv.frameLocator('#gameFrame').locator('.kit-intro-title')).toHaveText('Zero Hour');
    const ready=async()=>{await expect.poll(async()=>{const g=(await state()).gameData;return ['winner','spin'].includes(g.phase.type)||(g.phase.type==='playing'&&g.throwsThisTurn<3);},{timeout:30000}).toBe(true);
        await action({action:'BOARD_COMMAND',command:'RESET_PHASE'});};
    const dart=async(spec)=>{await ready();const g0=(await state()).gameData;const n0=g0.throwsThisTurn,idx=g0.activeIdx;
        await action({action:'FORWARD_GAME_ACTION',payload:{type:'TRIGGER_SPECIFIC_THROW',...spec}});
        await expect.poll(async()=>{const g=(await state()).gameData;return g.throwsThisTurn!==n0||g.phase.type!=='playing'||g.activeIdx!==idx;},{timeout:10000}).toBe(true);};
    let hotSeen=false;
    for(let v=0;v<15;v++){
        const hot=(await state()).gameData.zh.hot;
        const seat=v%3;
        // seat 0 throws hot trebles, seat 1 plain 20s, seat 2 a mix with a bull and a miss
        const darts=seat===0?[{number:hot[0],multiplier:3,sector:'T'+hot[0]},{number:hot[1],multiplier:1,sector:'s'+hot[1]},{number:5,multiplier:1,sector:'s5'}]
            :seat===1?[{number:20,multiplier:1,sector:'s20'},{number:20,multiplier:3,sector:'T20'},{number:1,multiplier:2,sector:'D1'}]
            :[{number:'bull',multiplier:2,sector:'Bull'},{miss:true},{number:hot[0],multiplier:1,sector:'S'+hot[0]}];
        for(const d of darts)await dart(d);
        if(v===0){const t=await frame.evaluate(()=>window.__zerohour.game.log.map(e=>e.e));hotSeen=t.includes('impact');}
        const g=(await state()).gameData;
        if(g.phase.type==='spin')break;
        await expect.poll(()=>lies(frame,state),{timeout:20000,intervals:[300]}).toBe('');
    }
    expect(hotSeen).toBe(true);
    await expect.poll(async()=>(await state()).gameData.phase.type,{timeout:15000}).toBe('spin');
    const sp=(await state()).gameData.zh.spin;
    // the reveal: the ball rests in the server's pocket, and the card names it
    await expect.poll(()=>frame.evaluate(()=>{const t=window.__zerohour.truth();return t.wheel.state==='settled'?t.wheel.under:null;}),{timeout:30000}).toBe(sp.pocket);
    await expect(tv.frameLocator('#gameFrame').locator('.zh-title-main')).toHaveText(`NUMBER ${sp.pocket}`,{timeout:20000});
    await expect.poll(async()=>(await state()).gameData.phase.type,{timeout:30000}).toBe('winner');
    const g=(await state()).gameData;
    await expect(tv.frameLocator('#gameFrame').locator('.zh-title-sub')).toContainText(g.phase.data.winnerName,{timeout:10000});
    await expect(tv.frameLocator('#gameFrame').locator('.zh-placings.is-on')).toBeVisible({timeout:10000});
    const rows=await tv.frameLocator('#gameFrame').locator('.zh-pl-row').evaluateAll(rs=>rs.map(r=>({place:Number(r.dataset.place),name:r.querySelector('.zh-pl-name').textContent})));
    const nameOf=id=>g.players.find(p=>p.id===id).name;
    expect(rows).toEqual(g.zh.placings.map(r=>({place:r.place,name:nameOf(r.id)})));
    expect(g.secret).toBeUndefined();
    expect(errors).toEqual([]);
    await viewerContext.close();
});

// A TV that joins mid-game (a refresh) builds the whole table at once, with no replay of the sweeps.
test('Zero Hour on the TV rebuilds the full table after a refresh',async({page,browser})=>{
    test.setTimeout(200000);
    const {tv,viewerContext,state,action}=await pairAndStart(page,browser,['Alice','Ben']);
    for(let v=0;v<4;v++){
        await expect.poll(async()=>{const g=(await state()).gameData;return g.phase.type==='playing'&&g.throwsThisTurn===0;},{timeout:30000}).toBe(true);
        for(let k=0;k<3;k++){await action({action:'BOARD_COMMAND',command:'RESET_PHASE'});const n0=(await state()).gameData.throwsThisTurn;
            await action({action:'FORWARD_GAME_ACTION',payload:{type:'TRIGGER_SPECIFIC_THROW',number:20,multiplier:3,sector:'T20'}});
            await expect.poll(async()=>(await state()).gameData.throwsThisTurn!==n0||(await state()).gameData.phase.type!=='playing',{timeout:10000}).toBe(true);}
    }
    await tv.reload();
    let frame=null;
    await expect.poll(async()=>{frame=tv.frames().find(f=>f.url().includes(PAGE));return !!frame&&await frame.evaluate(()=>!!(window.__zerohour&&window.__zerohour.game&&window.__zerohour.game.gd)).catch(()=>false);},{timeout:30000}).toBe(true);
    await expect.poll(()=>lies(frame,state),{timeout:8000,intervals:[200]}).toBe('');
    const sweeps=await frame.evaluate(()=>window.__zerohour.game.log.filter(e=>e.e==='sweep').length);
    expect(sweeps).toBeLessThanOrEqual(1); // at most the visit that was mid-sweep when the page loaded
    await viewerContext.close();
});
