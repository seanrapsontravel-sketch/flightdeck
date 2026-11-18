const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const {SessionStore}=require('../src/storage');
const {playerName,avatar,validThrow}=require('../src/validation');
const {startSession,tickSession,sessionCommand,standings,upsertResult}=require('../src/session');
const players=['Alice','Ben','Chloe','Dev'].map((name,i)=>({id:String(i),name}));
test('strict names, photo formats and physical dart validation',()=>{
    assert.equal(playerName('<img src=x onerror=alert(1)>'),'<img src=x onerror=alert(1)>');
    assert.throws(()=>playerName('a'.repeat(41)));assert.throws(()=>avatar('javascript:alert(1)'));assert.throws(()=>avatar('data:image/png;base64,PHN2Zz4='));
    for(const p of [{number:19.5,multiplier:3},{number:21,multiplier:1},{number:'20',multiplier:1},{number:'bull',multiplier:3},{number:20,multiplier:1.5}])assert.equal(validThrow({type:'TRIGGER_SPECIFIC_THROW',...p}),false);
    assert.ok(validThrow({type:'TRIGGER_SPECIFIC_THROW',number:20,multiplier:3}));
});
test('versioned checkpoint restores pending transition, correction and event receipts',()=>{
    const dir=fs.mkdtempSync(path.join(os.tmpdir(),'fd-store-'));
    try{const store=new SessionStore(dir);const s={state:{players,session:startSession(players,30,1000)},pendingSchedule:{next:'x01_show_intermission',dueAt:3000},acceptedThrows:{'visit:0':true},scoreCorrection:{active:true}};store.save(s);const restored=store.load();assert.equal(restored.pendingSchedule.dueAt,3000);assert.equal(restored.state.session.deadline,1801000);assert.equal(restored.scoreCorrection.active,true);assert.equal(restored.acceptedThrows['visit:0'],true);fs.writeFileSync(store.file,'{"schemaVersion":99}');assert.throws(()=>store.load());}finally{fs.rmSync(dir,{recursive:true,force:true});}
});
test('deadline finishes only the current visit, including reconnect past deadline',()=>{
    const s=startSession(players,30,0);const gd={currentRound:1,activeIdx:0,throwsThisTurn:1,phase:{type:'playing'}};
    tickSession(s,gd,false,false,s.deadline);assert.equal(s.status,'expiring');
    gd.throwsThisTurn=2;tickSession(s,gd,false,false,s.deadline+100);assert.equal(s.status,'expiring');
    gd.throwsThisTurn=3;tickSession(s,gd,true,false,s.deadline+200);assert.equal(s.status,'ended');
    const idle=startSession(players,30,0);tickSession(idle,{...gd,throwsThisTurn:0},false,false,idle.deadline+1000);assert.equal(idle.status,'ended');
});
test('expiry handles pending animation, correction, setup and tiebreak boundaries',()=>{
    for(const phase of ['dart_callout','intermission','playoff','bust']){const s=startSession(players,30,0);tickSession(s,{currentRound:1,throwsThisTurn:3,phase:{type:phase}},true,false,s.deadline);assert.equal(s.status,'ended');}
    const s=startSession(players,30,0);const gd={currentRound:1,throwsThisTurn:2,phase:{type:'playing'}};tickSession(s,gd,false,true,s.deadline);assert.equal(s.status,'expiring');gd.throwsThisTurn=3;tickSession(s,gd,false,false,s.deadline+1);assert.equal(s.status,'ended');
    const firstDart=startSession(players,30,0);tickSession(firstDart,{currentRound:1,throwsThisTurn:0,phase:{type:'playing'}},false,true,firstDart.deadline);assert.equal(firstDart.status,'expiring');
    for(const phase of ['setup','pick_mode','pick_player','winner']){const a=startSession(players,30,0);tickSession(a,{throwsThisTurn:0,phase:{type:phase}},false,false,a.deadline);assert.equal(a.status,'ended');}
});
test('pause, resume, extension and early endings are recorded',()=>{
    const s=startSession(players,30,0);sessionCommand(s,'PAUSE_SESSION',null,1000);tickSession(s,null,false,false,99999999);assert.equal(s.status,'paused');sessionCommand(s,'CONTINUE_SESSION',null,6000);assert.equal(s.deadline,1805000);sessionCommand(s,'EXTEND_SESSION',30,7000);assert.equal(s.deadline,3605000);sessionCommand(s,'END_SESSION',null,8000);assert.equal(s.status,'ended');assert.equal(s.history.length,5);
});
test('three games, ties, corrections and simulation exclusions recalculate standings',()=>{
    const state={session:startSession(players,60),matchParticipants:players,matchSimulated:false,results:[]};state.matchSessionId=state.session.id;
    for(const game of ['derby','x01','cricket']){state.gameData={gameType:game,matchKey:game,players:players.map(p=>({...p,score:p.id==='0'?9:0})),phase:{type:'winner',data:{winnerId:'0'}}};upsertResult(state);}
    assert.equal(standings(state.session,state.results)[0].points,30);
    assert.equal(standings(state.session,state.results).find(p=>p.id==='1').points,15); // shared 2nd–4th: (7+5+3)/3
    state.gameData={gameType:'derby',matchKey:'derby',players:players.map(p=>({...p,score:0})),phase:{type:'draw',data:{contenders:[players[0],players[1]]}}};upsertResult(state);
    assert.equal(state.results.length,3);assert.equal(state.results.find(r=>r.id==='derby').version,2);
    assert.equal(standings(state.session,state.results)[0].points,28.5);
    state.matchSimulated=true;upsertResult(state);assert.equal(standings(state.session,state.results)[0].points,20);
    state.matchSimulated=false;upsertResult(state,'abandoned');assert.equal(standings(state.session,state.results)[0].points,20);
});
test('changing participants, solo challenges and doubles never silently count',()=>{
    const state={session:startSession(players,30),matchParticipants:players.slice(0,2),matchSessionId:null,gameData:{gameType:'x01',matchKey:'a',phase:{type:'winner',data:{winnerId:'0'}}}};
    upsertResult(state);assert.equal(state.results[0].excluded,'different_participants');state.matchParticipants=players;state.matchIsDoubles=true;upsertResult(state);assert.equal(state.results[0].excluded,'teams');state.matchIsDoubles=false;state.gameData.gameType='quick10';state.gameData.phase.type='complete';upsertResult(state);assert.equal(state.results[0].excluded,'solo_or_practice');
});
test('failed checkpoint write preserves the previous committed score',()=>{
    const dir=fs.mkdtempSync(path.join(os.tmpdir(),'fd-disk-'));
    try {
        const store=new SessionStore(dir);store.save({state:{players,score:281}});
        fs.mkdirSync(store.file+'.tmp');
        assert.throws(()=>store.save({state:{players,score:221}}));
        assert.equal(store.load().state.score,281);
    } finally {fs.rmSync(dir,{recursive:true,force:true});}
});
