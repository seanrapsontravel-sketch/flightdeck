const {test,expect}=require('@playwright/test');
const fs=require('node:fs');
const {startHost}=require('../helpers.cjs');
let host;
// the TV renders WebGL: give the browser the GPU, so this measures the real thing
test.use({launchOptions:{args:['--enable-gpu','--use-angle=metal','--ignore-gpu-blocklist','--enable-unsafe-swiftshader']}});
test.beforeEach(async()=>{host=await startHost();});
test.afterEach(async()=>{if(host){await host.stop();fs.rmSync(host.dataDir,{recursive:true,force:true});host=null;}});

const PAGE='/games/shanghai-3d.html';   // viewer.html?shanghai=3d until the M4 swap-in
// where a dart must sit, from what was thrown (the control's debug sectors: s# inner, S# outer, D#, T#, 25, Bull)
const bedFor=d=>d.miss?'miss':d.n==='bull'?(d.m>=2?'bull':'outer_bull'):d.m===3?'treble':d.m===2?'double':d.ring==='O'?'single_outer':'single_inner';

async function pairAndStart(page,browser,names){
    await page.goto(host.base+'/control');
    await page.getByRole('heading',{name:'Pair this tablet'}).waitFor();
    await page.locator('input[name="code"]').fill(host.codes.operator);
    await page.locator('.fd-modal select').selectOption('operator');
    await page.getByRole('button',{name:'Pair device',exact:true}).click();
    await expect(page.locator('.fd-session-bar')).toContainText('Operator paired');
    const viewerContext=await browser.newContext({ignoreHTTPSErrors:true,viewport:{width:1920,height:1080}});
    const tv=await viewerContext.newPage();await tv.goto(host.base+'/viewer?shanghai=3d');
    const action=async a=>{await page.evaluate(a=>sendAction(a),a);await page.waitForTimeout(80);};
    const state=()=>page.evaluate(()=>lastKnownControlState);
    for(const name of names)await action({action:'ADD_PLAYER',name});
    await action({action:'FILL_LINEUP'});
    await action({action:'SAVE_VENUE_CONFIG',patch:{viewerVideoEnabled:false,dartCalloutMode:'off'}});
    await page.getByRole('button',{name:'Start timed session'}).click();
    await page.locator('#sessionMinutes').selectOption('60');await page.getByRole('button',{name:'Start session',exact:true}).click();
    await expect.poll(async()=>(await state()).session?.status).toBe('active');
    await page.locator('#tabSocial').click();await page.locator('.game-card[data-game="shanghai"]').click();await page.locator('#btnSelectionPlay').click();
    await expect.poll(async()=>(await state()).gameData?.gameType).toBe('shanghai');
    await expect(tv.locator('#gameFrame')).toHaveAttribute('src',/games\/shanghai-3d\.html/);
    let frame=null;
    await expect.poll(async()=>{frame=tv.frames().find(f=>f.url().includes(PAGE));return !!frame&&await frame.evaluate(()=>!!(window.__shanghai&&window.__shanghai.game&&window.__shanghai.game.gd)).catch(()=>false);},{timeout:30000}).toBe(true);
    return {tv,viewerContext,action,state,frame};
}

/** a scripted player: throws through the control's debug panel and checks the TV after every dart */
function player(page,frame,action,state){
    const thrown=[];let owner=null;const seen=new Set();const delays=[];
    async function lies(){
        const g=(await state()).gameData;
        const t=await frame.evaluate(()=>window.__shanghai.truth());
        if(!t||!t.settled)return 'unsettled '+JSON.stringify(t&&t.busy);
        // the DOM columns are the readable truth: totals and the eight round cells
        const cols=await frame.evaluate(()=>[...document.querySelectorAll('.sh3-col')].map(c=>({score:Number(c.dataset.score),rounds:JSON.parse(c.dataset.rounds||'null'),darts:Number(c.dataset.darts||0),text:c.querySelector('.sh3-score').textContent,cells:[...c.querySelectorAll('.sh3-cells i')].map(i=>i.textContent)})));
        const m=[];
        g.players.forEach((p,i)=>{
            const c=cols[i],s=t.players[i];
            const want=(p.roundScores||[]).map(v=>v==null?null:v);
            if(!c)return m.push(`${p.name} column missing`);
            if(c.score!==p.score||c.text!==String(p.score))m.push(`${p.name} score ${c.text} vs ${p.score}`);
            if(JSON.stringify(c.rounds)!==JSON.stringify(want))m.push(`${p.name} rounds ${JSON.stringify(c.rounds)} vs ${JSON.stringify(want)}`);
            if(c.cells.join(',')!==want.map(v=>v==null?'':String(v)).join(','))m.push(`${p.name} round cells ${c.cells}`);
            if(!s.scroll||s.scroll.score!==p.score||JSON.stringify(s.scroll.rounds)!==JSON.stringify(want))m.push(`${p.name} scroll ${JSON.stringify(s.scroll)}`);
            // one sky lantern per point in the player's cloud (capped; past the cap it glows brighter)
            if(!['winner','draw'].includes(g.phase.type)&&s.lanterns!==Math.min(t.cap,p.score))m.push(`${p.name} lanterns ${s.lanterns} vs ${Math.min(t.cap,p.score)}`);
        });
        if(g.phase.type==='playing'){
            if(t.darts.length!==g.throwsThisTurn)m.push(`darts ${t.darts.length} vs ${g.throwsThisTurn}`);
            else thrown.slice(thrown.length-t.darts.length).forEach((d,k)=>{const want=bedFor(d),got=t.darts[k];
                if(got.bed!==want||(want!=='miss'&&want!=='bull'&&want!=='outer_bull'&&got.number!==d.n))m.push(`dart ${k} in ${got.bed} ${got.number} vs ${want} ${d.n}`);});
            if(cols[g.activeIdx].darts!==g.throwsThisTurn)m.push(`dart dots ${cols[g.activeIdx].darts} vs ${g.throwsThisTurn}`);
            if(t.round!==g.currentRound||t.target!==g.currentRound)m.push(`round pill ${t.round}/${t.target} vs ${g.currentRound}`);
            if(t.tiers!==g.currentRound)m.push(`lit tiers ${t.tiers} vs round ${g.currentRound}`);
            if(t.wedge!==g.currentRound)m.push(`live wedge ${t.wedge} vs ${g.currentRound}`);
            if(t.active!==g.activeIdx)m.push(`active ${t.active} vs ${g.activeIdx}`);
        }
        return m.join('; ');
    }
    const settledTruth=()=>expect.poll(lies,{timeout:20000,intervals:[250]}).toBe('');
    async function ready(){await expect.poll(async()=>{const g=(await state()).gameData;return ['winner','draw'].includes(g.phase.type)||(g.phase.type==='playing'&&g.throwsThisTurn<3);},{timeout:30000}).toBe(true);
        await action({action:'BOARD_COMMAND',command:'RESET_PHASE'});}
    async function dart(n,m=1,ring='I'){
        await ready();
        const g0=(await state()).gameData;
        if(g0.activeIdx!==owner||g0.throwsThisTurn===0){thrown.length=0;owner=g0.activeIdx;}
        const n0=g0.throwsThisTurn,idx=g0.activeIdx;
        const log0=await frame.evaluate(()=>window.__shanghai.game.seq);
        if(n==='miss')await action({action:'FORWARD_GAME_ACTION',payload:{type:'TRIGGER_SPECIFIC_THROW',miss:true}});
        else{
            await page.locator('#debugNumberSelect').selectOption(String(n));
            await page.locator(`input[name="debugMultiplier"][value="${m}"]`).check();
            if(m===1&&n!=='bull')await page.locator(`input[name="debugRing"][value="${ring}"]`).check();
            await page.locator('#hubThrowBtn').click();
        }
        thrown.push({n,m,ring,miss:n==='miss'});
        await expect.poll(async()=>{const g=(await state()).gameData;return g.throwsThisTurn!==n0||g.phase.type!=='playing'||g.activeIdx!==idx;},{timeout:10000}).toBe(true);
        const g=(await state()).gameData;seen.add(g.phase.type);if(g.lastThrow?.hit)seen.add('hit-'+g.lastThrow.multiplier);
        const log=await frame.evaluate(n=>window.__shanghai.game.log.filter(e=>e.n>n),log0);
        const st=log.find(e=>e.e==='state-dart'),th=log.find(e=>e.e==='throw');
        if(st&&th)delays.push(th.t-st.t);
        // dart 3 arrives with its takeover: it must land and score before the takeover's title
        if(n0===2&&['intermission','round_announce'].includes(g.phase.type)){
            await expect.poll(async()=>{const L=await frame.evaluate(n=>window.__shanghai.game.log.filter(e=>e.n>n),log0);const imp=L.findIndex(e=>e.e==='impact'&&e.k===2),ttl=L.findIndex(e=>e.e==='title');return imp>=0&&ttl>imp;},{timeout:6000}).toBe(true);
            seen.add('dart3-'+g.phase.type);
            const sc=await frame.evaluate(i=>Number(document.querySelectorAll('.sh3-col')[i].dataset.score),idx);
            expect(sc).toBe(g.players[idx].score);
        }
        if(!['winner','draw'].includes(g.phase.type)&&!g.lastThrow?.shanghai)await settledTruth();
    }
    return {dart,seen,delays,lies};
}
const visit=async(P,darts)=>{for(const d of darts)await P.dart(...d);};

// Shanghai 3D on the TV through the real server. After every dart, once the TV has settled, what it shows must equal
// the server's state ("nothing lies"): every DOM total and round cell, every station scroll, the round pill and target,
// the lit tiers (= the round), the live wedge (= the target), the active station, the dart dots, and each dart in the
// bed the server scored. Every visit's dart 3 arrives with its takeover; the script covers singles (inner and outer),
// doubles, trebles, other numbers, both bulls, misses, eight rounds and the winner.
test('Shanghai 3D on the TV shows the true scores, rounds, tiers and darts through a whole game',async({page,browser})=>{
    test.setTimeout(300000);
    const errors=[];page.on('pageerror',e=>errors.push(e.message));
    page.on('websocket',ws=>ws.on('framereceived',({payload})=>{try{const m=JSON.parse(String(payload));if(m.type==='COMMAND_ERROR')errors.push(m.error);}catch{}}));
    const {tv,viewerContext,state,frame,action}=await pairAndStart(page,browser,['Christopher & Maximilian','Ben']);
    tv.on('pageerror',e=>errors.push('TV: '+e.message));
    tv.on('console',m=>{if(m.type()==='error')errors.push('TV console: '+m.text());});
    const P=player(page,frame,action,state);
    await expect(tv.frameLocator('#gameFrame').locator('.kit-intro')).toHaveClass(/is-on/,{timeout:10000});
    await expect(tv.frameLocator('#gameFrame').locator('.kit-intro-title')).toHaveText('Shanghai');
    await page.evaluate(()=>{window.__phases=new Set();setInterval(()=>{const t=lastKnownControlState?.gameData?.phase?.type;if(t)window.__phases.add(t);},100);});
    // round 1 (aim for 1)
    await P.dart(1,1,'I');
    await expect(tv.frameLocator('#gameFrame').locator('.kit-intro')).not.toHaveClass(/is-on/);
    await visit(P,[[1,3],[7,1,'O']]);                         // +3, then another number: dart 3 → intermission
    await visit(P,[[1,2],['miss'],['bull',1]]);               // +2, a miss, the outer bull: dart 3 → round announce
    // round 2
    await visit(P,[[2,1,'O'],['bull',2],[12,3]]);             // outer single +2, the bull (0), a treble of another number
    await visit(P,[[2,3],[2,3],[2,2]]);                       // treble, treble, double: no single, so no Shanghai
    // rounds 3–7: quick visits
    for(let r=3;r<=7;r++){await visit(P,[[r,1,'I'],['miss'],[20,1,'I']]);await visit(P,[['miss'],[r,2],['miss']]);}
    // round 8 (final), then the winner
    expect((await state()).gameData.currentRound).toBe(8);
    await visit(P,[[8,3],[8,1,'O'],[3,1,'I']]);
    await visit(P,[['miss'],['miss'],['miss']]);
    await expect.poll(async()=>(await state()).gameData.phase.type,{timeout:15000}).toBe('winner');
    const g=(await state()).gameData;
    expect(g.phase.data.reason).toBe('score');
    for(const k of await page.evaluate(()=>[...window.__phases]))P.seen.add(k);
    for(const k of ['intermission','round_announce','dart3-intermission','dart3-round_announce','hit-1','hit-2','hit-3'])expect(P.seen.has(k),k).toBe(true);
    await expect(tv.frameLocator('#gameFrame').locator('.sh3-title')).toContainText('CHAMPION',{timeout:10000});
    await expect(tv.frameLocator('#gameFrame').locator('.sh3-title-sub')).toHaveText(g.phase.data.winnerName);
    await expect.poll(P.lies,{timeout:10000}).toBe('');
    const worst=Math.max(...P.delays);
    console.log(`dart reaction: worst ${worst.toFixed(1)} ms over ${P.delays.length} darts`);
    expect(worst).toBeLessThan(100);
    await tv.screenshot({path:'output/playwright/shanghai-winner.png'});
    // the page ignores state that isn't from its parent viewer on this origin
    const before=await frame.evaluate(()=>window.__shanghai.game.gd.phase.type);
    await frame.evaluate(()=>{
        const data={type:'SYNC_STATE',state:{gameData:{gameType:'shanghai',players:[{id:'x',name:'FORGED',score:99,roundScores:[]}],activeIdx:0,throwsThisTurn:0,currentRound:1,phase:{type:'playing',data:{}},lastThrow:null}}};
        window.dispatchEvent(new MessageEvent('message',{origin:location.origin,source:window,data}));
        window.dispatchEvent(new MessageEvent('message',{origin:'https://evil.invalid',source:parent,data}));
    });
    await tv.waitForTimeout(300);
    expect(await frame.evaluate(()=>window.__shanghai.game.gd.phase.type)).toBe(before);
    expect(await frame.evaluate(()=>document.querySelectorAll('.sh3-col').length)).toBe(2);
    expect(errors).toEqual([]);await viewerContext.close();
});

// The pub rule: a single, a double and a treble of the target in one visit wins on the spot. The dart lands and
// scores first, then SHANGHAI! with the winner's name as DOM text.
test('Shanghai 3D: a Shanghai wins outright',async({page,browser})=>{
    test.setTimeout(180000);
    const errors=[];page.on('pageerror',e=>errors.push(e.message));
    const {tv,viewerContext,action,state,frame}=await pairAndStart(page,browser,['Alice','Ben']);
    tv.on('pageerror',e=>errors.push('TV: '+e.message));
    const P=player(page,frame,action,state);
    await visit(P,[[1,1,'O'],[5,1,'I'],[1,2]]);               // round 1: Alice — no Shanghai (5 isn't the number)
    await visit(P,[[1,3],[1,1,'I'],[1,2]]);                   // Ben: treble, single, double of 1 — SHANGHAI
    await expect.poll(async()=>(await state()).gameData.phase.type,{timeout:10000}).toBe('winner');
    const d=(await state()).gameData.phase.data;
    expect(d.reason).toBe('shanghai'); expect(d.winnerName).toBe('Ben');
    const L=await frame.evaluate(()=>window.__shanghai.game.log);
    expect(L.findIndex(e=>e.e==='impact'&&e.k===2)).toBeLessThan(L.findIndex(e=>e.e==='title'&&e.main==='SHANGHAI!'));
    await expect(tv.frameLocator('#gameFrame').locator('.sh3-title-main')).toHaveText('SHANGHAI!',{timeout:10000});
    await expect(tv.frameLocator('#gameFrame').locator('.sh3-title-sub')).toHaveText('Ben');
    await expect.poll(P.lies,{timeout:10000}).toBe('');
    await tv.screenshot({path:'output/playwright/shanghai-shanghai.png'});
    expect(errors).toEqual([]);await viewerContext.close();
});

// Debug previews (made-up data) must play without corrupting what's shown; an even game ends TIED with every
// contender named in DOM text.
test('Shanghai 3D survives debug previews and shows a draw',async({page,browser})=>{
    test.setTimeout(300000);
    const errors=[];page.on('pageerror',e=>errors.push(e.message));
    const {tv,viewerContext,action,state,frame}=await pairAndStart(page,browser,['Alice','Ben']);
    tv.on('pageerror',e=>errors.push('TV: '+e.message));
    const P=player(page,frame,action,state);
    await P.dart(1,1,'I');
    for(const screen of ['next','round','winner','draw']){
        await action({action:'DEBUG_SHOW_SCREEN',screen});
        await page.waitForTimeout(700);
        await action({action:'DEBUG_SHOW_SCREEN',screen:'clear'});
        await page.waitForTimeout(400);
    }
    await expect.poll(P.lies,{timeout:20000,intervals:[250]}).toBe('');
    // the rest of an even game: both players score the same every visit
    await visit(P,[['miss'],['miss']]);
    await visit(P,[[1,1,'I'],['miss'],['miss']]);
    for(let r=2;r<=8;r++)for(let v=0;v<2;v++)await visit(P,[[r,1,'I'],['miss'],['miss']]);
    await expect.poll(async()=>(await state()).gameData.phase.type,{timeout:15000}).toBe('draw');
    const d=(await state()).gameData.phase.data;
    await expect(tv.frameLocator('#gameFrame').locator('.sh3-title')).toContainText('TIED',{timeout:10000});
    for(const c of d.contenders)await expect(tv.frameLocator('#gameFrame').locator('.sh3-title-sub')).toContainText(c.name);
    await tv.screenshot({path:'output/playwright/shanghai-draw.png'});
    expect(errors).toEqual([]);await viewerContext.close();
});
