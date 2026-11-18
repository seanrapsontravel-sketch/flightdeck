const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const root=path.resolve(__dirname,'..');
const engines=require(root+'/src/engines');
const {registeredGames}=require(root+'/src/engines/registry');
const {mapAutodartsSegment:ad}=require(root+'/src/board/autodarts/mapThrow');
const {mapOpenDartsThrow:od}=require(root+'/src/board/opendarts/mapThrow');
const {mapScoliaThrow:sc}=require(root+'/src/board/scolia/scoliaClient');
const core=require(root+'/src/engines/core');
const history=require(root+'/src/matchHistory');
const players=['Alice','Ben','Chloe','Dev'].map((name,i)=>({id:String(i),name,avatar:null}));
function settle(result){for(let i=0;result.schedule && i<30;i++) result=engines.applyScheduledAction(result.gameData,result.schedule); assert.equal(result.schedule,null);return result.gameData;}
for(const game of registeredGames()) test(game+' initialisation and one valid dart through public engine interface',()=>{
 let g=engines.initGameData(game,players);
 if(game==='x01')g=engines.handleGameAction(g,game,{type:'CONFIRM_X01_SETUP',startScore:301,dartIn:'none',dartOut:'double'}).gameData;
 if(game==='quick10')g=engines.handleGameAction(g,game,{type:'SELECT_QUICK10_PLAYER',playerId:'0'}).gameData;
 if(game==='aroundtheworld' && g.phase.type==='pick_mode')g=engines.handleGameAction(g,game,{type:'CONFIRM_ATW_SETUP',variant:'standard'}).gameData;
 g=settle({gameData:g,schedule:engines.initialMatchSchedule(g)});
 const r=engines.handleGameAction(g,game,{type:'TRIGGER_SPECIFIC_THROW',number:20,multiplier:3,sector:'T20'},{throwSource:'mock'});
 assert.ok(r.gameData);assert.ok(JSON.stringify(r.gameData));settle(r);
});
test('All 60 numbered beds map consistently across three providers',()=>{
 for(let n=1;n<=20;n++)for(let m=1;m<=3;m++){
  const sector=(m===1?'s':m===2?'D':'T')+n;
  const mapped=[ad({name:sector,bed:m===1?'SingleInner':m===2?'Double':'Triple',number:n,multiplier:m}),od({ring:m===1?'single_inner':m===2?'double':'treble',sector:n}),sc({sector})];
  for(const dart of mapped){assert.equal(dart.number,n);assert.equal(dart.multiplier,m);assert.equal(core.throwScoreFromTarget(dart.number,dart.multiplier),n*m);}
 }
});
test('Bulls, misses and inner/outer singles preserve scoring distinctions',()=>{
 for(const [a,b,c,points] of [[{number:25,multiplier:1},{ring:'outer_bull',sector:25},{sector:'25'},25],[{number:25,multiplier:2},{ring:'bull',sector:25},{sector:'Bull'},50]])for(const d of [ad(a),od(b),sc(c)])assert.equal(core.throwScoreFromTarget(d.number,d.multiplier),points);
 assert.equal(ad({number:5,multiplier:1,bed:'SingleInner'}).sector,'s5');assert.equal(ad({number:5,multiplier:1,bed:'SingleOuter'}).sector,'S5');
 assert.equal(od({ring:'single_inner',sector:5}).sector,'s5');assert.equal(od({ring:'single_outer',sector:5}).sector,'S5');
 assert.ok(sc({sector:'T20',bounceout:true}).miss);assert.ok(od({ring:'miss',sector:0}).miss);assert.ok(ad({name:'Miss',multiplier:0}).miss);
});
test('X01 exact checkout, double requirement and bust rollback',()=>{
 let g=engines.initGameData('x01',players);
 g=engines.handleGameAction(g,'x01',{type:'CONFIRM_X01_SETUP',startScore:301,dartIn:'none',dartOut:'double'}).gameData;
 const throwD=(n,m)=>engines.handleGameAction(g,'x01',{type:'TRIGGER_SPECIFIC_THROW',number:n,multiplier:m},{throwSource:'mock'});
 for(let i=0;i<3;i++){const r=throwD(20,3);g=r.gameData;if(i===2)g=settle(r);}
 assert.equal(g.players[0].score,121);
 // Return to first player with three misses per other player, using normal scheduled rules.
 for(let p=0;p<3;p++)for(let d=0;d<3;d++)g=settle(engines.handleGameAction(g,'x01',{type:'TRIGGER_SPECIFIC_THROW',miss:true},{throwSource:'mock'}));
 g=settle(throwD(20,3));assert.equal(g.players[0].score,61);
 g=settle(throwD(20,3));assert.equal(g.players[0].score,121); // leaves one: bust whole visit
});
test('History skips a torn line and latest same-id correction replaces earlier score',()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'flightdeck-history-'));
 try {
  const record={id:'same',gameType:'quick10',totalScore:500,playedAt:'2026-11-16T20:00:00Z',player:{id:'0',name:'Alice'}};
  assert.ok(history.appendMatch(dir,record).ok);
  fs.appendFileSync(history.matchesPath?history.matchesPath(dir):path.join(dir,history.MATCHES_FILE),'broken-json\n');
  assert.ok(history.appendMatch(dir,{...record,totalScore:400}).ok);
  const top=history.topMatches(dir,'quick10');assert.equal(top.length,1);assert.equal(top[0].totalScore,400);
 } finally {fs.rmSync(dir,{recursive:true,force:true});}
});
test('Quick10 ten 79-point visits total 790 with debug provenance',()=>{
 let g=engines.initGameData('quick10',[players[0]]);
 for(let i=0;i<10;i++)for(const p of [{number:20,multiplier:3},{number:19,multiplier:1},{miss:true}])g=settle(engines.handleGameAction(g,'quick10',{type:'TRIGGER_SPECIFIC_THROW',...p},{throwSource:'debug'}));
 assert.equal(g.totalScore,790);assert.equal(g.phase.type,'complete');assert.equal(g.usedDebug,true);
});
test('fixed order preserves the lineup and random order is explicit',()=>{
 const ids=players.map(p=>p.id);
 assert.deepEqual(engines.initGameData('derby',players).players.map(p=>p.id),ids);
 const random=Math.random;
 try { Math.random=()=>0; assert.notDeepEqual(engines.initGameData('derby',players,{playOrder:'random'}).players.map(p=>p.id),ids); }
 finally { Math.random=random; }
});
