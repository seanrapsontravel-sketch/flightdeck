// Zero Hour Milestone 0 review renders (docs/plans/ZERO-HOUR.md §13) — ONE command:
//   the master at 2 / 4 / 6 players, round 1 (empty) and round 5 (full); the chip close-ups (1:1 crops); the spin
//   sequence (all bets are down → wheel → ball → reveal → winner → placings); and the sweep as a clip + filmstrip.
// Everything runs the TV page's ?demo=1 (seeded, the server's own rules module). Real-time, not fixed-step: the demo's
// timers are wall-clock, so frames can differ by a few milliseconds between runs.
// usage: node docs/plans/tools/zerohour-look.cjs [outDir=docs/plans/zerohour-lookdev/m0]
const R = require('path').resolve(__dirname, '../../..') + '/';
const { chromium } = require(R + 'node_modules/playwright');
const { startHost } = require(R + 'tests/helpers.cjs');
const fs = require('fs'), path = require('path'), { execFileSync } = require('child_process');

const OUT = path.resolve(process.argv[2] || R + 'docs/plans/zerohour-lookdev/m0');
const ARGS = ['--enable-gpu', '--use-angle=metal', '--ignore-gpu-blocklist', '--enable-unsafe-swiftshader'];
(async () => {
    fs.mkdirSync(OUT, { recursive: true });
    fs.mkdirSync(OUT + '/crops', { recursive: true });
    const host = await startHost();
    const b = await chromium.launch({ args: ARGS });
    const logs = [];
    const newPage = async (ctxOpts = {}) => {
        const ctx = await b.newContext({ ignoreHTTPSErrors: true, viewport: { width: 1920, height: 1080 }, ...ctxOpts });
        const page = await ctx.newPage();
        page.on('pageerror', (e) => logs.push('PAGEERROR ' + e.message));
        page.on('console', (m) => { if (m.type() === 'error') logs.push('error ' + m.text()); });
        return { ctx, page };
    };
    const open = async (page, q) => { await page.goto(host.base + '/games/zerohour.html?demo=1&dpr=1&intro=0&seed=7&' + q); await page.waitForFunction(() => window.__zerohour && window.__zerohour.game.gd, null, { timeout: 60000 }); };
    const wait = (page, ms) => page.waitForTimeout(ms);
    const idle = (page) => page.waitForFunction(() => { const t = __zerohour.truth(); return t.settled; }, null, { timeout: 30000 });

    let { ctx, page } = await newPage();
    // 1–2: the master, empty and full, at each table size
    for (const n of [2, 4, 6]) {
        await open(page, `players=${n}${n === 6 ? '&long=1' : ''}`);
        await page.evaluate(() => __zerohourDemo.pause()); await wait(page, 1500);
        await page.screenshot({ path: `${OUT}/1-master-${n}p-round1.png` });
        await page.evaluate((v) => { __zerohourDemo.skip(v); __zerohourDemo.pause(); }, n * 4 + 1);
        await wait(page, 4500); await idle(page);
        await page.screenshot({ path: `${OUT}/2-master-${n}p-round5.png` });
    }
    // 3: chip close-ups on the 6-player round-5 table: the busiest cell, then 1:1 crops (dpr 1 = TV pixels)
    const busiest = await page.evaluate(() => { const c = __zerohour.game.gd.zh.cells; let best = 0, k = 0; c.forEach((x) => { const n = Object.keys(x.byPlayer).length + Object.values(x.byPlayer).reduce((a, v) => a + v, 0) / 1000; if (n > best) { best = n; k = x.pocket; } }); return k; });
    await page.evaluate((n) => __zerohour.shot('cell', { n }), busiest); await wait(page, 1200);
    await page.screenshot({ path: `${OUT}/3-chips-cell-${busiest}.png` });
    await page.screenshot({ path: `${OUT}/crops/chips-1to1.png`, clip: { x: 480, y: 270, width: 960, height: 540 } });
    await page.evaluate(() => __zerohour.shot('master')); await wait(page, 1500);
    await page.screenshot({ path: `${OUT}/crops/master-layout-1to1.png`, clip: { x: 760, y: 420, width: 960, height: 540 } });
    await page.screenshot({ path: `${OUT}/crops/master-wheel-1to1.png`, clip: { x: 0, y: 360, width: 960, height: 540 } });
    await page.screenshot({ path: `${OUT}/crops/porthole-1to1.png`, clip: { x: 660, y: 0, width: 600, height: 380 } });
    // 4: the spin, from the same table
    await page.evaluate(() => { __zerohourDemo.resume(); __zerohourDemo.toSpin(); });
    await page.waitForFunction(() => __zerohour.game.gd.phase.type === 'spin', null, { timeout: 30000 });
    const shots = [[2500, '4-all-bets-down'], [4800, '5-wheel'], [6200, '6-ball'], [5200, '7-reveal']];
    for (const [ms, name] of shots) { await wait(page, ms); await page.screenshot({ path: `${OUT}/${name}.png` }); }
    await page.waitForFunction(() => __zerohour.game.gd.phase.type === 'winner', null, { timeout: 30000 });
    await wait(page, 1800); await page.screenshot({ path: `${OUT}/8-winner.png` });
    await wait(page, 2600); await page.screenshot({ path: `${OUT}/9-placings.png` });
    await ctx.close();

    // 10: the sweep, as a clip (a big hot visit on a busy 6-player table) and a filmstrip
    ({ ctx, page } = await newPage({ recordVideo: { dir: OUT + '/_video', size: { width: 1920, height: 1080 } } }));
    await open(page, 'players=6&long=1');
    await page.evaluate(() => { __zerohourDemo.skip(13); __zerohourDemo.pause(); });
    await wait(page, 4000);
    const strip = [];
    await page.evaluate(() => { __zerohourDemo.queue(['hot3', 'hot3', 'hot3']); __zerohourDemo.resume(); });
    await page.waitForFunction(() => __zerohour.game.gd.throwsThisTurn === 3, null, { timeout: 30000 });
    for (let k = 0; k < 8; k++) { await wait(page, 380); const f = `${OUT}/_strip-${k}.png`; await page.screenshot({ path: f }); strip.push(f); }
    await wait(page, 2500);
    const video = await page.video().path();
    await ctx.close();
    try {
        execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-i', video, '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-crf', '20', `${OUT}/10-sweep.mp4`]);
    } catch (e) { logs.push('ffmpeg failed: ' + e.message); }
    await b.close(); await host.stop();
    execFileSync('python3', ['-c', `
import glob,os
from PIL import Image, ImageDraw, ImageFont
O=${JSON.stringify(OUT)}
try: F=ImageFont.truetype('/System/Library/Fonts/Supplemental/Arial Bold.ttf',20)
except OSError: F=ImageFont.load_default()
def label(im,t):
    d=ImageDraw.Draw(im);d.text((11,im.height-29),t,font=F,fill=(0,0,0));d.text((10,im.height-30),t,font=F,fill=(255,255,255));return im
fs=sorted(glob.glob(os.path.join(O,'[0-9]*.png')),key=lambda f:(int(os.path.basename(f).split('-')[0]),f))
W,H=640,360;S=Image.new('RGB',(W*3,H*((len(fs)+2)//3)),(20,20,24))
for i,f in enumerate(fs): S.paste(label(Image.open(f).convert('RGB').resize((W,H)),os.path.basename(f)[:-4]),((i%3)*W,(i//3)*H))
S.save(os.path.join(O,'contact-sheet.jpg'),quality=86)
st=sorted(glob.glob(os.path.join(O,'_strip-*.png')))
if st:
    W2,H2=480,270;T=Image.new('RGB',(W2*4,H2*2))
    for i,f in enumerate(st): T.paste(label(Image.open(f).convert('RGB').resize((W2,H2)),'+%.2fs'%(0.38*(i+1))),((i%4)*W2,(i//4)*H2))
    T.save(os.path.join(O,'10-sweep-filmstrip.jpg'),quality=86)
for f in st: os.remove(f)
`], { stdio: 'inherit' });
    fs.rmSync(OUT + '/_video', { recursive: true, force: true });
    console.log('renders →', OUT);
    console.log(logs.slice(0, 20).join('\n') || 'no console errors');
})().catch((e) => { console.error(e); process.exit(1); });
