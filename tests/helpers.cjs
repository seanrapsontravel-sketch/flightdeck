const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const https = require('node:https');
const net = require('node:net');
const { spawn, execFileSync } = require('node:child_process');
const WebSocket = require('ws');
const root = path.resolve(__dirname, '..');
const delay = ms => new Promise(r => setTimeout(r, ms));
async function until(fn, timeout = 15000) {
    const start = Date.now();
    while (Date.now() - start < timeout) { const value = await fn(); if (value) return value; await delay(30); }
    throw new Error('Timed out waiting for state.');
}
async function startHost(existing) {
    execFileSync(process.execPath, ['scripts/setup.js'], { cwd: root });
    const dataDir = existing || fs.mkdtempSync(path.join(os.tmpdir(), 'flightdeck-test-'));
    const port = await new Promise(resolve => { const s = net.createServer(); s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => resolve(p)); }); });
    const child = spawn(process.execPath, ['src/server.js'], { cwd: root, env: { ...process.env, SCORING_MODE:'mock', PORT:String(port), FD_DATA_DIR:dataDir }, stdio:['ignore','pipe','pipe'] });
    let output = ''; child.stdout.on('data', b=>output+=b); child.stderr.on('data', b=>output+=b);
    await until(() => { if (child.exitCode != null) throw new Error(output); return output.includes('Engine Restored!'); });
    const codes = /Pair tablet: (\d+)\s+·\s+Pair operator: (\d+)/.exec(output);
    const base = `https://localhost:${port}`;
    function request(route, method='GET', body, cookie, origin=base) {
        return new Promise((resolve,reject)=>{
            const r=https.request(`${base}${route}`, { method, rejectUnauthorized:false, headers:{ Origin:origin, ...(body?{'Content-Type':'application/json'}:{}), ...(cookie?{Cookie:cookie}:{}) } }, res=>{
                const chunks=[];res.on('data',c=>chunks.push(c));res.on('end',()=>{const text=Buffer.concat(chunks).toString();resolve({status:res.statusCode,headers:res.headers,body:text ? JSON.parse(text):null});});
            });r.on('error',reject);if(body)r.write(JSON.stringify(body));r.end();
        });
    }
    async function pair(role='operator') { const r=await request('/api/pair','POST',{role,code:codes[role==='operator'?2:1]}); if(r.status!==200)throw new Error(JSON.stringify(r));return r.headers['set-cookie'][0].split(';')[0]; }
    async function connect(cookie, origin=base, surface='control') {
        const ws = new WebSocket(base.replace('https:', 'wss:') + '/?surface=' + surface, { rejectUnauthorized:false, origin, headers:cookie?{Cookie:cookie}:{} });
        const peer={ ws, messages:[], state:null, board:null, errors:[] };
        ws.on('message',b=>{const m=JSON.parse(b);peer.messages.push(m);if(m.type==='STATE_UPDATE')peer.state=m.data;if(m.type==='BOARD_UPDATE')peer.board=m.data;if(m.type==='COMMAND_ERROR')peer.errors.push(m);});
        await new Promise((resolve,reject)=>{ws.once('open',resolve);ws.once('error',reject);});
        await until(()=>peer.state);
        peer.command=async (request, id=require('node:crypto').randomUUID())=>{
            const command={...request,commandId:id,issuedAt:Date.now()}; ws.send(JSON.stringify(command));
            const r=await until(()=>peer.messages.find(m=>m.commandId===id && ['COMMAND_ACK','COMMAND_ERROR'].includes(m.type)));
            await delay(40); return r;
        };
        return peer;
    }
    async function stop(signal='SIGTERM') { if(child.exitCode!==null || child.signalCode) return; child.kill(signal);await new Promise(r=>child.once('exit',r)); }
    return { child, base, port, dataDir, codes:{control:codes[1],operator:codes[2]}, request, pair, connect, stop, output:()=>output };
}
module.exports={startHost,delay,until};
