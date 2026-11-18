// usage: node baseline.cjs <outdir> [frames=240,420,600]
// Seeded, fixed-step regression frames for the 3D games: Math.random is seeded before any script runs, the page runs
// with ?capture=1&dpr=1 (no rAF), and Playwright's fake clock drives setTimeout/Date so a ?demo=1 simulator emits its
// states at the same simulated moments every run. One frame = 1/60 s of clock, then one step.
// Writes <outdir>/<case>-<frame>.png and prints a sha1 per frame. Compare two runs with baseline-diff.py.
const R = '/Users/seanrapson/flightdeck-fork/';
const { chromium } = require(R + 'node_modules/playwright');
const { startHost } = require(R + 'tests/helpers.cjs');
const fs = require('fs'), crypto = require('crypto');

const CASES = (process.env.CASES ? process.env.CASES.split(',') : null);
const ALL = [
    { name: 'limbo-lookdev', page: 'games/limbo.html', q: 'capture=1&dpr=1&players=3&seed=4', G: '__limbo' },
    { name: 'limbo-demo', page: 'games/limbo.html', q: 'capture=1&dpr=1&demo=1&players=4&seed=3&sound=0', G: '__limbo', demo: '__limboDemo' },
    { name: 'demolition-lookdev', page: 'games/demolition-3d.html', q: 'capture=1&dpr=1', G: '__demolition' },
    { name: 'demolition-demo', page: 'games/demolition-3d.html', q: 'capture=1&dpr=1&demo=1&seed=3', G: '__demolition', demo: '__demolitionDemo' },
    { name: 'killer-demo', page: process.env.KPAGE || 'games/killer.html', q: 'capture=1&dpr=1&demo=1&players=4&seed=3', G: '__killer', demo: '__killerDemo' },
];

(async () => {
    const [OUT, fr = '240,420,600'] = process.argv.slice(2);
    const frames = fr.split(',').map(Number);
    fs.mkdirSync(OUT, { recursive: true });
    const host = await startHost();
    const b = await chromium.launch({ args: ['--enable-gpu', '--use-angle=metal', '--ignore-gpu-blocklist', '--enable-unsafe-swiftshader'] });
    for (const C of ALL.filter((c) => !CASES || CASES.includes(c.name))) {
        const ctx = await b.newContext({ ignoreHTTPSErrors: true, viewport: { width: 1280, height: 720 } });
        await ctx.addInitScript(() => {
            let s = 0x9e3779b9;
            Math.random = () => { s |= 0; s = (s + 0x6d2b79f5) | 0; let t = Math.imul(s ^ (s >>> 15), 1 | s); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
        });
        const page = await ctx.newPage();
        const logs = [];
        page.on('pageerror', (e) => logs.push('PAGEERROR ' + e.message));
        page.on('console', (m) => { if (m.type() === 'error') logs.push('console ' + m.text()); });
        // the fake clock is paused: page time moves only through runFor (otherwise it still ticks in real time)
        const T0 = new Date('2026-11-18T12:00:00Z').getTime();
        await page.clock.install({ time: T0 });
        await page.clock.pauseAt(T0 + 1000);
        await page.goto(host.base + '/' + C.page + '?' + C.q);
        const has = async (g) => { for (let i = 0; i < 300; i++) { if (await page.evaluate((x) => !!window[x], g)) return; await new Promise((r) => setTimeout(r, 100)); } throw new Error(g + ' never appeared'); };
        await has(C.G); if (C.demo) await has(C.demo);
        // CSS animations/transitions run on the compositor's real clock: switch them off so the HUD is deterministic
        await page.addStyleTag({ content: '*,*::before,*::after{animation:none!important;transition:none!important}' });
        let f = 0;
        for (const target of frames) {
            while (f < target) {
                await page.clock.runFor(1000 / 60);
                await page.evaluate((g) => window[g].step(1, 1 / 60), C.G);
                f++;
            }
            const file = `${OUT}/${C.name}-${target}.png`;
            await page.screenshot({ path: file });
            console.log(C.name, target, crypto.createHash('sha1').update(fs.readFileSync(file)).digest('hex').slice(0, 12));
        }
        if (logs.length) console.log(C.name, 'LOGS:\n  ' + logs.slice(0, 20).join('\n  '));
        await ctx.close();
    }
    await b.close(); await host.stop();
})().catch((e) => { console.error(e); process.exit(1); });
