// usage: node docs/plans/tools/sound-reel.cjs <out.wav>   (Limbo sound: offline render of every moment; see docs/plans/LIMBO-3D-SOUND.md)
// Renders Limbo's sound engine offline: a scripted reel of every moment, in game order, as the heat rises → WAV.
const R='/Users/seanrapson/flightdeck-fork/';const {chromium}=require(R+'node_modules/playwright');const {startHost}=require(R+'tests/helpers.cjs');const fs=require('fs');
(async()=>{const OUT=process.argv[2];const host=await startHost();const b=await chromium.launch();const p=await (await b.newContext({ignoreHTTPSErrors:true})).newPage();
 const logs=[];p.on('console',m=>logs.push(m.type()+': '+m.text()));p.on('pageerror',e=>logs.push('PAGEERROR '+e.message));
 await p.goto(host.base+'/games/limbo.html?sound=0&loop=0');
 const b64=await p.evaluate(async(STEM)=>{
  const {LimboAudio}=await import('/games/limbo/audio.js');
  const SR=48000,T=34,ctx=new OfflineAudioContext(2,SR*T,SR);
  const A=new LimboAudio({ctx,volume:0.85});
  const url='/assets/shared/winner-cheers.mp3';A.clips=new Map([[url,await ctx.decodeAudioData(await (await fetch(url)).arrayBuffer())]]);
  const heat=(h,t)=>{A.heat=h;A.roar&&A.roar.gain.setTargetAtTime(0.05+0.2*h,t,0.6);A.murmur&&A.murmur.gain.setTargetAtTime(0.045+0.06*h,t,1.2);};
  const tension=(v,t)=>{if(!A.drone)A.setTension(0.001);A.drone.g.gain.setTargetAtTime(0.11*v*v,t,0.25);A.drone.lp.frequency.setTargetAtTime(220+900*v*v,t,0.3);};
  A.startAmbience(0);A.startGroove(0.5);heat(0,0);
  const stem=STEM;if(stem){const z={amb:[A.sfx,A.crowd,A.musicDuck],music:[A.sfx,A.crowd,A.amb],sfx:[A.amb,A.crowd,A.musicDuck],crowd:[A.amb,A.sfx,A.musicDuck]}[stem];for(const g of z)g.gain.value=0;if(stem!=='music')A.musicDuck.gain.value=0;A.duck=()=>{};}
  const ev=[
   [1.0,()=>A.visitStart(1.0)],[1.6,()=>A.leap(-0.5,1.6)],[2.5,()=>A.land(2.5)],
   [3.0,()=>A.dart({total:12,score:12,bar:60},3.0)],[4.4,()=>A.dart({total:30,score:18,bar:60},4.4)],[5.8,()=>A.dart({total:41,score:11,bar:60},5.8)],
   [6.4,()=>{A.cheer(6.4);A.limbo(6.4);A.flourish(6.55);}],[7.7,()=>A.splash(7.7)],
   [7.45,()=>{for(let i=0;i<19;i++)A.tooth('drop',i===18,7.45+i*0.074);}],
   [9.0,()=>heat(19/57,9.0)],
   [10.0,()=>A.visitStart(10.0)],[11.0,()=>A.coconutFall(11.0)],[11.45,()=>{A.bonk(11.45);A.dart({total:25,score:25,bar:41},11.0);}],
   [12.6,()=>tension(0.5,12.6)],
   [13.2,()=>{A.fireball(13.2,1);A.groan(13.55);A.conch(13.9);A.dropOut(2);tension(0,13.2);}],[14.4,()=>A.snuff(-0.6,14.4)],
   [15.6,()=>{A.resetRun(0.9,15.6);for(let i=0;i<19;i++)A.tooth('reset',false,15.6+i*0.047);heat(0,15.6);}],
   [17.0,()=>heat(52/57,17.0)],[17.2,()=>{A.visitStart(17.2);tension(0.3,17.2);}],[18.4,()=>{A.dart({total:6,score:6,bar:8},18.4);tension(0.9,18.9);}],
   [19.4,()=>{A.noRoom(19.4);A.fireball(19.4,0.6);A.groan(19.75);A.conch(20.1);A.dropOut(2);tension(0,19.4);}],
   [20.9,()=>A.timber(0.5,20.9)],[22.0,()=>{A.thud(0.5,22.0);A.gong(22.08);}],
   [23.4,()=>A.dart({total:8,score:2,bar:8},23.4)],[23.9,()=>A.ting(23.9)],[24.6,()=>A.cheer(24.6,0.8)],
   [26.0,()=>A.winner(26.0)],[27.3,()=>A.firework(-0.4,35,27.3)],[28.0,()=>A.firework(0.5,42,28.0)],[28.7,()=>A.firework(0.1,30,28.7)],[29.6,()=>A.firework(-0.6,38,29.6)],
   [28.4,()=>{A.heat=0.8;A.startGroove(28.4);}],[30.6,()=>A.firework(0.3,44,30.6)],
  ];
  ev.sort((a,b)=>a[0]-b[0]);
  for(const [t,f] of ev){A.scheduleUntil(t);f();}
  A.scheduleUntil(T);
  const buf=await ctx.startRendering();
  // 16-bit WAV
  const n=buf.length,ch=2,data=new DataView(new ArrayBuffer(44+n*ch*2));let o=0;
  const w=s=>{for(const c of s)data.setUint8(o++,c.charCodeAt(0));},u32=v=>{data.setUint32(o,v,true);o+=4;},u16=v=>{data.setUint16(o,v,true);o+=2;};
  w('RIFF');u32(36+n*ch*2);w('WAVE');w('fmt ');u32(16);u16(1);u16(ch);u32(SR);u32(SR*ch*2);u16(ch*2);u16(16);w('data');u32(n*ch*2);
  const L=buf.getChannelData(0),Rr=buf.getChannelData(1);let peak=0,nan=0;
  for(let i=0;i<n;i++)for(const d of [L,Rr]){let v=d[i];if(!Number.isFinite(v)){nan++;v=0;}peak=Math.max(peak,Math.abs(v));data.setInt16(o,Math.max(-1,Math.min(1,v))*32767,true);o+=2;}
  let s='';const bytes=new Uint8Array(data.buffer);for(let i=0;i<bytes.length;i+=0x8000)s+=String.fromCharCode.apply(null,bytes.subarray(i,i+0x8000));
  return {b64:btoa(s),peak,nan};
 },process.env.STEM||'');
 fs.writeFileSync(OUT,Buffer.from(b64.b64,'base64'));console.log('peak',b64.peak.toFixed(3),'nonfinite samples',b64.nan);
 console.log(logs.filter(l=>/error|PAGEERROR/i.test(l)).slice(0,10).join('\n')||'no errors');await b.close();await host.stop();})().catch(e=>{console.error(e);process.exit(1)});
