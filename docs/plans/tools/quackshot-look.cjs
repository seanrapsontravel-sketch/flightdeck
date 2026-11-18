// Quackshot Milestone 2 look-dev deliverables — ONE command (plan §1 rule 7): the 8 stills (master at rounds 1 and 6,
// bed close-up on the parade, outer bull, double bull, Ring of Fire, splash, winner), 1:1 crops of every hero, a 20 s
// fixed-step clip of a real visit (+ filmstrip) and the contact sheets. Seeded; fake clock (demo timers advance with
// the frames). usage: node docs/plans/tools/quackshot-look.cjs [outDir=docs/plans/quackshot-lookdev/m2] [only]
const R = require('path').resolve(__dirname, '../../..') + '/';
const { chromium } = require(R + 'node_modules/playwright');
const { startHost } = require(R + 'tests/helpers.cjs');
const fs = require('fs'), path = require('path'), { execFileSync } = require('child_process');
const OUT = path.resolve(process.argv[2] || R + 'docs/plans/quackshot-lookdev/m2');
const ONLY = process.argv[3] || '';

(async () => {
    fs.mkdirSync(OUT + '/crops', { recursive: true });
    const host = await startHost();
    const b = await chromium.launch({ args: ['--enable-gpu', '--use-angle=metal', '--ignore-gpu-blocklist', '--enable-unsafe-swiftshader'] });
    const logs = [];
    async function open(q) {
        const ctx = await b.newContext({ ignoreHTTPSErrors: true, viewport: { width: 1920, height: 1080 } });
        await ctx.addInitScript(() => { let s = 0x9e3779b9; Math.random = () => { s |= 0; s = (s + 0x6d2b79f5) | 0; let t = Math.imul(s ^ (s >>> 15), 1 | s); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; });
        const page = await ctx.newPage();
        page.on('pageerror', (e) => logs.push('PAGEERROR ' + e.message));
        page.on('console', (m) => { if (['error', 'warning'].includes(m.type())) logs.push(m.type() + ' ' + m.text()); });
        const T0 = new Date('2026-11-18T20:00:00Z').getTime();
        await page.clock.install({ time: T0 }); await page.clock.pauseAt(T0 + 1000);
        await page.goto(host.base + '/games/quackshot-3d.html?capture=1&dpr=1&demo=1&' + q);
        for (let i = 0; i < 300 && !(await page.evaluate(() => !!(window.__quackshot && window.__quackshotDemo))); i++) await new Promise((r) => setTimeout(r, 100));
        const step = async (n) => { for (let i = 0; i < n; i++) { await page.clock.runFor(1000 / 60); await page.evaluate(() => __quackshot.step(1, 1 / 60)); } };
        return { ctx, page, step };
    }
    const shot = (page, name) => page.screenshot({ path: `${OUT}/${name}.png` });
    // a believable mid-game table: scores either side of zero, some ducks won
    const table = `(()=>{const d=__quackshotDemo;d.set(0,{score:6,bullseyes:2});d.set(1,{score:-2,bullseyes:0});d.set(2,{score:9,bullseyes:3});d.set(3,{score:3,bullseyes:1});})()`;
    const job = (name) => !ONLY || name.includes(ONLY);
    // 1. master, round 1 — and 2. master, round 6 (fireworks, gold chase)
    if (job('1-master')) { const { ctx, page, step } = await open('players=4&seed=5'); await step(30); await page.evaluate(table); await page.evaluate(() => __quackshotDemo.force('parade')); await step(90); await page.evaluate(() => { __quackshotDemo.pause(); __quackshot.shot('master'); }); await step(40); await shot(page, '1-master-round1'); await ctx.close(); }
    if (job('2-master')) {
        const { ctx, page, step } = await open('players=4&seed=5'); await step(30); await page.evaluate(table);
        await page.evaluate(() => __quackshotDemo.force('final')); await step(60 * 8);   // dart → FINALE announce → UP NEXT → round 6
        await page.evaluate(() => __quackshotDemo.force('parade')); await step(90); await page.evaluate(() => { __quackshotDemo.pause(); __quackshot.shot('master'); }); await step(150);
        await shot(page, '2-master-round6'); await ctx.close();
    }
    // 3. bed close-up on the parade: a +1 lands; hold the bed shot on it
    if (job('3-parade')) {
        const { ctx, page, step } = await open('players=4&seed=5'); await step(30); await page.evaluate(table);
        await page.evaluate(() => __quackshotDemo.force('parade')); await step(44);
        await page.evaluate(() => { const r = __quackshot.darts.shown.at(-1); __quackshot.shot('bed', { at: r.at }); }); await step(50);
        await shot(page, '3-parade-bed'); await ctx.close();
    }
    // 4–7: the overlay moments, each at its peak (reaction) — the card comes at 1.41 s
    // the dart lands ~39 frames after force(); `at` = frames after that for the reaction's peak; the card is up by +100
    for (const [name, kind, at] of [['4-outer-bull', 'bull', 30], ['5-double-bull', 'dbull', 34], ['6-ring-of-fire', 'fire', 40], ['7-splash', 'splash', 14]]) {
        if (!job(name)) continue;
        const { ctx, page, step } = await open('players=4&seed=5'); await step(30); await page.evaluate(table);
        await page.evaluate((k) => __quackshotDemo.force(k), kind); await step(39 + at);
        await shot(page, name); await step(110 - at); await shot(page, name + '-card'); await ctx.close();
    }
    // 8. winner
    if (job('8-winner')) { const { ctx, page, step } = await open('players=4&seed=5'); await step(30); await page.evaluate(table); await page.evaluate(() => __quackshotDemo.force('winner')); await step(150); await shot(page, '8-winner'); await ctx.close(); }
    // the clip: a real visit — a parade +1, an outer bull, a splash — then UP NEXT, 20 s at 60 fps
    if (job('clip')) {
        const { ctx, page, step } = await open('players=4&seed=5'); await step(30); await page.evaluate(table);
        await page.evaluate(() => __quackshotDemo.queue(['parade', 'bull', 'splash']));
        const dir = fs.mkdtempSync(path.join(OUT, 'f-'));
        for (let i = 0; i < 1200; i++) { await step(1); await page.screenshot({ path: `${dir}/${String(i).padStart(5, '0')}.jpg`, type: 'jpeg', quality: 90 }); }
        execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-framerate', '60', '-i', `${dir}/%05d.jpg`, '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-crf', '18', '-preset', 'slow', `${OUT}/quackshot-lookdev-visit.mp4`]);
        execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-i', `${OUT}/quackshot-lookdev-visit.mp4`, '-vf', 'fps=0.8,scale=480:270,tile=4x4', '-frames:v', '1', `${OUT}/visit-filmstrip.jpg`]);
        fs.rmSync(dir, { recursive: true }); await ctx.close();
    }
    await b.close(); await host.stop();
    if (!ONLY) execFileSync('python3', ['-c', `
import sys
from PIL import Image
O=sys.argv[1]
# 1:1 crops of every hero (no scaling): (still, box, name)
C=[('3-parade-bed',(560,240,1360,840),'parade-ducks'),('4-outer-bull',(560,180,1360,780),'tin-ducks-knocked'),('1-master-round1',(700,240,1220,760),'target-face'),
   ('1-master-round1',(480,90,1440,270),'marquee'),('1-master-round1',(360,780,1200,940),'stations'),('1-master-round1',(240,0,760,520),'hanging-ducks'),
   ('6-ring-of-fire',(460,160,1460,880),'ring-of-fire'),('8-winner',(460,240,1460,900),'winner-station'),('2-master-round6',(0,0,1000,560),'fairground-fireworks')]
for s,b,n in C: Image.open(f'{O}/{s}.png').crop(b).save(f'{O}/crops/{n}.png')
names=['1-master-round1','2-master-round6','3-parade-bed','4-outer-bull','5-double-bull','6-ring-of-fire','7-splash','8-winner']
S=Image.new('RGB',(3*640,3*360),(20,20,24))
for i,n in enumerate(names): S.paste(Image.open(f'{O}/{n}.png').convert('RGB').resize((640,360),Image.LANCZOS),((i%3)*640,(i//3)*360))
S.save(f'{O}/contact-sheet.jpg',quality=90)
`, OUT], { stdio: 'inherit' });
    console.log(logs.slice(0, 20).join('\n') || 'no console errors');
})().catch((e) => { console.error(e); process.exit(1); });
