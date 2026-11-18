// "How to play" review: each 3D game's explainer, all three pages, at 1080p over its own demo world
// (docs/plans/GAME-INTROS-3D.md). Seeded, fake clock. usage: node docs/plans/tools/intros.cjs [outDir] [only]
const R = require('path').resolve(__dirname, '../../..') + '/';
const { chromium } = require(R + 'node_modules/playwright');
const { startHost } = require(R + 'tests/helpers.cjs');
const fs = require('fs'), path = require('path'), { execFileSync } = require('child_process');
const OUT = path.resolve(process.argv[2] || R + 'docs/plans/intros');
const ONLY = process.argv[3] || '';
const GAMES = [['quackshot', 'quackshot-3d.html', '__quackshot'], ['killer', 'killer.html', '__killer'], ['limbo', 'limbo.html', '__limbo'], ['derby', 'derby.html', '__derby', true], ['demolition', 'demolition-3d.html', '__demolition'], ['zerohour', 'zerohour.html', '__zerohour', true]];
(async () => {
    fs.mkdirSync(OUT, { recursive: true });
    const host = await startHost();
    const b = await chromium.launch({ args: ['--enable-gpu', '--use-angle=metal', '--ignore-gpu-blocklist', '--enable-unsafe-swiftshader'] });
    const logs = [];
    for (const [name, file, G, realtime] of GAMES) {
        if (ONLY && !name.includes(ONLY)) continue;
        const ctx = await b.newContext({ ignoreHTTPSErrors: true, viewport: { width: 1920, height: 1080 } });
        const page = await ctx.newPage();
        page.on('pageerror', (e) => logs.push(`${name} PAGEERROR ${e.message}`));
        page.on('console', (m) => { if (m.type() === 'error') logs.push(`${name} error ${m.text()}`); });
        // Derby predates the fixed-step capture mode: it plays in real time
        if (!realtime) { const T0 = new Date('2026-11-18T20:00:00Z').getTime(); await page.clock.install({ time: T0 }); await page.clock.pauseAt(T0 + 1000); }
        await page.goto(`${host.base}/games/${file}?${realtime ? '' : 'capture=1&'}dpr=1&demo=1&players=4&seed=3&intro=1`);
        for (let i = 0; i < 300 && !(await page.evaluate((g) => !!window[g], G)); i++) await new Promise((r) => setTimeout(r, 100));
        if (realtime) await page.waitForTimeout(1500);
        const step = realtime ? (n) => page.waitForTimeout((n * 1000) / 60) : async (n) => { for (let i = 0; i < n; i++) { await page.clock.runFor(1000 / 60); await page.evaluate((g) => window[g].step(1, 1 / 60), G); } };
        // page 1 at 3 s; page 2 with its second legend row lit; page 3 at 3 s in
        for (const [t, tag] of [[3, '1-how-it-works'], [7.2 + 0.4 + 1.5 * 1.4, '2-how-to-score'], [null, '3-how-to-win']]) {
            if (t === null) {
                const ms = await page.evaluate(() => { const r = document.querySelectorAll('.kit-intro-row').length; return 400 + r * 1500 + 2600; });
                await step(Math.round((7.2 + ms / 1000 + 3) * 60) - Math.round((7.2 + 0.4 + 1.5 * 1.4) * 60));
            } else await step(Math.round(t * 60) - (tag === '1-how-it-works' ? 0 : Math.round(3 * 60)));
            await page.screenshot({ path: `${OUT}/${name}-${tag}.png` });
        }
        await ctx.close();
    }
    await b.close(); await host.stop();
    if (!ONLY) execFileSync('python3', ['-c', `
import sys,glob
from PIL import Image
O=sys.argv[1];fs=sorted(glob.glob(O+'/*-[123]-*.png'))
names=sorted({f.split('/')[-1].split('-')[0] for f in fs},key=['quackshot','killer','limbo','derby','demolition'].index)
S=Image.new('RGB',(3*640,len(names)*360))
for j,n in enumerate(names):
  for i,f in enumerate(sorted(glob.glob(f'{O}/{n}-[123]-*.png'))): S.paste(Image.open(f).convert('RGB').resize((640,360)),(i*640,j*360))
S.save(O+'/contact.jpg',quality=88)`, OUT], { stdio: 'inherit' });
    console.log(logs.slice(0, 20).join('\n') || 'no console errors');
})().catch((e) => { console.error(e); process.exit(1); });
