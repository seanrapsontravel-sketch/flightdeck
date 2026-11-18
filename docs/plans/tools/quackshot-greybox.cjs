// Quackshot Milestone 1 review: the greybox playing. Master stills at 2, 4 and 6 players (long names), one still per
// moment, and a fixed-step clip of the demo game (seeded, fake clock: demo timers advance with the frames).
// usage: node docs/plans/tools/quackshot-greybox.cjs [outDir=docs/plans/quackshot-lookdev/m1] [seconds=40]
const R = require('path').resolve(__dirname, '../../..') + '/';
const { chromium } = require(R + 'node_modules/playwright');
const { startHost } = require(R + 'tests/helpers.cjs');
const fs = require('fs'), path = require('path'), { execFileSync } = require('child_process');
const OUT = path.resolve(process.argv[2] || R + 'docs/plans/quackshot-lookdev/m1');
const SECS = Number(process.argv[3]) || 40;

(async () => {
    fs.mkdirSync(OUT, { recursive: true });
    const host = await startHost();
    const b = await chromium.launch({ args: ['--enable-gpu', '--use-angle=metal', '--ignore-gpu-blocklist', '--enable-unsafe-swiftshader'] });
    const logs = [];
    async function open(q) {
        const ctx = await b.newContext({ ignoreHTTPSErrors: true, viewport: { width: 1920, height: 1080 } });
        await ctx.addInitScript(() => { let s = 0x9e3779b9; Math.random = () => { s |= 0; s = (s + 0x6d2b79f5) | 0; let t = Math.imul(s ^ (s >>> 15), 1 | s); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; });
        const page = await ctx.newPage();
        page.on('pageerror', (e) => logs.push('PAGEERROR ' + e.message));
        page.on('console', (m) => { if (['error', 'warning'].includes(m.type())) logs.push(m.type() + ' ' + m.text()); });
        const T0 = new Date('2026-11-18T12:00:00Z').getTime();
        await page.clock.install({ time: T0 }); await page.clock.pauseAt(T0 + 1000);
        await page.goto(host.base + '/games/quackshot-3d.html?capture=1&dpr=1&demo=1&' + q);
        for (let i = 0; i < 300 && !(await page.evaluate(() => !!(window.__quackshot && window.__quackshotDemo))); i++) await new Promise((r) => setTimeout(r, 100));
        const step = async (n) => { for (let i = 0; i < n; i++) { await page.clock.runFor(1000 / 60); await page.evaluate(() => __quackshot.step(1, 1 / 60)); } };
        return { ctx, page, step };
    }
    const shot = (page, name) => page.screenshot({ path: `${OUT}/${name}.png` });
    // master at 2, 4, 6 players with long names (the layout risk in plan §11)
    for (const n of [2, 4, 6]) {
        const { ctx, page, step } = await open(`players=${n}&long=1&seed=3&shot=master`);
        await step(60); await page.evaluate(() => { const d = __quackshotDemo; d.pause(); d.set(0, { score: -3, bullseyes: 2 }); d.set(1, { score: 7, bullseyes: 1 }); });
        await step(90); await shot(page, `master-${n}p`); await ctx.close();
    }
    // one still per moment, at the moment's peak
    for (const [kind, at] of [['parade', 40], ['bull', 50], ['dbull', 50], ['fire', 60], ['splash', 50], ['miss', 50], ['final', 200], ['winner', 120], ['draw', 120]]) {
        const { ctx, page, step } = await open('players=4&seed=5');
        await step(60);   // force before the demo's first natural dart (2.2 s) so it is the next one thrown
        await page.evaluate((k) => __quackshotDemo.force(k), kind);
        await step(kind === 'final' ? 60 : 20);
        await step(at); await shot(page, `moment-${kind}`);
        if (['bull', 'dbull', 'fire', 'splash', 'miss'].includes(kind)) { await step(70); await shot(page, `moment-${kind}-card`); }
        await ctx.close();
    }
    // the clip: the demo game as it plays, 60 fps
    {
        const { ctx, page, step } = await open('players=4&seed=11');
        const dir = fs.mkdtempSync(path.join(OUT, 'f-'));
        for (let i = 0; i < SECS * 60; i++) { await step(1); await page.screenshot({ path: `${dir}/${String(i).padStart(5, '0')}.jpg`, type: 'jpeg', quality: 88 }); }
        execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-framerate', '60', '-i', `${dir}/%05d.jpg`, '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-crf', '20', '-preset', 'medium', `${OUT}/greybox-demo.mp4`]);
        execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-i', `${OUT}/greybox-demo.mp4`, '-vf', `fps=${16 / SECS},scale=480:270,tile=4x4`, '-frames:v', '1', `${OUT}/greybox-filmstrip.jpg`]);
        fs.rmSync(dir, { recursive: true }); await ctx.close();
    }
    execFileSync('python3', [R + 'docs/plans/tools/sheet.py', OUT, `${OUT}/contact.jpg`, '3']);
    console.log(logs.slice(0, 20).join('\n') || 'no console errors');
    await b.close(); await host.stop();
})().catch((e) => { console.error(e); process.exit(1); });
