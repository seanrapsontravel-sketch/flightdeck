// Shanghai Milestone 2 look-dev deliverables — ONE command (plan §1 rule 7): 8 stills (master at rounds 1 / 4 / 8,
// a scoring dart, a treble, lanterns rising, the round crane, the winner), 1:1 crops of every hero, a 20 s
// fixed-step clip of a real visit (+ filmstrip) and a contact sheet. Seeded; fake clock.
// usage: node docs/plans/tools/shanghai-look.cjs [outDir=docs/plans/shanghai-lookdev/m2] [only] [noclip]
const { session, R } = require('./shanghai-cap.cjs');
const fs = require('fs'), path = require('path'), { execFileSync } = require('child_process');
const OUT = path.resolve(process.argv[2] || R + 'docs/plans/shanghai-lookdev/m2');
const ONLY = process.argv[3] && process.argv[3] !== '-' ? process.argv[3] : '';
const NOCLIP = process.argv.includes('noclip');

(async () => {
    fs.mkdirSync(OUT + '/crops', { recursive: true });
    const S = await session();
    const job = (n) => !ONLY || n.includes(ONLY);
    const shot = (page, n) => page.screenshot({ path: `${OUT}/${n}.png` });
    // the master at rounds 1, 4 and 8 (6 players, long names, a believable table)
    for (const [n, r] of [['1-master-round1', 1], ['2-master-round4', 4], ['3-master-round8', 8]]) {
        if (!job(n)) continue;
        const { ctx, page, step, demo } = await S.open('players=6&long=1');
        await step(20); await demo(`(()=>{__shanghaiDemo.pause();__shanghaiDemo.table(${r});__shanghaiDemo.jump(${r});__shanghaiDemo.pause();})()`);
        await step(150); await shot(page, n); await ctx.close();
    }
    // a scoring dart (a double, round 5): the bed shot, the gong, sparks, +10, lanterns leaving the wedge
    if (job('4-scoring')) {
        const { ctx, page, step, until, demo } = await S.open('players=6&long=1');
        await step(20); await demo(`(()=>{__shanghaiDemo.table(5);__shanghaiDemo.queue(['double']);__shanghaiDemo.jump(5);})()`);
        await until('impact', 16); await shot(page, '4-scoring-dart'); await ctx.close();
    }
    // a treble (round 6), held on the master so the firecrackers along the wall read
    if (job('5-treble')) {
        const { ctx, page, step, until, demo } = await S.open('players=6&long=1&shot=master');
        await step(20); await demo(`(()=>{__shanghaiDemo.table(6);__shanghaiDemo.queue(['treble']);__shanghaiDemo.jump(6);})()`);
        await until('impact', 22); await shot(page, '5-treble'); await ctx.close();
    }
    // lanterns rising: a treble in round 8 releases 24, on the master
    if (job('6-lanterns')) {
        const { ctx, page, step, until, demo } = await S.open('players=6&long=1&shot=master');
        await step(20); await demo(`(()=>{__shanghaiDemo.table(8);__shanghaiDemo.queue(['treble']);__shanghaiDemo.jump(8);})()`);
        await until('impact', 62); await shot(page, '6-lanterns-rising'); await ctx.close();
    }
    // the round crane: up the pagoda as tier 5 lights
    if (job('7-crane')) {
        const { ctx, page, step, until, demo } = await S.open('players=4&long=1');
        await step(20); await demo(`(()=>{__shanghaiDemo.table(4);__shanghaiDemo.jump(4);__shanghaiDemo.force('round');})()`);
        await until('tier', 40); await shot(page, '7-round-crane'); await ctx.close();
    }
    // the winner: every lantern lets go, fireworks over the pagoda (the winner shot, and the same moment on the master)
    for (const [n, q] of [['8-winner', ''], ['8b-winner-master', '&shot=master']]) {
        if (!job(n)) continue;
        const { ctx, page, step, demo } = await S.open('players=6&long=1' + q);
        await step(20); await demo(`(()=>{__shanghaiDemo.table(8);__shanghaiDemo.jump(8);__shanghaiDemo.pause();})()`); await step(60);
        await demo(`__shanghaiDemo.force('winner')`); await step(150); await shot(page, n); await ctx.close();
    }
    // the clip: a real visit in round 5 (a single, a treble, another number → UP NEXT), 20 s at 60 fps
    if (job('clip') && !NOCLIP) {
        const { ctx, page, step, demo } = await S.open('players=6&long=1');
        await step(20); await demo(`(()=>{__shanghaiDemo.table(5);__shanghaiDemo.queue(['single','treble','other']);__shanghaiDemo.jump(5);})()`);
        const dir = fs.mkdtempSync(path.join(OUT, 'f-'));
        for (let i = 0; i < 1200; i++) { await step(1); await page.screenshot({ path: `${dir}/${String(i).padStart(5, '0')}.jpg`, type: 'jpeg', quality: 88 }); }
        execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-framerate', '60', '-i', `${dir}/%05d.jpg`, '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-crf', '19', '-preset', 'medium', `${OUT}/shanghai-lookdev-visit.mp4`]);
        execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-i', `${OUT}/shanghai-lookdev-visit.mp4`, '-vf', 'fps=0.8,scale=480:270,tile=4x4', '-frames:v', '1', `${OUT}/visit-filmstrip.jpg`]);
        fs.rmSync(dir, { recursive: true }); await ctx.close();
    }
    await S.close();
    if (!ONLY) execFileSync('python3', ['-c', `
import sys
from PIL import Image
O=sys.argv[1]
# 1:1 crops of every hero (no scaling): (still, box, name)
C=[('3-master-round8',(560,300,1360,1000),'gate-board-night'),('1-master-round1',(560,300,1360,1000),'gate-board-sunset'),('3-master-round8',(1100,0,1620,560),'pagoda-night'),
   ('1-master-round1',(1100,0,1620,560),'pagoda-sunset'),('3-master-round8',(0,360,760,940),'stations-left-lanterns'),('3-master-round8',(1160,360,1920,940),'stations-right-lanterns'),
   ('4-scoring-dart',(460,140,1460,900),'scoring-dart-bed'),('5-treble',(0,180,1920,720),'treble-firecrackers'),('8-winner',(360,120,1560,940),'winner-station'),('8b-winner-master',(400,0,1920,700),'winner-lanterns-fireworks')]
for s,b,n in C: Image.open(f'{O}/{s}.png').crop(b).save(f'{O}/crops/{n}.png')
names=['1-master-round1','2-master-round4','3-master-round8','4-scoring-dart','5-treble','6-lanterns-rising','7-round-crane','8-winner','8b-winner-master']
S=Image.new('RGB',(3*640,3*360),(20,20,24))
for i,n in enumerate(names): S.paste(Image.open(f'{O}/{n}.png').convert('RGB').resize((640,360),Image.LANCZOS),((i%3)*640,(i//3)*360))
S.save(f'{O}/contact-sheet.jpg',quality=90)
`, OUT], { stdio: 'inherit' });
    console.log(S.logs.slice(0, 20).join('\n') || 'no console errors');
})().catch((e) => { console.error(e); process.exit(1); });
