// Shanghai Milestone 1 review renders — ONE command: the master at 2 / 4 / 6 players (long names), then each moment
// of a simulated game (?demo=1, seeded): a scoring dart (bed shot), the dart-3 takeover (UP NEXT), the round crane,
// round 8 at night, a Shanghai, the champion and a tie. Also times the sky's per-round environment bake.
// usage: node docs/plans/tools/shanghai-greybox.cjs [outDir=docs/plans/shanghai-lookdev/m1]
const R = require('path').resolve(__dirname, '../../..') + '/';
const { chromium } = require(R + 'node_modules/playwright');
const { startHost } = require(R + 'tests/helpers.cjs');
const fs = require('fs'), path = require('path'), { execFileSync } = require('child_process');

const OUT = path.resolve(process.argv[2] || R + 'docs/plans/shanghai-lookdev/m1');
(async () => {
    fs.mkdirSync(OUT, { recursive: true });
    const host = await startHost();
    const b = await chromium.launch({ args: ['--enable-gpu', '--use-angle=metal', '--ignore-gpu-blocklist', '--enable-unsafe-swiftshader'] });
    const ctx = await b.newContext({ ignoreHTTPSErrors: true, viewport: { width: 1920, height: 1080 } });
    const page = await ctx.newPage(); const logs = [];
    page.on('pageerror', (e) => logs.push('PAGEERROR ' + e.message));
    page.on('console', (m) => { if (m.type() === 'error') logs.push('error ' + m.text()); });
    const open = async (q) => { await page.goto(host.base + '/games/shanghai-3d.html?demo=1&dpr=1&intro=0&seed=3&' + q); await page.waitForFunction(() => window.__shanghai && window.__shanghai.game.gd, null, { timeout: 60000 }); };
    const shot = (n) => page.screenshot({ path: `${OUT}/${n}.png` });
    const wait = (ms) => page.waitForTimeout(ms);
    const force = (k) => page.evaluate((k) => __shanghaiDemo.force(k), k);
    // the master at each player count, nothing moving
    for (const n of [2, 4, 6]) { await open(`players=${n}&long=1`); await page.evaluate(() => __shanghaiDemo.pause()); await wait(1200); await shot(`1-master-${n}p`); }
    // a game's moments (6 players, long names)
    await open('players=6&long=1');
    await page.evaluate(() => __shanghaiDemo.pause());
    await page.evaluate(() => { __shanghaiDemo.queue(['treble']); __shanghaiDemo.resume(); });
    await wait(1000); await shot('2-scoring-dart');
    await force('dart3'); await wait(1300); await shot('3-dart3-up-next');
    await force('round'); await wait(2300); await shot('4-round-crane');
    await wait(3400); await shot('5-round2-master');
    await force('final'); await wait(5600); await shot('6-round8-night');
    const bake = await page.evaluate(() => { const S = __shanghai.sky, t = []; for (let k = 0; k < 4; k++) { const t0 = performance.now(); S.set(k / 3); S.bake(null); t.push(performance.now() - t0); } return t.map((x) => +x.toFixed(1)); });
    await force('shanghai'); await wait(3900); await shot('7-shanghai-dart'); await wait(2600); await shot('8-shanghai-winner');
    await open('players=4'); await force('winner'); await wait(1800); await shot('9-champion');
    await open('players=3'); await force('draw'); await wait(1800); await shot('10-tied');
    console.log('sky bake ms (per round change):', JSON.stringify(bake));
    await ctx.close(); await b.close(); await host.stop();
    execFileSync('python3', ['-c', `
import glob,os
from PIL import Image, ImageDraw, ImageFont
fs=sorted(glob.glob(os.path.join(${JSON.stringify(OUT)},'*.png')),key=lambda f:int(os.path.basename(f).split('-')[0]))
W,H=640,360;S=Image.new('RGB',(W*3,H*((len(fs)+2)//3)),(20,20,24))
try: F=ImageFont.truetype('/System/Library/Fonts/Supplemental/Arial Bold.ttf',20)
except OSError: F=ImageFont.load_default()
for i,f in enumerate(fs):
    im=Image.open(f).convert('RGB').resize((W,H));d=ImageDraw.Draw(im);t=os.path.basename(f)[:-4];d.text((11,H-29),t,font=F,fill=(0,0,0));d.text((10,H-30),t,font=F,fill=(255,255,255))
    S.paste(im,((i%3)*W,(i//3)*H))
S.save(os.path.join(${JSON.stringify(OUT)},'contact.jpg'),quality=86)
`], { stdio: 'inherit' });
    console.log(logs.slice(0, 20).join('\n') || 'no console errors');
})().catch((e) => { console.error(e); process.exit(1); });
