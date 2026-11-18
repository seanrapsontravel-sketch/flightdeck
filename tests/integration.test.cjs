const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {randomUUID}=require('node:crypto');
const {startHost,until,delay}=require('./helpers.cjs');
const {topMatches}=require('../src/matchHistory');

test('paired permissions, durable darts, recovery, correction and championship clock', {timeout:90000}, async()=>{
    let host=await startHost();const dir=host.dataDir;
    try {
        const operatorCookie=await host.pair();
        const controlCookie=await host.pair('control');
        const viewer=await host.connect();
        const tablet=await host.connect(controlCookie);
        const pairedTV=await host.connect(operatorCookie,host.base,'viewer');
        assert.equal((await pairedTV.command({action:'ADD_PLAYER',name:'TV must stay read only'})).type,'COMMAND_ERROR');
        let peer=await host.connect(operatorCookie);
        assert.equal((await viewer.command({action:'ADD_PLAYER',name:'Intruder'})).type,'COMMAND_ERROR');
        assert.equal((await tablet.command({action:'RESET_MATCH'})).type,'COMMAND_ERROR');
        assert.equal((await tablet.command({action:'SAVE_VENUE_CONFIG',patch:{arenaName:'Intruder'}})).type,'COMMAND_ERROR');
        assert.equal((await tablet.command({action:'FORWARD_GAME_ACTION',payload:{type:'TRIGGER_THROW'}})).type,'COMMAND_ERROR');
        assert.equal((await host.request('/api/restart','POST',{},null)).status,403);
        assert.equal((await host.request('/api/debug/winner-clip','POST',{},null)).status,403);
        assert.equal((await host.request('/api/pair','POST',{role:'operator',code:host.codes.operator},null,'https://evil.invalid')).status,403);
        await assert.rejects(host.connect(null,'https://evil.invalid'));
        assert.equal((await peer.command({action:'ADD_PLAYER',name:'x'.repeat(41)})).type,'COMMAND_ERROR');
        assert.equal((await peer.command({action:'ADD_PLAYER',name:'Bad photo',avatar:'javascript:alert(1)'})).type,'COMMAND_ERROR');
        await peer.command({action:'ADD_PLAYER',name:'<img src=x onerror=alert(1)>'});
        await peer.command({action:'ADD_PLAYER',name:'Ben'});
        await peer.command({action:'FILL_LINEUP'});
        await peer.command({action:'SAVE_VENUE_CONFIG',patch:{viewerVideoEnabled:false,dartCalloutMode:'off'}});
        await peer.command({action:'START_SESSION',minutes:30});
        const deadline=peer.state.session.deadline;
        await peer.command({action:'SELECT_GAME',gameType:'x01'});
        await peer.command({action:'FORWARD_GAME_ACTION',payload:{type:'CONFIRM_X01_SETUP',startScore:301,dartIn:'none',dartOut:'double'}});
        const dart={action:'FORWARD_GAME_ACTION',payload:{type:'TRIGGER_SPECIFIC_THROW',number:20,multiplier:3,eventId:'physical-visit-1:0'}};
        const commandId=randomUUID();await peer.command(dart,commandId);
        assert.equal(peer.state.gameData.players[0].score,241);
        const failed=await peer.command({action:'FORWARD_GAME_ACTION',payload:{type:'TRIGGER_SPECIFIC_THROW',number:19.5,multiplier:3}});
        assert.equal(failed.type,'COMMAND_ERROR');assert.equal(peer.state.gameData.players[0].score,241);
        await peer.command(dart);assert.equal(peer.state.gameData.players[0].score,241);
        await peer.command({...dart,payload:{...dart.payload,eventId:'physical-visit-1:1'}});
        assert.equal(peer.state.gameData.players[0].score,181); // repeated T20 is legitimate
        await host.stop('SIGKILL');
        host=await startHost(dir);peer=await host.connect(operatorCookie);
        assert.equal(peer.state.recoveryRequired,true);assert.equal(peer.state.gameData.players[0].score,181);assert.equal(peer.state.session.deadline,deadline);
        const duplicate=await peer.command(dart,commandId);assert.equal(duplicate.duplicate,true);
        await peer.command({action:'RESUME_SESSION'});assert.equal(peer.state.recoveryRequired,false);
        await peer.command({...dart,payload:{...dart.payload,eventId:'physical-visit-1:1'}});assert.equal(peer.state.gameData.players[0].score,181);
        await peer.command({action:'CORRECT_SCORE_BEGIN'});assert.equal(peer.state.gameData.players[0].score,241);
        await host.stop('SIGKILL');host=await startHost(dir);peer=await host.connect(operatorCookie);await peer.command({action:'RESUME_SESSION'});
        assert.equal(peer.state.scoreCorrection.active,true);
        await peer.command({action:'CORRECT_SCORE_CANCEL'});assert.equal(peer.state.gameData.players[0].score,181);
        await peer.command({action:'NAVIGATE',screen:'GAME_SELECTION'});
        assert.equal(peer.state.results[0].status,'abandoned');
        await peer.command({action:'SELECT_GAME',gameType:'quick10'});
        await peer.command({action:'FORWARD_GAME_ACTION',payload:{type:'SELECT_QUICK10_PLAYER',playerId:peer.state.players[0].id}});
        async function throwD(payload) {
            await until(()=>peer.state.gameData.phase.type==='playing' && peer.state.gameData.throwsThisTurn < 3);
            if(peer.board?.awaitingTakeout) {await peer.command({action:'BOARD_COMMAND',command:'RESET_PHASE'});await until(()=>!peer.board.awaitingTakeout);}
            const r=await peer.command({action:'FORWARD_GAME_ACTION',payload:{type:'TRIGGER_SPECIFIC_THROW',...payload}});assert.equal(r.type,'COMMAND_ACK');
        }
        for(let i=0;i<10;i++) for(const p of [{number:20,multiplier:3},{number:19,multiplier:1},{miss:true}]) await throwD(p);
        await until(()=>peer.state.gameData.phase.type==='complete');assert.equal(peer.state.gameData.totalScore,790);
        const resultId=peer.state.gameData.savedMatchId;
        await peer.command({action:'CORRECT_SCORE_BEGIN'});
        await peer.command({action:'CORRECT_SCORE_APPLY',payload:{type:'TRIGGER_SPECIFIC_THROW',number:'bull',multiplier:2}});
        // Kill during the pending commit animation; its schedule must recover.
        await host.stop('SIGKILL');host=await startHost(dir);peer=await host.connect(operatorCookie);await peer.command({action:'RESUME_SESSION'});
        await until(()=>peer.state.gameData.phase.type==='complete');assert.equal(peer.state.gameData.totalScore,840);
        assert.equal(peer.state.gameData.savedMatchId,resultId);
        const rows=topMatches(dir,'quick10',100);assert.equal(rows.length,1);assert.equal(rows[0].totalScore,840);
        const before=JSON.stringify(peer.state.gameData);
        await peer.command({action:'FORWARD_GAME_ACTION',payload:{type:'TRIGGER_SPECIFIC_THROW',number:20,multiplier:3}});assert.equal(JSON.stringify(peer.state.gameData),before);
        await peer.command({action:'NAVIGATE',screen:'GAME_SELECTION'});
        await peer.command({action:'SELECT_GAME',gameType:'x01'});
        await peer.command({action:'FORWARD_GAME_ACTION',payload:{type:'CONFIRM_X01_SETUP',startScore:301,dartIn:'none',dartOut:'double'}});
        await peer.command({action:'FORWARD_GAME_ACTION',payload:{type:'TRIGGER_SPECIFIC_THROW',number:20,multiplier:1}});
        await host.stop('SIGKILL');
        const checkpointPath=path.join(dir,'session.json');const saved=JSON.parse(fs.readFileSync(checkpointPath));saved.state.session.deadline=Date.now()-1000;fs.writeFileSync(checkpointPath,JSON.stringify(saved));
        host=await startHost(dir);peer=await host.connect(operatorCookie);await peer.command({action:'RESUME_SESSION'});assert.equal(peer.state.session.status,'expiring');
        await peer.command({action:'FORWARD_GAME_ACTION',payload:{type:'TRIGGER_SPECIFIC_THROW',number:20,multiplier:1}});
        await peer.command({action:'FORWARD_GAME_ACTION',payload:{type:'TRIGGER_SPECIFIC_THROW',number:20,multiplier:1}});
        await until(()=>peer.state.session.status==='ended');
        const last=peer.state.gameData.players[0].score;
        await peer.command({action:'FORWARD_GAME_ACTION',payload:{type:'TRIGGER_SPECIFIC_THROW',number:20,multiplier:1}});assert.equal(peer.state.gameData.players[0].score,last);
        assert.ok(peer.state.eventLog.length===0);
        assert.ok(fs.statSync(path.join(dir,'session.json')).size<500000);
    } finally {await host.stop();fs.rmSync(dir,{recursive:true,force:true});}
});

test('storage failure stops scoring before acknowledgements or score broadcasts', {timeout:30000}, async()=>{
    const host=await startHost();
    try {
        const peer=await host.connect(await host.pair());
        await peer.command({action:'ADD_PLAYER',name:'Alice'});await peer.command({action:'FILL_LINEUP'});
        await peer.command({action:'SELECT_GAME',gameType:'quick10'});
        fs.mkdirSync(path.join(host.dataDir,'session.json.tmp'));
        const before=peer.messages.length;
        peer.ws.send(JSON.stringify({action:'FORWARD_GAME_ACTION',payload:{type:'TRIGGER_SPECIFIC_THROW',number:20,multiplier:3},commandId:randomUUID(),issuedAt:Date.now()}));
        await until(()=>peer.ws.readyState===3);
        const delivered=peer.messages.slice(before);
        assert.equal(delivered.some(m=>['STATE_UPDATE','DART_ANNOUNCE','COMMAND_ACK'].includes(m.type)),false);
        assert.equal((await host.request('/api/health')).body.ok,false);
        const saved=JSON.parse(fs.readFileSync(path.join(host.dataDir,'session.json')));
        assert.equal(saved.state.gameData.throwsThisTurn,0);
    } finally {await host.stop();fs.rmSync(host.dataDir,{recursive:true,force:true});}
});
