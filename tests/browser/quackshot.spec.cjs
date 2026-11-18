const {test,expect}=require('@playwright/test');
const fs=require('node:fs');
const {startHost}=require('../helpers.cjs');
let host;
// the TV renders WebGL: give the browser the GPU, so this measures the real thing
test.use({launchOptions:{args:['--enable-gpu','--use-angle=metal','--ignore-gpu-blocklist','--enable-unsafe-swiftshader']}});
test.beforeEach(async()=>{host=await startHost();});
test.afterEach(async()=>{if(host){await host.stop();fs.rmSync(host.dataDir,{recursive:true,force:true});host=null;}});

const PAGE='/games/quackshot-3d.html';   // viewer.html?quackshot=3d until the M4 swap-in
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
    const tv=await viewerContext.newPage();await tv.goto(host.base+'/viewer?quackshot=3d');
    const action=async a=>{await page.evaluate(a=>sendAction(a),a);await page.waitForTimeout(80);};
    const state=()=>page.evaluate(()=>lastKnownControlState);
    for(const name of names)await action({action:'ADD_PLAYER',name});
    await action({action:'FILL_LINEUP'});
    await action({action:'SAVE_VENUE_CONFIG',patch:{viewerVideoEnabled:false,dartCalloutMode:'off'}});
    await page.getByRole('button',{name:'Start timed session'}).click();
    await page.locator('#sessionMinutes').selectOption('60');await page.getByRole('button',{name:'Start session',exact:true}).click();
    await expect.poll(async()=>(await state()).session?.status).toBe('active');
    await page.locator('#tabSocial').click();await page.locator('.game-card[data-game="quackshot"]').click();await page.locator('#btnSelectionPlay').click();
    await expect.poll(async()=>(await state()).gameData?.gameType).toBe('quackshot');
    await expect(tv.locator('#gameFrame')).toHaveAttribute('src',/games\/quackshot-3d\.html/);
    let frame=null;
    await expect.poll(async()=>{frame=tv.frames().find(f=>f.url().includes(PAGE));return !!frame&&await frame.evaluate(()=>!!(window.__quackshot&&window.__quackshot.game&&window.__quackshot.game.gd)).catch(()=>false);},{timeout:30000}).toBe(true);
    return {tv,viewerContext,action,state,frame};
}

/** a scripted player: throws through the control's debug panel and checks the TV after every dart */
function player(page,frame,action,state){
    const thrown=[];let owner=null;const seen=new Set();const delays=[];
    async function lies(){
        const g=(await state()).gameData;
        const t=await frame.evaluate(()=>window.__quackshot.truth());
        if(!t||!t.settled)return 'unsettled '+JSON.stringify(t&&t.busy);
        // the DOM columns are the readable truth
        const cols=await frame.evaluate(()=>[...document.querySelectorAll('.qs3-col')].map(c=>({score:Number(c.dataset.score),ducks:Number(c.dataset.ducks),darts:Number(c.dataset.darts||0),text:c.querySelector('.qs3-score').textContent})));
        const m=[];
        g.players.forEach((p,i)=>{
            const c=cols[i],s=t.players[i];
            if(!c)return m.push(`${p.name} column missing`);
            if(c.score!==p.score)m.push(`${p.name} score ${c.score} vs ${p.score}`);
            if(c.text!==(p.score<0?'−':'')+Math.abs(p.score))m.push(`${p.name} score text ${c.text}`);
            if(c.ducks!==p.bullseyes)m.push(`${p.name} ducks ${c.ducks} vs ${p.bullseyes}`);
            if(s.shelf!==Math.min(12,p.bullseyes))m.push(`${p.name} shelf ${s.shelf} vs ${p.bullseyes}`);
            if(s.marquee!==p.score)m.push(`${p.name} marquee ${s.marquee} vs ${p.score}`);
        });
        if(g.phase.type==='playing'){
            if(t.darts.length!==g.throwsThisTurn)m.push(`darts ${t.darts.length} vs ${g.throwsThisTurn}`);
            else thrown.slice(thrown.length-t.darts.length).forEach((d,k)=>{const want=bedFor(d),got=t.darts[k];
                if(got.bed!==want||(want!=='miss'&&want!=='bull'&&want!=='outer_bull'&&got.number!==d.n))m.push(`dart ${k} in ${got.bed} ${got.number} vs ${want} ${d.n}`);});
            if(cols[g.activeIdx].darts!==g.throwsThisTurn)m.push(`dart dots ${cols[g.activeIdx].darts} vs ${g.throwsThisTurn}`);
            if(t.round!==g.currentRound)m.push(`round ${t.round} vs ${g.currentRound}`);
            if(t.marqueeRound!==g.currentRound)m.push(`marquee round ${t.marqueeRound} vs ${g.currentRound}`);
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
        const log0=await frame.evaluate(()=>window.__quackshot.game.seq);
        if(n==='miss')await action({action:'FORWARD_GAME_ACTION',payload:{type:'TRIGGER_SPECIFIC_THROW',miss:true}});
        else{
            await page.locator('#debugNumberSelect').selectOption(String(n));
            await page.locator(`input[name="debugMultiplier"][value="${m}"]`).check();
            if(m===1&&n!=='bull')await page.locator(`input[name="debugRing"][value="${ring}"]`).check();
            await page.locator('#hubThrowBtn').click();
        }
        thrown.push({n,m,ring,miss:n==='miss'});
        await expect.poll(async()=>{const g=(await state()).gameData;return g.throwsThisTurn!==n0||g.phase.type!=='playing';},{timeout:10000}).toBe(true);
        const g=(await state()).gameData;seen.add(g.phase.type);if(g.lastThrow?.zone)seen.add(g.lastThrow.zone);
        // the dart reacts at once: its throw starts within a frame or two of its state arriving
        const log=await frame.evaluate(n=>window.__quackshot.game.log.filter(e=>e.n>n),log0);
        const st=log.find(e=>e.e==='state-dart'),th=log.find(e=>e.e==='throw');
        if(st&&th)delays.push(th.t-st.t);
        // a bull: the won duck flies to the shelf and lands inside the server's 4.41 s window
        if(g.lastThrow?.bullseye&&g.phase.type==='bullseye'){
            await expect.poll(async()=>(await state()).gameData.phase.type,{timeout:9000,intervals:[100]}).not.toBe('bullseye');
            const L=await frame.evaluate(n=>window.__quackshot.game.log.filter(e=>e.n>n),log0);
            expect(L.some(e=>e.e==='prize-land'),'prize landed before the window closed').toBe(true);
            seen.add('prize-in-window');
        }
        // dart 3 into an inner single: the takeover arrives with the dart — it must land and score first
        if(n0===2&&g.lastThrow?.zone==='inner_single'&&['intermission','round_announce'].includes(g.phase.type)){
            await expect.poll(async()=>{const L=await frame.evaluate(n=>window.__quackshot.game.log.filter(e=>e.n>n),log0);const imp=L.findIndex(e=>e.e==='impact'&&e.k===2),ttl=L.findIndex(e=>e.e==='title');return imp>=0&&ttl>imp;},{timeout:6000}).toBe(true);
            seen.add('dart3-takeover');
            // and its score was on the HUD before the takeover's title
            const sc=await frame.evaluate(i=>Number(document.querySelectorAll('.qs3-col')[i].dataset.score),idx);
            expect(sc).toBe(g.players[idx].score);
        }
        await settledTruth();
    }
    return {dart,seen,delays,lies};
}

// Quackshot 3D on the TV through the real server. After every dart, once the TV has settled, what it shows must
// equal the server's state ("nothing lies"): every DOM score (incl. negatives) and duck count, each prize shelf, the
// marquee, the round, the active station, the dart dots, and each dart in the bed the server scored. The script covers
// every zone (inner single, Ring of Fire, double bull, outer bull, outer single, double, miss), the dart-3 inner single
// arriving with its intermission and with a round announce, six rounds incl. the ×2 final, and the winner.
test('Quackshot 3D on the TV shows the true scores, ducks, darts and round through a whole game',async({page,browser})=>{
    test.setTimeout(240000);
    const errors=[];page.on('pageerror',e=>errors.push(e.message));
    page.on('websocket',ws=>ws.on('framereceived',({payload})=>{try{const m=JSON.parse(String(payload));if(m.type==='COMMAND_ERROR')errors.push(m.error);}catch{}}));
    const {tv,viewerContext,action,state,frame}=await pairAndStart(page,browser,['Christopher & Maximilian','Ben']);
    tv.on('pageerror',e=>errors.push('TV: '+e.message));
    tv.on('console',m=>{if(m.type()==='error')errors.push('TV console: '+m.text());});
    const P=player(page,frame,action,state);
    // the How to play explainer is up on the TV at the start, and leaves with the first dart (GAME-INTROS-3D.md)
    await expect(tv.frameLocator('#gameFrame').locator('.kit-intro')).toHaveClass(/is-on/,{timeout:10000});
    await expect(tv.frameLocator('#gameFrame').locator('.kit-intro-title')).toHaveText('Quackshot');
    await page.evaluate(()=>{window.__phases=new Set();setInterval(()=>{const t=lastKnownControlState?.gameData?.phase?.type;if(t)window.__phases.add(t);},100);});
    // round 1
    await P.dart(20,1,'I');          // +1 parade
    await expect(tv.frameLocator('#gameFrame').locator('.kit-intro')).not.toHaveClass(/is-on/);
    await P.dart(5,3);               // −2 Ring of Fire
    await P.dart('bull',2);          // +3 double bull, then the intermission
    await P.dart('miss');            // −1 splash (miss)
    await P.dart(16,2);              // −1 splash (double)
    await P.dart(7,1,'I');           // dart 3 inner single: arrives with the round announce
    // round 2
    await P.dart('bull',1);          // +2 outer bull
    await P.dart(12,1,'O');          // −1 outer single
    await P.dart(1,1,'I');           // dart 3 inner single: arrives with the intermission
    for(const n of [3,4,5])await P.dart(n,1,'I');
    // rounds 3–5: quick inner singles
    for(let v=0;v<6;v++)for(const n of [6,10,13])await P.dart(n,1,'I');
    // round 6 (×2): negatives doubled, then the winner
    expect((await state()).gameData.currentRound).toBe(6);
    await P.dart(19,3);              // −4 (−2 ×2)
    await P.dart(17,1,'I'); await P.dart(2,1,'I');
    await P.dart(9,1,'I'); await P.dart(14,1,'I'); await P.dart(11,1,'I');
    await expect.poll(async()=>(await state()).gameData.phase.type,{timeout:15000}).toBe('winner');
    const g=(await state()).gameData;
    for(const k of await page.evaluate(()=>[...window.__phases]))P.seen.add(k);
    for(const k of ['inner_single','triple','double_bull','bull','board','miss','bullseye','zone_hit','splash','round_announce','intermission','dart3-takeover','prize-in-window'])expect(P.seen.has(k),k).toBe(true);
    // the winner's name is DOM text
    await expect(tv.frameLocator('#gameFrame').locator('.qs3-title')).toContainText('GRAND PRIZE',{timeout:10000});
    await expect(tv.frameLocator('#gameFrame').locator('.qs3-title-sub')).toHaveText(g.phase.data.winnerName);
    await expect.poll(P.lies,{timeout:10000}).toBe('');
    // reaction latency: each dart's throw began within ~a frame of its state arriving
    const worst=Math.max(...P.delays);
    console.log(`dart reaction: worst ${worst.toFixed(1)} ms over ${P.delays.length} darts`);
    expect(worst).toBeLessThan(100);
    await tv.screenshot({path:'output/playwright/quackshot-winner.png'});

    // the page ignores state that isn't from its parent viewer on this origin
    const before=await frame.evaluate(()=>window.__quackshot.game.gd.phase.type);
    await frame.evaluate(()=>{
        const data={type:'SYNC_STATE',state:{gameData:{gameType:'quackshot',players:[{id:'x',name:'FORGED',score:99,bullseyes:9}],activeIdx:0,throwsThisTurn:0,currentRound:1,phase:{type:'playing',data:{}},lastThrow:null}}};
        window.dispatchEvent(new MessageEvent('message',{origin:location.origin,source:window,data}));
        window.dispatchEvent(new MessageEvent('message',{origin:'https://evil.invalid',source:parent,data}));
    });
    await tv.waitForTimeout(300);
    expect(await frame.evaluate(()=>window.__quackshot.game.gd.phase.type)).toBe(before);
    expect(await frame.evaluate(()=>document.querySelectorAll('.qs3-col').length)).toBe(2);
    expect(errors).toEqual([]);await viewerContext.close();
});

// Debug previews (made-up data) must play without corrupting the scores shown; an even game ends in a DEAD HEAT with
// every contender named in DOM text.
test('Quackshot 3D survives debug previews and shows a draw',async({page,browser})=>{
    test.setTimeout(240000);
    const errors=[];page.on('pageerror',e=>errors.push(e.message));
    const {tv,viewerContext,action,state,frame}=await pairAndStart(page,browser,['Alice','Ben']);
    tv.on('pageerror',e=>errors.push('TV: '+e.message));
    const P=player(page,frame,action,state);
    await P.dart(20,1,'I');
    for(const screen of ['outer_bull','double_bull','zone_minus','splash','next']){
        await action({action:'DEBUG_SHOW_SCREEN',screen});
        await page.waitForTimeout(600);
        await action({action:'DEBUG_SHOW_SCREEN',screen:'clear'});   // back to playing, the visit as it was
        await page.waitForTimeout(300);
    }
    await expect.poll(P.lies,{timeout:20000,intervals:[250]}).toBe('');
    // the rest of an even game: every visit three inner singles, so both finish level
    await P.dart(1,1,'I'); await P.dart(18,1,'I');
    for(let v=0;v<11;v++)for(const n of [4,13,6])await P.dart(n,1,'I');
    await expect.poll(async()=>(await state()).gameData.phase.type,{timeout:15000}).toBe('draw');
    const d=(await state()).gameData.phase.data;
    await expect(tv.frameLocator('#gameFrame').locator('.qs3-title')).toContainText('DEAD HEAT',{timeout:10000});
    for(const c of d.contenders)await expect(tv.frameLocator('#gameFrame').locator('.qs3-title-sub')).toContainText(c.name);
    await tv.screenshot({path:'output/playwright/quackshot-draw.png'});
    expect(errors).toEqual([]);await viewerContext.close();
});
