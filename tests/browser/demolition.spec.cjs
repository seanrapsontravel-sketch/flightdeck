const {test,expect}=require('@playwright/test');
const fs=require('node:fs');
const {startHost}=require('../helpers.cjs');
let host;
// the TV renders WebGL: give the browser the GPU (as docs/plans/tools/dcap.cjs does), so this measures the real thing
test.use({launchOptions:{args:['--enable-gpu','--use-angle=metal','--ignore-gpu-blocklist','--enable-unsafe-swiftshader']}});
test.beforeAll(async()=>{host=await startHost();});
test.afterAll(async()=>{if(host){await host.stop();fs.rmSync(host.dataDir,{recursive:true,force:true});}});

// 3D Demolition on the TV through the real server. After every dart, once the TV says its swings and drop-ins have
// finished, each lane's standing blocks and its strip number must equal the server's teamScores ("nothing lies").
// The script covers hits, a checkout, the final-round rule, a sudden-death playoff from 60, a miss, a bust rewind and
// the winner; plus the operator's help overlay and forged-message rejection.
test('Demolition 3D on the TV shows the true towers through checkouts, a playoff, a bust and the winner',async({page,browser})=>{
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
    await action({action:'NAVIGATE',screen:'GAME_SELECTION'});
    await page.locator('#tabSocial').click();await page.locator('.game-card[data-game="demolition"]').click();await page.locator('#btnSelectionPlay').click();
    await expect.poll(async()=>(await state()).gameData?.gameType).toBe('demolition');
    await expect(tv.locator('#gameFrame')).toHaveAttribute('src',/games\/demolition\.html/);
    let frame=null;
    await expect.poll(async()=>{frame=tv.frames().find(f=>f.url().includes('/games/demolition.html'));return !!frame&&await frame.evaluate(()=>!!(window.__demolition&&window.__demolition.game)).catch(()=>false);},{timeout:30000}).toBe(true);

    // the TV, once settled, against the server's state: '' when they agree
    async function lies(){
        const g=(await state()).gameData;
        const t=await frame.evaluate(()=>window.__demolition.truth());
        if(!t||!t.settled)return 'unsettled '+JSON.stringify(t&&t.busy);
        const m=[];
        if(t.standing.length!==g.teamScores.length)m.push(`${t.standing.length} towers vs ${g.teamScores.length} lanes`);
        g.teamScores.forEach((s,i)=>{
            if(t.standing[i]!==s)m.push(`lane ${i} blocks ${t.standing[i]} vs ${s}`);
            if(t.lanes[i]!==s)m.push(`lane ${i} strip ${t.lanes[i]} vs ${s}`);
        });
        return m.join('; ');
    }
    const settledTruth=()=>expect.poll(lies,{timeout:20000,intervals:[250]}).toBe('');
    async function ready(){await expect.poll(async()=>{const g=(await state()).gameData;return g.phase.type==='winner'||(g.phase.type==='playing'&&g.dartsThrownThisTurn<3&&g.teamScores[g.activeTurnIndex]>0);},{timeout:30000}).toBe(true);
        await action({action:'BOARD_COMMAND',command:'RESET_PHASE'});}
    const phases=new Set();
    async function dart(thrower,n,m=1){
        await ready();
        const g0=(await state()).gameData;
        expect(g0.teams[g0.activeTurnIndex][0].name).toBe(thrower);
        const n0=g0.dartsThrownThisTurn;
        if(n==='miss')await action({action:'FORWARD_GAME_ACTION',payload:{type:'TRIGGER_SPECIFIC_THROW',miss:true}});
        else await action({action:'FORWARD_GAME_ACTION',payload:{type:'TRIGGER_SPECIFIC_THROW',number:n,multiplier:m}});
        await expect.poll(async()=>{const g=(await state()).gameData;return g.dartsThrownThisTurn!==n0||g.phase.type!=='playing'||g.teamScores[g.activeTurnIndex]===0;},{timeout:10000}).toBe(true);
        await settledTruth();
        phases.add((await state()).gameData.phase.type);
    }
    const C='Christopher & Maximilian',B='Ben';
    // the thrower card names the thrower and shows their initials (no photo registered)
    await expect(tv.frameLocator('#gameFrame').locator('.dm-thrower .dm-tname')).toHaveText(C,{timeout:10000});
    await expect(tv.frameLocator('#gameFrame').locator('.dm-thrower .dm-tav')).toHaveText('CM');
    // help overlay follows the operator's toggle
    await action({action:'FORWARD_GAME_ACTION',payload:{type:'TOGGLE_HELP'}});
    await expect(tv.frameLocator('#gameFrame').locator('.dm-help')).toHaveClass(/is-on/);
    await action({action:'FORWARD_GAME_ACTION',payload:{type:'TOGGLE_HELP'}});
    await expect(tv.frameLocator('#gameFrame').locator('.dm-help')).not.toHaveClass(/is-on/);

    await dart(C,20,3);await dart(C,20,3);await dart(C,20,3);          // 180 → 0: checkout, Ben still throws
    const lanes=tv.frameLocator('#gameFrame').locator('.dm-lane');
    await expect(lanes.nth(0)).toHaveClass(/is-out/);await expect(lanes.nth(1)).not.toHaveClass(/is-out/);
    await dart(B,20,3);await dart(B,20,3);await dart(B,20,3);          // Ben checks out too: sudden death from 60
    await expect.poll(async()=>(await state()).gameData.isPlayoff,{timeout:15000}).toBe(true);
    await ready();await settledTruth();
    expect((await state()).gameData.teamScores).toEqual([60,60]);
    await dart(C,'miss');await dart(C,20,1);                            // 60 → 40
    await dart(C,20,3);                                                 // 40 − 60: bust, back to 60
    expect(phases.has('bust')).toBe(true);
    await dart(B,20,3);                                                 // Ben checks out: the winner
    await expect.poll(async()=>(await state()).gameData.phase.type,{timeout:15000}).toBe('winner');
    const g=(await state()).gameData;
    expect(g.phase.data.winnerName).toBe(B);
    await expect(tv.frameLocator('#gameFrame').locator('.dm-title')).toContainText(B,{timeout:10000});
    await settledTruth();
    await expect(lanes.nth(1)).toHaveClass(/is-out/);await expect(lanes.nth(0)).not.toHaveClass(/is-out/);
    await tv.screenshot({path:'output/playwright/demolition-3d-winner.png'});

    // the page ignores state that isn't from its parent viewer on this origin
    const before=await frame.evaluate(()=>window.__demolition.truth().standing.join(','));
    await frame.evaluate(()=>{
        const data={type:'SYNC_STATE',state:{gameData:{gameType:'demolition',teams:[[{id:'x',name:'FORGED'}]],teamScores:[3],roundInitialScores:[3],activeTurnIndex:0,dartsThrownThisTurn:0,phase:{type:'playing',data:{}},lastThrow:null}}};
        window.dispatchEvent(new MessageEvent('message',{origin:location.origin,source:window,data}));
        window.dispatchEvent(new MessageEvent('message',{origin:'https://evil.invalid',source:parent,data}));
    });
    await tv.waitForTimeout(500);
    expect(await frame.evaluate(()=>window.__demolition.truth().standing.join(','))).toBe(before);
    expect(errors).toEqual([]);await viewerContext.close();
});
