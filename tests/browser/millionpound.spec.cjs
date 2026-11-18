const {test,expect}=require('@playwright/test');
const fs=require('node:fs');
const {startHost}=require('../helpers.cjs');
let host;
// the TV renders WebGL: give the browser the GPU, so this measures the real thing
test.use({launchOptions:{args:['--enable-gpu','--use-angle=metal','--ignore-gpu-blocklist','--enable-unsafe-swiftshader']}});
test.beforeEach(async()=>{host=await startHost();});
test.afterEach(async()=>{if(host){await host.stop();fs.rmSync(host.dataDir,{recursive:true,force:true});host=null;}});

const PAGE='/games/millionpound.html';
const ANCHOR={A:20,B:6,C:3,D:11};
const BEDS=['single_inner','single_outer','treble','double'];

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
    await page.locator('#tabSocial').click();await page.locator('.game-card[data-game="millionpound"]').click();await page.locator('#btnSelectionPlay').click();
    await expect.poll(async()=>(await state()).gameData?.gameType).toBe('millionpound');
    await expect(tv.locator('#gameFrame')).toHaveAttribute('src',/games\/millionpound\.html/);
    let frame=null;
    await expect.poll(async()=>{frame=tv.frames().find(f=>f.url().includes(PAGE));return !!frame&&await frame.evaluate(()=>!!(window.__millionpound&&window.__millionpound.game&&window.__millionpound.game.gd)).catch(()=>false);},{timeout:30000}).toBe(true);
    return {tv,viewerContext,action,state,frame};
}

/** nothing lies: once the TV has settled, what it shows equals the server's state */
function checker(frame,state){
    const thrown=[];
    async function lies(){
        const g=(await state()).gameData;
        const t=await frame.evaluate(()=>window.__millionpound.truth());
        if(!t||!t.settled)return 'unsettled '+JSON.stringify(t&&t.busy);
        const m=[];
        g.players.forEach((p,i)=>{
            if(!t.chips[i]||t.chips[i].rung!==p.rung)m.push(`${p.name} chip rung ${t.chips[i]&&t.chips[i].rung} vs ${p.rung}`);
            if(!t.towers[i]||t.towers[i].rung!==p.rung)m.push(`${p.name} tower rung ${t.towers[i]&&t.towers[i].rung} vs ${p.rung}`);
        });
        const ph=g.phase.type,q=g.question;
        if(['playing','locked','reveal'].includes(ph)&&q){
            if(!t.question)m.push('question not on screen');
            else{
                if(t.question.text!==q.text)m.push(`question "${t.question.text}" vs "${q.text}"`);
                for(const L of ['A','B','C','D'])if(t.question.answers[L].text!==q.answers[L])m.push(`answer ${L} "${t.question.answers[L].text}" vs "${q.answers[L]}"`);
            }
            if(t.round!==g.currentRound||t.q!==q.number)m.push(`round pill ${t.round}/${t.q} vs ${g.currentRound}/${q.number}`);
            if(t.active!==g.activeIdx)m.push(`active ${t.active} vs ${g.activeIdx}`);
            // green only once revealed, and then only the right answer
            if(ph!=='reveal'&&t.green.length)m.push(`green before the reveal: ${t.green}`);
            if(ph==='reveal'&&!g.phase.data.final&&(t.green.length!==1||t.green[0]!==g.phase.data.correctKey))m.push(`green ${t.green} vs ${g.phase.data.correctKey}`);
            if(ph==='locked'){const a=g.phase.data.answer;for(const L of ['A','B','C','D'])if((t.quads[L]==='locked')!==(L===a))m.push(`quadrant ${L} ${t.quads[L]} with answer ${a}`);
                if(a&&!t.question.answers[a].cls.includes('is-locked'))m.push(`lozenge ${a} not locked in`);}
            if(ph==='playing'&&Object.values(t.quads).some(s=>s!=='live'))m.push(`quadrants not live: ${JSON.stringify(t.quads)}`);
            // the board shows exactly this visit's answer zones, and the stakes are the server's
            const live=Object.values(q.zones).flat().sort((a,b)=>a-b);
            if(t.zoneSize!==q.zoneSize||JSON.stringify(t.activeWedges)!==JSON.stringify(live))m.push(`zones ${t.zoneSize} ${t.activeWedges} vs ${q.zoneSize} ${live}`);
            if(ph==='playing'&&q.stakes&&(!t.stakes||t.stakes.right!==q.stakes.right||t.stakes.treble!==q.stakes.trebleRight||t.stakes.wrong!==q.stakes.trebleWrong))m.push(`stakes ${JSON.stringify(t.stakes)} vs ${JSON.stringify(q.stakes)}`);
            const nd=(g.turnDarts||[]).length;   // = throwsThisTurn, except a sudden-death dart (a visit of its own)
            if(t.darts.length!==nd)m.push(`darts ${t.darts.length} vs ${nd}`);
            else thrown.slice(thrown.length-t.darts.length).forEach((d,k)=>{const got=t.darts[k];
                const want=d.miss?'miss':d.n==='bull'?(d.m===2?'bull':'outer_bull'):null;
                if(want&&got.bed!==want)m.push(`dart ${k} in ${got.bed} vs ${want}`);
                if(!want&&(got.number!==d.n||!BEDS.includes(got.bed)))m.push(`dart ${k} in ${got.bed} ${got.number} vs ${d.n}`);});
        }
        return m.join('; ');
    }
    return {lies,thrown,settled:()=>expect.poll(lies,{timeout:20000,intervals:[250]}).toBe('')};
}

// Million Pound Oche (rules V2) on the TV through the real server: a whole two-player game, 15 questions each (and
// sudden death if they finish level). After the dart (locked), at the reveal and on the next question, the TV must
// equal the server: the question and answers as DOM text, the board's live answer zones (5 / 5 / 3 / 3 / 2), the
// stakes (right / treble / wrong treble), the amber lock, green only at the reveal and only on the right answer, every
// prize on the chips and towers, the round pill, the active player, and each dart in its bed. Covers right, right
// double and right treble (+2), wrong and wrong treble (−1), the first inner bull (free pass) and a second one (no
// answer), the outer bull, a miss, a number out of play, darts between questions dropped, and the winner.
test('Million Pound Oche on the TV tells the truth through a whole game',async({page,browser})=>{
    test.setTimeout(480000);
    const errors=[];page.on('pageerror',e=>errors.push(e.message));
    page.on('websocket',ws=>ws.on('framereceived',({payload})=>{try{const m=JSON.parse(String(payload));if(m.type==='COMMAND_ERROR')errors.push(m.error);}catch{}}));
    const {tv,viewerContext,state,frame,action}=await pairAndStart(page,browser,['Christopher & Maximilian','Ben']);
    tv.on('pageerror',e=>errors.push('TV: '+e.message));
    tv.on('console',m=>{if(m.type()==='error')errors.push('TV console: '+m.text());});
    const C=checker(frame,state);
    await expect(tv.frameLocator('#gameFrame').locator('.kit-intro')).toHaveClass(/is-on/,{timeout:10000});
    await expect(tv.frameLocator('#gameFrame').locator('.kit-intro-title')).toHaveText('Million Pound Oche');
    // the spoiler check: the right answer is in the state, but never on screen before the reveal
    const spoiler=async()=>frame.evaluate(()=>document.querySelectorAll('.mpo-ans.is-right').length);
    const plan=[];   // what each question gets: right, wrong, treble, double, bull, outer bull, miss
    const kinds=['right','wrong','right-T','bull','miss','right-D','wrong-T','outer','right','inactive','bull','right'];
    for(let k=0;k<30;k++)plan.push(kinds[k%kinds.length]);
    let k=0,dropped=0;const seen=new Set();
    while(true){
        await expect.poll(async()=>{const g=(await state()).gameData;return ['winner','draw'].includes(g.phase.type)||(g.phase.type==='playing'&&g.dartsThisQuestion===0);},{timeout:30000}).toBe(true);
        const g=(await state()).gameData;
        if(['winner','draw'].includes(g.phase.type))break;
        if(g.questionInTurn===0)await action({action:'BOARD_COMMAND',command:'RESET_PHASE'});
        if(g.suddenDeath){seen.add('sudden_death');}
        await C.settled();
        expect(await spoiler()).toBe(0);
        let kind=plan[k++]||'right';const key=g.question.correctKey,wrong=['A','B','C','D'].find(L=>L!==key);
        const live=new Set(Object.values(g.question.zones).flat()),off=[...Array(20)].map((_,i)=>i+1).filter(n=>!live.has(n));
        if(kind==='inactive'&&!off.length)kind='miss';
        const passUsed=g.players[g.activeIdx].passUsed;
        let d;
        if(kind.startsWith('right'))d={n:ANCHOR[key],m:kind==='right-T'?3:kind==='right-D'?2:1};
        else if(kind==='wrong')d={n:ANCHOR[wrong],m:1};
        else if(kind==='wrong-T')d={n:ANCHOR[wrong],m:3};
        else if(kind==='inactive')d={n:off[0],m:3};
        else if(kind==='bull')d={n:'bull',m:2};
        else if(kind==='outer')d={n:'bull',m:1};
        else d={miss:true};
        if(g.questionInTurn===0)C.thrown.length=0;
        C.thrown.push(d);
        const payload=d.miss?{type:'TRIGGER_SPECIFIC_THROW',miss:true}:d.n==='bull'?{type:'TRIGGER_SPECIFIC_THROW',number:'bull',multiplier:d.m,sector:d.m===2?'Bull':'25'}
            :{type:'TRIGGER_SPECIFIC_THROW',number:d.n,multiplier:d.m,sector:(d.m===3?'T':d.m===2?'D':'s')+d.n};
        const idx=g.activeIdx,n0=g.players[idx].answers.length,seq0=await frame.evaluate(()=>window.__millionpound.game.seq);
        await action({action:'FORWARD_GAME_ACTION',payload});
        // a second dart before the next question: dropped, never held for later
        if(k%5===2){await action({action:'FORWARD_GAME_ACTION',payload:{type:'TRIGGER_SPECIFIC_THROW',number:20,multiplier:1,sector:'s20'}});dropped++;
            const gg=(await state()).gameData;expect(gg.dartsThisQuestion+(gg.players[idx].answers.length-n0)).toBeLessThanOrEqual(1);}
        // the outcome, as the server recorded it at the reveal
        await expect.poll(async()=>(await state()).gameData.players[idx].answers.length,{timeout:10000,intervals:[50]}).toBe(n0+1);
        const a=(await state()).gameData.players[idx].answers[n0];
        const want={right:'right','right-D':'right','right-T':'treble_right',wrong:'wrong','wrong-T':'treble_wrong',bull:passUsed?'pass_used':'pass',outer:'outer_bull',miss:'miss',inactive:'inactive'}[kind];
        if(!a.suddenDeath)expect(a.outcome,kind).toBe(want);
        seen.add(a.suddenDeath?'sudden_death':want);
        // the TV locked in exactly the answer the server judged (amber on that quadrant and lozenge), then revealed it
        await expect.poll(async()=>{const L=await frame.evaluate(n=>window.__millionpound.game.log.filter(e=>e.n>n),seq0);
            const imp=L.find(e=>e.e==='impact'),rev=L.find(e=>e.e==='reveal');
            return imp&&rev?`${imp.answer} ${imp.pass} | ${rev.key}`:'waiting';},{timeout:10000,message:`dart ${JSON.stringify(d)} kind ${kind} k ${k} answer ${JSON.stringify(a)} log ${JSON.stringify(await frame.evaluate(n=>window.__millionpound.game.log.filter(e=>e.n>n-12).map(e=>[e.n,e.e,e.answer,e.key,e.id,e.n0]),seq0))} seq0 ${seq0}`}).toBe(`${a.chosen} ${!!a.pass} | ${a.correctKey}`);
        await C.settled();
    }
    const g=(await state()).gameData;
    expect(dropped).toBeGreaterThan(3);
    for(const o of ['right','treble_right','wrong','treble_wrong','pass','pass_used','outer_bull','miss','inactive'])expect(seen.has(o),o).toBe(true);
    g.players.forEach(p=>expect(p.answers.filter(a=>!a.suddenDeath).length).toBe(15));
    expect(g.phase.type).toBe('winner');
    await expect(tv.frameLocator('#gameFrame').locator('.mpo-title')).toContainText('CHAMPION',{timeout:10000});
    await expect(tv.frameLocator('#gameFrame').locator('.mpo-title-sub')).toContainText(g.phase.data.winnerName);
    await expect(tv.frameLocator('#gameFrame').locator('.mpo-final-row')).toHaveCount(2);
    await expect.poll(C.lies,{timeout:10000}).toBe('');
    await tv.screenshot({path:'output/playwright/millionpound-end.png'});
    // the page ignores state that isn't from its parent viewer on this origin
    const before=await frame.evaluate(()=>window.__millionpound.game.gd.phase.type);
    await frame.evaluate(()=>{
        const data={type:'SYNC_STATE',state:{gameData:{gameType:'millionpound',seed:1,players:[{id:'x',name:'FORGED',rung:9}],activeIdx:0,throwsThisTurn:0,currentRound:1,phase:{type:'playing',data:{}},lastThrow:null}}};
        window.dispatchEvent(new MessageEvent('message',{origin:location.origin,source:window,data}));
        window.dispatchEvent(new MessageEvent('message',{origin:'https://evil.invalid',source:parent,data}));
    });
    await tv.waitForTimeout(300);
    expect(await frame.evaluate(()=>window.__millionpound.game.gd.phase.type)).toBe(before);
    expect(errors).toEqual([]);await viewerContext.close();
});

// Debug previews (locked, right, wrong, pass, million, next, winner, draw) play without corrupting what's shown,
// and a corrected dart (Correct Score) replays the same question with the new answer.
test('Million Pound Oche survives previews and a corrected dart',async({page,browser})=>{
    test.setTimeout(240000);
    const errors=[];page.on('pageerror',e=>errors.push(e.message));
    const {tv,viewerContext,action,state,frame}=await pairAndStart(page,browser,['Alice','Ben']);
    tv.on('pageerror',e=>errors.push('TV: '+e.message));
    const C=checker(frame,state);
    await C.settled();
    for(const screen of ['mpo_locked','mpo_right','mpo_treble','mpo_wrong','mpo_wrong_treble','mpo_pass','mpo_million','next','winner','draw']){
        await action({action:'DEBUG_SHOW_SCREEN',screen});
        await page.waitForTimeout(800);
        await action({action:'DEBUG_SHOW_SCREEN',screen:'clear'});
        await page.waitForTimeout(500);
    }
    await C.settled();
    // a misread dart: the wrong quadrant, then Correct Score puts it in the right one
    const g0=(await state()).gameData,key=g0.question.correctKey,wrong=['A','B','C','D'].find(L=>L!==key);
    C.thrown.length=0;C.thrown.push({n:ANCHOR[wrong],m:1});
    await action({action:'FORWARD_GAME_ACTION',payload:{type:'TRIGGER_SPECIFIC_THROW',number:ANCHOR[wrong],multiplier:1,sector:'s'+ANCHOR[wrong]}});
    await expect.poll(async()=>(await state()).gameData.phase.type).toBe('locked');
    await action({action:'CORRECT_SCORE_BEGIN'});
    await expect.poll(async()=>(await state()).gameData.phase.type).toBe('playing');
    C.thrown.length=0;C.thrown.push({n:ANCHOR[key],m:1});
    await action({action:'CORRECT_SCORE_APPLY',payload:{type:'TRIGGER_SPECIFIC_THROW',number:ANCHOR[key],multiplier:1,sector:'s'+ANCHOR[key]}});
    await expect.poll(async()=>(await state()).gameData.phase.type,{timeout:8000}).toBe('reveal');
    const g=(await state()).gameData;
    expect(g.question.id).toBe(g0.question.id);
    expect(g.phase.data.right).toBe(true);
    expect(g.players[0].rung).toBe(1);
    await C.settled();
    await tv.screenshot({path:'output/playwright/millionpound-corrected.png'});
    expect(errors).toEqual([]);await viewerContext.close();
});
