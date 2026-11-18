const {test,expect}=require('@playwright/test');
const fs=require('node:fs');
const {startHost}=require('../helpers.cjs');
let host;
// the TV renders WebGL: give the browser the GPU (as docs/plans/tools/dcap.cjs does), so this measures the real thing
test.use({launchOptions:{args:['--enable-gpu','--use-angle=metal','--ignore-gpu-blocklist','--enable-unsafe-swiftshader']}});
test.beforeAll(async()=>{host=await startHost();});
test.afterAll(async()=>{if(host){await host.stop();fs.rmSync(host.dataDir,{recursive:true,force:true});}});

// 3D Limbo on the TV through the real server. After every dart, once the TV says its animations have settled, what it
// shows must equal the server's state ("nothing lies"): the bar at currentTargetBar, the ball at currentRunningTotal
// while a visit is in play, and each player's lit torches equal to their lives. The script covers a clear, a bar
// hold, a miss (+25), burns with the bar reset to 60, and an elimination through to the winner.
test('Limbo 3D on the TV shows the true bar, ball and lives through clears, a hold, burns and an elimination',async({page,browser})=>{
    const errors=[];page.on('pageerror',e=>errors.push(e.message));
    page.on('websocket',ws=>ws.on('framereceived',({payload})=>{try{const m=JSON.parse(String(payload));if(m.type==='COMMAND_ERROR')errors.push(m.error);}catch{}}));
    await page.goto(host.base+'/control');
    await page.getByRole('heading',{name:'Pair this tablet'}).waitFor();
    await page.locator('input[name="code"]').fill(host.codes.operator);
    await page.locator('.fd-modal select').selectOption('operator');
    await page.getByRole('button',{name:'Pair device',exact:true}).click();
    await expect(page.locator('.fd-session-bar')).toContainText('Operator paired');
    const viewerContext=await browser.newContext({ignoreHTTPSErrors:true,viewport:{width:1920,height:1080}});
    const tv=await viewerContext.newPage();tv.on('pageerror',e=>errors.push('TV: '+e.message));await tv.goto(host.base+'/viewer');
    const action=async a=>{await page.evaluate(a=>sendAction(a),a);await page.waitForTimeout(80);};
    const state=()=>page.evaluate(()=>lastKnownControlState);
    for(const name of ['Christopher & Maximilian','Ben'])await action({action:'ADD_PLAYER',name});
    await action({action:'FILL_LINEUP'});
    await action({action:'SAVE_VENUE_CONFIG',patch:{viewerVideoEnabled:false,dartCalloutMode:'off'}});
    await page.getByRole('button',{name:'Start timed session'}).click();
    await page.locator('#sessionMinutes').selectOption('60');await page.getByRole('button',{name:'Start session',exact:true}).click();
    await expect.poll(async()=>(await state()).session?.status).toBe('active');
    await page.locator('#tabSocial').click();await page.locator('.game-card[data-game="limbo"]').click();await page.locator('#btnSelectionPlay').click();
    await expect.poll(async()=>(await state()).gameData?.gameType).toBe('limbo');
    await expect(tv.locator('#gameFrame')).toHaveAttribute('src',/games\/limbo\.html/);
    let frame=null;
    await expect.poll(async()=>{frame=tv.frames().find(f=>f.url().includes('/games/limbo.html'));return !!frame&&await frame.evaluate(()=>!!(window.__limbo&&window.__limbo.game)).catch(()=>false);},{timeout:30000}).toBe(true);

    // the TV, once settled, against the server's state: '' when they agree
    async function lies(){
        const g=(await state()).gameData;
        const t=await frame.evaluate(()=>window.__limbo.truth());
        if(!t||!t.settled)return 'unsettled '+JSON.stringify(t&&t.busy);
        const m=[];
        if(t.bar!==g.currentTargetBar)m.push(`bar ${t.bar} vs ${g.currentTargetBar}`);
        if(Math.abs(t.barY-t.barYWant)>0.02)m.push(`bar height ${t.barY} vs ${t.barYWant}`);
        if(g.phase.type==='playing'&&g.throwsThisTurn>0){
            if(t.ball!==g.currentRunningTotal)m.push(`ball ${t.ball} vs ${g.currentRunningTotal}`);
            if(Math.abs(t.ballY-t.ballYWant)>0.02)m.push(`ball height ${t.ballY} vs ${t.ballYWant}`);
        }
        if(g.phase.type!=='winner')g.players.forEach((p,i)=>{if(t.lit[i]!==Math.max(0,p.lives))m.push(`${p.name} torches ${t.lit[i]} vs lives ${p.lives}`);});
        return m.join('; ');
    }
    const settledTruth=()=>expect.poll(lies,{timeout:15000,intervals:[250]}).toBe('');
    async function ready(){await expect.poll(async()=>{const g=(await state()).gameData;return ['winner'].includes(g.phase.type)||(g.phase.type==='playing'&&g.throwsThisTurn<3);},{timeout:30000}).toBe(true);
        await action({action:'BOARD_COMMAND',command:'RESET_PHASE'});}
    let verdict=null;
    async function dart(n,m=1){
        await ready();
        const n0=(await state()).gameData.throwsThisTurn;
        if(n==='miss')await action({action:'FORWARD_GAME_ACTION',payload:{type:'TRIGGER_SPECIFIC_THROW',miss:true}});
        else{await page.locator('#debugNumberSelect').selectOption(String(n));await page.locator(`input[name="debugMultiplier"][value="${m}"]`).check();await page.locator('#hubThrowBtn').click();}
        // the server's verdict, read as soon as the dart lands (the TV takes a while to finish showing it)
        await expect.poll(async()=>{const g=(await state()).gameData;return g.throwsThisTurn!==n0||g.phase.type!=='playing';},{timeout:10000}).toBe(true);
        const g=(await state()).gameData;verdict=[g.phase.type,g.phase.data?.mode].filter(Boolean);
        await settledTruth();
    }
    const seen={clear:0,hold:0,burn:0,miss:0,reset:0};
    async function visit(darts,expectPhase){
        // read the bar once play has resumed (after a burn the server puts it back to 60 a moment later)
        await ready();
        const before=(await state()).gameData;
        for(const d of darts)await dart(...(Array.isArray(d)?d:[d]));
        if(expectPhase)expect(verdict).toContain(expectPhase);
        if(expectPhase==='clear')seen.clear++;if(expectPhase==='hold')seen.hold++;if(expectPhase==='life_loss')seen.burn++;
        if(darts.includes('miss'))seen.miss++;
        if(expectPhase==='life_loss'&&before.currentTargetBar<60)seen.reset++;
    }
    await visit([5,5,5],'clear');                    // bar 60 → 15
    await visit([5,5,5],'hold');                     // exactly 15: the bar holds
    await visit([[20,3]],'life_loss');               // 60 over 15: burned, bar back to 60
    await visit([10,10,10],'clear');                 // bar 60 → 30
    await visit(['miss',1,1],'clear');               // a miss is 25: 27, bar → 27
    await visit([[20,3]],'life_loss');
    await visit([[20,3]],'life_loss');
    await visit([[20,3]],'life_loss');
    await visit([[20,3]],'life_loss');               // the first player's last torch: out, and the other one wins
    await expect.poll(async()=>(await state()).gameData.phase.type,{timeout:10000}).toBe('winner');
    const g=(await state()).gameData;
    await expect(tv.frameLocator('#gameFrame').locator('.lb-title')).toContainText(g.phase.data.winnerName,{timeout:10000});
    expect(seen).toEqual({clear:3,hold:1,burn:5,miss:1,reset:2});
    // the out player's totem is down and greyed on the strip
    expect(await frame.evaluate(()=>window.__limbo.totems.filter(t=>t.out).length)).toBe(1);
    await expect(tv.frameLocator('#gameFrame').locator('.lb-pcard.is-out')).toHaveCount(1);
    await tv.screenshot({path:'output/playwright/limbo-winner.png'});

    // the page ignores state that isn't from its parent viewer on this origin
    const before=await frame.evaluate(()=>window.__limbo.game.gd.phase.type);
    await frame.evaluate(()=>{
        const data={type:'SYNC_STATE',state:{gameData:{gameType:'limbo',players:[{id:'x',name:'FORGED',lives:3}],activeIdx:0,currentTargetBar:3,currentRunningTotal:0,throwsThisTurn:0,phase:{type:'playing',data:{}},lastThrow:null}}};
        window.dispatchEvent(new MessageEvent('message',{origin:location.origin,source:window,data}));
        window.dispatchEvent(new MessageEvent('message',{origin:'https://evil.invalid',source:parent,data}));
    });
    await tv.waitForTimeout(300);
    expect(await frame.evaluate(()=>window.__limbo.game.gd.phase.type)).toBe(before);
    expect(errors).toEqual([]);await viewerContext.close();
});
