const {test,expect}=require('@playwright/test');
const fs=require('node:fs');
const {startHost}=require('../helpers.cjs');
let host;
// the TV renders WebGL: give the browser the GPU (as docs/plans/tools/dcap.cjs does), so this measures the real thing
test.use({launchOptions:{args:['--enable-gpu','--use-angle=metal','--ignore-gpu-blocklist','--enable-unsafe-swiftshader']}});
// each test gets its own server: a finished game leaves the session running
test.beforeEach(async()=>{host=await startHost();});
test.afterEach(async()=>{if(host){await host.stop();fs.rmSync(host.dataDir,{recursive:true,force:true});host=null;}});

const litOf=p=>p.lives<0?0:p.isKiller?3:Math.min(3,p.killerMarks||0);
const bedFor=d=>d.miss?'miss':d.n==='bull'?(d.m>=2?'bull':'outer_bull'):d.m===3?'treble':d.m===2?'double':d.ring==='O'?'single_outer':'single_inner';

async function pairAndStart(page,browser,names,video){
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
    await action({action:'SAVE_VENUE_CONFIG',patch:{viewerVideoEnabled:video,dartCalloutMode:'off'}});
    await page.getByRole('button',{name:'Start timed session'}).click();
    await page.locator('#sessionMinutes').selectOption('60');await page.getByRole('button',{name:'Start session',exact:true}).click();
    await expect.poll(async()=>(await state()).session?.status).toBe('active');
    await page.locator('#tabSocial').click();await page.locator('.game-card[data-game="killer"]').click();await page.locator('#btnSelectionPlay').click();
    await expect.poll(async()=>(await state()).gameData?.gameType).toBe('killer');
    await expect(tv.locator('#gameFrame')).toHaveAttribute('src',/games\/killer\.html/);
    let frame=null;
    await expect.poll(async()=>{frame=tv.frames().find(f=>f.url().includes('/games/killer.html'));return !!frame&&await frame.evaluate(()=>!!(window.__killer&&window.__killer.game&&window.__killer.game.gd)).catch(()=>false);},{timeout:30000}).toBe(true);
    return {tv,viewerContext,action,state,frame};
}

// 3D Killer on the TV through the real server. After every dart, once the TV says its animations have settled, what
// it shows must equal the server's state ("nothing lies"): each wedge's lit bands = marks (3 for a killer, 0 out),
// killer flags, out players shattered and struck through, one dart on the board per dart thrown, each in the bed the
// board reported, and the round. The script covers a mark, a ×2 mark, misses, a bull, three players becoming killers,
// strikes, two killers stripped, a ×2 overkill death, a round wrap and the last strike through to the winner.
test('Killer 3D on the TV shows the true wedges, killers, outs, darts and round through a whole game',async({page,browser})=>{
    const errors=[];page.on('pageerror',e=>errors.push(e.message));
    page.on('websocket',ws=>ws.on('framereceived',({payload})=>{try{const m=JSON.parse(String(payload));if(m.type==='COMMAND_ERROR')errors.push(m.error);}catch{}}));
    const {tv,viewerContext,action,state,frame}=await pairAndStart(page,browser,['Christopher & Maximilian','Ben','Chloe'],false);
    tv.on('pageerror',e=>errors.push('TV: '+e.message));
    const thrown=[];   // this visit's darts, as thrown
    async function lies(){
        const g=(await state()).gameData;
        const t=await frame.evaluate(()=>window.__killer.truth());
        if(!t||!t.settled)return 'unsettled '+JSON.stringify(t&&t.busy);
        const m=[];
        g.players.forEach((p,i)=>{
            const s=t.players[i];
            if(!s||s.n!==p.targetNumber)return m.push(`${p.name} number`);
            if(s.lit!==litOf(p))m.push(`${p.name} lit ${s.lit} vs ${litOf(p)}`);
            if(s.killer!==(!!p.isKiller&&p.lives>=0))m.push(`${p.name} killer ${s.killer}`);
            if(s.out!==(p.lives<0))m.push(`${p.name} out ${s.out}`);
        });
        if(g.phase.type==='playing'){
            if(t.darts.length!==g.throwsThisTurn)m.push(`darts ${t.darts.length} vs ${g.throwsThisTurn}`);
            else thrown.slice(-t.darts.length).forEach((d,k)=>{const want=bedFor(d),got=t.darts[k];
                if(got.bed!==want||(want!=='miss'&&want!=='bull'&&want!=='outer_bull'&&got.number!==d.n))m.push(`dart ${k} in ${got.bed} ${got.number} vs ${want} ${d.n}`);});
            if(t.round!==g.currentRound)m.push(`round ${t.round} vs ${g.currentRound}`);
        }
        return m.join('; ');
    }
    const settledTruth=()=>expect.poll(lies,{timeout:20000,intervals:[250]}).toBe('');
    // the mock board waits for the darts to be pulled out after a visit: RESET_PHASE is the takeout
    async function ready(){await expect.poll(async()=>{const g=(await state()).gameData;return ['winner','draw'].includes(g.phase.type)||(g.phase.type==='playing'&&g.throwsThisTurn<3);},{timeout:30000}).toBe(true);
        await action({action:'BOARD_COMMAND',command:'RESET_PHASE'});}
    const seen=new Set();
    let visitOwner=null;
    async function dart(n,m=1,ring='I'){
        await ready();
        const g0=(await state()).gameData;
        if(g0.activeIdx!==visitOwner||g0.throwsThisTurn===0){thrown.length=0;visitOwner=g0.activeIdx;}
        const n0=g0.throwsThisTurn;
        if(n==='miss')await action({action:'FORWARD_GAME_ACTION',payload:{type:'TRIGGER_SPECIFIC_THROW',miss:true}});
        else{
            await page.locator('#debugNumberSelect').selectOption(String(n));
            await page.locator(`input[name="debugMultiplier"][value="${m}"]`).check();
            if(m===1&&n!=='bull'){const r=page.locator(`input[name="debugRing"][value="${ring}"]`);if(await r.count())await r.check();}
            await page.locator('#hubThrowBtn').click();
        }
        thrown.push({n,m,ring,miss:n==='miss'});
        // the server's verdict, read as soon as the dart lands
        await expect.poll(async()=>{const g=(await state()).gameData;return g.throwsThisTurn!==n0||g.phase.type!=='playing';},{timeout:10000}).toBe(true);
        const g=(await state()).gameData;seen.add(g.phase.type);if(g.lastThrow?.effect)seen.add(g.lastThrow.effect);
        await settledTruth();
    }
    // between-visit phases (round announce, intermission) come and go in 2.5–3 s: watch for them on the tablet
    await page.evaluate(()=>{window.__phases=new Set();setInterval(()=>{const t=lastKnownControlState?.gameData?.phase?.type;if(t)window.__phases.add(t);},100);});
    const num=async i=>(await state()).gameData.players[i].targetNumber;
    const who=async()=>(await state()).gameData.activeIdx;
    expect(await who()).toBe(0);
    const [n0,n1,n2]=[await num(0),await num(1),await num(2)];
    // round 1
    await dart(n0,2);                 // ×2 mark: 2 marks (mult_boost)
    await dart('miss');
    await dart('bull',1);
    await dart(n1,3);                 // player 2: treble on their own number: killer
    await dart(n0,1,'O');             // strike: player 1 down to 1 mark
    await dart('miss');
    await dart(n2,3);                 // player 3: killer
    await dart(n1,1);                 // strike a killer: player 2 stripped (2 lives left)
    await dart('miss');
    // round 2 (the round wraps)
    await dart('miss');await dart('miss');await dart('miss');
    await dart(n1,1);                 // player 2: back to killer
    await dart(n0,2);                 // ×2 against 1 mark: overkill, player 1 is out
    await dart('miss');
    await dart(n1,3);                 // ×3 against a killer: stripped to 0 lives (still in)
    await dart(n1,1);                 // the empty civilian is struck: out, and player 3 wins
    await expect.poll(async()=>(await state()).gameData.phase.type,{timeout:15000}).toBe('winner');
    const g=(await state()).gameData;
    expect(g.phase.data.winnerName).toBe('Chloe');
    for(const k of await page.evaluate(()=>[...window.__phases]))seen.add(k);
    for(const k of ['mult_boost','became_killer','lost_killer','death','mark','strike','round_announce','intermission'])expect(seen.has(k),k).toBe(true);
    await expect(tv.frameLocator('#gameFrame').locator('.kl-title')).toContainText(g.phase.data.winnerName,{timeout:10000});
    // the two out players are shattered and struck through on the ledger
    await expect.poll(()=>frame.evaluate(()=>window.__killer.agents.filter(a=>a.out).length)).toBe(2);
    await expect(tv.frameLocator('#gameFrame').locator('.kl-pcard.is-out')).toHaveCount(2);
    await tv.screenshot({path:'output/playwright/killer-winner.png'});

    // the page ignores state that isn't from its parent viewer on this origin
    const before=await frame.evaluate(()=>window.__killer.game.gd.phase.type);
    await frame.evaluate(()=>{
        const data={type:'SYNC_STATE',state:{gameData:{gameType:'killer',players:[{id:'x',name:'FORGED',targetNumber:20,lives:3,killerMarks:0,isKiller:false}],activeIdx:0,throwsThisTurn:0,currentRound:1,phase:{type:'playing',data:{}},lastThrow:null}}};
        window.dispatchEvent(new MessageEvent('message',{origin:location.origin,source:window,data}));
        window.dispatchEvent(new MessageEvent('message',{origin:'https://evil.invalid',source:parent,data}));
    });
    await tv.waitForTimeout(300);
    expect(await frame.evaluate(()=>window.__killer.game.gd.phase.type)).toBe(before);
    expect(errors).toEqual([]);await viewerContext.close();
});

// Video mode lengthens the server's windows (became 5.5 s, death 5.5 s, lost 5.2 s). The TV's moments must still
// finish inside them, and debug previews of each screen (made-up data) must not corrupt the board.
test('Killer 3D fits video-mode windows and survives debug previews',async({page,browser})=>{
    const errors=[];page.on('pageerror',e=>errors.push(e.message));
    const {tv,viewerContext,action,state,frame}=await pairAndStart(page,browser,['Alice','Ben'],true);
    tv.on('pageerror',e=>errors.push('TV: '+e.message));
    const num=async i=>(await state()).gameData.players[i].targetNumber;
    const throwAt=async(n,m)=>{await action({action:'BOARD_COMMAND',command:'RESET_PHASE'});await page.locator('#debugNumberSelect').selectOption(String(n));await page.locator(`input[name="debugMultiplier"][value="${m}"]`).check();await page.locator('#hubThrowBtn').click();};
    // became killer in video mode: when the server leaves the became_killer phase, the TV's moment has finished
    await throwAt(await num(0),3);
    await expect.poll(async()=>(await state()).gameData.phase.type,{timeout:10000}).toBe('became_killer');
    const t0=Date.now();
    await expect.poll(async()=>(await state()).gameData.phase.type,{timeout:15000}).not.toBe('became_killer');
    const held=Date.now()-t0;
    expect(held).toBeGreaterThan(5000);                         // the video-mode window was used
    const busy=await frame.evaluate(()=>window.__killer.truth().busy);
    expect(busy.cur===null||!/became/.test(String(busy.cur)),JSON.stringify(busy)).toBe(true);
    // the became moment's queue entry is gone by the time the server moved on
    expect(await frame.evaluate(()=>window.__killer.game.events.length)).toBeLessThanOrEqual(2);
    // debug previews: each forced screen, then back; the board must still tell the truth
    for(const screen of ['became_killer','lost_killer','death']){
        await action({action:'DEBUG_SHOW_SCREEN',screen});
        await page.waitForTimeout(700);
        await action({action:'BOARD_COMMAND',command:'RESET_PHASE'});
        await page.waitForTimeout(400);
    }
    await expect.poll(async()=>{
        const g=(await state()).gameData,t=await frame.evaluate(()=>window.__killer.truth());
        if(!t.settled)return 'unsettled';
        return g.players.map((p,i)=>t.players[i].lit===litOf(p)&&t.players[i].killer===(!!p.isKiller&&p.lives>=0)&&t.players[i].out===(p.lives<0)).every(Boolean)?'':JSON.stringify(t.players);
    },{timeout:20000,intervals:[250]}).toBe('');
    expect(errors).toEqual([]);await viewerContext.close();
});
