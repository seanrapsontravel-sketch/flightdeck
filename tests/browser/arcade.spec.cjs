const {test,expect}=require('@playwright/test');
const fs=require('node:fs');
const {startHost}=require('../helpers.cjs');
let host;
test.beforeAll(async()=>{host=await startHost();});
test.afterAll(async()=>{if(host){await host.stop();fs.rmSync(host.dataDir,{recursive:true,force:true});}});

test('four-player tablet and TV complete Derby, Killer, Demolition, X01 and Quick 10',async({page,browser})=>{
    const errors=[];page.on('pageerror',e=>errors.push(e.message));
    page.on('websocket',ws=>ws.on('framereceived',({payload})=>{try{const m=JSON.parse(String(payload));if(m.type==='COMMAND_ERROR')errors.push(m.error);}catch{}}));
    await page.goto(host.base+'/control');
    await page.getByRole('heading',{name:'Pair this tablet'}).waitFor();
    await page.locator('input[name="code"]').fill(host.codes.operator);
    await page.locator('.fd-modal select').selectOption('operator');
    await page.getByRole('button',{name:'Pair device',exact:true}).click();
    await expect(page.locator('.fd-session-bar')).toContainText('Operator paired');
    const viewerContext=await browser.newContext({ignoreHTTPSErrors:true,viewport:{width:1920,height:1080}});
    const tv=await viewerContext.newPage();tv.on('pageerror',e=>errors.push(e.message));await tv.goto(host.base+'/viewer');
    const action=async a=>{await page.evaluate(a=>sendAction(a),a);await page.waitForTimeout(80);};
    const state=()=>page.evaluate(()=>lastKnownControlState);
    for(const name of ['Alice','Ben','Chloe','Dev'])await action({action:'ADD_PLAYER',name});
    await action({action:'FILL_LINEUP'});
    await action({action:'SAVE_VENUE_CONFIG',patch:{viewerVideoEnabled:false,dartCalloutMode:'off'}});
    await page.getByRole('button',{name:'Start timed session'}).click();
    await page.locator('#sessionMinutes').selectOption('60');await page.getByRole('button',{name:'Start session',exact:true}).click();
    await expect.poll(async()=>(await state()).session?.status).toBe('active');
    const deadline=(await state()).session.deadline;
    async function ready(){await expect.poll(async()=>{
        const s=await state(),g=s?.gameData;if(!g)return false;
        if(['winner','draw','complete'].includes(g.phase.type))return true;
        return g.phase.type==='playing'&&(g.dartsThrownThisTurn??g.throwsThisTurn??0)<3&&!(g.gameType==='demolition'&&g.teamScores[g.activeTurnIndex]===0)&&!(g.gameType==='killer'&&g.players.filter(p=>p.lives>=0).length===1);
    },{timeout:30000}).toBe(true);
    await action({action:'BOARD_COMMAND',command:'RESET_PHASE'});
    return (await state()).gameData;}
    async function dart(n,m=1){await ready();if(n==='miss')await action({action:'FORWARD_GAME_ACTION',payload:{type:'TRIGGER_SPECIFIC_THROW',miss:true}});else{await page.locator('#debugNumberSelect').selectOption(String(n));await page.locator(`input[name="debugMultiplier"][value="${m}"]`).check();await page.locator('#hubThrowBtn').click();await page.waitForTimeout(80);}if((await state()).selectedGame==='demolition')await page.waitForTimeout(1400);}
    async function start(game){if((await state()).currentScreen==='IN_GAME')await action({action:'NAVIGATE',screen:'GAME_SELECTION'});await page.locator(['x01','quick10'].includes(game)?'#tabClassic':'#tabSocial').click();await page.locator(`.game-card[data-game="${game}"]`).click();await page.locator('#btnSelectionPlay').click();await expect.poll(async()=>(await state()).gameData?.gameType).toBe(game);await expect(tv.locator('#gameFrame')).toHaveAttribute('src',new RegExp(game));}
    async function winner(game){const g=(await state()).gameData;expect(g.phase.type).toBe('winner');await expect(tv.frameLocator('#gameFrame').locator('body')).toContainText(new RegExp(g.phase.data.winnerName,'i'));await tv.screenshot({path:`output/playwright/${game}-winner.png`});}
    console.log('Playing Derby');
    await start('derby');const champ=(await state()).gameData.players[0].id;
    for(let i=0;i<120;i++){const g=await ready();if(['winner','draw'].includes(g.phase.type))break;const p=g.players[g.activeIdx];await dart(p.id===champ?p.targetNumber:'miss',3);}await winner('derby');
    console.log('Playing Killer');
    await start('killer');const killer=(await state()).gameData.players[0].id;
    for(let i=0;i<100;i++){const g=await ready();if(['winner','draw'].includes(g.phase.type))break;const p=g.players[g.activeIdx];await dart(p.id!==killer?'miss':!p.isKiller?p.targetNumber:g.players.find(o=>o.id!==killer&&o.lives>=0).targetNumber,3);}await winner('killer');
    console.log('Playing Demolition');
    await start('demolition');
    for(let i=0;i<60;i++){const g=await ready();if(['winner','draw'].includes(g.phase.type))break;await dart(g.activeTurnIndex===0?20:'miss',3);}await winner('demolition');
    console.log('Playing X01');
    await start('x01');await page.locator('#x01SetupOutOpts [data-value="double"]').click();await page.locator('#x01SetupStartBtn').click();
    const xchamp=(await state()).gameData.players[0].id;
    for(let i=0;i<100;i++){const g=await ready();if(g.phase.type==='winner')break;const p=g.players[g.activeIdx];if(p.id!==xchamp)await dart('miss');else if(p.score>61)await dart(20,3);else if(p.score===61)await dart(17,3);else await dart(p.score/2,2);}await winner('x01');
    console.log('Playing Quick 10');
    await start('quick10');await page.locator('#quick10PickGrid button').filter({hasText:'Alice'}).click();
    for(let i=0;i<10;i++){await dart(20,3);await dart(19);await dart('miss');}
    await expect.poll(async()=>(await state()).gameData.phase.type).toBe('complete');expect((await state()).gameData.totalScore).toBe(790);
    await page.locator('#hubCorrectScoreBtn').click();await page.locator('#correctNumberSelect').selectOption('bull');await page.locator('input[name="correctMultiplier"][value="2"]').check();await page.locator('#correctScoreApplyBtn').click();
    await expect.poll(async()=>(await state()).gameData.totalScore).toBe(840);expect((await state()).quick10Leaderboard).toHaveLength(1);
    await tv.screenshot({path:'output/playwright/quick10-corrected.png'});
    await page.reload();await expect.poll(async()=>(await state())?.session?.deadline).toBe(deadline);
    await page.getByRole('button',{name:'Standings',exact:true}).click();await expect(page.locator('.fd-modal')).toContainText('Excluded: simulated');
    expect(errors).toEqual([]);await viewerContext.close();
});

test('unsafe names render as text and the TV rejects forged iframe messages',async({page})=>{
    const cookie=await host.pair();await page.context().addCookies([{name:'fd_device',value:cookie.split('=')[1],url:host.base,secure:true,httpOnly:true,sameSite:'Strict'}]);
    await page.goto(host.base+'/control');await expect(page.locator('.fd-session-bar')).toContainText('Operator paired');
    await page.evaluate(()=>sendAction({action:'NAVIGATE',screen:'REGISTRATION'}));
    await page.evaluate(()=>sendAction({action:'ADD_PLAYER',name:'<img src=x onerror=window.pwned=1>'}));
    await expect(page.locator('.player-name-display').filter({hasText:'<img src=x onerror=window.pwned=1>'})).toBeVisible();expect(await page.evaluate(()=>window.pwned)).toBeUndefined();
    await page.evaluate(()=>{
        sendAction({action:'CLEAR_LINEUP'});
        sendAction({action:'MOVE_SINGLES_PLAYER',fromSlot:-1,toSlot:0,playerId:lastKnownControlState.players[0].id});
        sendAction({action:'SELECT_GAME',gameType:'x01'});
    });
    await expect.poll(()=>page.evaluate(()=>lastKnownControlState.gameData?.gameType)).toBe('x01');
    const tv=await page.context().newPage();await tv.goto(host.base+'/viewer');
    await expect(tv.locator('#gameFrame')).toHaveAttribute('src',/x01/);
    await tv.frameLocator('#gameFrame').locator('body').waitFor();
    const frame=tv.frames().find(f=>f.url().includes('/games/x01.html'));
    const original=await frame.locator('body').innerText();
    await frame.evaluate(()=>{
        const data={type:'SYNC_STATE',state:{gameData:{gameType:'x01',players:[],phase:{type:'winner',data:{winnerName:'FORGED WINNER'}}}}};
        window.dispatchEvent(new MessageEvent('message',{origin:location.origin,source:window,data}));
        window.dispatchEvent(new MessageEvent('message',{origin:'https://evil.invalid',source:parent,data}));
    });
    expect(await frame.locator('body').innerText()).toBe(original);
    await tv.evaluate(()=>socket.send(JSON.stringify({action:'NAVIGATE',screen:'REGISTRATION',commandId:crypto.randomUUID(),issuedAt:Date.now()})));
    await expect(tv.locator('.fd-notice')).toContainText('does not have permission');
    expect(await page.evaluate(()=>lastKnownControlState.currentScreen)).toBe('IN_GAME');
    await tv.close();
});

test('saved championship, pause, extension and final champion work on tablet and TV',async({page,browser})=>{
    let rig=await startHost();const dir=rig.dataDir;
    try {
        const cookie=await rig.pair();const peer=await rig.connect(cookie);
        for(const name of ['Alice','Ben'])await peer.command({action:'ADD_PLAYER',name});
        await peer.command({action:'FILL_LINEUP'});await peer.command({action:'START_SESSION',minutes:30});
        const deadline=peer.state.session.deadline;
        await rig.stop();
        // A saved, genuine-results fixture tests presentation and recovery; the
        // rule suite separately calculates the three completed-game results.
        const file=require('node:path').join(dir,'session.json');const saved=JSON.parse(fs.readFileSync(file));
        saved.state.results=['derby','x01','cricket'].map((gameType,i)=>({id:`fixture-${i}`,sessionId:saved.state.session.id,gameType,status:'completed',eligible:true,version:1,participants:saved.state.session.participants.map((p,j)=>({...p,place:j+1}))}));
        fs.writeFileSync(file,JSON.stringify(saved));
        rig=await startHost(dir);
        await page.context().addCookies([{name:'fd_device',value:cookie.split('=')[1],url:rig.base,secure:true,httpOnly:true,sameSite:'Strict'}]);
        await page.goto(rig.base+'/control');await page.getByRole('button',{name:'Resume session',exact:true}).click();
        await expect.poll(()=>page.evaluate(()=>lastKnownControlState.session.deadline)).toBe(deadline);
        await page.getByRole('button',{name:'Standings',exact:true}).click();await expect(page.getByRole('cell',{name:'30',exact:true})).toBeVisible();
        await page.getByRole('button',{name:'Pause session',exact:true}).click();await expect.poll(()=>page.evaluate(()=>lastKnownControlState.session.status)).toBe('paused');
        await page.getByRole('button',{name:'Standings',exact:true}).click();await page.getByRole('button',{name:'Continue session',exact:true}).click();
        await expect.poll(()=>page.evaluate(()=>lastKnownControlState.session.status)).toBe('active');
        await page.getByRole('button',{name:'Standings',exact:true}).click();await page.getByRole('button',{name:'Extend 30 minutes',exact:true}).click();
        await expect.poll(()=>page.evaluate(()=>lastKnownControlState.session.deadline)).toBeGreaterThanOrEqual(deadline+1800000);
        await page.getByRole('button',{name:'Standings',exact:true}).click();await page.getByRole('button',{name:'End session',exact:true}).click();await page.getByRole('button',{name:'End now',exact:true}).click();
        await expect(page.getByRole('heading',{name:'Champion: Alice',exact:true})).toBeVisible();
        const context=await browser.newContext({ignoreHTTPSErrors:true,viewport:{width:1920,height:1080}});const tv=await context.newPage();await tv.goto(rig.base+'/viewer');
        await expect(tv.getByRole('heading',{name:'Champion: Alice',exact:true})).toBeVisible();
        await page.screenshot({path:'output/playwright/session-champion-tablet.png'});await tv.screenshot({path:'output/playwright/session-champion-tv.png'});await context.close();
    } finally {await rig.stop();fs.rmSync(dir,{recursive:true,force:true});}
});
